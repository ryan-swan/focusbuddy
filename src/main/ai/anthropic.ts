import Anthropic from '@anthropic-ai/sdk'
import { getNode } from '../db/nodes'
import { getWidget, listWidgetsByTask } from '../db/widgets'
import { getRecentHistory } from '../db/browsing'
import { getRecentActivity } from '../db/activity'
import { markdownToTiptap } from './markdownToTiptap'
import { resolveModel } from './modelRouting'
import type {
  ActionProposal,
  ActivityEvent,
  AiBuildResponse,
  AiBuildSuggestion,
  BodyDoubleResponse,
  ChatRequest,
  ChatResponse,
  LivingPageRegenerateResponse,
  SetupSuggestResponse,
  SmartStackGroup,
  SmartStackResponse,
  TrailSummaryResponse,
  Widget,
  WidgetKind,
  WidgetSuggestion
} from '@shared/types'

// ── Action-proposal tools (chat → workspace) ────────────────────────────────
//
// Claude can propose workspace actions via Anthropic tool-use. We define one
// tool per action kind. When the user's request implies a doable thing
// ("create a todo list for next week", "open the Figma file", "add a focus
// session"), Claude returns tool_use blocks alongside its text reply. We
// parse them into ActionProposal[] and ship to the renderer, which renders
// each as a confirmable card. NOTHING auto-executes — the user always
// clicks Apply.
//
// Each tool's input_schema matches the corresponding ActionProposal payload
// (minus the runtime-generated id). Keep these in sync with shared/types.ts.


// Stable proposal id — unique per response, used for selection state in the
// renderer. Deliberately not a UUID; just a counter scoped to the response.
function makeProposalId(prefix: string, i: number): string {
  return `${prefix}-${Date.now().toString(36)}-${i}`
}

// Render a Tiptap-compatible doc JSON from a sections array. Keeps the
// Anthropic-side schema simple (heading + body strings) while shipping the
// renderer the Tiptap structure it expects.
function sectionsToTiptap(
  sections: Array<{ heading: string; body?: string }>
): object {
  const content: object[] = []
  for (const s of sections) {
    content.push({
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: s.heading }]
    })
    if (s.body) {
      // Naive paragraph split — Claude's bodies tend to be single paragraphs
      // already; if not, two paragraphs is better than one for readability.
      for (const para of s.body.split(/\n\n+/)) {
        const trimmed = para.trim()
        if (!trimmed) continue
        content.push({
          type: 'paragraph',
          content: [{ type: 'text', text: trimmed }]
        })
      }
    }
  }
  return { type: 'doc', content }
}

// Translate Claude's tool_use blocks into ActionProposal[]. Unknown tools or
// schema-violating inputs are dropped silently so a bad proposal never breaks
// the chat reply.

let client: Anthropic | null = null
function getClient(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return null
  if (!client) client = new Anthropic({ apiKey: key })
  return client
}

// Model IDs are now resolved per-call via `resolveModel(purpose)` in ./modelRouting.

function formatActivityForPrompt(events: ActivityEvent[]): string {
  if (events.length === 0) return '(no recorded activity in the window)'
  // Render newest-first events as a compact bulleted log. Truncate long payload strings.
  const lines = events.map((e) => {
    const when = new Date(e.ts).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit'
    })
    const p = e.payload || {}
    const truncate = (v: unknown, n: number): string => {
      const s = typeof v === 'string' ? v : v == null ? '' : JSON.stringify(v)
      return s.length > n ? s.slice(0, n) + '…' : s
    }
    let detail = ''
    switch (e.kind) {
      case 'task_switched':
        detail = `→ "${truncate(p.toTitle, 60)}"`
        break
      case 'widget_added':
        detail = `${p.kind ?? '?'} "${truncate(p.title || p.content, 50)}"`
        break
      case 'widget_focused':
        detail = `${p.kind ?? '?'} "${truncate(p.title, 40)}"`
        break
      case 'widget_removed':
        detail = `${p.kind ?? '?'}`
        break
      case 'browser_nav':
        detail = `${truncate(p.title || p.host || p.url, 70)}`
        break
      case 'note_edit':
        detail = `${p.kind ?? 'note'}: "${truncate(p.preview, 50)}"`
        break
      case 'chat_sent':
        detail = `"${truncate(p.preview, 70)}"`
        break
      case 'session_started':
        detail = `${p.plannedSeconds ?? 0}s planned`
        break
      case 'session_ended':
        detail = `${p.outcome ?? '?'} after ${p.actualSeconds ?? 0}s`
        break
      case 'ai_setup_run':
        detail = `${p.count ?? '?'} suggestions`
        break
      case 'resume_generated':
        detail = ''
        break
    }
    return `  ${when}  ${e.kind}${detail ? '  ' + detail : ''}`
  })
  return lines.join('\n')
}

function summarizeWidgets(widgets: Widget[]): string {
  if (widgets.length === 0) return '(no widgets on the canvas yet)'
  const lines: string[] = []
  for (const w of widgets.slice(0, 14)) {
    const title = w.title ? `"${w.title}"` : ''
    const content = (w.content || '').replace(/\s+/g, ' ').slice(0, 180)
    const meta = content ? `: ${content}` : ''
    // Include the FULL widget.id — Claude needs to pass it back verbatim to
    // propose_update_widget / propose_delete_widget / propose_add_table_row.
    lines.push(`- id=${w.id} kind=${w.kind} ${title}${meta}`)
    // For table widgets, also include the bound table's schema so Claude
    // knows what columns exist + their types. The content field for a
    // table widget IS the table id.
    if (w.kind === 'table' && w.content) {
      try {
        // Lazy import to avoid a circular dep — tables module imports from db
        // which boots SQLite, and we only need it inside this function.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { getTable } = require('../db/tables') as typeof import('../db/tables')
        const table = getTable(w.content)
        if (table) {
          const cols = table.schema.columns
            .map((c) => `${c.id}:${c.label}(${c.type})`)
            .join(', ')
          lines.push(`    tableId=${w.content} columns=[${cols}]`)
        }
      } catch {
        // best-effort
      }
    }
    // For field widgets, surface the type + label so Claude can refer.
    if (w.kind === 'field' && w.content) {
      try {
        const parsed = JSON.parse(w.content) as {
          def?: { type?: string; label?: string }
          value?: unknown
        }
        if (parsed.def) {
          lines.push(
            `    field type=${parsed.def.type ?? '?'} label="${parsed.def.label ?? ''}"`
          )
        }
      } catch {
        // ignore malformed content
      }
    }
  }
  if (widgets.length > 14) lines.push(`- (+${widgets.length - 14} more widgets)`)
  return lines.join('\n')
}

