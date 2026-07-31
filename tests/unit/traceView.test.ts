import { describe, it, expect } from 'vitest'
import type { ChatMentionResolved, ChatSource, ChatToolTrace } from '../../src/shared/types'
import {
  getTraceView,
  hasTraceContent,
  traceSummary,
  toolIcon,
  type AssistantTrace
} from '../../src/renderer/src/lib/traceView'

// The trace's contract is honesty, and this is where it is enforced: a line may
// only be drawn as done because the event that finished it arrived. So these
// tests are written as "given exactly these events fired, what may the UI say?"

const src = (n: number, title: string, docType = 'document'): ChatSource => ({
  n,
  docId: `doc-${n}`,
  title,
  docType,
  snippet: `snippet ${n}`
})

const tool = (index: number, kind: string, label: string): ChatToolTrace => ({ index, kind, label })

// A resolved (or refused) @-mention, as the main process reports it.
const mention = (
  title: string,
  resolved: boolean,
  extra: Partial<ChatMentionResolved> = {}
): ChatMentionResolved => ({
  kind: 'document',
  id: title.toLowerCase().replace(/\s+/g, '-'),
  title,
  resolved,
  chars: resolved ? 120 : 0,
  truncated: false,
  reason: resolved ? null : 'this document no longer exists',
  ...extra
})

// A trace with nothing yet reported — the state right after a send starts.
function running(patch: Partial<AssistantTrace> = {}): AssistantTrace {
  return {
    status: 'running',
    startedAt: 1000,
    retrievedAt: null,
    retrievalMs: null,
    repliedAt: null,
    completedAt: null,
    mentions: [],
    sources: [],
    tools: [],
    error: null,
    ...patch
  }
}

function done(patch: Partial<AssistantTrace> = {}): AssistantTrace {
  return running({
    status: 'done',
    retrievedAt: 1100,
    retrievalMs: 240,
    repliedAt: 1900,
    completedAt: 2000,
    ...patch
  })
}

const labels = (lines: Array<{ label: string }>): string[] => lines.map((l) => l.label)

describe('getTraceView — phases only advance on real events', () => {
  it('shows only the search while retrieval is still out', () => {
    const v = getTraceView(running(), 0)
    expect(v.completed).toEqual([])
    expect(v.active?.label).toBe('Searching your workspace…')
    expect(v.error).toBeNull()
  })

  it('never claims an answer was written before the reply landed', () => {
    // Retrieval is back, sources all revealed, but no reply event yet.
    const t = running({ retrievedAt: 1100, retrievalMs: 240, sources: [src(1, 'A')] })
    const v = getTraceView(t, 1)
    expect(labels(v.completed)).toEqual(['Searched your workspace · 1 source · 240ms'])
    expect(v.active?.label).toBe('Writing the answer…')
  })

  it('reports the real elapsed retrieval time, not an estimate', () => {
    const v = getTraceView(done({ retrievalMs: 37, sources: [src(1, 'A'), src(2, 'B')] }), 2)
    expect(v.completed[0].label).toBe('Searched your workspace · 2 sources · 37ms')
  })

  it('says so plainly when retrieval found nothing', () => {
    const v = getTraceView(done({ retrievalMs: 12 }), 0)
    expect(v.completed[0].label).toBe('Searched your workspace · nothing relevant · 12ms')
  })

  it('walks the sources one at a time as they are revealed', () => {
    const t = done({ sources: [src(1, 'Release checklist'), src(2, 'updater-notes.md')] })
    // Nothing revealed yet: the first source is the one being read.
    expect(getTraceView(t, 0).active?.label).toBe('Reading Release checklist…')
    expect(getTraceView(t, 0).completed[0].leaves).toEqual([])
    // One revealed: it appears as a leaf, the second becomes active.
    const v1 = getTraceView(t, 1)
    expect(v1.active?.label).toBe('Reading updater-notes.md…')
    expect(labels(v1.completed[0].leaves ?? [])).toEqual(['Release checklist'])
    // All revealed: the reveal phase is over.
    const v2 = getTraceView(t, 2)
    expect(labels(v2.completed[0].leaves ?? [])).toEqual(['Release checklist', 'updater-notes.md'])
    expect(v2.active).toBeNull()
  })

  it('carries the source on each leaf so the trace can open it', () => {
    // The trace lists everything retrieval found; the chips below the answer
    // list only what it cited. Anything retrieved-but-uncited is reachable
    // nowhere else, so these leaves are the only route back to it.
    const sources = [src(1, 'Release checklist'), src(2, 'updater-notes.md')]
    const leaves = getTraceView(done({ sources }), 2).completed[0].leaves ?? []
    expect(leaves.map((l) => l.source)).toEqual(sources)
  })

  it('does not put a source on a tool leaf — an action is not a document', () => {
    const t = done({ tools: [tool(0, 'compose-mail', 'Email draft → Ryan')] })
    const toolLine = getTraceView(t, 0).completed.find((l) => l.key === 'tools')
    expect((toolLine?.leaves ?? []).every((l) => l.source === undefined)).toBe(true)
  })

  it('numbers source leaves to match the inline [n] markers', () => {
    const v = getTraceView(done({ sources: [src(1, 'A'), src(2, 'B'), src(3, 'C')] }), 3)
    expect((v.completed[0].leaves ?? []).map((l) => l.n)).toEqual([1, 2, 3])
  })
})

