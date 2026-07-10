// Voice command interpreter.
//
// The renderer captures audio via the existing Whisper pipeline, hands the
// transcript here along with a pruned canvas snapshot, and we ask Claude to
// emit ActionProposal[] that the canvas should review / apply.
//
// Why a separate module instead of folding into anthropic.ts:
//   - the prompt is specifically tuned for mutation-of-existing-canvas,
//     not creation-from-scratch (buildFromPrompt's job)
//   - it must constrain Claude to ONLY the safe subset of proposal kinds
//     and reject ids that aren't in the snapshot — voice commands target
//     existing widgets by id, not by free-text descriptions
//   - it's the hot path for the floating-mic UX, so we want a focused
//     low-token system prompt that returns fast (Sonnet, ~1.5s typical)
//
// Returns ActionProposal[] formatted for the renderer's normal apply
// pipeline. The renderer adds proposal cards using its existing dock
// pattern; nothing here triggers a mutation directly.

import Anthropic from '@anthropic-ai/sdk'
import { randomUUID } from 'crypto'
import { resolveAnthropicKey } from '../settingsStore'
import { resolveModel } from './modelRouting'
import type { ActionProposal, WidgetKind, NavigateTarget } from '@shared/types'

// What the renderer hands us about the current canvas. Kept deliberately
// flat — the AI never sees the full widget shape, only the fields it
// needs to reason about intent + write back a valid mutation.
export interface CanvasSnapshotWidget {
  id: string
  kind: WidgetKind
  title: string
  contentPreview: string // first ~120 chars of content, sanitised
  selected?: boolean
  recentlyTouched?: boolean // mutated/focused in the last few minutes
  visible?: boolean // currently inside the camera viewport
}

export interface VoiceCommandInput {
  transcript: string
  activeTaskId: string | null
  selectedWidgetId: string | null
  widgets: CanvasSnapshotWidget[]
}

export interface VoiceCommandResult {
  ok: true
  reply: string
  proposals: ActionProposal[]
}

export interface VoiceCommandError {
  ok: false
  error: string
  reason?: 'no_key' | 'empty_transcript' | 'no_proposals' | 'api' | 'parse'
}

const VALID_KINDS: WidgetKind[] = [
  'sticky',
  'note',
  'markdown',
  'page',
  'file',
  'webview',
  'table',
  'field',
  'task-link',
  'timer',
  'calculator',
  'color',
  'streamdeck',
  'image',
  'video',
  'pdf',
  'gdoc',
  'gsheet',
  'gslide',
  'email',
  'local-app-launcher',
  'mindmap',
  'voice-recorder'
]

function makeId(i: number): string {
  return `vc-${Date.now().toString(36)}-${i}`
}

export async function runVoiceCommand(
  input: VoiceCommandInput
): Promise<VoiceCommandResult | VoiceCommandError> {
  const transcript = input.transcript.trim()
  if (!transcript) {
    return { ok: false, error: 'Empty transcript — nothing to interpret.', reason: 'empty_transcript' }
  }

  const key = resolveAnthropicKey()
  if (!key) {
    return {
      ok: false,
      error: 'No Anthropic key set. Open Settings → AI · API keys to paste one.',
      reason: 'no_key'
    }
  }

  const widgetCatalogBlock = buildWidgetIndex(input.widgets, input.selectedWidgetId)
  const contextBlock = buildContextBlock(input)

  const system = buildSystemPrompt()
  const userMsg =
    `User said (voice transcript):\n"${transcript}"\n\n` +
    `Current canvas:\n${contextBlock}\n\n` +
    `Widgets on canvas (id ── kind ── title ── content-preview):\n${widgetCatalogBlock}\n\n` +
    `Return the JSON now.`

  const client = new Anthropic({ apiKey: key })
  let raw = ''
  try {
    const resp = await client.messages.create({
      model: resolveModel('setup'),
      max_tokens: 8192,
      system,
      messages: [{ role: 'user', content: userMsg }]
    })
    // Invariant 1: guard the stop reason before reading content, so a refusal or a
    // context-window overflow surfaces as an honest error instead of silently
    // returning an empty (no-op) result.
    const sr = resp.stop_reason as string
    if (sr === 'refusal') {
      return { ok: false, error: 'The model declined to act on that request.', reason: 'api' }
    }
    if (sr === 'model_context_window_exceeded') {
      return { ok: false, error: 'That was too much context for one request — try a shorter command.', reason: 'api' }
    }
    raw = resp.content
      .filter((b) => b.type === 'text')
      .map((b) => ('text' in b ? b.text : ''))
      .join('\n')
      .trim()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg.length > 240 ? msg.slice(0, 240) + '…' : msg, reason: 'api' }
  }

  const parsed = parseResponse(raw)
  if (!parsed.ok) return parsed

  // Sanitise + validate every proposal against the snapshot. Drop any that
  // reference unknown widget ids, invalid kinds, or impossible targets.
  const known = new Map(input.widgets.map((w) => [w.id, w]))
  const valid: ActionProposal[] = []
  let i = 0
  for (const raw of parsed.proposals) {
    const sanitised = sanitiseProposal(raw, known, input.activeTaskId, i++)
    if (sanitised) valid.push(sanitised)
  }

  if (valid.length === 0) {
    return {
      ok: false,
      error: parsed.reply ||
        'I understood the transcript but couldn\'t map it to a safe action. Try rephrasing — name the widget or describe a concrete change.',
      reason: 'no_proposals'
    }
  }

  return { ok: true, reply: parsed.reply, proposals: valid }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildContextBlock(input: VoiceCommandInput): string {
  const lines: string[] = []
  lines.push(`activeTaskId: ${input.activeTaskId ?? 'NONE (user is on dashboard / non-task view)'}`)
  lines.push(
    `selectedWidget: ${
      input.selectedWidgetId
        ? input.selectedWidgetId.slice(0, 8) + '…'
        : 'NONE (no widget currently selected — "this" must be inferred from context)'
    }`
  )
  lines.push(`totalWidgetsVisible: ${input.widgets.length}`)
  // Current time so schedule-event can resolve "tomorrow at 3pm" to an absolute
  // startMs. The model must compute from this, never guess a date.
  lines.push(`now: ${new Date().toString()} (epoch ms: ${Date.now()})`)
  return lines.join('\n')
}

