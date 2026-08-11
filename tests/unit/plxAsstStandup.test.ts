import { describe, it, expect } from 'vitest'
import { composeStandup } from '../../src/main/assistant/standup'
import type { WorkCompletedDigest } from '../../src/main/assistant/workCompleted'
import type { BriefTask } from '../../src/main/ai/dailyBriefContext'

// The standup composer weaves look-back (Work-Completed) + look-forward (brief) into
// one honest, deterministic narrative — the no-AI fallback and the ground truth the
// AI weave rephrases. Lock: never fabricates, degrades to "all caught up", and the
// prompt context carries both halves.

function wc(over: Partial<WorkCompletedDigest> = {}): WorkCompletedDigest {
  return {
    scope: { kind: 'all' },
    fromCursor: -1,
    toCursor: 10,
    completed: [],
    createdCount: 0,
    updatedCount: 0,
    deletedCount: 0,
    summaryLine: 'Nothing new since the last digest.',
    ...over
  }
}
const task = (title: string, over: Partial<BriefTask> = {}): BriefTask => ({
  id: title,
  title,
  status: 'open',
  priority: 3,
  importance: 3,
  dueDate: null,
  ...over
})

describe('composeStandup', () => {
  it('honestly reports "all caught up" when nothing done and nothing to do', () => {
    const s = composeStandup({ workCompleted: wc(), tasks: [], blocks: [], docs: [], nowMs: 1_000 })
    expect(s.hasContent).toBe(false)
    expect(s.narrative).toContain('all caught up')
  })

  it('weaves look-back completions with look-forward tasks', () => {
    const s = composeStandup({
      workCompleted: wc({
        completed: [{ eventId: 'e1', objectId: 't1', deskId: null, eventType: 'TaskCompleted', summary: null, at: '', rowid: 5 }],
        summaryLine: '1 task completed'
      }),
      completedTitles: { t1: 'Ship pricing page' },
      tasks: [task('Draft launch email', { importance: 5, dueDate: 2_000 }), task('Low prio', { importance: 1 })],
      blocks: [],
      docs: [],
      nowMs: 1_000
    })
    expect(s.hasContent).toBe(true)
    expect(s.narrative).toContain('Ship pricing page') // look-back with resolved title
    expect(s.narrative).toContain('Draft launch email') // look-forward, importance-ranked first
  })

  it('never invents a completed title it was not given (counts only)', () => {
    const s = composeStandup({
      workCompleted: wc({
        completed: [{ eventId: 'e1', objectId: 't1', deskId: null, eventType: 'TaskCompleted', summary: null, at: '', rowid: 5 }],
        summaryLine: '1 task completed'
      }),
      tasks: [],
      blocks: [],
      docs: [],
      nowMs: 1_000
    })
    expect(s.narrative).toContain('completed 1 task')
    expect(s.narrative).not.toContain('undefined')
  })

  it('prompt context carries both halves for the AI weave', () => {
    const s = composeStandup({
      workCompleted: wc({ summaryLine: '2 tasks completed' }),
      tasks: [task('Review PR')],
      blocks: [],
      docs: [],
      nowMs: 1_000
    })
    expect(s.promptContext).toContain('LOOK BACK')
    expect(s.promptContext).toContain('2 tasks completed')
    expect(s.promptContext).toContain('LOOK FORWARD')
    expect(s.promptContext).toContain('Review PR')
  })

  it('uses the subject label (personal vs team)', () => {
    const base = { workCompleted: wc({ completed: [{ eventId: 'e', objectId: 'x', deskId: null, eventType: 'TaskCompleted', summary: null, at: '', rowid: 1 }], summaryLine: '1 task completed' }), tasks: [], blocks: [], docs: [], nowMs: 1 }
    expect(composeStandup({ ...base, subject: 'you' }).narrative).toContain('you completed')
    expect(composeStandup({ ...base, subject: 'the team' }).narrative).toContain('the team completed')
  })
})