describe('getTraceView — prepared actions', () => {
  it('says nothing about tools when none were prepared', () => {
    const v = getTraceView(done({ sources: [src(1, 'A')] }), 1)
    expect(labels(v.completed)).toEqual([
      'Searched your workspace · 1 source · 240ms',
      'Wrote the answer'
    ])
    expect(v.active).toBeNull()
  })

  it('lists each prepared action under a counted line', () => {
    const t = done({
      tools: [tool(0, 'compose-mail', 'Email draft → Ryan'), tool(1, 'create-page', 'Page — Release update')]
    })
    const v = getTraceView(t, 0)
    const toolLine = v.completed.find((l) => l.key === 'tools')
    expect(toolLine?.label).toBe('Prepared 2 tools')
    expect(labels(toolLine?.leaves ?? [])).toEqual([
      'Email draft → Ryan',
      'Page — Release update'
    ])
  })

  it('keeps a "preparing" line up only while the stream is still open AND something has landed', () => {
    // One action in, stream still running: more may be coming — true, so say it.
    const midway = running({
      retrievedAt: 1100,
      retrievalMs: 5,
      repliedAt: 1500,
      tools: [tool(0, 'compose-mail', 'Email draft → Ryan')]
    })
    expect(getTraceView(midway, 0).active?.label).toBe('Preparing actions…')

    // Stream still running but no action has landed: we do NOT know that any is
    // coming, so we promise nothing.
    const quiet = running({ retrievedAt: 1100, retrievalMs: 5, repliedAt: 1500 })
    expect(getTraceView(quiet, 0).active).toBeNull()
  })

  it('drops the "preparing" line the moment the request completes', () => {
    const t = done({ tools: [tool(0, 'compose-mail', 'Email draft → Ryan')] })
    expect(getTraceView(t, 0).active).toBeNull()
  })
})