function taskBlock(taskId: string): string {
  const node = getNode(taskId)
  if (!node || node.kind !== 'task') return ''
  const widgets = listWidgetsByTask(taskId)
  const lines = [
    `Task: ${node.title}`,
    node.description ? `Notes: ${node.description}` : '',
    `Status: ${node.status}`,
    `Priority/Interest/Importance: ${node.priority}/${node.interest}/${node.importance} (1-5)`,
    node.estimateMinutes !== null
      ? `Estimate: ${node.estimateMinutes} min (extensions: ${node.extensionsMinutes} min)`
      : '',
    '',
    'Widgets on the desk:',
    summarizeWidgets(widgets)
  ].filter(Boolean)
  return lines.join('\n')
}

function buildSystemPrompt(taskId: string | null): string {
  const base =
    'You are FocusBuddy, the in-app pair-worker for an ADHD-friendly task-execution desktop app. ' +
    'You help the user think, plan, research, and complete the task they are currently focused on. ' +
    'You can see the contents of their canvas (sticky notes, browsers, files, calculators, timers — listed below). ' +
    'Be concise and action-oriented. Default to suggesting the single next concrete step over long explanations. ' +
    'When the user asks for research, give the 3–5 highest-value points, not an essay.\n\n' +
    // ── Action-proposal protocol (JSON-required) ──────────────────────────
    'OUTPUT FORMAT: every response you produce MUST be a single valid JSON object. No prose outside the JSON. No markdown code fences. JUST the JSON. Shape:\n' +
    '{\n' +
    '  "reply": "1-2 short markdown sentences shown to the user as your chat message",\n' +
    '  "actions": [ /* zero or more action objects */ ]\n' +
    '}\n\n' +
    'Each action object has a "kind" plus its required fields. Valid kinds:\n' +
    '\n' +
    '  { "kind": "create-todo-list", "title": "Launch checklist", "items": ["Buy hosting", "Record pilot"], "reason": "checklist for launch" }\n' +
    '  { "kind": "open-url", "url": "https://docs.google.com/...", "title": "Brief draft", "reason": "..." }\n' +
    '  { "kind": "create-widget", "widgetKind": "sticky"|"note"|"markdown"|"calculator"|"color"|"timer", "title": "...", "content": "...", "reason": "..." }\n' +
    '  { "kind": "create-page", "title": "Project brief", "sections": [{"heading":"Goals","body":"..."}], "reason": "..." }\n' +
    '  { "kind": "create-task", "title": "Q1 rebrand", "notes": "scope notes", "reason": "..." }\n' +
    '  { "kind": "create-table", "title": "Episodes", "columns": [{"label":"Title","type":"text-short"},{"label":"Status","type":"single-select","options":["Draft","Recorded","Live"]}], "reason": "..." }\n' +
    '  { "kind": "add-table-row", "tableId": "<from canvas summary>", "cells": {"Title":"Pilot","Status":"Draft"}, "reason": "..." }\n' +
    '  { "kind": "create-field", "label": "Energy", "fieldType": "single-select", "options": ["Low","Med","High"], "reason": "..." }\n' +
    '  { "kind": "update-widget", "widgetId": "<from canvas summary>", "label": "the launch checklist", "title": "...", "content": "...", "reason": "..." }\n' +
    '  { "kind": "delete-widget", "widgetId": "<from canvas summary>", "label": "the empty sticky", "reason": "..." }\n' +
    '  { "kind": "start-focus-session", "minutes": 5, "reason": "..." }\n' +
    '\n' +
    '⚠ HARD RULES:\n' +
    '1. The user sees ONLY two things: (a) the "reply" field rendered as markdown, and (b) one action card for each item in the "actions" array. They do NOT see anything else you write. Describing widgets in prose inside "reply" does NOT create them — the actions array must contain the entries.\n' +
    '2. For pure chat / questions / no-action requests: actions = []. Just put your answer in reply.\n' +
    '3. For multi-widget setups: one action object per widget. A planning workspace with 3 things = 3 entries in actions.\n' +
    '4. For todo lists: ALWAYS use "create-todo-list" — never a "create-widget" of kind "markdown" with bullets.\n' +
    '5. For Google Docs/Sheets/Slides or any URL: use "open-url", not "create-widget".\n' +
    '6. For Airtable-style record collections (clients, episodes, contacts, ideas with columns): use "create-table". Define columns up-front. Use "add-table-row" to insert specific rows after the table exists.\n' +
    '7. For modifying existing widgets, use their id from the canvas summary (shown as `id=...`). Same for tableId.\n' +
    '8. Delete only on explicit user request, never speculatively.\n' +
    '9. "reply" should be short (1-2 sentences). Markdown is rendered. Don\'t list the widgets in reply — let the cards speak.\n\n' +
    'CORRECT for "set up a podcast launch workspace":\n' +
    '{\n' +
    '  "reply": "Setting up your podcast launch — apply the cards below.",\n' +
    '  "actions": [\n' +
    '    {"kind":"create-todo-list","title":"Launch checklist","items":["Hosting","Pilot","Submit to Apple"],"reason":"launch milestones"},\n' +
    '    {"kind":"create-table","title":"Episodes","columns":[{"label":"Title","type":"text-short"},{"label":"Status","type":"single-select","options":["Draft","Recorded","Live"]}],"reason":"episode tracker"}\n' +
    '  ]\n' +
    '}\n\n' +
    'CORRECT for "what time is it in Tokyo":\n' +
    '{ "reply": "Tokyo is JST (UTC+9). Right now it\'s roughly 17 hours ahead of Pacific Time.", "actions": [] }\n\n' +
    'INCORRECT (NEVER do this): A reply that says "Here are the widgets I\'ve added: 📝 **Launch checklist** with these items..." while actions is empty. The widgets do not exist if they are not in the actions array.'
  if (!taskId) return base
  const block = taskBlock(taskId)
  if (!block) return base
  return `${base}\n\n${block}`
}