function buildWidgetIndex(
  widgets: CanvasSnapshotWidget[],
  selectedId: string | null
): string {
  if (widgets.length === 0) return '(empty canvas)'
  return widgets
    .slice(0, 40) // hard cap — even a busy desk has <40 things worth listing
    .map((w) => {
      const sel = w.id === selectedId ? ' [SELECTED]' : ''
      const visible = w.visible ? ' [visible]' : ''
      const recent = w.recentlyTouched ? ' [recent]' : ''
      const preview = w.contentPreview ? `: "${w.contentPreview.slice(0, 80)}"` : ''
      return `- ${w.id} ── ${w.kind} ── "${w.title || '(untitled)'}"${preview}${sel}${visible}${recent}`
    })
    .join('\n')
}

function buildSystemPrompt(): string {
  return `You are PlexiDesk's voice-command interpreter.

The user just spoke an instruction. You decide what concrete workspace actions to propose. You NEVER execute anything — every proposal becomes a card the user clicks Apply or Dismiss on.

Available proposal kinds (return as a JSON array under "proposals"):

1. "create-widget" — drop a new widget on the canvas.
   { "kind": "create-widget", "widgetKind": "sticky|note|markdown|page|table|field|file|webview|timer|calculator|color|mindmap", "title": "...", "content": "...", "reason": "..." }
   The content field holds the body the user wants populated. Tables/pages get sensible empty starts, sticky/note/markdown get plain text.
   IMPORTANT: widgetKind "table" here makes a DEFAULT empty table (a Name + Done column). If the user names the columns/fields they want to track, use "create-table" (kind 12) instead so those columns are actually created.

2. "update-widget" — modify an existing widget. Reference by id from the snapshot below.
   { "kind": "update-widget", "widgetId": "<id-from-snapshot>", "label": "<short user-facing description>", "title": "...", "content": "...", "operation": "replace|append|prepend", "x": 0, "y": 0, "width": 0, "height": 0, "reason": "..." }
   Any field can be omitted. operation defaults to "replace" — use "append" when the user wants to add to existing content ("add 'call dentist' to my todo list").

3. "delete-widget" — destroy an existing widget. ALWAYS confirmed individually by the user.
   { "kind": "delete-widget", "widgetId": "<id>", "label": "<short description>", "reason": "..." }

4. "link-widgets" — draw a ghost line between two widgets ("connect the budget to the deadline note").
   { "kind": "link-widgets", "sourceWidgetId": "<id>", "targetWidgetId": "<id>", "sourceLabel": "...", "targetLabel": "...", "reason": "..." }

5. "focus-widget" — bring a specific widget to the front + activate it ("focus the timer").
   { "kind": "focus-widget", "widgetId": "<id>", "label": "...", "reason": "..." }

6. "drill-in-widget" — open a widget in focus mode (fullscreen single-widget zoomed modal). Use when the user wants a distraction-free view of one widget ("expand the page", "open my notes full screen").
   { "kind": "drill-in-widget", "widgetId": "<id>", "label": "...", "reason": "..." }

7. "toggle-todo-item" — check / uncheck a specific item inside a markdown checklist or page widget. Match by substring.
   { "kind": "toggle-todo-item", "widgetId": "<id>", "widgetLabel": "...", "itemMatch": "<substring of the line>", "checked": true|false, "reason": "..." }
   Example: "check off the dentist appointment" → itemMatch: "dentist", checked: true.

8. "arrange-widgets" — tidy the canvas into a grid. Use when the user says "arrange", "tidy", "organise the canvas", etc. Omit widgetIds to arrange ALL free-position widgets on the active task; include widgetIds to arrange a subset.
   { "kind": "arrange-widgets", "widgetIds": null | ["<id>", ...], "label": "...", "reason": "..." }

9. "add-table-row" — append a row to an existing table widget. Match by widgetId from the snapshot below; the table id is the widget's id (the canvas table widget owns one backing table).
   { "kind": "add-table-row", "tableId": "<the table widget's id>", "cells": { "<columnLabel>": "<value>", ... }, "reason": "..." }
   Use this when the user says "add a row to the budget table for groceries $80" — match column labels case-insensitively; the executor handles coercion.

10. "create-task" — make a new sub-task.
    { "kind": "create-task", "title": "...", "notes": "...", "reason": "..." }

11. "create-todo-list" — quick markdown checklist widget.
    { "kind": "create-todo-list", "title": "...", "items": ["...", "..."], "reason": "..." }

12. "create-table" — create a NEW table widget WITH SPECIFIC COLUMNS. Use this (NOT create-widget) whenever the user describes the fields/columns they want to track.
    { "kind": "create-table", "title": "...", "columns": [ { "label": "Name", "type": "text-short" }, { "label": "Phone number", "type": "text-short" }, { "label": "Date", "type": "date" }, { "label": "Status", "type": "single-select", "options": ["To call", "Called", "No answer"] } ], "reason": "..." }
    Column "type" is one of: text-short, text-long, number, checkbox, single-select, multi-select, date, attachment, button. Include "options" for the select types. Pick the most natural type per field (phone/email/name → text-short, a notes field → text-long, an amount → number, a yes/no → checkbox, a stage/status → single-select).
    Example: "make a table to track calls with name, phone number, date and status" → exactly the columns shown above.

SYSTEM-WIDE actions (these work from ANYWHERE — they do NOT need a canvas or a widget id, so propose them even when the user is inside a document, a room, or any other view):

13. "navigate-to" — open any area of the app ("open my calendar", "go to Files", "show the org chart", "take me to Mail", "open the People map").
    { "kind": "navigate-to", "target": "home|rooms|desks|shared|documents|files|mail|messages|inbox|calendar|meetings|forms|vault|search|reports|insights|org|peoplemap|knowledge|apps|sign|projects|flows|marketplace|design|task|document|product", "targetId": "<id, only for task/document/product/desks/knowledge>", "label": "<what you're opening, e.g. 'Calendar'>", "reason": "..." }
    Use targetId ONLY when you have a real id from a context block; for task/document/product it is required — if you don't have the id, don't guess, ask in reply.

14. "create-document" — make a new office file (Word-style doc, spreadsheet, slide deck, diagram, or design).
    { "kind": "create-document", "docType": "doc|sheet|slides|map|design", "title": "...", "reason": "..." }

15. "schedule-event" — put an event on the calendar. Compute startMs (epoch ms) from the "now" value in the context; NEVER invent a date.
    { "kind": "schedule-event", "title": "...", "startMs": 0, "durationMinutes": 30, "recurrence": null, "reason": "..." }

16. "compose-mail" — draft an email (the user always sends it themselves).
    { "kind": "compose-mail", "to": ["..."], "subject": "...", "body": "...", "reason": "..." }

17. "create-knowledge-entry" — save a note into the knowledge base. Only from what the user actually said — never invent facts, figures, or citations.
    { "kind": "create-knowledge-entry", "title": "...", "body": "...", "tags": ["..."], "reason": "..." }

18. "start-focus-session" — begin a focus timer. { "kind": "start-focus-session", "minutes": 25, "reason": "..." }

19. "open-url" — open an external web page as a canvas webview (NOT app navigation — use navigate-to for that). { "kind": "open-url", "url": "https://…", "title": "...", "reason": "..." }

Resolving "this" / "that" / "it":
- If "selectedWidget" is set, that's "this".
- Otherwise, pick the widget whose title or content most plausibly matches the user's reference. If two are equally likely, ask in the "reply" field instead of guessing.
- If neither selection nor a clear match exists, do NOT emit a mutation proposal — emit a "reply" asking which one.

Output format — STRICT:
Return valid JSON ONLY (no prose, no code fence). Schema:
{
  "reply": "<1-2 sentence summary of what you'll propose, written conversationally — this becomes the user-facing confirmation>",
  "proposals": [ ...0-6 proposals... ]
}

Rules:
- SCOPE — the current focus (activeTaskId, selectedWidget, the widget snapshot) is a BIAS, not a restriction. Canvas-target actions (create-widget, update/delete/link/focus/drill/toggle/arrange/add-table-row) need a widget id from the snapshot. But the SYSTEM-WIDE actions (13-19) plus create-task/create-todo-list/create-table work from anywhere — always propose them when that's what the user wants, even if the user is inside a document or a different view than what's shown below.
- All "widgetId", "sourceWidgetId", "targetWidgetId" MUST be exact ids copied from the snapshot. Never invent ids. The same applies to every "targetId": copy it from a context block or omit it — if a required id isn't available, ask in "reply" instead of guessing.
- NO FAKERY: never invent facts, figures, quotes, dates, emails, or ids. create-knowledge-entry / any summary must come only from what the user said or the real context; if there isn't enough, say so in "reply". Compute schedule-event startMs from the "now" value, never a guessed date.
- Mutation proposals (update / delete / link / focus) require the target to exist in the snapshot.
- If the user's intent is conversational ("what does this do?"), return [] proposals and answer in "reply".
- If activeTaskId is NONE, you CAN still propose create-task and any system-wide action. You CAN'T propose create-widget (no canvas to put it on) — say so in "reply".
- Never propose more than 6 actions in one response. If the user asked for more, propose the most important 6 and mention the rest in "reply".
- Destructive ops (delete-widget, update-widget/edit-document with operation "replace") need a clear user trigger — only propose if the user explicitly said delete / remove / clear / trash / get rid of / replace / overwrite. Default to non-destructive (append).`
}

