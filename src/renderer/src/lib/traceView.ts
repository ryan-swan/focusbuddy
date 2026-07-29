// The retrieval trace, derived — never separately managed.
//
// `getTraceView` walks the trace's recorded facts and returns the exact lines to
// draw. Nothing about what the trace shows is stored anywhere else: no "current
// phase" field, no per-line status the UI keeps in sync. That is deliberate. A
// phase list that is state can desync from the work it describes, and a trace
// that says "Searching…" when nothing is in flight is exactly the dishonesty
// this whole surface exists to remove. Here, a line can only be drawn as done
// because the event that finished it actually arrived.
//
// Pure and DOM-free so it unit-tests directly — the derivation is where the
// honesty lives, so it is the part that gets pinned by tests.

import type { ChatSource, ChatToolTrace } from '@shared/types'
import { connectorForKind, connectorMeta } from './chatBlocks'

// What the assistant actually did while answering one message.
//
// Every field is set from a server event that really fired. `retrievedAt`,
// `repliedAt` and `completedAt` are renderer clock stamps for the moment each
// event landed; `retrievalMs` is the real elapsed time measured in the main
// process, because the round trip through IPC is not part of the search.
export interface AssistantTrace {
  status: 'running' | 'done' | 'error'
  startedAt: number
  // Null until the `sources` event lands.
  retrievedAt: number | null
  retrievalMs: number | null
  // Null until the reply prose lands whole.
  repliedAt: number | null
  completedAt: number | null
  // Everything retrieval returned — NOT the same as what the answer cites.
  // Citation chips are derived separately, from the [n] markers in the prose.
  sources: ChatSource[]
  tools: ChatToolTrace[]
  error: string | null
}

export interface TraceLeaf {
  key: string
  label: string
  icon: string
  // 1-based citation number, for source leaves. Matches the [n] markers.
  n?: number
  // The retrieved source this leaf stands for, so it can be opened.
  //
  // This matters more than it looks: the trace lists everything retrieval
  // found, while the chips below the answer list only what the answer cited.
  // Anything retrieved but uncited exists nowhere else in the UI — the trace is
  // the only way back to it. Absent on tool leaves, which name an action rather
  // than a document.
  source?: ChatSource
}

export interface TraceLine {
  key: string
  label: string
  icon: string
  leaves?: TraceLeaf[]
}

export interface TraceView {
  // Phases that finished, in the order they finished.
  completed: TraceLine[]
  // The one phase in flight, or null when nothing is.
  active: TraceLine | null
  // Set instead of `active` when the request failed. Never both.
  error: TraceLine | null
}

// How long to wait between revealing one retrieved source and the next. Slow
// enough to read, fast enough that six sources don't outlast the answer.
export const SOURCE_REVEAL_INTERVAL_MS = 260

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

// Icon for a prepared action. Connector-shaped kinds (mail / calendar / chat)
// reuse the same icons their proposal cards carry, so the same action looks like
// the same thing in the trace and on the card below it.
export function toolIcon(kind: string): string {
  const connector = connectorForKind(kind)
  if (connector) return connectorMeta(connector).icon
  if (kind.startsWith('create-doc') || kind === 'create-page' || kind === 'edit-document') {
    return 'description'
  }
  if (kind === 'create-table' || kind === 'add-table-row' || kind === 'set-cell') return 'table_chart'
  if (kind === 'create-task' || kind === 'update-task' || kind === 'create-todo-list') {
    return 'check_circle'
  }
  if (kind === 'create-agent') return 'smart_toy'
  if (kind === 'create-knowledge-entry') return 'menu_book'
  if (kind === 'open-url') return 'open_in_new'
  return 'bolt'
}

// Is there anything worth drawing?
//
// While a request is live the answer is yes — retrieval really is running, and
// saying so is the useful part. Once it has finished, a request that retrieved
// nothing and prepared nothing has nothing to report, and the trace disappears
// entirely rather than collapsing to a "0 sources" badge nobody asked for.
export function hasTraceContent(trace: AssistantTrace): boolean {
  if (trace.status === 'running') return true
  if (trace.status === 'error') return true
  return trace.sources.length > 0 || trace.tools.length > 0
}