// ── Parse the JSON-structured chat response ────────────────────────────────
// Claude's prompt requires {reply: string, actions: [...]} JSON. This parser
// validates each action against the ActionProposal kinds we know and drops
// malformed entries. Unknown kinds → silently skipped (forward-compat with
// future tool definitions in the prompt).
//
// Returns { reply, proposals }. If the model returned NO valid JSON the
// caller treats the entire text as the reply with no proposals.
function parseChatJson(raw: string): {
  reply: string
  proposals: ActionProposal[]
} | null {
  const jsonStr = extractJson(raw)
  if (!jsonStr) return null
  let parsed: { reply?: unknown; actions?: unknown }
  try {
    parsed = JSON.parse(jsonStr) as { reply?: unknown; actions?: unknown }
  } catch {
    return null
  }
  const reply = typeof parsed.reply === 'string' ? parsed.reply : ''
  const actionsRaw = Array.isArray(parsed.actions) ? parsed.actions : []
  const proposals: ActionProposal[] = []
  let i = 0
  for (const a of actionsRaw) {
    if (!a || typeof a !== 'object') continue
    const action = a as Record<string, unknown>
    const kind = action.kind as string
    const reason =
      typeof action.reason === 'string' ? (action.reason as string) : undefined
    switch (kind) {
      case 'create-widget': {
        const widgetKind = action.widgetKind as WidgetKind
        if (!widgetKind) break
        proposals.push({
          id: makeProposalId('cw', i++),
          kind: 'create-widget',
          widgetKind,
          title: typeof action.title === 'string' ? (action.title as string) : undefined,
          content:
            typeof action.content === 'string' ? (action.content as string) : undefined,
          reason
        })
        break
      }
      case 'open-url': {
        const url = action.url as string
        if (!url) break
        proposals.push({
          id: makeProposalId('url', i++),
          kind: 'open-url',
          url,
          title: typeof action.title === 'string' ? (action.title as string) : undefined,
          reason
        })
        break
      }
      case 'create-todo-list': {
        const title = action.title as string
        const items = Array.isArray(action.items) ? (action.items as string[]) : []
        if (!title || items.length === 0) break
        proposals.push({
          id: makeProposalId('todo', i++),
          kind: 'create-todo-list',
          title,
          items,
          reason
        })
        break
      }
      case 'create-page': {
        const title = action.title as string
        const sections = Array.isArray(action.sections)
          ? (action.sections as Array<{ heading: string; body?: string }>)
          : []
        if (!title || sections.length === 0) break
        proposals.push({
          id: makeProposalId('page', i++),
          kind: 'create-page',
          title,
          content: JSON.stringify(sectionsToTiptap(sections)),
          reason
        })
        break
      }
      case 'create-task': {
        const title = action.title as string
        if (!title) break
        proposals.push({
          id: makeProposalId('task', i++),
          kind: 'create-task',
          title,
          notes:
            typeof action.notes === 'string' ? (action.notes as string) : undefined,
          reason
        })
        break
      }
      case 'start-focus-session': {
        const minutes = action.minutes as number
        if (!minutes || minutes <= 0) break
        proposals.push({
          id: makeProposalId('fs', i++),
          kind: 'start-focus-session',
          minutes,
          reason
        })
        break
      }
      case 'delete-widget': {
        const widgetId = action.widgetId as string
        const label = action.label as string
        if (!widgetId || !label) break
        proposals.push({
          id: makeProposalId('del', i++),
          kind: 'delete-widget',
          widgetId,
          label,
          reason
        })
        break
      }
      case 'update-widget': {
        const widgetId = action.widgetId as string
        const label = action.label as string
        if (!widgetId || !label) break
        proposals.push({
          id: makeProposalId('upd', i++),
          kind: 'update-widget',
          widgetId,
          label,
          title:
            typeof action.title === 'string' ? (action.title as string) : undefined,
          content:
            typeof action.content === 'string' ? (action.content as string) : undefined,
          reason
        })
        break
      }
      case 'create-table': {
        const title = action.title as string
        const columns = Array.isArray(action.columns)
          ? (action.columns as Array<{
              label: string
              type: string
              options?: string[]
            }>)
          : []
        if (!title || columns.length === 0) break
        proposals.push({
          id: makeProposalId('tbl', i++),
          kind: 'create-table',
          title,
          columns: columns as unknown as Extract<
            ActionProposal,
            { kind: 'create-table' }
          >['columns'],
          reason
        })
        break
      }
      case 'add-table-row': {
        const tableId = action.tableId as string
        const cells = action.cells as Record<string, string>
        if (!tableId || !cells || typeof cells !== 'object') break
        proposals.push({
          id: makeProposalId('row', i++),
          kind: 'add-table-row',
          tableId,
          cells,
          reason
        })
        break
      }
      case 'create-field': {
        const label = action.label as string
        const fieldType = action.fieldType as string
        if (!label || !fieldType) break
        proposals.push({
          id: makeProposalId('fld', i++),
          kind: 'create-field',
          label,
          fieldType: fieldType as Extract<
            ActionProposal,
            { kind: 'create-field' }
          >['fieldType'],
          options: Array.isArray(action.options)
            ? (action.options as string[])
            : undefined,
          reason
        })
        break
      }
    }
  }
  return { reply, proposals }
}

