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
import type { ActionProposal, WidgetKind } from '@shared/types'

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
      max_tokens: 2048,
      system,
      messages: [{ role: 'user', content: userMsg }]
    })
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
  return `You are FocusBuddy's voice-command interpreter.

The user just spoke an instruction. You decide what concrete workspace actions to propose. You NEVER execute anything — every proposal becomes a card the user clicks Apply or Dismiss on.

Available proposal kinds (return as a JSON array under "proposals"):

1. "create-widget" — drop a new widget on the canvas.
   { "kind": "create-widget", "widgetKind": "sticky|note|markdown|page|table|field|file|webview|timer|calculator|color|mindmap", "title": "...", "content": "...", "reason": "..." }
   The content field holds the body the user wants populated. Tables/pages get sensible empty starts, sticky/note/markdown get plain text.

2. "update-widget" — modify an existing widget. Reference by id from the snapshot below.
   { "kind": "update-widget", "widgetId": "<id-from-snapshot>", "label": "<short user-facing description>", "title": "...", "content": "...", "operation": "replace|append|prepend", "x": 0, "y": 0, "width": 0, "height": 0, "reason": "..." }
   Any field can be omitted. operation defaults to "replace" — use "append" when the user wants to add to existing content ("add 'call dentist' to my todo list").

3. "delete-widget" — destroy an existing widget. ALWAYS confirmed individually by the user.
   { "kind": "delete-widget", "widgetId": "<id>", "label": "<short description>", "reason": "..." }

4. "link-widgets" — draw a ghost line between two widgets ("connect the budget to the deadline note").
   { "kind": "link-widgets", "sourceWidgetId": "<id>", "targetWidgetId": "<id>", "sourceLabel": "...", "targetLabel": "...", "reason": "..." }

5. "focus-widget" — bring a specific widget to the front + activate it ("focus the timer").
   { "kind": "focus-widget", "widgetId": "<id>", "label": "...", "reason": "..." }

6. "create-task" — make a new sub-task.
   { "kind": "create-task", "title": "...", "notes": "...", "reason": "..." }

7. "create-todo-list" — quick markdown checklist widget.
   { "kind": "create-todo-list", "title": "...", "items": ["...", "..."], "reason": "..." }

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
- All "widgetId", "sourceWidgetId", "targetWidgetId" MUST be exact ids copied from the snapshot. Never invent ids.
- Mutation proposals (update / delete / link / focus) require the target to exist in the snapshot.
- If the user's intent is conversational ("what does this do?"), return [] proposals and answer in "reply".
- If activeTaskId is NONE, you CAN still propose create-task. You CAN'T propose create-widget (no canvas to put it on) — say so in "reply".
- Never propose more than 6 actions in one response. If the user asked for more, propose the most important 6 and mention the rest in "reply".
- Destructive ops (delete-widget) need a clear user trigger — only propose if the user explicitly said delete / remove / clear / trash / get rid of.`
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

function sanitiseProposal(
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