// The one-line summary the trace collapses to. Only ever names things that
// exist, so "3 sources · 2 tools" never appears over a request that had neither.
//
// A failed request says so first. Now that a failure can be folded away, a bare
// "1 source" over a broken request would read exactly like one that went fine —
// which is the one thing a collapsed summary must never do.
export function traceSummary(trace: AssistantTrace): string {
  const parts: string[] = []
  if (trace.sources.length > 0) parts.push(plural(trace.sources.length, 'source'))
  if (trace.tools.length > 0) parts.push(plural(trace.tools.length, 'tool'))
  if (trace.status === 'error') {
    return parts.length > 0 ? `Failed · ${parts.join(' · ')}` : 'Failed'
  }
  if (parts.length === 0) return 'No sources used'
  return parts.join(' · ')
}

function retrieveLabel(trace: AssistantTrace): string {
  const ms = trace.retrievalMs
  const timing = typeof ms === 'number' ? ` · ${ms}ms` : ''
  if (trace.sources.length === 0) return `Searched your workspace · nothing relevant${timing}`
  return `Searched your workspace · ${plural(trace.sources.length, 'source')}${timing}`
}

function sourceLeaves(trace: AssistantTrace, revealedCount: number): TraceLeaf[] {
  return trace.sources.slice(0, Math.max(0, revealedCount)).map((s) => ({
    key: `${s.n}-${s.docId}`,
    label: s.title,
    icon: s.docType === 'knowledge' ? 'menu_book' : 'description',
    n: s.n,
    source: s
  }))
}

function toolLeaves(trace: AssistantTrace): TraceLeaf[] {
  return trace.tools.map((t) => ({
    key: `tool-${t.index}`,
    label: t.label,
    icon: toolIcon(t.kind)
  }))
}

// Walk the trace and return what to draw. `revealedCount` is how many retrieved
// sources have been ticked in by the caller's reveal timer — the one piece of
// presentation state, and it only ever gates how much of a completed fact is
// on screen yet, never whether the fact is true.
export function getTraceView(trace: AssistantTrace, revealedCount: number): TraceView {
  const completed: TraceLine[] = []
  const failed = trace.status === 'error'
  // A failure replaces whatever would have been active. Phases already finished
  // stay green because they really did finish; nothing ahead of the failure is
  // ever drawn as done.
  const stop = (active: TraceLine | null): TraceView =>
    failed
      ? {
          completed,
          active: null,
          error: {
            key: 'failed',
            label: trace.error?.trim() || 'The request failed.',
            icon: 'error'
          }
        }
      : { completed, active, error: null }

  // 1 — retrieval. Nothing else can be true until this returns.
  if (trace.retrievedAt === null) {
    return stop({ key: 'retrieve', label: 'Searching your workspace…', icon: 'search' })
  }
  completed.push({
    key: 'retrieve',
    label: retrieveLabel(trace),
    icon: 'search',
    leaves: sourceLeaves(trace, revealedCount)
  })

  // 2 — reading what came back, one source at a time.
  if (revealedCount < trace.sources.length) {
    const current = trace.sources[revealedCount]
    return stop({
      key: `read-${revealedCount}`,
      label: `Reading ${current.title}…`,
      icon: 'description'
    })
  }

  // 3 — the answer. The envelope is {reply, actions}, so the prose necessarily
  // closes before any action does: this phase genuinely completes first, and the
  // trace shows that real order rather than a tidier invented one.
  if (trace.repliedAt === null && trace.completedAt === null) {
    return stop({ key: 'answer', label: 'Writing the answer…', icon: 'edit_note' })
  }
  // The reply landed (repliedAt), or the request finished without a separate
  // reply event — the prose-only fallback path, where there was no JSON envelope
  // to watch a reply field close inside. A request that FAILED before any reply
  // gets no line at all: nothing was written, so nothing claims to have been.
  if (trace.repliedAt !== null || !failed) {
    completed.push({ key: 'answer', label: 'Wrote the answer', icon: 'edit_note' })
  }

  // 4 — actions. The line exists only once one has actually arrived; a request
  // that proposed nothing says nothing about tools.
  if (trace.tools.length > 0) {
    completed.push({
      key: 'tools',
      label: `Prepared ${plural(trace.tools.length, 'tool')}`,
      icon: 'bolt',
      leaves: toolLeaves(trace)
    })
    // Still streaming after at least one action landed: more may be coming, and
    // saying so is true. With none yet we stay silent rather than promising
    // tools that may never appear.
    if (trace.status === 'running') {
      return stop({ key: 'tools-active', label: 'Preparing actions…', icon: 'bolt' })
    }
  }

  return stop(null)
}