export async function sendChat(req: ChatRequest): Promise<ChatResponse> {
  const c = getClient()
  if (!c) {
    return {
      ok: false,
      needsApiKey: true,
      error:
        'No ANTHROPIC_API_KEY found. Add it to projects/focusbuddy/.env (see .env.example) and restart the app.'
    }
  }
  try {
    const system = buildSystemPrompt(req.taskId)
    const msgs = req.messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
    // DELIBERATELY no `tools:` passed. We tried Anthropic native tool-use and
    // the model defaults to prose too often even when the prompt commands
    // tools. AI Builder uses a strict JSON-required prompt (same pattern as
    // here) and is bulletproof. Same approach for chat: prompt mandates a
    // {reply, actions} JSON envelope; parser extracts both.
    const resp = await c.messages.create({
      model: resolveModel('chat'),
      max_tokens: 2048,
      system,
      messages: msgs
    })
    const text = resp.content
      .filter((b) => b.type === 'text')
      .map((b) => ('text' in b ? b.text : ''))
      .join('\n')
      .trim()

    const parsed = parseChatJson(text)
    if (parsed) {
      return {
        ok: true,
        message: {
          role: 'assistant',
          content: parsed.reply || (parsed.proposals.length > 0 ? "Here's what I can set up:" : ''),
          ts: Date.now()
        },
        proposals: parsed.proposals.length > 0 ? parsed.proposals : undefined
      }
    }
    // Fallback — model didn't return JSON. Treat the entire text as a plain
    // chat reply with no proposals. Better than a blank message.
    return {
      ok: true,
      message: { role: 'assistant', content: text, ts: Date.now() }
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export async function generateProactiveWelcome(taskId: string): Promise<ChatResponse> {
  const c = getClient()
  if (!c) return { ok: false, needsApiKey: true, error: 'No ANTHROPIC_API_KEY' }
  const node = getNode(taskId)
  if (!node || node.kind !== 'task') {
    return { ok: false, error: 'Task not found' }
  }
  const block = taskBlock(taskId)
  const system =
    'You are FocusBuddy, the in-app pair-worker. The user has just started working on a task. ' +
    'Give them a brief, energizing 1-2 sentence opening that: ' +
    '(1) acknowledges the task by name without being repetitive about the title; ' +
    '(2) suggests ONE concrete first step they could take RIGHT NOW based on what is on their canvas; ' +
    '(3) skips pleasantries, no "great!", no "let me help you", no questions back to the user. ' +
    'Write as if you are sitting next to them, ready to work.'
  const user = `${block}\n\nWrite the opening now (1-2 sentences, no preamble):`
  try {
    const resp = await c.messages.create({
      model: resolveModel('welcome'),
      max_tokens: 200,
      system,
      messages: [{ role: 'user', content: user }]
    })
    const text = resp.content
      .filter((b) => b.type === 'text')
      .map((b) => ('text' in b ? b.text : ''))
      .join('\n')
      .trim()
    return { ok: true, message: { role: 'assistant', content: text, ts: Date.now() } }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

const VALID_KINDS: WidgetKind[] = [
  'sticky',
  'note',
  'markdown',
  'webview',
  'pdf',
  'gdoc',
  'gsheet',
  'gslide',
  'email',
  'calculator',
  'color',
  'image',
  'video',
  'timer'
]

function extractJson(text: string): string | null {
  // Allow Claude to wrap in markdown ```json ... ``` or just return raw JSON
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
  if (fence) return fence[1].trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) return text.slice(start, end + 1)
  return null
}

export async function suggestSetupWidgets(taskId: string): Promise<SetupSuggestResponse> {
  const c = getClient()
  if (!c) return { ok: false, needsApiKey: true, error: 'No ANTHROPIC_API_KEY' }
  const node = getNode(taskId)
  if (!node || node.kind !== 'task') {
    return { ok: false, error: 'Task not found' }
  }
  const existing = listWidgetsByTask(taskId)
  const existingSummary =
    existing.length > 0
      ? existing
          .map(
            (w) =>
              `- ${w.kind}${w.title ? ` "${w.title}"` : ''}${w.content ? `: ${w.content.slice(0, 80)}` : ''}`
          )
          .join('\n')
      : '(none yet — fresh canvas)'

  const recent = getRecentHistory(8, taskId)
  const recentSummary =
    recent.length > 0
      ? recent
          .map(
            (r) =>
              `- ${r.title || r.host || r.url}${r.title ? ` (${r.host})` : ''} — ${r.url} [${r.visitCount}x]`
          )
          .join('\n')
      : '(no browsing history yet)'

  const system =
    'You are FocusBuddy, a workspace setup assistant for an ADHD-friendly task app. ' +
    'The user is about to start a task — they often find it hard to start because deciding which tools to open is paralyzing. ' +
    'Your job: suggest exactly the widgets they need. Be CONCRETE and SPECIFIC. If they need to research X, suggest a search URL for X, not "a browser for research". ' +
    'Aim for 4–7 suggestions. Skip widgets that are already on their canvas (listed below).' +
    '\n\nAvailable widget kinds:\n' +
    '- sticky: a small colored sticky note (use for short reminders, talking points)\n' +
    '- note: a larger paper note (use for longer writing surface)\n' +
    '- markdown: a markdown editor that renders to rich text. For checklists use GFM task-list syntax — each line must start with "- [ ] " (unchecked) or "- [x] " (checked), exactly that, dash-space-bracket. Use for structured outlines, briefs, checklists, tables, longer documents.\n' +
    '- webview: any URL (use this for generic browser tabs)\n' +
    '- gdoc: a Google Doc URL\n' +
    '- gsheet: a Google Sheet URL\n' +
    '- gslide: a Google Slides URL\n' +
    '- pdf: a PDF URL\n' +
    '- email: a Gmail/Outlook URL (default https://mail.google.com)\n' +
    '- timer: a countdown timer — content MUST be JSON like {"targetSec":1500,"elapsedSec":0,"state":"idle","startedAt":null}\n' +
    '- calculator: an inline calculator — content empty\n' +
    '- color: a color picker — content can be empty or a hex like "#fbbf24"\n' +
    '\nFor URLs you do not know exactly, use sensible specific guesses:\n' +
    '- Google search: https://www.google.com/search?q=YOUR+SEARCH+TERMS\n' +
    '- Gmail: https://mail.google.com/mail/u/0/#search/RELEVANT-QUERY (when looking up specific email threads)\n' +
    '- Otherwise leave content empty and the user fills the URL.\n' +
    '\nRespond with VALID JSON ONLY, no commentary, no markdown fence. Schema:\n' +
    '{\n  "suggestions": [\n    {\n      "kind": "webview",\n      "title": "short 1-4 word label",\n      "content": "URL or text",\n      "reason": "one sentence why this helps"\n    }\n  ]\n}'

  const userMsg = `Task to set up:
Title: ${node.title}
${node.description ? 'Description: ' + node.description : ''}
Priority/Interest/Importance: ${node.priority}/${node.interest}/${node.importance} (1-5)
${node.estimateMinutes !== null ? `Estimated time: ${node.estimateMinutes} min` : ''}

Widgets already on the canvas (don't suggest duplicates of these):
${existingSummary}

The user's most-visited pages (prefer these specific URLs when relevant — they're the user's actual workflow, not generic guesses):
${recentSummary}

Return the JSON now. 4–7 suggestions. Specific URLs where possible.`

  try {
    const resp = await c.messages.create({
      model: resolveModel('setup'),
      max_tokens: 1500,
      system,
      messages: [{ role: 'user', content: userMsg }]
    })
    const text = resp.content
      .filter((b) => b.type === 'text')
      .map((b) => ('text' in b ? b.text : ''))
      .join('\n')
      .trim()
    const jsonStr = extractJson(text)
    if (!jsonStr) return { ok: false, error: 'AI did not return JSON' }
    let parsed: unknown
    try {
      parsed = JSON.parse(jsonStr)
    } catch (e) {
      return { ok: false, error: 'AI returned invalid JSON: ' + (e as Error).message }
    }
    const arr = (parsed as { suggestions?: unknown[] }).suggestions
    if (!Array.isArray(arr)) {
      return { ok: false, error: 'AI response missing "suggestions" array' }
    }
    const valid: WidgetSuggestion[] = []
    for (const item of arr) {
      const obj = item as Partial<WidgetSuggestion>
      if (!obj.kind || !VALID_KINDS.includes(obj.kind)) continue
      valid.push({
        kind: obj.kind,
        title: (obj.title ?? '').toString().slice(0, 80),
        content: (obj.content ?? '').toString().slice(0, 600),
        reason: (obj.reason ?? '').toString().slice(0, 200)
      })
    }
    if (valid.length === 0) {
      return { ok: false, error: 'AI returned no valid suggestions' }
    }
    return { ok: true, suggestions: valid }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export async function generateResume(
  taskId: string
): Promise<{ ok: boolean; markdown?: string; error?: string; needsApiKey?: boolean }> {
  const c = getClient()
  if (!c) return { ok: false, needsApiKey: true, error: 'No ANTHROPIC_API_KEY' }
  const node = getNode(taskId)
  if (!node || node.kind !== 'task') {
    return { ok: false, error: 'Task not found' }
  }
  const block = taskBlock(taskId)
  const system =
    'You are generating a "handoff document" so the user can return to this task tomorrow and resume in 30 seconds instead of 20 minutes. ' +
    'Write concise markdown with these sections, in this order: ' +
    '\n\n# Where you are\n(2-3 sentences on what has been worked on, based on sticky notes / browser URLs / notes on the canvas)\n\n' +
    '# Key decisions\n(bulleted list of any decisions noted in the widgets; if none clear, write "(none captured yet)")\n\n' +
    '# Open questions\n(bulleted list of unresolved items; if none, write "(none)")\n\n' +
    '# Next 3 actions\n(numbered list of the most concrete next steps to resume work)\n\n' +
    'Keep the whole document under 250 words. No preamble, no pleasantries, no meta-commentary.'
  const user = `${block}\n\nGenerate the handoff document now.`
  try {
    const resp = await c.messages.create({
      model: resolveModel('resume'),
      max_tokens: 1500,
      system,
      messages: [{ role: 'user', content: user }]
    })
    const text = resp.content
      .filter((b) => b.type === 'text')
      .map((b) => ('text' in b ? b.text : ''))
      .join('\n')
      .trim()
    return { ok: true, markdown: text }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * "What was I doing?" — summarizes recent activity into a short narrative.
 *
 * Uses Haiku (fast + cheap) since this is pure summarization and gets called
 * on demand by users who just came back from a context switch.
 */
export async function summarizeRecentTrail(
  taskId: string | null,
  sinceMs: number
): Promise<TrailSummaryResponse> {
  const c = getClient()
  if (!c) return { ok: false, needsApiKey: true, error: 'No ANTHROPIC_API_KEY' }

  const events = getRecentActivity({ taskId, sinceMs, limit: 120 })
  if (events.length === 0) {
    return {
      ok: true,
      summary:
        "No recorded activity in the window. Either you just opened the app, you've been away, or all the action was happening inside a browser tab (those page-internal clicks aren't tracked yet).",
      eventCount: 0
    }
  }

  // Sort oldest-first so the prompt reads chronologically.
  const ordered = [...events].sort((a, b) => a.ts - b.ts)
  const node = taskId ? getNode(taskId) : null
  const taskTitle = node ? `"${node.title}"` : 'this session'

  const system =
    'You are FocusBuddy\'s external memory for an ADHD user who just came back from a context switch. ' +
    'Given a chronological activity log, produce a SHORT narrative (3-5 sentences) of what they were doing, ' +
    'so they can pick up where they left off without re-orienting. ' +
    'Be specific — name the documents, URLs, sticky contents. ' +
    'Lead with the most important thread; end with "where you left off". ' +
    'No bullet points, no headings — just one warm, concise paragraph. ' +
    "Don't pad with apologies or meta-commentary."

  const user = `Activity log for ${taskTitle} (chronological):\n${formatActivityForPrompt(ordered)}\n\nWrite the narrative now.`

  try {
    const resp = await c.messages.create({
      model: resolveModel('trail_summary'),
      max_tokens: 400,
      system,
      messages: [{ role: 'user', content: user }]
    })
    const text = resp.content
      .filter((b) => b.type === 'text')
      .map((b) => ('text' in b ? b.text : ''))
      .join('\n')
      .trim()
    if (!text) return { ok: false, error: 'AI returned empty summary' }
    return { ok: true, summary: text, eventCount: events.length }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * Body Double Mode — quiet AI presence that drops a 1-line observation every ~10 min.
 *
 * Three states based on recent activity:
 *  - Engaged (events within last 10 min) → short affirming observation
 *  - Just-drifted (10-20 min idle) → soft check-in
 *  - Deeply away (>20 min idle) → return literal "SKIP" so we don't spam silence
 *
 * Designed for presence without pressure. Max ~15 words. No questions, no coaching.
 */
export async function generatePresenceNarration(
  taskId: string | null,
  recentMessages: string[]
): Promise<BodyDoubleResponse> {
  const c = getClient()
  if (!c) return { ok: false, needsApiKey: true, error: 'No ANTHROPIC_API_KEY' }

  const now = Date.now()
  const events = getRecentActivity({ taskId, sinceMs: now - 20 * 60 * 1000, limit: 30 })
  const lastEventMs = events.length > 0 ? Math.max(...events.map((e) => e.ts)) : 0
  const idleMs = lastEventMs > 0 ? now - lastEventMs : Infinity

  // Deeply away — don't ping. The "Bring me back" button (separate feature) is the right tool there.
  if (events.length === 0 || idleMs > 20 * 60 * 1000) {
    return { ok: true, skip: true }
  }

  const node = taskId ? getNode(taskId) : null
  const taskTitle = node ? `"${node.title}"` : 'this session'
  const state = idleMs < 10 * 60 * 1000 ? 'engaged' : 'just_drifted'

  const recentLines =
    recentMessages.length > 0
      ? `\n\nThings you've already said (don't repeat tone or phrasing):\n${recentMessages.slice(-5).map((m) => `- "${m}"`).join('\n')}`
      : ''

  const system =
    'You are FocusBuddy in Body Double mode — a quiet AI presence sitting beside an ADHD user as they work. ' +
    'Your job: presence WITHOUT pressure. ' +
    'Drop a SHORT observation (max 15 words, often shorter — under 10 ideal). ' +
    'Tone: warm, low-key, like a friend at a coffee shop noticing you without interrupting. ' +
    '\n\nABSOLUTE RULES:\n' +
    '- No questions that demand answers.\n' +
    "- No coaching or suggestions ('try X', 'maybe Y').\n" +
    "- No sycophancy ('great job!', 'amazing work!', 'you're crushing it!').\n" +
    "- No emojis unless the user is in a clearly playful state.\n" +
    '- Never repeat a previous observation. Vary cadence and angle.\n' +
    '- One sentence. Sometimes a fragment is better.\n' +
    '\nReturn JUST the line. No quotes, no preamble.'

  let user: string
  if (state === 'engaged') {
    const eventLines = events
      .slice(0, 12)
      .map((e) => `- ${e.kind}: ${JSON.stringify(e.payload).slice(0, 100)}`)
      .join('\n')
    user = `The user is actively working on ${taskTitle}. Recent activity (last 10 min):\n${eventLines}\n\nDrop one quiet line that acknowledges what they're doing — name something specific from the activity (a doc, a URL host, a chat topic, the session count) so they feel seen. Max 15 words.${recentLines}`
  } else {
    const minIdle = Math.round(idleMs / 60000)
    user = `The user was working on ${taskTitle} but has been idle for ${minIdle} minutes. They might be on a break, in another app, or just thinking. Drop one warm low-key check-in line — make it clear you're still here without making them feel watched. Max 15 words. Examples (don't copy verbatim): "Still here whenever." / "Coffee break? No rush." / "${minIdle}m breath. Welcome back when ready."${recentLines}`
  }

  try {
    const resp = await c.messages.create({
      model: resolveModel('body_double'),
      max_tokens: 60,
      system,
      messages: [{ role: 'user', content: user }]
    })
    const text = resp.content
      .filter((b) => b.type === 'text')
      .map((b) => ('text' in b ? b.text : ''))
      .join('')
      .trim()
      .replace(/^["']|["']$/g, '') // strip wrapping quotes if model added them

    if (!text || text.toUpperCase() === 'SKIP') return { ok: true, skip: true }
    return { ok: true, line: text }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * Smart Stacking — semantic grouping of unsectioned widgets.
 *
 * Reads non-archived, non-pinned, top-level (no parent section) widgets on a task,
 * asks Claude to propose 2-5 named groups based on what they relate to. The user
 * reviews and accepts; the renderer creates the sections.
 */
export async function proposeSmartStacks(taskId: string): Promise<SmartStackResponse> {
  const c = getClient()
  if (!c) return { ok: false, needsApiKey: true, error: 'No ANTHROPIC_API_KEY' }
  const node = getNode(taskId)
  if (!node) return { ok: false, error: 'Task not found' }

  const allWidgets = listWidgetsByTask(taskId)
  // Only group widgets that aren't already in a section, aren't archived, aren't pinned, aren't sections themselves
  const candidates = allWidgets.filter(
    (w) =>
      !w.archived &&
      !w.pinned &&
      w.kind !== 'section' &&
      w.parentSectionId === null
  )

  if (candidates.length < 3) {
    return {
      ok: false,
      error: 'Need at least 3 unsectioned widgets on the canvas to find groups.'
    }
  }

  // Cap the prompt size — 30 most-recently-updated is plenty of signal
  const trimmed = [...candidates]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 30)

  const widgetLines = trimmed
    .map((w) => {
      const title = w.title ? w.title.slice(0, 60) : ''
      const content = (w.content || '').replace(/\s+/g, ' ').trim().slice(0, 120)
      const meta = [title, content].filter(Boolean).join(' — ')
      return `[${w.id}] (${w.kind}) ${meta || '(empty)'}`
    })
    .join('\n')

  const system =
    'You are FocusBuddy\'s Smart Stack organizer. The user has many widgets on their canvas for an ADHD-friendly task workspace. ' +
    'Your job: group widgets that BELONG TOGETHER based on what sub-goal they serve. ' +
    '\n\nRules:\n' +
    '- Use widget titles and content snippets to infer relationship.\n' +
    "- A group should have a clear theme, not just a widget-kind label (don't say 'Stickies' or 'Browsers').\n" +
    '- Skip widgets that don\'t fit anywhere — leave them ungrouped (don\'t list them).\n' +
    '- 2-5 groups ideal. Sometimes 1 if everything truly relates. Never more than 5.\n' +
    '- Group names: 1-3 words, concrete (e.g. "Pricing research" not "Research", "Anna outreach" not "People").\n' +
    "- Each group needs 2+ members. Don't propose a one-widget group.\n" +
    '- One sentence reason per group.\n' +
    '\nRespond with VALID JSON ONLY, no commentary, no markdown fence. Schema:\n' +
    '{\n  "groups": [\n    {\n      "name": "string",\n      "widgetIds": ["id", "id"],\n      "reason": "one sentence"\n    }\n  ]\n}'

  const user = `Active task: "${node.title}"${node.description ? '\nNotes: ' + node.description : ''}\n\nWidgets to group:\n${widgetLines}\n\nReturn JSON now.`

  try {
    const resp = await c.messages.create({
      model: resolveModel('smart_stack'),
      max_tokens: 1200,
      system,
      messages: [{ role: 'user', content: user }]
    })
    const text = resp.content
      .filter((b) => b.type === 'text')
      .map((b) => ('text' in b ? b.text : ''))
      .join('\n')
      .trim()
    const jsonStr = extractJson(text)
    if (!jsonStr) return { ok: false, error: 'AI did not return JSON' }
    let parsed: unknown
    try {
      parsed = JSON.parse(jsonStr)
    } catch (e) {
      return { ok: false, error: 'AI returned invalid JSON: ' + (e as Error).message }
    }
    const arr = (parsed as { groups?: unknown[] }).groups
    if (!Array.isArray(arr)) {
      return { ok: false, error: 'AI response missing "groups" array' }
    }

    const validIds = new Set(trimmed.map((w) => w.id))
    const groups: SmartStackGroup[] = []
    const claimed = new Set<string>()
    for (const item of arr) {
      const obj = item as Partial<SmartStackGroup>
      if (!obj.name || !obj.widgetIds || !Array.isArray(obj.widgetIds)) continue
      // Filter out unknown IDs and ones already claimed by an earlier group
      const ids = obj.widgetIds.filter(
        (id) => typeof id === 'string' && validIds.has(id) && !claimed.has(id)
      )
      if (ids.length < 2) continue // skip singleton or empty groups
      ids.forEach((id) => claimed.add(id))
      groups.push({
        name: String(obj.name).slice(0, 40),
        widgetIds: ids,
        reason: (obj.reason ?? '').toString().slice(0, 200)
      })
    }

    if (groups.length === 0) {
      return { ok: false, error: 'AI returned no valid groups' }
    }
    return { ok: true, groups }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ── AI Builder: free-form prompt → widget suggestions ────────────────────────
//
// User describes what they want to achieve (e.g. "track my freelance clients"
// or "plan a trip"). The model returns a set of suggested widgets — including
// fully-configured tables, pre-populated pages, and pre-typed field widgets.
// The renderer shows each as a card with a checkbox; only selected ones get
// spawned on the canvas.

export async function buildFromPrompt(input: {
  prompt: string
  taskId: string | null
}): Promise<AiBuildResponse> {
  const c = getClient()
  if (!c) return { ok: false, needsApiKey: true, error: 'No ANTHROPIC_API_KEY' }
  const userPrompt = input.prompt.trim()
  if (!userPrompt) {
    return { ok: false, error: 'Empty prompt — describe what you want to build.' }
  }

  // Existing-context block: if the user is on a task with widgets already,
  // we tell the model so it doesn't duplicate. Keeps suggestions additive.
  let existingBlock = '(empty canvas)'
  if (input.taskId) {
    const existing = listWidgetsByTask(input.taskId)
    if (existing.length > 0) {
      existingBlock = existing
        .map(
          (w) =>
            `- ${w.kind}${w.title ? ` "${w.title}"` : ''}${w.content ? `: ${w.content.slice(0, 80)}` : ''}`
        )
        .join('\n')
    }
  }

  const system = `You are FocusBuddy's workspace builder. Given a user's natural-language description of what they want to do, you suggest concrete widgets they can add to their canvas.

Widget kinds (use the EXACT kind string):
- "sticky" — small colored note. content = plain text.
- "note" — larger writing surface. content = plain text.
- "markdown" — markdown editor (renders to rich text). content = markdown.
- "page" — Notion-style rich document with headings, todos, lists, code blocks. Provide pageContent as a Tiptap document: { "type": "doc", "content": [...] }. Top-level nodes: paragraph, heading (with attrs.level 1-3), bulletList, orderedList, taskList, codeBlock, blockquote, horizontalRule.
- "table" — Airtable-style database with typed columns. Provide tableSchema.columns. Column types: "text-short", "text-long", "number", "checkbox", "single-select", "multi-select", "date", "attachment", "button", "relation". For select types, config.options must be an array of {id, label, color (hex)}. For "button", config = {action: "ai-prompt"|"shell", payload, label}. For "relation", config = {tableId: null} (user wires up later).
- "field" — single typed input on the canvas. Provide fieldDef = {id, type, label, config}. Same type list as table columns.
- "file" — placeholder for uploaded file. content = "" (user drops file later).
- "webview" — generic URL. content = full URL.
- "gdoc"/"gsheet"/"gslide" — Google docs/sheets/slides URL.
- "pdf" — PDF URL.
- "email" — Gmail/Outlook URL.
- "timer" — countdown. content = JSON: {"targetSec":1500,"elapsedSec":0,"state":"idle","startedAt":null}
- "calculator" — empty content.
- "color" — hex like "#fbbf24" or empty.

Rules:
1. Choose the BEST widget for each piece of the user's intent. Prefer "table" for any list-of-records-with-attributes ("clients", "tasks", "trips", "habits"). Prefer "page" for prose, plans, briefs. Prefer "field" for single values the user wants to glance at.
2. Tables should have 3-6 columns. Include a primary text column first (e.g. Name/Title) and useful attributes (Status, Date, Tags, etc.).
3. Pre-populate page content with section headings + a starter paragraph or todo list so the user has structure to fill in.
4. For "field" widgets, pick the type carefully — checkbox for binary, single-select for status with options, date for due dates, number for quantities.
5. Use sensible 4-8 suggestions per request. Each must be valuable on its own.
6. Skip widgets that already exist on the canvas (listed in "existing widgets" below).

Respond with VALID JSON ONLY (no commentary, no markdown fence). Schema:
{
  "intent": "1-sentence interpretation of what the user wants",
  "suggestions": [
    {
      "id": "s1",
      "kind": "table",
      "title": "Project tracker",
      "reason": "Track each project with status and due date",
      "tableSchema": {
        "columns": [
          {"id": "c1", "type": "text-short", "label": "Project", "config": {}},
          {"id": "c2", "type": "single-select", "label": "Status", "config": {"options": [
            {"id": "o1", "label": "Todo", "color": "#ef4444"},
            {"id": "o2", "label": "Doing", "color": "#f97316"},
            {"id": "o3", "label": "Done", "color": "#22c55e"}
          ]}},
          {"id": "c3", "type": "date", "label": "Due", "config": {}}
        ]
      }
    },
    {
      "id": "s2",
      "kind": "page",
      "title": "Project notes",
      "reason": "Brain dump space for ideas + decisions",
      "pageContent": {
        "type": "doc",
        "content": [
          {"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "Notes"}]},
          {"type": "paragraph", "content": [{"type": "text", "text": "Start typing..."}]}
        ]
      }
    }
  ]
}`

  const userMsg = `User's request:
${userPrompt}

Widgets already on the canvas (skip duplicates):
${existingBlock}

Return the JSON now.`

  try {
    const resp = await c.messages.create({
      model: resolveModel('setup'),
      max_tokens: 4000,
      system,
      messages: [{ role: 'user', content: userMsg }]
    })
    const text = resp.content
      .filter((b) => b.type === 'text')
      .map((b) => ('text' in b ? b.text : ''))
      .join('\n')
      .trim()
    const jsonStr = extractJson(text)
    if (!jsonStr) return { ok: false, error: 'AI did not return JSON' }
    let parsed: { intent?: string; suggestions?: AiBuildSuggestion[] }
    try {
      parsed = JSON.parse(jsonStr) as { intent?: string; suggestions?: AiBuildSuggestion[] }
    } catch {
      return { ok: false, error: 'AI returned invalid JSON' }
    }
    if (!parsed.suggestions || !Array.isArray(parsed.suggestions)) {
      return { ok: false, error: 'AI response missing suggestions array' }
    }
    // Defensive: enforce kind validity. Drop any suggestion whose kind we
    // don't render — saves a runtime error in the renderer.
    const allowedKinds: WidgetKind[] = [
      'sticky',
      'note',
      'markdown',
      'webview',
      'pdf',
      'gdoc',
      'gsheet',
      'gslide',
      'email',
      'calculator',
      'color',
      'image',
      'video',
      'timer',
      'section',
      'task-link',
      'local-app-launcher',
      'file',
      'field',
      'page',
      'table'
    ]
    const filtered = parsed.suggestions.filter((s) => allowedKinds.includes(s.kind))
    return {
      ok: true,
      intent: parsed.intent,
      suggestions: filtered
    }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

// ── Living pages ─────────────────────────────────────────────────────────────
//
// A "living" Page widget carries a `livingQuery` instead of (or alongside)
// user-edited content. Every time the task's other widgets change, we
// debounce in the renderer and call this function to re-synthesize the
// page's body. The output replaces widget.content with fresh Tiptap JSON.
//
// Anti-loop guarantees:
//   1. The page being regenerated is excluded from the canvas summary.
//   2. Other living pages on the same canvas are excluded too — otherwise
//      page A would describe page B which describes page A and the system
//      would oscillate. They cite each other only via the user's manual
//      authoring path (Inter-Widget Links, shipping after this feature).

export async function regenerateLivingPage(
  widgetId: string
): Promise<LivingPageRegenerateResponse> {
  const c = getClient()
  if (!c) return { ok: false, needsApiKey: true, error: 'No ANTHROPIC_API_KEY' }

  const w = getWidget(widgetId)
  if (!w) return { ok: false, error: 'Widget not found' }
  if (w.kind !== 'page') return { ok: false, error: 'Widget is not a page' }
  if (!w.livingQuery || !w.livingQuery.trim()) {
    return { ok: false, error: 'Living query is empty — set a query first' }
  }

  const task = getNode(w.taskId)
  if (!task || task.kind !== 'task') return { ok: false, error: 'Task not found' }

  const allWidgets = listWidgetsByTask(w.taskId)
  // Exclude self + every other living page on the same canvas so we don't
  // loop or self-reference. The user can still LINK pages explicitly via
  // Inter-Widget Links (next feature), but the AI summary never sees other
  // living pages' generated bodies.
  const source = allWidgets.filter(
    (other) => other.id !== w.id && !(other.kind === 'page' && other.livingQuery)
  )

  if (source.length === 0) {
    return {
      ok: true,
      skip: true,
      reason: 'No source material on the canvas yet — add notes, files, or pages, then regenerate.'
    }
  }

  const system =
    'You are FocusBuddy. The user has a "living page" on their canvas — a page whose body you regenerate ' +
    'on demand from the rest of the widgets in their current task. Your job is to synthesize a clean, ' +
    'useful answer to their query using ONLY the source material listed below.\n\n' +
    'OUTPUT RULES — read carefully:\n' +
    '  - Reply with raw markdown. NO code fences. NO preamble like "Here is the summary".\n' +
    '  - Start directly with the first heading or paragraph.\n' +
    '  - Use ## for section headings, - for bullets, - [ ] for open todos, - [x] for done.\n' +
    '  - If the source material does not contain enough to answer, say so in one sentence — do not invent.\n' +
    '  - Cite source widgets inline by quoting the widget title in **bold** when relevant, e.g. **Meeting notes**.\n' +
    '  - Keep it concise — this is a snapshot, not an essay. ~150-400 words is the right zone.'

  const user = `Task: ${task.title}\n${task.description ? `Notes: ${task.description}\n` : ''}\n` +
    `Living page query: ${w.livingQuery.trim()}\n\n` +
    `Source widgets on the canvas:\n${summarizeWidgets(source)}\n\n` +
    'Write the markdown body now:'

  try {
    const resp = await c.messages.create({
      model: resolveModel('living_page'),
      max_tokens: 1500,
      system,
      messages: [{ role: 'user', content: user }]
    })
    const text = resp.content
      .filter((b) => b.type === 'text')
      .map((b) => ('text' in b ? b.text : ''))
      .join('\n')
      .trim()

    if (!text) return { ok: false, error: 'Empty response from model' }

    const doc = markdownToTiptap(text)
    const generatedAt = Date.now()
    return {
      ok: true,
      content: JSON.stringify(doc),
      generatedAt
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