describe('getTraceView — failure ends red, never green', () => {
  it('names the failure and draws no active phase', () => {
    const t: AssistantTrace = done({
      status: 'error',
      repliedAt: null,
      error: 'Conversation hit the model context window. Start a fresh session.'
    })
    const v = getTraceView(t, 0)
    expect(v.active).toBeNull()
    expect(v.error?.label).toBe('Conversation hit the model context window. Start a fresh session.')
  })

  it('does not claim an answer was written when the request died before one', () => {
    const t = done({ status: 'error', repliedAt: null, error: 'boom', sources: [src(1, 'A')] })
    const v = getTraceView(t, 1)
    expect(labels(v.completed)).toEqual(['Searched your workspace · 1 source · 240ms'])
    expect(labels(v.completed)).not.toContain('Wrote the answer')
  })

  it('keeps the phases that genuinely finished before the failure', () => {
    // Prose landed, then the stream broke. The answer really was written.
    const t = done({ status: 'error', error: 'network dropped', sources: [src(1, 'A')] })
    const v = getTraceView(t, 1)
    expect(labels(v.completed)).toEqual([
      'Searched your workspace · 1 source · 240ms',
      'Wrote the answer'
    ])
    expect(v.error?.label).toBe('network dropped')
  })

  it('falls back to a generic line when the failure carried no message', () => {
    const v = getTraceView(done({ status: 'error', error: '   ' }), 0)
    expect(v.error?.label).toBe('The request failed.')
  })

  it('shows the failure even when it happened before retrieval returned', () => {
    const t = running({ status: 'error', completedAt: 1200, error: 'No Anthropic API key set.' })
    const v = getTraceView(t, 0)
    expect(v.completed).toEqual([])
    expect(v.active).toBeNull()
    expect(v.error?.label).toBe('No Anthropic API key set.')
  })
})

describe('hasTraceContent — when nothing happened, render nothing', () => {
  it('is false for a finished request that retrieved nothing and prepared nothing', () => {
    expect(hasTraceContent(done())).toBe(false)
  })

  it('is true while a request is in flight — the search really is running', () => {
    expect(hasTraceContent(running())).toBe(true)
  })

  it('is true once anything real came back', () => {
    expect(hasTraceContent(done({ sources: [src(1, 'A')] }))).toBe(true)
    expect(hasTraceContent(done({ tools: [tool(0, 'create-task', 'Task — A')] }))).toBe(true)
  })

  it('is true for a failure, which always has something to say', () => {
    expect(hasTraceContent(done({ status: 'error', error: 'boom' }))).toBe(true)
  })
})

describe('traceSummary — the collapsed line only names things that exist', () => {
  it('counts sources and tools', () => {
    expect(traceSummary(done({ sources: [src(1, 'A'), src(2, 'B'), src(3, 'C')] }))).toBe('3 sources')
    expect(
      traceSummary(
        done({
          sources: [src(1, 'A'), src(2, 'B'), src(3, 'C')],
          tools: [tool(0, 'compose-mail', 'x'), tool(1, 'create-page', 'y')]
        })
      )
    ).toBe('3 sources · 2 tools')
  })

  it('uses the singular where it should', () => {
    expect(traceSummary(done({ sources: [src(1, 'A')], tools: [tool(0, 'create-task', 'x')] }))).toBe(
      '1 source · 1 tool'
    )
  })

  it('never invents a zero count', () => {
    expect(traceSummary(done())).toBe('No sources used')
    expect(traceSummary(done({ status: 'error', error: 'x' }))).toBe('Failed')
  })

  it('leads with the failure, so a folded-away error cannot read as a success', () => {
    expect(traceSummary(done({ status: 'error', error: 'x', sources: [src(1, 'A')] }))).toBe(
      'Failed · 1 source'
    )
    expect(
      traceSummary(
        done({
          status: 'error',
          error: 'x',
          sources: [src(1, 'A'), src(2, 'B')],
          tools: [tool(0, 'compose-mail', 'y')]
        })
      )
    ).toBe('Failed · 2 sources · 1 tool')
  })
})

describe('toolIcon — an action looks the same in the trace as on its card', () => {
  it('reuses the connector icons for connector-shaped kinds', () => {
    expect(toolIcon('compose-mail')).toBe('mail')
    expect(toolIcon('schedule-event')).toBe('calendar_month')
    expect(toolIcon('post-chat')).toBe('chat')
  })

  it('has sensible icons for the workspace kinds', () => {
    expect(toolIcon('create-page')).toBe('description')
    expect(toolIcon('create-table')).toBe('table_chart')
    expect(toolIcon('create-task')).toBe('check_circle')
    expect(toolIcon('create-agent')).toBe('smart_toy')
  })

  it('falls back rather than rendering a broken glyph for an unknown kind', () => {
    expect(toolIcon('summon-dragon')).toBe('bolt')
  })
})

