import { describe, it, expect } from 'vitest'
import type { FbNode } from '../../src/shared/types'
import {
  pulseCounts,
  overdueRadar,
  agendaItems,
  activityFeed,
  statusBreakdown,
  trendLines,
  startRecommendations
} from '../../src/renderer/src/lib/attentionAnalytics'

// DEC-048 — the command center's numbers. Every claim derivable from
// createdAt/updatedAt/state alone; nothing pretends to an event history.

const NOW = Date.parse('2026-08-26T12:00:00Z')
const DAY = 24 * 60 * 60 * 1000

let seq = 0
const wi = (over: Partial<FbNode>): FbNode =>
  ({
    id: `i${++seq}`,
    kind: 'work_item',
    title: over.id ?? `item ${seq}`,
    parentId: null,
    workItemState: 'open',
    intentClass: 'to_do',
    createdAt: NOW - DAY,
    updatedAt: NOW - DAY,
    dueAt: null,
    ...over
  }) as FbNode

describe('pulseCounts', () => {
  it('open / due today / overdue / closed7d, from attention state alone', () => {
    const items = [
      wi({}),
      wi({ dueAt: new Date(NOW + 60 * 60 * 1000).toISOString() }), // today
      wi({ dueAt: new Date(NOW - DAY).toISOString() }), // overdue
      wi({ workItemState: 'completed', updatedAt: NOW - 2 * DAY }),
      wi({ workItemState: 'dismissed', updatedAt: NOW - DAY }) // noise ≠ closed
    ]
    const p = pulseCounts(items, NOW)
    expect(p.open).toBe(3)
    expect(p.dueToday).toBe(1)
    expect(p.overdue).toBe(1)
    expect(p.closed7d).toBe(1)
    expect(p.closedByDay).toHaveLength(14)
    expect(p.closedByDay.reduce((a, b) => a + b, 0)).toBe(1)
  })
})

describe('overdueRadar / agendaItems', () => {
  it('buckets overdue vs due-soon, soonest first', () => {
    const a = wi({ dueAt: new Date(NOW - 2 * DAY).toISOString() })
    const b = wi({ dueAt: new Date(NOW - DAY).toISOString() })
    const c = wi({ dueAt: new Date(NOW + DAY).toISOString() })
    const r = overdueRadar([c, b, a], NOW)
    expect(r.overdue.map((i) => i.id)).toEqual([a.id, b.id])
    expect(r.dueSoon.map((i) => i.id)).toEqual([c.id])
  })

  it('the agenda is dated work through tomorrow plus active Meet items', () => {
    const meet = wi({ intentClass: 'to_meet' })
    const today = wi({ dueAt: new Date(NOW + 2 * 60 * 60 * 1000).toISOString() })
    const nextWeek = wi({ dueAt: new Date(NOW + 6 * DAY).toISOString() })
    const ids = agendaItems([nextWeek, meet, today], NOW).map((i) => i.id)
    expect(ids).toContain(meet.id)
    expect(ids).toContain(today.id)
    expect(ids).not.toContain(nextWeek.id)
    expect(ids[0]).toBe(today.id) // dated leads
  })
})

describe('statusBreakdown', () => {
  it('splits each class by not-started / in-progress / waiting / done, hides empty classes', () => {
    const items = [
      wi({}),
      wi({ workItemState: 'in_progress' }),
      wi({ workItemState: 'waiting' }),
      wi({ workItemState: 'completed', updatedAt: NOW - DAY }),
      wi({ intentClass: 'to_review', workItemState: 'open' })
    ]
    const rows = statusBreakdown(items, NOW)
    const todo = rows.find((r) => r.queue === 'to_do')!
    expect(todo).toMatchObject({ notStarted: 1, inProgress: 1, waiting: 1, done7d: 1, total: 4 })
    expect(rows.find((r) => r.queue === 'to_meet')).toBeUndefined()
    // Ordered by open load — to_do (3 active) before to_review (1).
    expect(rows[0].queue).toBe('to_do')
  })
})

describe('trendLines — only honestly derivable claims', () => {
  it('names a closing streak from terminal-day buckets', () => {
    const items = [
      wi({ workItemState: 'completed', updatedAt: NOW - 1 * DAY }),
      wi({ workItemState: 'completed', updatedAt: NOW - 2 * DAY }),
      wi({ workItemState: 'completed', updatedAt: NOW - 3 * DAY })
    ]
    expect(trendLines(items, NOW).join(' ')).toContain('days in a row')
  })

  it('names week-over-week arrival swings only past real thresholds', () => {
    const items = [
      ...Array.from({ length: 8 }, () => wi({ createdAt: NOW - 2 * DAY })),
      ...Array.from({ length: 4 }, () => wi({ createdAt: NOW - 9 * DAY }))
    ]
    expect(trendLines(items, NOW).join(' ')).toContain('up 100% this week')
  })

  it('stays silent rather than inventing when the data is thin', () => {
    expect(trendLines([wi({})], NOW).length).toBeLessThanOrEqual(1)
  })
})

describe('startRecommendations', () => {
  it('top-N by the SAME ranker the queues use, each with a reason', () => {
    const overdue = wi({ dueAt: new Date(NOW - DAY).toISOString() })
    const stale = wi({ updatedAt: NOW - 9 * DAY })
    const fresh = wi({})
    const recs = startRecommendations([fresh, stale, overdue], NOW, 2)
    expect(recs[0].item.id).toBe(overdue.id)
    expect(recs[0].reason).toBe('Past due')
    expect(recs[1].item.id).toBe(stale.id)
    expect(recs.every((r) => r.reason.length > 0)).toBe(true)
  })

  it('suggested (unapproved) items never lead the strip', () => {
    const sug = wi({ workItemState: 'suggested', dueAt: new Date(NOW - DAY).toISOString() })
    const plain = wi({})
    expect(startRecommendations([sug, plain], NOW, 2).map((r) => r.item.id)).toEqual([plain.id])
  })
})