interface ParseResult {
  ok: true
  reply: string
  proposals: unknown[]
}

function parseResponse(raw: string): ParseResult | VoiceCommandError {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim()

  // Try whole-string parse first.
  let parsed: { reply?: unknown; proposals?: unknown } | null = null
  try {
    parsed = JSON.parse(cleaned) as { reply?: unknown; proposals?: unknown }
  } catch {
    // Fallback — extract the largest top-level {} block.
    const first = cleaned.indexOf('{')
    const last = cleaned.lastIndexOf('}')
    if (first >= 0 && last > first) {
      try {
        parsed = JSON.parse(cleaned.slice(first, last + 1)) as {
          reply?: unknown
          proposals?: unknown
        }
      } catch {
        return { ok: false, error: 'Model returned malformed JSON.', reason: 'parse' }
      }
    } else {
      return { ok: false, error: 'Model returned no JSON object.', reason: 'parse' }
    }
  }

  const reply = typeof parsed.reply === 'string' ? parsed.reply : ''
  const proposals = Array.isArray(parsed.proposals) ? parsed.proposals : []
  return { ok: true, reply, proposals }
}

// Exported for unit testing — it is the whitelist-and-drop gate that stops the
// model's output from ever producing an unsupported or id-fabricating action.
export function sanitiseProposal(
  raw: unknown,
  known: Map<string, CanvasSnapshotWidget>,
  activeTaskId: string | null,
  i: number
): ActionProposal | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const kind = typeof o.kind === 'string' ? o.kind : ''
  const reason = typeof o.reason === 'string' ? o.reason : undefined
  const id = makeId(i)

  switch (kind) {
    case 'create-widget': {
      if (!activeTaskId) return null
      const wk = typeof o.widgetKind === 'string' ? (o.widgetKind as WidgetKind) : null
      if (!wk || !VALID_KINDS.includes(wk)) return null
      return {
        id,
        kind: 'create-widget',
        widgetKind: wk,
        title: typeof o.title === 'string' ? o.title : undefined,
        content: typeof o.content === 'string' ? o.content : undefined,
        reason
      }
    }
    case 'create-table': {
      // A table WITH explicit columns (vs create-widget widgetKind:table, which
      // is a default name/done table). The executor's applyCreateTable builds
      // the schema from these columns.
      if (!activeTaskId) return null
      const title = typeof o.title === 'string' ? o.title.trim() : ''
      const VALID_COL_TYPES = [
        'text-short',
        'text-long',
        'number',
        'checkbox',
        'single-select',
        'multi-select',
        'date',
        'attachment',
        'button'
      ]
      type Col = Extract<ActionProposal, { kind: 'create-table' }>['columns'][number]
      const columns = (Array.isArray(o.columns) ? o.columns : [])
        .map((c): Col | null => {
          if (!c || typeof c !== 'object') return null
          const co = c as Record<string, unknown>
          const label = typeof co.label === 'string' ? co.label.trim() : ''
          if (!label) return null
          const type =
            typeof co.type === 'string' && VALID_COL_TYPES.includes(co.type)
              ? (co.type as Col['type'])
              : 'text-short'
          const col: Col = { label, type }
          if (Array.isArray(co.options)) {
            const opts = co.options.filter((x): x is string => typeof x === 'string')
            if (opts.length > 0) col.options = opts
          }
          return col
        })
        .filter((c): c is Col => c !== null)
      if (!title || columns.length === 0) return null
      return { id, kind: 'create-table', title, columns, reason }
    }
    case 'update-widget': {
      const wid = typeof o.widgetId === 'string' ? o.widgetId : ''
      if (!known.has(wid)) return null
      const op =
        o.operation === 'append' || o.operation === 'prepend' || o.operation === 'replace'
          ? (o.operation as 'replace' | 'append' | 'prepend')
          : undefined
      const update: Extract<ActionProposal, { kind: 'update-widget' }> = {
        id,
        kind: 'update-widget',
        widgetId: wid,
        label: typeof o.label === 'string' ? o.label : known.get(wid)?.title || 'widget',
        reason
      }
      if (typeof o.title === 'string') update.title = o.title
      if (typeof o.content === 'string') update.content = o.content
      if (op) update.operation = op
      if (typeof o.x === 'number') update.x = o.x
      if (typeof o.y === 'number') update.y = o.y
      if (typeof o.width === 'number') update.width = o.width
      if (typeof o.height === 'number') update.height = o.height
      // Reject no-op updates — would just clutter the proposal dock.
      const hasMutation =
        update.title !== undefined ||
        update.content !== undefined ||
        update.x !== undefined ||
        update.y !== undefined ||
        update.width !== undefined ||
        update.height !== undefined
      if (!hasMutation) return null
      return update
    }
    case 'delete-widget': {
      const wid = typeof o.widgetId === 'string' ? o.widgetId : ''
      if (!known.has(wid)) return null
      return {
        id,
        kind: 'delete-widget',
        widgetId: wid,
        label: typeof o.label === 'string' ? o.label : known.get(wid)?.title || 'widget',
        reason
      }
    }
    case 'link-widgets': {
      const src = typeof o.sourceWidgetId === 'string' ? o.sourceWidgetId : ''
      const tgt = typeof o.targetWidgetId === 'string' ? o.targetWidgetId : ''
      if (!known.has(src) || !known.has(tgt) || src === tgt) return null
      return {
        id,
        kind: 'link-widgets',
        sourceWidgetId: src,
        targetWidgetId: tgt,
        sourceLabel: typeof o.sourceLabel === 'string' ? o.sourceLabel : known.get(src)!.title,
        targetLabel: typeof o.targetLabel === 'string' ? o.targetLabel : known.get(tgt)!.title,
        reason
      }
    }
    case 'focus-widget': {
      const wid = typeof o.widgetId === 'string' ? o.widgetId : ''
      if (!known.has(wid)) return null
      return {
        id,
        kind: 'focus-widget',
        widgetId: wid,
        label: typeof o.label === 'string' ? o.label : known.get(wid)?.title || 'widget',
        reason
      }
    }
    case 'create-task': {
      const title = typeof o.title === 'string' ? o.title.trim() : ''
      if (!title) return null
      return {
        id,
        kind: 'create-task',
        title,
        notes: typeof o.notes === 'string' ? o.notes : undefined,
        reason
      }
    }
    case 'create-todo-list': {
      const title = typeof o.title === 'string' ? o.title : ''
      const items = Array.isArray(o.items)
        ? (o.items.filter((x) => typeof x === 'string') as string[])
        : []
      if (!title || items.length === 0) return null
      return {
        id,
        kind: 'create-todo-list',
        title,
        items,
        reason
      }
    }
    case 'toggle-todo-item': {
      const wid = typeof o.widgetId === 'string' ? o.widgetId : ''
      if (!known.has(wid)) return null
      const match = typeof o.itemMatch === 'string' ? o.itemMatch.trim() : ''
      if (!match) return null
      return {
        id,
        kind: 'toggle-todo-item',
        widgetId: wid,
        widgetLabel:
          typeof o.widgetLabel === 'string'
            ? o.widgetLabel
            : known.get(wid)?.title || 'widget',
        itemMatch: match,
        checked: typeof o.checked === 'boolean' ? o.checked : true,
        reason
      }
    }
    case 'drill-in-widget': {
      const wid = typeof o.widgetId === 'string' ? o.widgetId : ''
      if (!known.has(wid)) return null
      return {
        id,
        kind: 'drill-in-widget',
        widgetId: wid,
        label: typeof o.label === 'string' ? o.label : known.get(wid)?.title || 'widget',
        reason
      }
    }
    case 'arrange-widgets': {
      // widgetIds is optional — empty/null means "arrange every visible
      // non-pinned widget". When provided, every id MUST be in the
      // snapshot or the whole proposal is dropped.
      let widgetIds: string[] | null = null
      if (Array.isArray(o.widgetIds) && o.widgetIds.length > 0) {
        widgetIds = []
        for (const wid of o.widgetIds) {
          if (typeof wid !== 'string') return null
          if (!known.has(wid)) return null
          widgetIds.push(wid)
        }
      }
      return {
        id,
        kind: 'arrange-widgets',
        widgetIds,
        label: typeof o.label === 'string' ? o.label : 'all widgets',
        reason
      }
    }
    case 'add-table-row': {
      const tid = typeof o.tableId === 'string' ? o.tableId : ''
      // tableId is the table-widget's id; voiceCommand can only target
      // widgets the user can see, so it MUST be in the snapshot AND of
      // kind 'table'. (The executor itself does the column-coercion.)
      const target = known.get(tid)
      if (!target || target.kind !== 'table') return null
      if (!o.cells || typeof o.cells !== 'object') return null
      const cells: Record<string, string> = {}
      for (const [k, v] of Object.entries(o.cells as Record<string, unknown>)) {
        if (typeof k !== 'string') continue
        cells[k] = typeof v === 'string' ? v : v == null ? '' : String(v)
      }
      if (Object.keys(cells).length === 0) return null
      return {
        id,
        kind: 'add-table-row',
        tableId: tid,
        cells,
        reason
      }
    }
    // ── System-wide kinds (work from anywhere; no canvas widget id needed) ──
    case 'navigate-to': {
      const NAV_TARGETS = [
        'home', 'rooms', 'desks', 'shared', 'documents', 'files', 'mail', 'messages',
        'inbox', 'calendar', 'meetings', 'forms', 'vault', 'search', 'reports',
        'insights', 'org', 'peoplemap', 'knowledge', 'apps', 'sign', 'projects',
        'flows', 'marketplace', 'design', 'task', 'document', 'product'
      ]
      const target = typeof o.target === 'string' && NAV_TARGETS.includes(o.target) ? o.target : ''
      if (!target) return null
      const targetId = typeof o.targetId === 'string' && o.targetId.trim() ? o.targetId.trim() : undefined
      // Targets that address a specific object can't be invented — drop if the id
      // is missing rather than guess.
      if ((target === 'task' || target === 'document' || target === 'product') && !targetId) return null
      const label = typeof o.label === 'string' && o.label.trim() ? o.label.trim() : target
      return { id, kind: 'navigate-to', target: target as NavigateTarget, targetId, label, reason }
    }
    case 'open-url': {
      const url = typeof o.url === 'string' ? o.url.trim() : ''
      if (!/^https?:\/\//i.test(url)) return null
      return { id, kind: 'open-url', url, title: typeof o.title === 'string' ? o.title : undefined, reason }
    }
    case 'start-focus-session': {
      const raw = typeof o.minutes === 'number' ? o.minutes : 25
      const minutes = Math.min(480, Math.max(1, Math.round(raw)))
      return { id, kind: 'start-focus-session', minutes, reason }
    }
    case 'create-document': {
      const docType = typeof o.docType === 'string' ? o.docType : ''
      if (!['doc', 'sheet', 'slides', 'map', 'design'].includes(docType)) return null
      const title = typeof o.title === 'string' && o.title.trim() ? o.title.trim() : 'Untitled'
      return { id, kind: 'create-document', docType: docType as 'doc' | 'sheet' | 'slides' | 'map' | 'design', title, reason }
    }
    case 'create-knowledge-entry': {
      const title = typeof o.title === 'string' ? o.title.trim() : ''
      const body = typeof o.body === 'string' ? o.body.trim() : ''
      if (!title || !body) return null
      const tags = Array.isArray(o.tags) ? o.tags.filter((x): x is string => typeof x === 'string') : undefined
      return { id, kind: 'create-knowledge-entry', title, body, tags, reason }
    }
    case 'schedule-event': {
      const title = typeof o.title === 'string' ? o.title.trim() : ''
      const startMs = typeof o.startMs === 'number' && Number.isFinite(o.startMs) && o.startMs > 0 ? o.startMs : 0
      if (!title || !startMs) return null
      const durRaw = typeof o.durationMinutes === 'number' ? o.durationMinutes : 30
      const durationMinutes = Math.min(1440, Math.max(1, Math.round(durRaw)))
      const rec = o.recurrence
      const recurrence = rec === 'daily' || rec === 'weekly' || rec === 'monthly' ? rec : null
      return { id, kind: 'schedule-event', title, startMs, durationMinutes, recurrence, reason }
    }
    case 'compose-mail': {
      const subject = typeof o.subject === 'string' ? o.subject.trim() : ''
      const body = typeof o.body === 'string' ? o.body.trim() : ''
      if (!subject && !body) return null
      const to = Array.isArray(o.to) ? o.to.filter((x): x is string => typeof x === 'string') : undefined
      return { id, kind: 'compose-mail', to, subject, body, reason }
    }
    default:
      return null
  }
}

