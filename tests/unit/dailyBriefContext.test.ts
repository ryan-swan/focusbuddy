import { describe, it, expect } from 'vitest'
import { buildBriefContext, briefIsEmpty } from '../../src/main/ai/dailyBriefContext'

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