// ── The "Mentioned" lane (Phase 4.4, plan D3) ──────────────────────────────
// A separate lane from Retrieved on purpose: "you told me to read this" and
// "I went and found this" are different claims. The critical invariant is that
// merging them never happens — [n] means retrieval, and only retrieval.

describe('the mentioned lane — what the user named, and what it really produced', () => {
  it('leads the trace, because references resolve before retrieval runs', () => {
    const v = getTraceView(
      running({
        mentions: [mention('Q3 brief', true)],
        retrievedAt: 1100,
        retrievalMs: 40,
        sources: [src(1, 'A doc')],
        repliedAt: 1200,
        status: 'done',
        completedAt: 1300
      }),
      1
    )
    expect(v.completed[0].key).toBe('mentions')
    expect(v.completed[1].key).toBe('retrieve')
  })

  it('does not exist at all when the request carried no references', () => {
    const v = getTraceView(running({ retrievedAt: 1100, sources: [], repliedAt: 1200, status: 'done' }), 0)
    expect(v.completed.find((l) => l.key === 'mentions')).toBeUndefined()
  })

  it('never draws an unresolved reference as read', () => {
    const v = getTraceView(
      running({
        mentions: [mention('Gone doc', false)],
        retrievedAt: 1100,
        repliedAt: 1200,
        status: 'done'
      }),
      0
    )
    const line = v.completed.find((l) => l.key === 'mentions')!
    expect(line.label).toContain('Could not read')
    expect(line.label).not.toMatch(/^Read \d/)
    expect(line.leaves![0].label).toContain('no longer exists')
    expect(line.leaves![0].icon).toBe('link_off')
  })

  it('counts honestly when some resolved and some did not', () => {
    const v = getTraceView(
      running({
        mentions: [mention('Good', true), mention('Bad', false)],
        retrievedAt: 1100,
        repliedAt: 1200,
        status: 'done'
      }),
      0
    )
    expect(v.completed.find((l) => l.key === 'mentions')!.label).toBe('Read 1 of 2 items you referenced')
  })

  it('says a reference was shortened rather than passing a fragment off as the whole', () => {
    const v = getTraceView(
      running({
        mentions: [mention('Huge doc', true, { truncated: true })],
        retrievedAt: 1100,
        repliedAt: 1200,
        status: 'done'
      }),
      0
    )
    expect(v.completed.find((l) => l.key === 'mentions')!.leaves![0].label).toContain('shortened')
  })

  it('keeps [n] meaning retrieval, and only retrieval', () => {
    // The whole reason for a separate lane (plan D3). A mention must never take
    // a citation number, or an inline [1] in the prose would point at something
    // the model was never told to number.
    const t = running({
      mentions: [mention('Referenced', true), mention('Also referenced', true)],
      retrievedAt: 1100,
      sources: [src(1, 'First retrieved'), src(2, 'Second retrieved')],
      repliedAt: 1200,
      status: 'done'
    })
    const v = getTraceView(t, 2)
    const mentionLeaves = v.completed.find((l) => l.key === 'mentions')!.leaves!
    const sourceLeaves = v.completed.find((l) => l.key === 'retrieve')!.leaves!
    // No mention leaf carries a citation number.
    expect(mentionLeaves.every((l) => l.n === undefined)).toBe(true)
    // Retrieval's numbering starts at 1 regardless of how many were mentioned.
    expect(sourceLeaves.map((l) => l.n)).toEqual([1, 2])
  })

  it('summarises only references that were genuinely read', () => {
    expect(
      traceSummary(
        running({ mentions: [mention('A', true), mention('B', false)], sources: [src(1, 'x')], status: 'done' })
      )
    ).toBe('1 mentioned · 1 source')
    // All failed: the collapsed line must not advertise a count of zero read.
    expect(
      traceSummary(running({ mentions: [mention('A', false)], sources: [], tools: [], status: 'done' }))
    ).toBe('No sources used')
  })

  it('is content worth drawing even when retrieval found nothing', () => {
    expect(
      hasTraceContent(running({ mentions: [mention('A', true)], sources: [], tools: [], status: 'done' }))
    ).toBe(true)
  })
})
