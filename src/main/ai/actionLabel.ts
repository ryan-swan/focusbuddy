// One human line per action the assistant is preparing, for the retrieval trace.
//
// The trace's job is to let you watch the work happen — "✉ Email draft → Ryan",
// not "compose-mail". These labels are read off the RAW action object the
// streaming scanner carves out of the model's envelope, before the sanitiser
// runs, because the point is to show the action the moment it lands rather than
// after the whole response is parsed.
//
// That has one consequence worth being explicit about: a label can describe an
// action the sanitiser will later reject (a compose-mail with neither subject
// nor body, say). The trace is a record of what the model produced, not a
// promise that a card will appear — and the trace is ephemeral, while the cards
// are what persist. Under-describing is safer than over-promising, so every
// label is derived from fields actually present in the object.
//
// Dependency-free (no Electron, no DB, no SDK) so it unit-tests in isolation —
// the same reason chatJson.ts and streamingEnvelope.ts are their own modules.

// Kinds whose subject is a recipient rather than a name — these read with an
// arrow so the trace shows where the thing is headed.
const DIRECTED = new Set(['compose-mail', 'post-chat'])

// Human titles for each action kind the chat envelope can carry. Kinds are the
// same strings parseChatJson switches on; an unknown kind still gets a label
// (see below) rather than being dropped, because the trace must not go quiet
// just because the model invented something.
const KIND_TITLE: Record<string, string> = {
  'create-widget': 'Widget',
  'create-agent': 'Agent',
  'link-widgets': 'Wire',
  'open-url': 'Open link',
  'create-todo-list': 'To-do list',
  'create-page': 'Page',
  'create-task': 'Task',
  'start-focus-session': 'Focus session',
  'delete-widget': 'Remove widget',
  'update-widget': 'Update widget',
  'create-table': 'Table',
  'add-table-row': 'Table row',
  'create-field': 'Field',
  'update-task': 'Update task',
  'create-knowledge-entry': 'Knowledge entry',
  'edit-document': 'Document edit',
  'set-cell': 'Cell edit',
  'schedule-event': 'Calendar event',
  'compose-mail': 'Email draft',
  'post-chat': 'Message'
}

// Turn a kebab-case kind we have no title for into something readable, so an
// action kind added elsewhere in the codebase still reads as English here
// instead of forcing an edit to this file.
function humaniseKind(kind: string): string {
  const words = kind.replace(/[-_]+/g, ' ').trim()
  if (!words) return 'Action'
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

// The most specific subject we can name for this action, or '' when the object
// carries nothing worth showing. Order matters: the first field that identifies
// the thing to a person wins.
function subjectOf(kind: string, a: Record<string, unknown>): string {
  if (kind === 'compose-mail') {
    // Who it's going to is the useful half of an email; fall back to subject.
    const to = Array.isArray(a.to)
      ? (a.to as unknown[]).filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
      : []
    if (to.length === 1) return recipientName(to[0])
    if (to.length > 1) return `${recipientName(to[0])} +${to.length - 1}`
    return str(a.subject)
  }
  if (kind === 'post-chat') return str(a.conversationLabel) || str(a.conversationId)
  if (kind === 'open-url') return str(a.url)
  if (kind === 'link-widgets') {
    const from = str(a.sourceLabel)
    const to = str(a.targetLabel)
    if (from && to) return `${from} → ${to}`
    return from || to
  }
  if (kind === 'set-cell') return str(a.column) || str(a.tableId)
  if (kind === 'add-table-row') return str(a.tableId).replace(/^\$/, '')
  return str(a.title) || str(a.name) || str(a.subject) || str(a.instruction).slice(0, 60)
}

// Trim an address down to the part a person recognises: "Ryan Chen
// <ryan@acme.com>" and "ryan@acme.com" both read as "Ryan".
export function recipientName(addr: string): string {
  const trimmed = addr.trim()
  const angled = /^(.*?)</.exec(trimmed)
  const display = angled ? angled[1].trim().replace(/^["']|["']$/g, '') : ''
  if (display) return display
  const local = trimmed.replace(/^.*</, '').replace(/>.*$/, '').split('@')[0]
  if (!local) return trimmed
  // first.last / first_last / first-last → First
  const first = local.split(/[._-]/)[0]
  if (!first) return local
  return first.charAt(0).toUpperCase() + first.slice(1)
}

export interface ActionTrace {
  // The kind exactly as the model emitted it. Free string, not a union: this
  // runs before sanitisation and must survive an unrecognised value.
  kind: string
  // The line the trace draws.
  label: string
}

// Describe one raw action object from the streaming scanner. Returns null when
// the object isn't shaped like an action at all (no usable `kind`), so the
// caller can skip it without inventing a trace line for junk.
export function describeAction(raw: unknown): ActionTrace | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const a = raw as Record<string, unknown>
  const kind = str(a.kind)
  if (!kind) return null
  const title = KIND_TITLE[kind] ?? humaniseKind(kind)
  const subject = subjectOf(kind, a)
  // Actions addressed AT someone read with an arrow ("Email draft → Ryan");
  // everything else names its subject with a dash ("Table — Prospects").
  const sep = DIRECTED.has(kind) ? '→' : '—'
  const label = subject ? `${title} ${sep} ${subject}` : title
  return { kind, label: label.length > 90 ? `${label.slice(0, 88)}…` : label }
}