// Defensive uuid factory — currently uses crypto for a stable string, kept
// here so we can swap to a deterministic test seed if needed without
// touching the export surface.
export function _voiceCommandTestUuid(): string {
  return randomUUID()
}

// ── Streaming variant ───────────────────────────────────────────────────────
//
// runVoiceCommandStreaming is the "feels alive" path the operator's spec
// asked for: proposals appear in the dock as Claude emits them, not after
// a full round-trip. Same input shape, same sanitiser, but each accepted
// proposal is delivered through onProposal() the moment it lands, and the
// reply text streams via onReply() so the user can read it as it forms.
//
// JSON streaming strategy: the model outputs free-form JSON like
//   { "reply": "…", "proposals": [ {...}, {...}, … ] }
// We accumulate text deltas, scan for the "reply" field as soon as it
// closes, then track top-level objects inside the "proposals" array using
// a brace counter (string-literal aware). Each balanced object is parsed
// + sanitised independently. If the model emits a malformed entry we
// drop that one, keep streaming the rest.
//
// We deliberately do NOT use Anthropic's tool-use streaming here, which
// would also work but require rewriting the prompt to emit tool calls
// instead of a JSON envelope. The "JSON envelope + brace scanner" path
// keeps the single-source-of-truth prompt and lets us share the
// sanitiser with the non-streaming runVoiceCommand.

