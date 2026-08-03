import { describe, it, expect } from 'vitest'
import { buildBriefContext, briefIsEmpty, buildBriefActions } from '../../src/main/ai/dailyBriefContext'

const NOW = 1_780_000_000_000

describe('briefIsEmpty', () => {
  it('is empty only when there are no tasks, blocks or docs', () => {
    expect(briefIsEmpty([], [], [])).toBe(true)
    expect(briefIsEmpty([{ title: 'x', status: 'open', priority: 3, importance: 3, dueDate: null }], [], [])).toBe(false)
    expect(briefIsEmpty([], [{ title: 'm', startMs: NOW, durationMin: 30 }], [])).toBe(false)
    expect(briefIsEmpty([], [], [{ title: 'd', docType: 'doc' }])).toBe(false)
  })
})

describe('buildBriefContext', () => {
  it('includes the current time and each populated section', () => {
    const ctx = buildBriefContext(
      [
        { title: 'Ship launch', status: 'in_progress', priority: 1, importance: 5, dueDate: NOW + 86_400_000 },
        { title: 'Reply to Sam', status: 'open', priority: 3, importance: 2, dueDate: null }
      ],
      [{ title: 'Standup', startMs: NOW + 3_600_000, durationMin: 30 }],
      [{ title: 'Q3 Revenue', docType: 'sheet' }],
      NOW
    )
    expect(ctx).toContain('Current date and time')
    expect(ctx).toContain('Open and in-progress tasks')
    expect(ctx).toContain('Ship launch')
    expect(ctx).toContain('in progress')
    expect(ctx).toContain('due')
    expect(ctx).toContain('Scheduled time blocks')
    expect(ctx).toContain('Standup')
    expect(ctx).toContain('Recently worked-on documents')
    expect(ctx).toContain('Q3 Revenue (sheet)')
  })

  it('ranks tasks by importance then priority', () => {
    const ctx = buildBriefContext(
      [
        { title: 'Low', status: 'open', priority: 5, importance: 1, dueDate: null },
        { title: 'High', status: 'open', priority: 1, importance: 5, dueDate: null }
      ],
      [], [], NOW
    )
    expect(ctx.indexOf('High')).toBeLessThan(ctx.indexOf('Low'))
  })

  it('omits sections that have no data (no fabricated headings)', () => {
    const ctx = buildBriefContext([{ title: 'Only task', status: 'open', priority: 3, importance: 3, dueDate: null }], [], [], NOW)
    expect(ctx).toContain('Open and in-progress tasks')
    expect(ctx).not.toContain('Scheduled time blocks')
    expect(ctx).not.toContain('Recently worked-on documents')
  })

  it('caps long lists (12 tasks max)', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ title: `T${i}`, status: 'open', priority: 3, importance: 3, dueDate: null }))
    const ctx = buildBriefContext(many, [], [], NOW)
    expect((ctx.match(/^- \[/gm) ?? []).length).toBe(12)
  })
})

describe('buildBriefActions', () => {
  const tasks = [
    { id: 't1', title: 'Ship launch', status: 'in_progress', priority: 1, importance: 5, dueDate: null },
    { id: 't2', title: 'Reply to Sam', status: 'open', priority: 3, importance: 2, dueDate: null },
    { id: 't3', title: 'Low thing', status: 'open', priority: 5, importance: 1, dueDate: null }
  ]

  it('proposes blocks for the most important unscheduled tasks, most important first', () => {
    const actions = buildBriefActions(tasks, new Set(), NOW)
    expect(actions.length).toBe(3)
    expect(actions[0].taskId).toBe('t1')
    expect(actions.every((a) => a.startMs > NOW)).toBe(true)
    expect(actions.every((a) => a.durationMin > 0)).toBe(true)
  })

  it('skips tasks already on the calendar', () => {
    const actions = buildBriefActions(tasks, new Set(['t1']), NOW)
    expect(actions.some((a) => a.taskId === 't1')).toBe(false)
  })

  it('skips done tasks and tasks with no id', () => {
    const actions = buildBriefActions(
      [{ id: 't1', title: 'done', status: 'done', priority: 1, importance: 5, dueDate: null }, { title: 'no id', status: 'open', priority: 1, importance: 5, dueDate: null }],
      new Set(),
      NOW
    )
    expect(actions).toEqual([])
  })

  it('caps the number of suggestions', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ id: `x${i}`, title: `X${i}`, status: 'open', priority: 3, importance: 3, dueDate: null }))
    expect(buildBriefActions(many, new Set(), NOW).length).toBe(3)
  })
})
