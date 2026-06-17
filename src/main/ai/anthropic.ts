import Anthropic from '@anthropic-ai/sdk'
import { BROWSER_TOOLS, runBrowserTool } from './agentBrowser'
import { getNode } from '../db/nodes'
import { getWidget, listWidgetsByTask } from '../db/widgets'
import { listLinksByTask } from '../db/widgetLinks'
import { getTable } from '../db/tables'
import { getRecentHistory } from '../db/browsing'
import { getRecentActivity } from '../db/activity'
import { markdownToTiptap } from './markdownToTiptap'
import { extractJson, salvageEnvelope } from './chatJson'
import { resolveModel } from './modelRouting'
import { resolveAnthropicKey } from '../settingsStore'
import { shouldUseCredits, getCreditClient, invalidateCreditClient } from './creditMode'
import type {
  ActionProposal,
  ActivityEvent,
  AiBuildResponse,
  AiBuildSuggestion,
  BodyDoubleResponse,
  ChatRequest,
  ChatResponse,
  EmailReplyDraftResult,
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

// Cached SDK client keyed by the API key it was built with. When the user
// rotates the key from Settings we transparently swap to a fresh client on
// the next call — no app restart, no stale auth header.
let client: { key: string; instance: Anthropic } | null = null

function getClient(): Anthropic | null {
  // Credit mode first: when the user is signed in and policy says to use
  // PlexiDesk credits, route through the metered proxy. The proxy client's
  // own fetch handles the out-of-credits hand-off (auto fall-back to the
  // personal key in 'auto' mode), so call sites stay oblivious.
  if (shouldUseCredits()) {
    const credit = getCreditClient()
    if (credit) return credit
  }
  // BYOK path (and the fall-back when credit mode isn't applicable).
  const key = resolveAnthropicKey()
  if (!key) return null
  if (!client || client.key !== key) {
    client = { key, instance: new Anthropic({ apiKey: key }) }
  }
  return client.instance
}

/** Called by the IPC layer after a settings change so the next AI call
 *  picks up the new key without restarting the app. */
export function invalidateAnthropicClient(): void {
  client = null
  invalidateCreditClient()
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

// Compact "related & linked items" context: the widget-link graph for the task,
// so the assistant can act on linked widgets ("update the note linked to this
// browser"). Uses the same ids that appear in summarizeWidgets. Capped.
function summarizeLinks(taskId: string, widgets: Widget[]): string {
  const links = listLinksByTask(taskId)
  if (links.length === 0) return ''
  const MAX_LINKS = 20
  const idToKind = new Map(widgets.map((w) => [w.id, w.kind]))
  const lines = links.slice(0, MAX_LINKS).map((lk) => {
    const srcKind = idToKind.get(lk.sourceWidgetId) ?? '?'
    const tgtKind = idToKind.get(lk.targetWidgetId) ?? '?'
    // Surface the wire type so the assistant understands the relationship, not
    // just that two widgets are connected. A 'context' wire means "treat the
    // source as relevant background for the target"; a 'transform' wire names
    // the live operation; a 'mirror' wire means the two stay content-identical.
    let rel = 'related to'
    if (lk.type === 'transform') rel = lk.verb ? `feeds (${lk.verb}) into` : 'transforms into'
    else if (lk.type === 'mirror') rel = 'mirrors into'
    else rel = 'is context for'
    return `  ${lk.sourceWidgetId}(${srcKind}) ${rel} ${lk.targetWidgetId}(${tgtKind})`
  })
  if (links.length > MAX_LINKS) lines.push(`  (+${links.length - MAX_LINKS} more links)`)
  return 'Live wires between widgets (typed relationships):\n' + lines.join('\n')
}

function taskBlock(taskId: string): string {
  const node = getNode(taskId)
  if (!node || node.kind !== 'task') return ''
  const widgets = listWidgetsByTask(taskId)
  const linksSummary = summarizeLinks(taskId, widgets)
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
    summarizeWidgets(widgets),
    linksSummary || ''
  ].filter(Boolean)
  return lines.join('\n')
}

function buildSystemPrompt(taskId: string | null): string {
  const base =
    'You are PlexiDesk, the in-app pair-worker for an ADHD-friendly task-execution desktop app. ' +
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
    '  { "kind": "create-table", "id": "tbl-1", "title": "Episodes", "columns": [{"label":"Title","type":"text-short"},{"label":"Status","type":"single-select","options":["Draft","Recorded","Live"]}], "reason": "..." }\n' +
    '  { "kind": "add-table-row", "tableId": "$tbl-1", "cells": {"Title":"Pilot","Status":"Draft"}, "reason": "..." }\n' +
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
    '7. For modifying existing widgets, use their id from the canvas summary (shown as `id=...`). Same for an existing tableId.\n' +
    '7a. To add rows to a table you are creating in the SAME response, the table does not have a real id yet. Give the create-table action an "id" field (e.g. "tbl-1"), then in sibling add-table-row actions set "tableId": "$tbl-1" (literal $ prefix + the matching id). The system resolves it at apply time. NEVER guess a uuid for a not-yet-created table.\n' +
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
export function parseChatJson(raw: string): {
  reply: string
  proposals: ActionProposal[]
  truncated: boolean
} | null {
  let parsed: { reply?: unknown; actions?: unknown } | null = null
  let truncated = false
  const jsonStr = extractJson(raw)
  if (jsonStr) {
    try {
      parsed = JSON.parse(jsonStr) as { reply?: unknown; actions?: unknown }
    } catch {
      parsed = null
    }
  }
  if (!parsed) {
    // The whole envelope did not parse, which is almost always because the
    // model hit its output token limit mid-JSON. The actions that finished
    // before the cutoff are still complete objects, so salvage those rather
    // than dropping the entire response (which used to dump raw JSON into the
    // chat as prose).
    const salv = salvageEnvelope(raw)
    if (!salv) return null
    parsed = salv
    truncated = true
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
        // The AI can suggest its own proposal id (e.g. "tbl-1") so that
        // sibling add-table-row actions can reference it via "$tbl-1".
        // Fall back to a generated id when the AI doesn't bother.
        const proposedId =
          typeof action.id === 'string' && action.id.trim().length > 0
            ? (action.id as string)
            : makeProposalId('tbl', i++)
        proposals.push({
          id: proposedId,
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
        // Accept BOTH real uuids and "$<proposalId>" symbolic refs (the
        // applyAddTableRow resolver handles the prefix). Refuse only when
        // tableId is missing entirely.
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
  return { reply, proposals, truncated }
}

export async function sendChat(req: ChatRequest): Promise<ChatResponse> {
  const c = getClient()
  if (!c) {
    return {
      ok: false,
      needsApiKey: true,
      error:
        'No Anthropic API key set. Open Settings → AI → API keys and paste your key.'
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
      // 2048 was too tight: a "build me a workspace" request that emits several
      // todo lists plus a table and rows runs past it, the JSON gets cut off
      // mid-object, and the old parser fell back to printing the raw JSON. Give
      // the build envelope real headroom.
      model: resolveModel('chat'),
      max_tokens: 16384,
      system,
      messages: msgs
    })
    if ((resp.stop_reason as string) === 'refusal') {
      return { ok: false, error: 'Claude declined this request. Try rephrasing or breaking it into smaller steps.' }
    }
    if ((resp.stop_reason as string) === 'model_context_window_exceeded') {
      return { ok: false, error: 'Conversation hit the model context window. Start a fresh session.' }
    }
    const text = resp.content
      .filter((b) => b.type === 'text')
      .map((b) => ('text' in b ? b.text : ''))
      .join('\n')
      .trim()

    const parsed = parseChatJson(text)
    if (parsed) {
      let content = parsed.reply || (parsed.proposals.length > 0 ? "Here's what I can set up:" : '')
      if (parsed.truncated && parsed.proposals.length > 0) {
        // We recovered the actions that finished before the cutoff. Tell the
        // user the rest was dropped so they can ask for it rather than silently
        // getting a partial build.
        const n = parsed.proposals.length
        content +=
          `${content ? '\n\n' : ''}Your request was large, so I set up the first ${n} item${n === 1 ? '' : 's'} that fit. Ask me to continue for the rest, or break the request into smaller parts.`
      }
      return {
        ok: true,
        message: { role: 'assistant', content, ts: Date.now() },
        proposals: parsed.proposals.length > 0 ? parsed.proposals : undefined
      }
    }
    // No usable JSON came back. If the model was cut off at the token limit,
    // say so plainly. If it returned a JSON-shaped blob we still could not
    // read, show a friendly error rather than dumping raw JSON into the chat.
    // Only genuine prose (the model chose to chat) is passed through as-is.
    if ((resp.stop_reason as string) === 'max_tokens') {
      return {
        ok: false,
        error:
          'Your request produced more than I could fit in one response. Try asking for a smaller workspace, or split it across two messages.'
      }
    }
    if (text.trimStart().startsWith('{') || text.trimStart().startsWith('```')) {
      return {
        ok: false,
        error:
          "I couldn't read my own response that time. Try again, or ask for a smaller set of items."
      }
    }
    return {
      ok: true,
      message: { role: 'assistant', content: text, ts: Date.now() }
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// Raw single-turn completion for the AI command bar's intent router. Unlike
// sendChat, this does NOT impose the workspace-build system prompt and does NOT
// run the {reply, proposals} envelope parser over the result — both of which
// would discard the caller's router prompt and mangle the small intent JSON the
// router is meant to return. The caller supplies its own system prompt and gets
// the model's text back verbatim to parse. Kept deliberately narrow: a system
// string plus one user turn, used by the command bar to classify intent.
export async function routeCommandBar(input: {
  system: string
  text: string
}): Promise<{ ok: boolean; text?: string; needsApiKey?: boolean; error?: string }> {
  const c = getClient()
  if (!c) {
    return {
      ok: false,
      needsApiKey: true,
      error: 'No Anthropic API key set. Open Settings → AI · API keys to paste one.'
    }
  }
  const text = input.text.trim()
  if (!text) return { ok: false, error: 'Prompt is empty.' }
  try {
    const resp = await c.messages.create({
      model: resolveModel('command_route'),
      max_tokens: 1024,
      system: input.system,
      messages: [{ role: 'user', content: text }]
    })
    if ((resp.stop_reason as string) === 'refusal') {
      return { ok: false, error: 'Claude declined this request. Try rephrasing.' }
    }
    const out = resp.content
      .filter((b) => b.type === 'text')
      .map((b) => ('text' in b ? b.text : ''))
      .join('\n')
      .trim()
    if (!out) return { ok: false, error: 'Empty response from model.' }
    return { ok: true, text: out }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export async function generateProactiveWelcome(taskId: string): Promise<ChatResponse> {
  const c = getClient()
  if (!c) return { ok: false, needsApiKey: true, error: 'No Anthropic API key set. Open Settings → AI · API keys to paste one.' }
  const node = getNode(taskId)
  if (!node || node.kind !== 'task') {
    return { ok: false, error: 'Task not found' }
  }
  const block = taskBlock(taskId)
  const system =
    'You are PlexiDesk, the in-app pair-worker. The user has just started working on a task. ' +
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
    if ((resp.stop_reason as string) === 'refusal') {
      return { ok: false, error: 'Claude declined this request. Try rephrasing or breaking it into smaller steps.' }
    }
    if ((resp.stop_reason as string) === 'model_context_window_exceeded') {
      return { ok: false, error: 'Conversation hit the model context window. Start a fresh session.' }
    }
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


export async function suggestSetupWidgets(taskId: string): Promise<SetupSuggestResponse> {
  const c = getClient()
  if (!c) return { ok: false, needsApiKey: true, error: 'No Anthropic API key set. Open Settings → AI · API keys to paste one.' }
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
    'You are PlexiDesk, a workspace setup assistant for an ADHD-friendly task app. ' +
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
      max_tokens: 8192,
      system,
      messages: [{ role: 'user', content: userMsg }]
    })
    if ((resp.stop_reason as string) === 'refusal') {
      return { ok: false, error: 'Claude declined this request. Try rephrasing or breaking it into smaller steps.' }
    }
    if ((resp.stop_reason as string) === 'model_context_window_exceeded') {
      return { ok: false, error: 'Conversation hit the model context window. Start a fresh session.' }
    }
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
  if (!c) return { ok: false, needsApiKey: true, error: 'No Anthropic API key set. Open Settings → AI · API keys to paste one.' }
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
    if ((resp.stop_reason as string) === 'refusal') {
      return { ok: false, error: 'Claude declined this request. Try rephrasing or breaking it into smaller steps.' }
    }
    if ((resp.stop_reason as string) === 'model_context_window_exceeded') {
      return { ok: false, error: 'Conversation hit the model context window. Start a fresh session.' }
    }
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
  if (!c) return { ok: false, needsApiKey: true, error: 'No Anthropic API key set. Open Settings → AI · API keys to paste one.' }

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
    'You are PlexiDesk\'s external memory for an ADHD user who just came back from a context switch. ' +
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
    if ((resp.stop_reason as string) === 'refusal') {
      return { ok: false, error: 'Claude declined this request. Try rephrasing or breaking it into smaller steps.' }
    }
    if ((resp.stop_reason as string) === 'model_context_window_exceeded') {
      return { ok: false, error: 'Conversation hit the model context window. Start a fresh session.' }
    }
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
  if (!c) return { ok: false, needsApiKey: true, error: 'No Anthropic API key set. Open Settings → AI · API keys to paste one.' }

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
    'You are PlexiDesk in Body Double mode — a quiet AI presence sitting beside an ADHD user as they work. ' +
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
    if ((resp.stop_reason as string) === 'refusal') {
      return { ok: false, error: 'Claude declined this request. Try rephrasing or breaking it into smaller steps.' }
    }
    if ((resp.stop_reason as string) === 'model_context_window_exceeded') {
      return { ok: false, error: 'Conversation hit the model context window. Start a fresh session.' }
    }
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
  if (!c) return { ok: false, needsApiKey: true, error: 'No Anthropic API key set. Open Settings → AI · API keys to paste one.' }
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
    'You are PlexiDesk\'s Smart Stack organizer. The user has many widgets on their canvas for an ADHD-friendly task workspace. ' +
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
    if ((resp.stop_reason as string) === 'refusal') {
      return { ok: false, error: 'Claude declined this request. Try rephrasing or breaking it into smaller steps.' }
    }
    if ((resp.stop_reason as string) === 'model_context_window_exceeded') {
      return { ok: false, error: 'Conversation hit the model context window. Start a fresh session.' }
    }
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
  if (!c) return { ok: false, needsApiKey: true, error: 'No Anthropic API key set. Open Settings → AI · API keys to paste one.' }
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

  const system = `You are PlexiDesk's workspace builder. Given a user's natural-language description of what they want to do, you suggest concrete widgets they can add to their canvas.

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
      max_tokens: 16384,
      system,
      messages: [{ role: 'user', content: userMsg }]
    })
    if ((resp.stop_reason as string) === 'refusal') {
      return { ok: false, error: 'Claude declined this request. Try rephrasing or breaking it into smaller steps.' }
    }
    if ((resp.stop_reason as string) === 'model_context_window_exceeded') {
      return { ok: false, error: 'Conversation hit the model context window. Start a fresh session.' }
    }
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
  if (!c) return { ok: false, needsApiKey: true, error: 'No Anthropic API key set. Open Settings → AI · API keys to paste one.' }

  const w = getWidget(widgetId)
  if (!w) return { ok: false, error: 'Widget not found' }
  // Both a living Page and the dedicated Living Doc widget run through here.
  const isLivingKind = (k: string): boolean => k === 'page' || k === 'living-doc'
  if (!isLivingKind(w.kind)) return { ok: false, error: 'Widget is not a living document' }
  if (!w.livingQuery || !w.livingQuery.trim()) {
    return { ok: false, error: 'Living query is empty — set a brief first' }
  }

  const task = getNode(w.taskId)
  if (!task || task.kind !== 'task') return { ok: false, error: 'Task not found' }

  const allWidgets = listWidgetsByTask(w.taskId)
  // Exclude self + every other living document on the same canvas (a living
  // Page or a Living Doc) so we don't loop or self-reference. The AI summary
  // never sees another living document's generated body.
  const source = allWidgets.filter(
    (other) => other.id !== w.id && !(isLivingKind(other.kind) && other.livingQuery)
  )

  if (source.length === 0) {
    return {
      ok: true,
      skip: true,
      reason: 'No source material on the canvas yet — add notes, files, or pages, then regenerate.'
    }
  }

  const system =
    'You are PlexiDesk. The user has a "living page" on their canvas — a page whose body you regenerate ' +
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
    if ((resp.stop_reason as string) === 'refusal') {
      return { ok: false, error: 'Claude declined this request. Try rephrasing or breaking it into smaller steps.' }
    }
    if ((resp.stop_reason as string) === 'model_context_window_exceeded') {
      return { ok: false, error: 'Conversation hit the model context window. Start a fresh session.' }
    }
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

// ── In-widget AI: Page content suggestion ────────────────────────────────────
//
// Lets a PageWidget surface an inline "AI assistant" that takes a free-form
// prompt and returns Tiptap doc JSON ready to insert at the cursor. The
// renderer stages the result for user approval before actually inserting it
// into the editor — so the user sees what's about to land before it lands.

export interface PageContentSuggestion {
  ok: boolean
  // Tiptap doc JSON — directly insertable via editor.commands.insertContent.
  tiptapJson?: string
  // Markdown preview for the renderer's staging panel — much cheaper to
  // render with react-markdown than spinning up a hidden Tiptap instance.
  markdown?: string
  error?: string
  needsApiKey?: boolean
}

export async function suggestPageContent(
  prompt: string
): Promise<PageContentSuggestion> {
  const c = getClient()
  if (!c) return { ok: false, needsApiKey: true, error: 'No Anthropic API key set. Open Settings → AI · API keys to paste one.' }
  const trimmed = prompt.trim()
  if (!trimmed) return { ok: false, error: 'Prompt is empty.' }

  const system =
    'You are an in-page AI assistant. The user is inside a Notion-style page widget and ' +
    'wants you to draft content for them. The user will see your output first as a preview ' +
    'and can choose to Insert or Discard — your job is to produce well-structured markdown ' +
    'they will be happy to commit.\n\n' +
    'OUTPUT RULES:\n' +
    '  - Reply with raw markdown only. NO code fences. NO preamble.\n' +
    '  - Start directly with the first heading or paragraph.\n' +
    '  - Use ## for section headings, - for bullets, - [ ] for open todos, - [x] for done.\n' +
    '  - Keep it tight — this lands inside a page, not as a standalone document.\n' +
    '  - If the request is ambiguous, make a reasonable interpretation; do not ask back.'

  try {
    const resp = await c.messages.create({
      model: resolveModel('living_page'),
      max_tokens: 1500,
      system,
      messages: [{ role: 'user', content: trimmed }]
    })
    if ((resp.stop_reason as string) === 'refusal') {
      return { ok: false, error: 'Claude declined this request. Try rephrasing or breaking it into smaller steps.' }
    }
    if ((resp.stop_reason as string) === 'model_context_window_exceeded') {
      return { ok: false, error: 'Conversation hit the model context window. Start a fresh session.' }
    }
    const text = resp.content
      .filter((b) => b.type === 'text')
      .map((b) => ('text' in b ? b.text : ''))
      .join('\n')
      .trim()
    if (!text) return { ok: false, error: 'Empty response from model' }
    const doc = markdownToTiptap(text)
    return {
      ok: true,
      tiptapJson: JSON.stringify(doc),
      markdown: text
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ── Create with AI: office documents (doc / sheet / slides) ──────────────────
//
// The heart of the AI-first documents flow. The user describes what they want
// and (optionally) who it is for, and the model returns a complete, structured
// FIRST DRAFT in the right shape for the surface: a Tiptap document for a doc,
// a { columns, rows } grid for a sheet, a { slides[] } deck for slides. The
// renderer drops the result straight into an editable surface — this is the
// "get started with AI, then edit" loop, not a chat reply.

export interface DocumentGenResult {
  ok: boolean
  title?: string
  // Shape depends on docType; the renderer/db treat it as the document body.
  body?: unknown
  error?: string
  needsApiKey?: boolean
}

// Pull the first JSON object out of a model reply, tolerating stray prose or a
// ```json fence the model may add despite instructions.
function extractJsonObject(text: string): unknown {
  let s = text.trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) s = fence[1].trim()
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) throw new Error('No JSON object in response.')
  return JSON.parse(s.slice(start, end + 1))
}

export async function generateDocument(input: {
  docType: 'doc' | 'sheet' | 'slides'
  prompt: string
  audience?: string
}): Promise<DocumentGenResult> {
  const c = getClient()
  if (!c)
    return {
      ok: false,
      needsApiKey: true,
      error: 'No Anthropic API key set. Open Settings → AI · API keys to paste one.'
    }
  const topic = input.prompt.trim()
  if (!topic) return { ok: false, error: 'Describe what you want to create.' }
  const audienceLine = input.audience?.trim()
    ? ` The intended audience is ${input.audience.trim()}; pitch the level, tone and detail for them.`
    : ''

  const style =
    ' Write in plain, confident, human prose. Do not use em dashes or emoji. Do not use a bold label followed by a colon as a heading substitute; write real sentences.'

  try {
    if (input.docType === 'doc') {
      const system =
        'You draft a complete, well-structured business document in Markdown.' +
        audienceLine +
        ' Put the document title on the FIRST line as a single H1 (# Title). Then write the body using ## for section headings, prose paragraphs, and - for bullets only where a real list is warranted. Aim for a genuinely useful first draft the user will edit, not an outline of placeholders. Reply with raw Markdown only: no preamble, no code fences.' +
        style
      const resp = await c.messages.create({
        model: resolveModel('document'),
        max_tokens: 3000,
        system,
        messages: [{ role: 'user', content: topic }]
      })
      if ((resp.stop_reason as string) === 'refusal')
        return { ok: false, error: 'Claude declined this request. Try rephrasing it.' }
      const text = resp.content
        .filter((b) => b.type === 'text')
        .map((b) => ('text' in b ? b.text : ''))
        .join('\n')
        .trim()
      if (!text) return { ok: false, error: 'Empty response from model.' }
      const lines = text.split('\n')
      let title = topic.slice(0, 80)
      let bodyMd = text
      if (lines[0]?.startsWith('# ')) {
        title = lines[0].replace(/^#\s+/, '').trim()
        bodyMd = lines.slice(1).join('\n').trim()
      }
      return { ok: true, title, body: markdownToTiptap(bodyMd) }
    }

    if (input.docType === 'sheet') {
      const system =
        'You design a spreadsheet as structured data.' +
        audienceLine +
        ' Reply with ONLY a JSON object of the form {"title": string, "columns": string[], "rows": string[][]}. Use 2 to 8 short column headers. Provide 6 to 20 rows, each an array with exactly one string cell per column, filled with realistic, useful example data (not "example 1"). For a computed cell such as a total or a rate, put a spreadsheet formula starting with = that references cells in A1 style, for example "=SUM(B2:B9)". No markdown, no code fences, no prose outside the JSON.'
      const resp = await c.messages.create({
        model: resolveModel('document'),
        max_tokens: 2500,
        system,
        messages: [{ role: 'user', content: topic }]
      })
      if ((resp.stop_reason as string) === 'refusal')
        return { ok: false, error: 'Claude declined this request. Try rephrasing it.' }
      const text = resp.content
        .filter((b) => b.type === 'text')
        .map((b) => ('text' in b ? b.text : ''))
        .join('\n')
      const parsed = extractJsonObject(text) as {
        title?: string
        columns?: string[]
        rows?: string[][]
      }
      const columns = Array.isArray(parsed.columns) && parsed.columns.length ? parsed.columns : ['A', 'B', 'C']
      const width = columns.length
      const rows = Array.isArray(parsed.rows)
        ? parsed.rows.map((r) => {
            const row = Array.isArray(r) ? r.map((cell) => String(cell ?? '')) : []
            while (row.length < width) row.push('')
            return row.slice(0, width)
          })
        : []
      return {
        ok: true,
        title: parsed.title || topic.slice(0, 80),
        body: { columns, rows }
      }
    }

    // slides
    const system =
      'You design a clear, well-paced slide deck.' +
      audienceLine +
      ' Reply with ONLY a JSON object of the form {"title": string, "slides": [{"title": string, "bullets": string[], "notes": string, "layout": "title"|"bullets"|"section"}]}. Produce 5 to 10 slides that tell a coherent story with a beginning, middle and end. The first slide layout must be "title". Keep bullets to at most 6 short points per slide, and use an empty bullets array for title and section slides. Write one to three sentences of speaker notes per slide saying what to actually say. No markdown, no code fences, no prose outside the JSON.' +
      style
    const resp = await c.messages.create({
      model: resolveModel('document'),
      max_tokens: 3000,
      system,
      messages: [{ role: 'user', content: topic }]
    })
    if ((resp.stop_reason as string) === 'refusal')
      return { ok: false, error: 'Claude declined this request. Try rephrasing it.' }
    const text = resp.content
      .filter((b) => b.type === 'text')
      .map((b) => ('text' in b ? b.text : ''))
      .join('\n')
    const parsed = extractJsonObject(text) as {
      title?: string
      slides?: Array<{ title?: string; bullets?: string[]; notes?: string; layout?: string }>
    }
    const slides = (Array.isArray(parsed.slides) ? parsed.slides : []).map((s, i) => ({
      id: `${Date.now().toString(36)}-${i}`,
      title: s.title || `Slide ${i + 1}`,
      bullets: Array.isArray(s.bullets) ? s.bullets.map((b) => String(b)) : [],
      notes: typeof s.notes === 'string' ? s.notes : '',
      layout: (['title', 'bullets', 'section'].includes(String(s.layout))
        ? s.layout
        : i === 0
          ? 'title'
          : 'bullets') as 'title' | 'bullets' | 'section'
    }))
    if (!slides.length) return { ok: false, error: 'The deck came back empty. Try a more specific prompt.' }
    return { ok: true, title: parsed.title || topic.slice(0, 80), body: { slides } }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ── In-widget AI: Table row suggestion ───────────────────────────────────────
//
// Loads the target table's schema, asks the model for rows fitting that
// schema, and returns them as cells keyed by column LABEL (the renderer's
// add-row path coerces to typed values per column). The renderer stages the
// result for approval before adding any rows.

export interface TableRowsSuggestion {
  ok: boolean
  // Rows keyed by column label or column id — the existing coerceCellValue
  // path in the renderer handles either via case-insensitive label match.
  rows?: Array<Record<string, unknown>>
  // Optional schema additions — the AI proposes these when the current
  // schema doesn't cover what the prompt asks for. The renderer shows them
  // in the preview and applies them BEFORE inserting rows. Each entry has
  // a label, a field type, and (for select kinds) a list of option labels.
  columnsToAdd?: Array<{
    label: string
    type: string
    options?: string[]
  }>
  error?: string
  needsApiKey?: boolean
}

// ── Per-widget AI setup ──────────────────────────────────────────────────────
//
// Generalises the table's "suggest rows" into a single flow that drafts, for
// any supported widget, a short list of items to add in that widget's own
// format. The renderer previews the items, the user ticks the ones they want,
// and they are applied natively (a sticky gets checklist lines, a note gets
// note lines, markdown gets bullets, a card gets body points). Table and page
// keep their own richer flows; this covers the text-family widgets and gives
// every one of them the same "build with AI, approve the draft" experience.

export interface WidgetSetupItem {
  id: string
  text: string
}

export type WidgetSetupApplyAs =
  | 'sticky-checklist'
  | 'note-lines'
  | 'markdown-bullets'
  | 'card-bullets'
  | 'mindmap-nodes'
  | 'diagram-nodes'
  // Structured kinds (the empty-widget setup assistant). Each carries a typed
  // payload on the draft instead of the flat `items` list.
  | 'page-doc' // pageContent: a Tiptap document
  | 'webview-url' // url: a single web address

export interface WidgetSetupDraft {
  ok: boolean
  kind?: string
  applyAs?: WidgetSetupApplyAs
  // The plural noun shown in the preview header, e.g. "tasks" or "notes".
  noun?: string
  items?: WidgetSetupItem[]
  // Structured payloads — present only for the matching applyAs.
  pageContent?: object // applyAs 'page-doc'
  url?: string // applyAs 'webview-url'
  // A one-line, human summary of what the assistant proposes, shown above the
  // structured preview (e.g. "A research page with sections for ...").
  summary?: string
  needsApiKey?: boolean
  error?: string
}

const WIDGET_SETUP_KINDS: Record<
  string,
  { applyAs: WidgetSetupApplyAs; noun: string; guidance: string; structured?: boolean }
> = {
  // Structured kinds carry a typed payload (see suggestStructuredWidgetSetup),
  // not the flat `items` list. The empty-widget setup assistant covers these.
  page: {
    applyAs: 'page-doc',
    noun: 'page',
    structured: true,
    guidance:
      'a starter document structure for this page: a top-level heading, then a few section headings, ' +
      'each followed by a short paragraph or a bullet/todo list that fits the task'
  },
  webview: {
    applyAs: 'webview-url',
    noun: 'address',
    structured: true,
    guidance:
      'the single most useful web address (a full https:// URL) to open for this task — a real, ' +
      'well-known site, never a guessed or invented domain'
  },
  sticky: {
    applyAs: 'sticky-checklist',
    noun: 'tasks',
    guidance: 'a short, actionable checklist task of a few words'
  },
  note: {
    applyAs: 'note-lines',
    noun: 'notes',
    guidance: 'a concise note or idea, one thought per item'
  },
  markdown: {
    applyAs: 'markdown-bullets',
    noun: 'points',
    guidance: 'a concise content point that fleshes out the document'
  },
  card: {
    applyAs: 'card-bullets',
    noun: 'points',
    guidance: 'a single key point for the card body'
  },
  mindmap: {
    applyAs: 'mindmap-nodes',
    noun: 'branches',
    guidance: 'a concise mind-map branch label of a few words'
  },
  diagram: {
    applyAs: 'diagram-nodes',
    noun: 'nodes',
    guidance: 'a short diagram node label of a few words'
  }
}

export function widgetSetupIsSupported(kind: string): boolean {
  return kind in WIDGET_SETUP_KINDS
}

export async function suggestWidgetSetup(input: {
  widgetId: string
  prompt?: string
}): Promise<WidgetSetupDraft> {
  const c = getClient()
  if (!c) {
    return {
      ok: false,
      needsApiKey: true,
      error: 'No Anthropic API key set. Open Settings, then AI and API keys, to paste one.'
    }
  }
  const w = getWidget(input.widgetId)
  if (!w) return { ok: false, error: 'Widget not found.' }
  const cfg = WIDGET_SETUP_KINDS[w.kind]
  if (!cfg) return { ok: false, error: `AI setup is not available for ${w.kind} widgets yet.` }

  const task = getNode(w.taskId)
  const siblings = listWidgetsByTask(w.taskId).filter((o) => o.id !== w.id)
  const prompt = (input.prompt || '').trim()

  // Structured kinds (page, webview, …) return a typed payload, not a flat list.
  if (cfg.structured) {
    return suggestStructuredWidgetSetup({ widget: w, task, siblings, prompt, cfg, client: c })
  }

  const system =
    `You are an in-widget AI assistant. You propose a short list of items to add to a ${w.kind} ` +
    'widget, in the format that widget expects. Reply with a SINGLE JSON object of the exact shape ' +
    '{ "items": ["...", "..."] } and nothing else. No prose, no code fences. Each item is ' +
    `${cfg.guidance}. Propose between 3 and 8 items. Do not repeat anything already present.`

  const ctxParts = [
    task && task.kind === 'task'
      ? `Task: ${task.title}${task.description ? `\nTask notes: ${task.description}` : ''}`
      : '',
    w.title ? `Widget title: ${w.title}` : '',
    (w.content || '').trim()
      ? `Current contents:\n"""\n${(w.content || '').slice(0, 1500)}\n"""`
      : 'The widget is currently empty.',
    siblings.length ? `Other widgets on the canvas:\n${summarizeWidgets(siblings)}` : '',
    prompt
      ? `The user asks: ${prompt}`
      : 'No explicit instruction was given; infer what would be most useful to add.'
  ].filter(Boolean)

  const user = `${ctxParts.join('\n\n')}\n\nReturn the JSON list of ${cfg.noun} to add now.`

  try {
    const resp = await c.messages.create({
      model: resolveModel('setup'),
      max_tokens: 1500,
      system,
      messages: [{ role: 'user', content: user }]
    })
    if ((resp.stop_reason as string) === 'refusal') {
      return { ok: false, error: 'Claude declined this request.' }
    }
    const text = resp.content
      .filter((b) => b.type === 'text')
      .map((b) => ('text' in b ? b.text : ''))
      .join('')
      .trim()
    const json = extractJson(text)
    if (!json) return { ok: false, error: 'Claude did not return a usable list.' }
    let parsed: unknown
    try {
      parsed = JSON.parse(json)
    } catch {
      return { ok: false, error: 'Claude returned malformed JSON.' }
    }
    const rawItems = (parsed as { items?: unknown })?.items
    if (!Array.isArray(rawItems)) return { ok: false, error: 'Claude did not return an items list.' }
    const items: WidgetSetupItem[] = rawItems
      .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      .slice(0, 12)
      .map((t, i) => ({ id: `s${i}`, text: t.trim() }))
    if (items.length === 0) return { ok: false, error: 'Claude returned no items.' }
    return { ok: true, kind: w.kind, applyAs: cfg.applyAs, noun: cfg.noun, items }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// The empty-widget setup assistant for STRUCTURED kinds (page, webview, …). It
// returns a typed payload (a Tiptap document, a URL, …) rather than the flat
// item list the text kinds use. One shared shape: every reply is a JSON object
// with a one-line `summary` plus the kind-specific payload key.
async function suggestStructuredWidgetSetup(input: {
  widget: NonNullable<ReturnType<typeof getWidget>>
  task: ReturnType<typeof getNode>
  siblings: ReturnType<typeof listWidgetsByTask>
  prompt: string
  cfg: { applyAs: WidgetSetupApplyAs; noun: string; guidance: string; structured?: boolean }
  client: Anthropic
}): Promise<WidgetSetupDraft> {
  const { widget: w, task, siblings, prompt, cfg, client } = input

  // The single JSON shape the model must return, per kind.
  const payloadSpec =
    cfg.applyAs === 'page-doc'
      ? '"pageContent" is a Tiptap document: { "type": "doc", "content": [ ... ] } using only ' +
        'these node types: heading (attrs.level 1-3), paragraph, bulletList/listItem, ' +
        'taskList/taskItem (attrs.checked false), and text. Keep it focused, 4-10 nodes.'
      : '"url" is a single full https:// web address to a real, well-known site.'

  const system =
    'You set up a single empty widget for the user, based on what they are working on. ' +
    `This is a ${w.kind} widget. Propose ${cfg.guidance}. ` +
    'Reply with a SINGLE JSON object and nothing else (no prose, no code fences) of the shape ' +
    `{ "summary": "one short sentence describing what you are proposing", ${
      cfg.applyAs === 'page-doc' ? '"pageContent": { ... }' : '"url": "https://..."'
    } }. ${payloadSpec}`

  const ctxParts = [
    task && task.kind === 'task'
      ? `Task: ${task.title}${task.description ? `\nTask notes: ${task.description}` : ''}`
      : '',
    w.title ? `Widget title: ${w.title}` : '',
    siblings.length ? `Other widgets on the desk:\n${summarizeWidgets(siblings)}` : '',
    prompt ? `The user asks: ${prompt}` : 'No explicit instruction; infer what is most useful.'
  ].filter(Boolean)
  const user = `${ctxParts.join('\n\n')}\n\nReturn the JSON now.`

  try {
    const resp = await client.messages.create({
      model: resolveModel('setup'),
      max_tokens: cfg.applyAs === 'page-doc' ? 4096 : 800,
      system,
      messages: [{ role: 'user', content: user }]
    })
    const stop = resp.stop_reason as string
    if (stop === 'refusal') return { ok: false, error: 'Claude declined this request.' }
    if (stop === 'model_context_window_exceeded') {
      return { ok: false, error: 'The request was too large for the model.' }
    }
    const text = resp.content
      .filter((b) => b.type === 'text')
      .map((b) => ('text' in b ? b.text : ''))
      .join('')
      .trim()
    const json = extractJson(text)
    if (!json) return { ok: false, error: 'Claude did not return usable setup.' }
    let parsed: { summary?: unknown; pageContent?: unknown; url?: unknown }
    try {
      parsed = JSON.parse(json)
    } catch {
      return { ok: false, error: 'Claude returned malformed JSON.' }
    }
    const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : undefined

    if (cfg.applyAs === 'page-doc') {
      const doc = parsed.pageContent
      if (!doc || typeof doc !== 'object' || (doc as { type?: string }).type !== 'doc') {
        return { ok: false, error: 'Claude did not return a valid page document.' }
      }
      return { ok: true, kind: w.kind, applyAs: 'page-doc', noun: cfg.noun, pageContent: doc as object, summary }
    }

    // webview-url
    const url = typeof parsed.url === 'string' ? parsed.url.trim() : ''
    if (!/^https?:\/\/\S+$/i.test(url)) {
      return { ok: false, error: 'Claude did not return a valid web address.' }
    }
    return { ok: true, kind: w.kind, applyAs: 'webview-url', noun: cfg.noun, url, summary }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export async function suggestTableRows(
  tableId: string,
  prompt: string,
  count: number
): Promise<TableRowsSuggestion> {
  const c = getClient()
  if (!c) return { ok: false, needsApiKey: true, error: 'No Anthropic API key set. Open Settings → AI · API keys to paste one.' }
  const trimmed = prompt.trim()
  if (!trimmed) return { ok: false, error: 'Prompt is empty.' }
  const table = getTable(tableId)
  if (!table) return { ok: false, error: 'Table not found.' }
  // count === 0 means "auto — generate as many as the prompt naturally
  // implies." We pass that intent into the prompt instead of clamping to a
  // fixed number. Any positive value is bounded to a sane 1..20 range.
  const auto = count === 0
  const safeCount = auto ? 0 : Math.max(1, Math.min(20, Math.round(count)))

  const schemaLines: string[] = []
  for (const col of table.schema.columns) {
    const cfg = col.config as { options?: Array<{ label: string }> } | undefined
    const optStr =
      cfg?.options && Array.isArray(cfg.options) && cfg.options.length > 0
        ? ` (one of: ${cfg.options.map((o) => `"${o.label}"`).join(', ')})`
        : ''
    schemaLines.push(`  - "${col.label}" — ${col.type}${optStr}`)
  }

  // Detect "minimal scaffold" tables — the table widget auto-provisions a
  // (Name, Done) pair when first dropped. If the user's prompt asks for
  // something domain-specific (podcast episodes, contacts, workouts…),
  // those two columns almost certainly aren't enough — the AI should
  // ALWAYS propose what it actually needs.
  const looksLikeScaffold =
    table.schema.columns.length <= 2 &&
    table.schema.columns.every((c) =>
      ['Name', 'Done', 'Title', 'Status'].includes(c.label)
    )

  const system =
    'You are an in-table AI assistant. The user wants you to populate a typed table from a ' +
    'free-form prompt. You receive the table title, the CURRENT schema, and the prompt.\n\n' +
    '═══════════ COLUMN DECISION (read this carefully) ═══════════\n' +
    'BEFORE generating rows, decide whether the CURRENT schema actually fits the prompt.\n' +
    '\n' +
    'If the table looks like a generic empty scaffold (only Name/Done/Title/Status), the ' +
    'user has NOT set up real columns yet — propose the columns the prompt obviously needs ' +
    'via "columnsToAdd". This is the EXPECTED case for fresh tables.\n' +
    '\n' +
    'If the prompt clearly implies fields that are missing (e.g. "podcast episodes" needs ' +
    'Title, Duration, Host, Status, Release Date, etc.; "contacts" needs Name, Email, ' +
    'Company; "expenses" needs Date, Amount, Category, Notes), PROPOSE THEM. The user can ' +
    'reject if not needed.\n' +
    '\n' +
    'Only skip "columnsToAdd" when the existing schema GENUINELY covers everything implied ' +
    'by the prompt with no obvious gaps. When in doubt, propose.\n' +
    '\n' +
    '═══════════ OUTPUT RULES ═══════════\n' +
    '  - Reply with a SINGLE JSON object: { "columnsToAdd": [...], "rows": [ {…} ] }. NO prose. NO code fences.\n' +
    '  - "columnsToAdd" entries: { "label": "…", "type": "…", "options": ["…"]? }.\n' +
    '  - Valid types: text-short, text-long, number, checkbox, single-select, multi-select, date.\n' +
    '  - For single-select / multi-select columns YOU PROPOSE, you MUST include an "options" array of label strings.\n' +
    '  - Each row\'s keys are column LABELS — existing schema labels OR labels of columns you proposed.\n' +
    '  - You MUST populate cells for the columns you propose. A proposed column with no cell values in the rows defeats the point.\n' +
    '  - For checkbox columns use true/false. For number, use a JSON number. For dates, ISO 8601 (YYYY-MM-DD).\n' +
    '  - For single-select / multi-select the value MUST be one of the listed options. Multi-select takes an array.\n' +
    '  - For text columns, keep values under 80 chars (unless column is "text-long").\n' +
    (auto
      ? '  - Generate as many rows as the prompt naturally implies — could be 3, could be 20. Use judgement, no fixed count.\n'
      : `  - Generate exactly ${safeCount} row(s) unless the prompt clearly specifies a different count.\n`) +
    (looksLikeScaffold
      ? '\n⚠ The current schema is the default scaffold — you SHOULD propose columns unless the prompt explicitly asks to only use Name/Done.'
      : '')

  const user =
    `Table: "${table.title}"\n\nCurrent columns:\n${schemaLines.join('\n')}\n\nPrompt: ${trimmed}\n\nReturn the JSON now:`

  try {
    const resp = await c.messages.create({
      model: resolveModel('setup'),
      max_tokens: 8192,
      system,
      messages: [{ role: 'user', content: user }]
    })
    if ((resp.stop_reason as string) === 'refusal') {
      return { ok: false, error: 'Claude declined this request. Try rephrasing or breaking it into smaller steps.' }
    }
    if ((resp.stop_reason as string) === 'model_context_window_exceeded') {
      return { ok: false, error: 'Conversation hit the model context window. Start a fresh session.' }
    }
    const text = resp.content
      .filter((b) => b.type === 'text')
      .map((b) => ('text' in b ? b.text : ''))
      .join('\n')
      .trim()
    if (!text) return { ok: false, error: 'Empty response from model' }
    const json = extractJson(text)
    if (!json) return { ok: false, error: 'Model did not return JSON' }
    const parsed = JSON.parse(json) as {
      rows?: Array<Record<string, unknown>>
      columnsToAdd?: Array<{ label: string; type: string; options?: string[] }>
    }
    if (!Array.isArray(parsed.rows)) {
      return { ok: false, error: 'Model JSON missing "rows" array' }
    }
    return {
      ok: true,
      rows: parsed.rows,
      columnsToAdd: Array.isArray(parsed.columnsToAdd)
        ? parsed.columnsToAdd
        : undefined
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ── Live wires: transform ────────────────────────────────────────────────────
//
// A "transform wire" runs a free-text verb over the SOURCE widget's content and
// returns plain text to write into the TARGET. This deliberately bypasses the
// ActionProposal JSON envelope — the result is just content, not a proposal —
// so it is the cheapest, most direct AI path in the app. Routed to Haiku by
// default (see modelRouting 'wire_transform'). The reactive scheduling, debounce
// and loop-guard live in the renderer wire engine; this function is a pure,
// bounded one-shot.
export interface WireTransformResult {
  ok: boolean
  result?: string
  // True when the model returned nothing usable — the caller should NOT write
  // an empty string over the target, it should treat this as a no-op.
  skipped?: boolean
  needsApiKey?: boolean
  error?: string
}

// AI Assist transform. The universal AI Assist submenu (Expand, Simplify,
// Summarise, Rewrite, Fix Grammar, Improve Clarity, Continue Writing, Change
// Tone, Translate, Custom Prompt) routes every action through this one bounded
// call. It returns plain transformed text the renderer previews before applying
// in place; it never returns a proposal envelope. Modeled on runTransformWire.
export interface AiAssistResult {
  ok: boolean
  result?: string
  needsApiKey?: boolean
  error?: string
}

export async function transformText(input: {
  text: string
  instruction: string
  // The widget kind is passed so the model can respect the surface, e.g. keep
  // markdown in a markdown widget. Advisory only.
  kind?: string
}): Promise<AiAssistResult> {
  const c = getClient()
  if (!c) {
    return {
      ok: false,
      needsApiKey: true,
      error: 'No Anthropic API key set. Open Settings, then AI and API keys, to paste one.'
    }
  }
  const instruction = (input.instruction || '').trim()
  if (!instruction) return { ok: false, error: 'No AI Assist instruction was given.' }
  const text = (input.text || '').slice(0, 12000)
  if (!text.trim()) return { ok: false, error: 'There is no text to work on.' }

  const surface = input.kind ? ` The text comes from a ${input.kind} widget; preserve its formatting conventions.` : ''
  const system =
    'You are an inline writing assistant inside a visual workspace. You receive a block of text and an instruction, ' +
    'and you return the rewritten text that will be applied in place.' +
    surface +
    ' Return ONLY the resulting text. No preamble, no labels, no quotes, no explanation, no markdown code fences. ' +
    'The first character of your reply is the first character of the result. Preserve the original language unless the instruction is to translate.'

  const user = `Instruction: ${instruction}\n\nText:\n"""\n${text}\n"""\n\nReturn the resulting text now.`

  try {
    const resp = await c.messages.create({
      model: resolveModel('wire_transform'),
      max_tokens: 4096,
      system,
      messages: [{ role: 'user', content: user }]
    })
    if ((resp.stop_reason as string) === 'refusal') {
      return { ok: false, error: 'Claude declined this request.' }
    }
    if ((resp.stop_reason as string) === 'model_context_window_exceeded') {
      return { ok: false, error: 'The selected text is too large for this action.' }
    }
    const out = resp.content
      .filter((b) => b.type === 'text')
      .map((b) => ('text' in b ? b.text : ''))
      .join('')
      .trim()
    if (!out) return { ok: false, error: 'Claude returned an empty result.' }
    return { ok: true, result: out }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export async function runTransformWire(input: {
  sourceContent: string
  verb: string
  targetCurrentContent: string
}): Promise<WireTransformResult> {
  const c = getClient()
  if (!c) {
    return {
      ok: false,
      needsApiKey: true,
      error: 'No Anthropic API key set. Open Settings → AI · API keys to paste one.'
    }
  }

  const verb = input.verb.trim()
  if (!verb) return { ok: false, error: 'This transform wire has no instruction yet.' }

  const source = (input.sourceContent || '').slice(0, 8000)
  if (!source.trim()) return { ok: true, skipped: true }

  const system =
    'You are a transform step in a no-code pipeline on a visual canvas. ' +
    'You receive the content of a SOURCE widget and an instruction, and you return the transformed text ' +
    'that will be written verbatim into a TARGET widget. ' +
    'Return ONLY the transformed text. No preamble, no labels, no quotes, no explanation, no markdown code fences. ' +
    'The first character of your reply is the first character of the content. ' +
    'If the instruction does not apply to this source, return the single token SKIP.'

  const targetNote = input.targetCurrentContent.trim()
    ? `\n\nFor reference, the target currently contains:\n"""\n${input.targetCurrentContent.slice(0, 1500)}\n"""`
    : ''

  const user =
    `Instruction: ${verb}\n\n` +
    `Source content:\n"""\n${source}\n"""` +
    targetNote +
    `\n\nReturn the transformed text for the target now.`

  try {
    const resp = await c.messages.create({
      model: resolveModel('wire_transform'),
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: user }]
    })
    if ((resp.stop_reason as string) === 'refusal') {
      return { ok: false, error: 'Claude declined this transform.' }
    }
    if ((resp.stop_reason as string) === 'model_context_window_exceeded') {
      return { ok: false, error: 'Source content is too large for this transform.' }
    }
    const text = resp.content
      .filter((b) => b.type === 'text')
      .map((b) => ('text' in b ? b.text : ''))
      .join('')
      .trim()
    if (!text || text.toUpperCase() === 'SKIP') return { ok: true, skipped: true }
    return { ok: true, result: text }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ── Desk agents ──────────────────────────────────────────────────────────────
//
// A desk agent reasons over the content of the widgets wired INTO it against a
// standing instruction, and returns a single block of text that becomes its
// latest output. Like the transform wire it returns plain text (no proposal
// envelope), but it is routed to Sonnet because it weighs multiple inputs.
export interface DeskAgentResult {
  ok: boolean
  output?: string
  needsApiKey?: boolean
  error?: string
}

export async function runDeskAgent(input: {
  instruction: string
  inputs: Array<{ kind: string; title: string; content: string }>
  // Optional profile persona ("job description") that shapes the agent's
  // approach. It is layered into the system prompt but CANNOT change the rules
  // below or how the output is later applied to widgets.
  persona?: string
  // webContents id of a wired browser the agent may DRIVE to research.
  browserWcId?: number
  // The widgets this agent's output is auto-delivered into, with the format each
  // one expects.
  outputs?: Array<{ kind: string; title: string; format?: string }>
}): Promise<DeskAgentResult> {
  const c = getClient()
  if (!c) {
    return {
      ok: false,
      needsApiKey: true,
      error: 'No Anthropic API key set. Open Settings → AI · API keys to paste one.'
    }
  }
  const instruction = input.instruction.trim()
  if (!instruction) return { ok: false, error: 'This agent has no instruction yet.' }

  const inputBlock =
    input.inputs.length === 0
      ? '(No widgets are wired into this agent yet — it has no inputs to read.)'
      : input.inputs
          .map((w, i) => {
            const title = w.title ? ` "${w.title}"` : ''
            const body = (w.content || '').replace(/\s+/g, ' ').slice(0, 2000)
            return `Input ${i + 1} [${w.kind}${title}]:\n${body || '(empty)'}`
          })
          .join('\n\n')

  const persona = input.persona?.trim()
  const system =
    'You are a desk agent: a small, standing AI worker that lives on a visual canvas. ' +
    (persona
      ? `\n\nYour role and expertise (shapes HOW you work):\n${persona}\n\n`
      : '') +
    'You are given a standing instruction and the current content of the widgets wired into you. ' +
    'Do exactly what the instruction asks, using only the inputs provided. ' +
    'Return ONLY the resulting text that should appear as your latest output — no preamble, no labels, ' +
    'no meta-commentary about being an AI. Be concise and useful. ' +
    'If the inputs do not give you enough to act on, say briefly what is missing. ' +
    // The hygiene guarantee. Even if a role description implies otherwise, the
    // app — not you — decides how your output updates other widgets, and it
    // never deletes or overwrites existing data. Just produce the content.
    'You never manage how your output is written into other widgets; the app applies it safely ' +
    '(it updates tables and notes without erasing existing data). ' +
    'If your instruction says to record, save or write your findings somewhere (a page, a note, a table), ' +
    'do NOT ask the user for access and do NOT say you cannot write to it — just produce the findings as ' +
    'your output and the app delivers them into the linked widget for you.' +
    (input.browserWcId
      ? ' A browser is wired to you and you CAN control it. Use read_current_page to read the page on screen, ' +
        'open_url to visit a page, and web_search to find sources. Never claim you cannot browse the web or ' +
        'access a URL, and never ask the user to paste page content — read it yourself with these tools, then ' +
        'write your findings.'
      : '')

  const outs = input.outputs ?? []
  // What format to write in. If every target wants the same shape, target it
  // directly; if they differ, write Markdown and the app reshapes per target
  // (a table gets rows, a number field gets the number, a page gets a document).
  const formats = Array.from(new Set(outs.map((o) => o.format).filter(Boolean)))
  const outputBlock =
    outs.length > 0
      ? `\n\nYour output is automatically saved into these linked widgets, each in its own format:\n` +
        outs
          .map((o) => `- a ${o.kind}${o.title ? ` "${o.title}"` : ''}: provide ${o.format ?? 'plain text'}`)
          .join('\n') +
        (formats.length <= 1
          ? `\n\nWrite your output as ${formats[0] ?? 'plain text'}.`
          : `\n\nThese formats differ, so write your findings as well-structured Markdown; the app reshapes it for each widget automatically.`) +
        ` You never access those widgets yourself; just produce the content.`
      : ''

  const user = `Standing instruction:\n${instruction}\n\nWired inputs:\n${inputBlock}${outputBlock}\n\nProduce your output now.`

  try {
    // Browser research loop — when a browser is wired in, the agent can call
    // tools to read/navigate/search it, then synthesize. Bounded iterations.
    if (input.browserWcId) {
      const messages: Anthropic.MessageParam[] = [{ role: 'user', content: user }]
      for (let step = 0; step < 6; step++) {
        const resp = await c.messages.create({
          model: resolveModel('desk_agent'),
          max_tokens: 1500,
          system,
          tools: BROWSER_TOOLS,
          messages
        })
        if ((resp.stop_reason as string) === 'refusal') {
          return { ok: false, error: 'Claude declined this agent run.' }
        }
        messages.push({ role: 'assistant', content: resp.content })
        if (resp.stop_reason === 'tool_use') {
          const results: Anthropic.ToolResultBlockParam[] = []
          for (const block of resp.content) {
            if (block.type === 'tool_use') {
              const out = await runBrowserTool(
                input.browserWcId,
                block.name,
                (block.input ?? {}) as Record<string, unknown>
              )
              results.push({ type: 'tool_result', tool_use_id: block.id, content: out })
            }
          }
          messages.push({ role: 'user', content: results })
          continue
        }
        const text = resp.content
          .filter((b) => b.type === 'text')
          .map((b) => ('text' in b ? b.text : ''))
          .join('')
          .trim()
        if (text) return { ok: true, output: text }
        break
      }
      return { ok: false, error: 'The agent kept browsing without producing an answer.' }
    }

    const resp = await c.messages.create({
      model: resolveModel('desk_agent'),
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: user }]
    })
    if ((resp.stop_reason as string) === 'refusal') {
      return { ok: false, error: 'Claude declined this agent run.' }
    }
    if ((resp.stop_reason as string) === 'model_context_window_exceeded') {
      return { ok: false, error: 'The wired inputs are too large for one run.' }
    }
    const text = resp.content
      .filter((b) => b.type === 'text')
      .map((b) => ('text' in b ? b.text : ''))
      .join('')
      .trim()
    if (!text) return { ok: false, error: 'The agent returned nothing.' }
    return { ok: true, output: text }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// Design a custom agent profile from a free-form description of what the user
// needs. Returns a short name, a one-line blurb, and a system-prompt persona.
export interface AgentProfileDraft {
  ok: boolean
  name?: string
  blurb?: string
  systemPrompt?: string
  needsApiKey?: boolean
  error?: string
}

export async function designAgentProfile(description: string): Promise<AgentProfileDraft> {
  const c = getClient()
  if (!c) {
    return {
      ok: false,
      needsApiKey: true,
      error: 'No Anthropic API key set. Open Settings → AI · API keys to paste one.'
    }
  }
  const desc = description.trim()
  if (!desc) return { ok: false, error: 'Describe what the agent should be good at.' }

  const system =
    'You design "agent profiles" — concise job descriptions for a small AI worker. ' +
    'Given what the user needs, return a JSON object with exactly these keys: ' +
    '"name" (2-4 words, a role title), "blurb" (one short sentence, under 12 words), and ' +
    '"systemPrompt" (2-4 sentences in second person describing the role, its expertise, and HOW it ' +
    'should approach work — judgement, priorities, tone). ' +
    'The systemPrompt must NOT mention deleting, overwriting, or managing other widgets, files or data — ' +
    'it only describes how the agent thinks. Return ONLY the JSON object, no prose, no code fences.'

  try {
    const resp = await c.messages.create({
      model: resolveModel('setup'),
      max_tokens: 600,
      system,
      messages: [{ role: 'user', content: desc }]
    })
    if ((resp.stop_reason as string) === 'refusal') {
      return { ok: false, error: 'Claude declined this request.' }
    }
    const raw = resp.content
      .filter((b) => b.type === 'text')
      .map((b) => ('text' in b ? b.text : ''))
      .join('')
      .trim()
    const parsed = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, '')) as {
      name?: string
      blurb?: string
      systemPrompt?: string
    }
    if (!parsed.name || !parsed.systemPrompt) {
      return { ok: false, error: 'Could not generate a profile. Try a clearer description.' }
    }
    return {
      ok: true,
      name: String(parsed.name).slice(0, 40),
      blurb: String(parsed.blurb ?? '').slice(0, 120),
      systemPrompt: String(parsed.systemPrompt).slice(0, 1200)
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ── Mail: tone profiling + reply drafting ───────────────────────────────────
//
// Two calls power the proactive "draft a reply in my voice" feature. The first
// distils the user's Sent-folder samples into a short style descriptor; the
// second drafts a reply to one incoming email using that descriptor. The hard
// rule across both is the no-fakery one — describe only the voice that is
// actually in the samples, and never invent facts, dates or commitments in a
// reply. The caller sanitises samples + the incoming body before they get here.

/**
 * Build a compact writing-style profile (100-200 words of plain prose) from a
 * set of the user's own sent-email bodies. Returns the descriptor string, or an
 * error result. Routed to Haiku — this is pattern extraction, not reasoning.
 */
export async function buildToneProfile(
  samples: string[]
): Promise<{ ok: true; profile: string } | { ok: false; needsApiKey?: boolean; error: string }> {
  const c = getClient()
  if (!c)
    return {
      ok: false,
      needsApiKey: true,
      error: 'No Anthropic API key set. Open Settings → AI · API keys to paste one.'
    }
  const cleaned = samples.map((s) => s.trim()).filter(Boolean)
  if (cleaned.length < 3) {
    return { ok: false, error: 'Not enough sent history to learn a writing style yet.' }
  }

  const system =
    'You analyze writing samples and produce a compact style profile. You are given a set of real ' +
    'sent-email bodies from a single author. Identify genuine, consistently recurring patterns in how ' +
    'they write — never guess, invent, or generalize from one or two examples.\n\n' +
    'OUTPUT RULES:\n' +
    '- Reply with ONLY a plain-text paragraph of 100 to 200 words. No JSON, no headings, no bullets.\n' +
    '- Cover sentence structure, tone, recurring phrasing or vocabulary habits, and typical openings and closings.\n' +
    '- Only include a trait you can see repeated across multiple samples. Omit any dimension the samples do not support.\n' +
    '- Do not mention the author by name or any personal detail. Describe HOW they write, not WHAT they write about.\n' +
    '- No preamble. Start directly with the style description.'

  // Cap each sample so long signatures or disclaimers do not crowd out signal,
  // and keep the whole call comfortably inside Haiku's context.
  const body =
    `Writing samples (${cleaned.length} emails from the user's Sent folder):\n\n` +
    cleaned.map((s, i) => `--- Sample ${i + 1} ---\n${s.slice(0, 600)}`).join('\n\n') +
    '\n\nWrite the style profile now.'

  try {
    const resp = await c.messages.create({
      model: resolveModel('tone_profile'),
      max_tokens: 600,
      system,
      messages: [{ role: 'user', content: body }]
    })
    if ((resp.stop_reason as string) === 'refusal') {
      return { ok: false, error: 'Claude declined this request. Try again.' }
    }
    if ((resp.stop_reason as string) === 'model_context_window_exceeded') {
      return { ok: false, error: 'Too many samples for the model context window.' }
    }
    const text = resp.content
      .filter((b) => b.type === 'text')
      .map((b) => ('text' in b ? b.text : ''))
      .join('')
      .trim()
    if (!text) return { ok: false, error: 'Empty response from model.' }
    return { ok: true, profile: text }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * Draft a reply to one incoming email in the user's voice, given a style
 * profile. Returns the reply plus a self-assessed confidence, OR a skip result
 * for newsletters / no-reply senders / nothing-to-reply-to (an expected, not
 * error, outcome). Routed to Sonnet for the voice-vs-no-fakery balance.
 */
export async function draftReply(
  incoming: { subject: string; from: string; body: string },
  toneProfile: string | null
): Promise<EmailReplyDraftResult> {
  const c = getClient()
  if (!c)
    return {
      ok: false,
      needsApiKey: true,
      error: 'No Anthropic API key set. Open Settings → AI · API keys to paste one.'
    }

  const system =
    'You are drafting an email reply on behalf of a user who has opted into AI-assisted replies that ' +
    'match their personal writing style.\n\n' +
    'ABSOLUTE CONSTRAINTS:\n' +
    '1. Write ONLY what the incoming email gives you material to respond to. If it asks something you ' +
    'cannot answer without inventing information, acknowledge the question and say the user will follow ' +
    'up — never invent an answer.\n' +
    '2. Do NOT invent dates, times, numbers, dollar amounts, meeting details, third-party names, ' +
    'promises, or commitments. You may reflect back ones the incoming email states; you may not add new ones.\n' +
    '3. Do NOT add pleasantries, sign-offs, or closings the style profile does not show the user using.\n' +
    '4. If the email is a newsletter, automated notification, marketing message, or from a no-reply ' +
    'sender, return ONLY {"skip": true, "reason": "..."}. Do not draft a reply.\n' +
    '5. If the email is too ambiguous or short to reply to substantively, return {"skip": true, "reason": "..."}.\n\n' +
    'STYLE RULES:\n' +
    '- Write in exactly the voice described by the style profile, matching sentence length, formality, ' +
    'and typical opening and closing patterns.\n' +
    '- Keep the reply proportional to the incoming email. Plain text only, no markdown or HTML.\n\n' +
    'OUTPUT FORMAT — return a single JSON object, first character {, last character }. No prose outside ' +
    'the JSON, no markdown fences.\n' +
    '{"reply": "the full plain-text reply body", "confidence": 0.0-1.0, "note": "one sentence on any ' +
    'uncertainty or assumptions"}\n' +
    'OR when declining: {"skip": true, "reason": "one sentence"}'

  const profileText =
    toneProfile && toneProfile.trim()
      ? toneProfile.trim()
      : 'No distinct style sample is available. Write a clear, concise, professional reply.'

  const body =
    `Style profile for this user:\n${profileText}\n\n` +
    `Incoming email to reply to:\nSubject: ${incoming.subject}\nFrom: ${incoming.from}\n\n` +
    `${incoming.body.slice(0, 3000)}\n\nDraft the reply now.`

  try {
    const resp = await c.messages.create({
      model: resolveModel('email_reply_draft'),
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: body }]
    })
    if ((resp.stop_reason as string) === 'refusal') {
      return { ok: false, error: 'Claude declined to draft this reply.' }
    }
    if ((resp.stop_reason as string) === 'model_context_window_exceeded') {
      return { ok: false, error: 'The email was too long for the model context window.' }
    }
    if ((resp.stop_reason as string) === 'max_tokens') {
      return { ok: false, error: 'The reply draft was cut off. Try a shorter email.' }
    }
    const text = resp.content
      .filter((b) => b.type === 'text')
      .map((b) => ('text' in b ? b.text : ''))
      .join('')
      .trim()
    if (!text) return { ok: false, error: 'Empty response from model.' }

    let parsed: {
      reply?: string
      confidence?: number
      note?: string
      skip?: boolean
      reason?: string
    }
    const json = extractJson(text)
    if (!json) return { ok: false, error: 'Could not parse the reply draft.' }
    try {
      parsed = JSON.parse(json)
    } catch {
      return { ok: false, error: 'Could not parse the reply draft.' }
    }
    if (parsed.skip) {
      return { ok: true, skip: true, skipReason: parsed.reason || 'No reply needed.' }
    }
    if (!parsed.reply || !parsed.reply.trim()) {
      return { ok: false, error: 'The model returned an empty reply.' }
    }
    return {
      ok: true,
      reply: parsed.reply.trim(),
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : undefined,
      note: parsed.note
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