export interface VoiceCommandStreamCallbacks {
  onReply: (replyText: string) => void
  onProposal: (proposal: ActionProposal) => void
  onError: (error: VoiceCommandError) => void
  onComplete: (summary: { totalProposals: number; replyText: string }) => void
}

export async function runVoiceCommandStreaming(
  input: VoiceCommandInput,
  cb: VoiceCommandStreamCallbacks
): Promise<void> {
  const transcript = input.transcript.trim()
  if (!transcript) {
    cb.onError({ ok: false, error: 'Empty transcript — nothing to interpret.', reason: 'empty_transcript' })
    return
  }
  const key = resolveAnthropicKey()
  if (!key) {
    cb.onError({
      ok: false,
      error: 'No Anthropic key set. Open Settings → AI · API keys to paste one.',
      reason: 'no_key'
    })
    return
  }
  const widgetCatalogBlock = buildWidgetIndex(input.widgets, input.selectedWidgetId)
  const contextBlock = buildContextBlock(input)
  const system = buildSystemPrompt()
  const userMsg =
    `User said (voice transcript):\n"${transcript}"\n\n` +
    `Current canvas:\n${contextBlock}\n\n` +
    `Widgets on canvas (id ── kind ── title ── content-preview):\n${widgetCatalogBlock}\n\n` +
    `Return the JSON now.`

  const client = new Anthropic({ apiKey: key })
  const known = new Map(input.widgets.map((w) => [w.id, w]))
  const scanner = new StreamingProposalScanner()
  let replyEmitted = false
  let replyText = ''
  let proposalIndex = 0
  let acceptedCount = 0

  try {
    const stream = client.messages.stream({
      model: resolveModel('setup'),
      max_tokens: 8192,
      system,
      messages: [{ role: 'user', content: userMsg }]
    })

    stream.on('text', (delta: string) => {
      scanner.push(delta)

      // Emit reply text greedily once we've seen the closing quote on the
      // reply field. Sometimes the model emits the proposals first
      // (rarely, but valid) — onReply may stay un-fired until completion
      // in that case, and we flush from the final parse in `finally`.
      if (!replyEmitted) {
        const r = scanner.extractReply()
        if (r !== null) {
          replyEmitted = true
          replyText = r
          cb.onReply(r)
        }
      }

      // Drain all complete proposal objects we can see right now.
      while (true) {
        const next = scanner.nextProposal()
        if (next === null) break
        const sanitised = sanitiseProposal(next, known, input.activeTaskId, proposalIndex++)
        if (sanitised) {
          acceptedCount += 1
          cb.onProposal(sanitised)
        }
      }
    })

    const finalMsg = await stream.finalMessage()
    // Invariant 1: honour the stop reason. A refusal / context overflow means the
    // model produced nothing usable — surface it rather than completing silently.
    const sr = (finalMsg.stop_reason as string) ?? ''
    if (sr === 'refusal') {
      cb.onError({ ok: false, error: 'The model declined to act on that request.', reason: 'api' })
      return
    }
    if (sr === 'model_context_window_exceeded') {
      cb.onError({ ok: false, error: 'That was too much context for one request — try a shorter command.', reason: 'api' })
      return
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    cb.onError({ ok: false, error: msg.length > 240 ? msg.slice(0, 240) + '…' : msg, reason: 'api' })
    return
  }

  // Fallback: if reply never streamed (e.g. proposals-first order), pull
  // it from the final accumulated text via the same parser the
  // non-streaming path uses.
  if (!replyEmitted) {
    const parsed = parseResponse(scanner.fullText())
    if (parsed.ok && parsed.reply) {
      replyText = parsed.reply
      cb.onReply(parsed.reply)
    }
  }

  cb.onComplete({ totalProposals: acceptedCount, replyText })
}

// Incremental JSON-array scanner. Stores the running text buffer and
// tracks the brace + bracket depth so we can carve out completed
// objects inside the "proposals" array as soon as they land. String-
// literal aware (escapes + quotes don't confuse the counter).
//
// The scanner doesn't validate — it returns raw parsed objects, which
// the caller pipes through sanitiseProposal() before emitting.
class StreamingProposalScanner {
  private buf = ''
  private replyEnd: number | null = null // index where the reply field's closing " sits
  private proposalsArrayStart: number | null = null
  // Position the next-extract scan starts at (cursor advances as we
  // emit each completed object).
  private scanFrom = 0

  push(chunk: string): void {
    this.buf += chunk
  }

  fullText(): string {
    return this.buf
  }

  extractReply(): string | null {
    if (this.replyEnd !== null) {
      // Already emitted — caller shouldn't call us again, but guard.
      return null
    }
    // Look for `"reply"\s*:\s*"` then walk forward respecting escapes
    // until the closing quote.
    const m = this.buf.match(/"reply"\s*:\s*"/)
    if (!m || m.index === undefined) return null
    const start = m.index + m[0].length
    let i = start
    while (i < this.buf.length) {
      const c = this.buf[i]
      if (c === '\\') {
        i += 2
        continue
      }
      if (c === '"') {
        this.replyEnd = i
        // Decode the JSON string fragment by reparsing it within a tiny envelope.
        try {
          const json = `"${this.buf.slice(start, i)}"`
          return JSON.parse(json) as string
        } catch {
          return this.buf.slice(start, i)
        }
      }
      i += 1
    }
    return null
  }

  nextProposal(): unknown | null {
    // Locate the proposals array if we haven't already.
    if (this.proposalsArrayStart === null) {
      const m = this.buf.match(/"proposals"\s*:\s*\[/)
      if (!m || m.index === undefined) return null
      this.proposalsArrayStart = m.index + m[0].length
      this.scanFrom = this.proposalsArrayStart
    }
    // Scan from scanFrom looking for a complete top-level object.
    // Skip whitespace / commas between objects.
    let i = this.scanFrom
    while (i < this.buf.length && /[\s,]/.test(this.buf[i])) i += 1
    if (i >= this.buf.length) {
      this.scanFrom = i
      return null
    }
    if (this.buf[i] === ']') {
      // End of proposals array — nothing more to find.
      this.scanFrom = i
      return null
    }
    if (this.buf[i] !== '{') {
      // Junk before the next object — skip a char and try again next push.
      this.scanFrom = i + 1
      return null
    }
    // We're at the start of an object. Walk forward maintaining brace +
    // bracket depth + string-literal state until depth returns to 0.
    let depth = 0
    let inString = false
    let escape = false
    let j = i
    while (j < this.buf.length) {
      const c = this.buf[j]
      if (escape) {
        escape = false
        j += 1
        continue
      }
      if (inString) {
        if (c === '\\') escape = true
        else if (c === '"') inString = false
        j += 1
        continue
      }
      if (c === '"') {
        inString = true
      } else if (c === '{' || c === '[') {
        depth += 1
      } else if (c === '}' || c === ']') {
        depth -= 1
        if (depth === 0) {
          // Completed object spans i..j inclusive.
          const slice = this.buf.slice(i, j + 1)
          this.scanFrom = j + 1
          try {
            return JSON.parse(slice)
          } catch {
            return null
          }
        }
      }
      j += 1
    }
    // Object not yet complete — don't advance scanFrom past i so the
    // next push() finds it again.
    this.scanFrom = i
    return null
  }
}
