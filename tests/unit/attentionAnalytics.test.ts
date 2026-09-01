import { describe, it, expect } from 'vitest'
import type { FbNode } from '../../src/shared/types'
import {
  pulseCounts,
  overdueRadar,
  agendaItems,
  activityFeed,
  statusBreakdown,
  trendLines,
  startRecommendations,
  kpiMetrics,
  KPI_FILTERS,
  dayTimeline,
  type KpiKey
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

  it('the fallback is honest per card: only #1 claims the top (DEC-072)', () => {
    const a = wi({ updatedAt: NOW - 2 * 60 * 60 * 1000 })
    const b = wi({ updatedAt: NOW - 60 * 60 * 1000 })
    const recs = startRecommendations([a, b], NOW, 2)
    expect(recs[0].reason).toBe('Top of your queue')
    expect(recs[1].reason).toBe('Next in your queue')
  })

  it('a card that has waited states its days instead of a superlative (DEC-072)', () => {
    const waited = wi({ updatedAt: NOW - 9 * DAY })
    const recs = startRecommendations([waited], NOW, 1)
    expect(recs[0].reason).toBe('Waiting 9 days')
  })

  it('suggested (unapproved) items never lead the strip', () => {
    const sug = wi({ workItemState: 'suggested', dueAt: new Date(NOW - DAY).toISOString() })
    const plain = wi({})
    expect(startRecommendations([sug, plain], NOW, 2).map((r) => r.item.id)).toEqual([plain.id])
  })
})

describe('DEC-049 — the KPI band', () => {
  it('every tile COUNTS by the same predicate its click FILTERS by', () => {
    // The honesty property: press "Overdue 3" and you get exactly those 3.
    const items = [
      wi({ dueAt: new Date(NOW - DAY).toISOString() }), // overdue
      wi({ dueAt: new Date(NOW + 2 * 60 * 60 * 1000).toISOString() }), // due today
      wi({ workItemState: 'in_progress' }),
      wi({ workItemState: 'waiting' }),
      wi({ workItemState: 'completed', updatedAt: NOW - DAY }),
      wi({})
    ]
    for (const m of kpiMetrics(items, NOW)) {
      const rows = items.filter((i) => KPI_FILTERS[m.key](i, NOW))
      expect(rows.length, m.key).toBe(m.value)
    }
  })

  it('reports the six command-center metrics with honest values', () => {
    const items = [
      wi({ dueAt: new Date(NOW - DAY).toISOString() }),
      wi({ dueAt: new Date(NOW + 60_000).toISOString() }),
      wi({ workItemState: 'delegated' }),
      wi({ workItemState: 'blocked' }),
      wi({ workItemState: 'completed', updatedAt: NOW - 2 * DAY })
    ]
    const by = Object.fromEntries(kpiMetrics(items, NOW).map((m) => [m.key, m.value])) as Record<
      KpiKey,
      number
    >
    expect(by.open).toBe(4) // the completed one is not open
    expect(by.overdue).toBe(1)
    expect(by.due_today).toBe(1)
    expect(by.in_progress).toBe(1) // delegated projects as in progress
    expect(by.waiting).toBe(1) // blocked counts as waiting
    expect(by.closed_7d).toBe(1)
  })

  it('an overdue item is NOT also counted as due today', () => {
    const od = wi({ dueAt: new Date(NOW - 3 * 60 * 60 * 1000).toISOString() })
    expect(KPI_FILTERS.overdue(od, NOW)).toBe(true)
    expect(KPI_FILTERS.due_today(od, NOW)).toBe(false)
  })

  it('dismissed and archived items never count as closed work', () => {
    const dropped = wi({ workItemState: 'dismissed', updatedAt: NOW - DAY })
    const shelved = wi({ workItemState: 'archived', updatedAt: NOW - DAY })
    expect(KPI_FILTERS.closed_7d(dropped, NOW)).toBe(false)
    expect(KPI_FILTERS.closed_7d(shelved, NOW)).toBe(false)
    // …nor as open (they are closed out of the queues).
    expect(KPI_FILTERS.open(dropped, NOW)).toBe(false)
  })

  it('a hint only appears when the comparison is real', () => {
    const thin = kpiMetrics([wi({})], NOW).find((m) => m.key === 'closed_7d')!
    expect(thin.hint).toBeUndefined() // no prior week to compare against
  })
})

describe('DEC-049 — dayTimeline (today\'s calendar + dated work)', () => {
  // dayTimeline windows on the LOCAL day (setHours(0,0,0,0)…(23,59,59,999)), so
  // this block needs a reference "now" that sits mid-local-day. The file-wide NOW
  // is 12:00 UTC, which is 21:30 at UTC+9:30 — there NOW + 4h falls into tomorrow,
  // the late block is correctly filtered out, and the merge test below failed for
  // anyone east of about UTC+8 while staying green on CI's UTC runners. Anchoring
  // to local noon makes the block timezone-independent without weakening it.
  const REF_DAY = new Date(NOW)
  const NOON = new Date(REF_DAY.getFullYear(), REF_DAY.getMonth(), REF_DAY.getDate(), 12, 0, 0, 0).getTime()

  const block = (over: Partial<{ id: string; title: string; startMs: number; durationMin: number; meeting: unknown }>) => ({
    id: 'b1',
    title: 'Block',
    startMs: NOON,
    durationMin: 30,
    ...over
  })

  it('merges calendar blocks with dated items in time order', () => {
    const early = block({ id: 'b-early', title: 'Standup', startMs: NOON - 3 * 60 * 60 * 1000 })
    const late = block({ id: 'b-late', title: 'Review', startMs: NOON + 4 * 60 * 60 * 1000 })
    const due = wi({ dueAt: new Date(NOON + 60 * 60 * 1000).toISOString() })
    const t = dayTimeline([due], [late, early], NOON)
    expect(t.map((e) => (e.kind === 'event' ? e.title : 'ITEM'))).toEqual([
      'Standup',
      'ITEM',
      'Review'
    ])
  })

  it('ignores blocks outside today and sorts undated work last', () => {
    const tomorrow = block({ id: 'b-tom', startMs: NOON + 2 * DAY })
    const meetItem = wi({ intentClass: 'to_meet' }) // undated, still agenda-worthy
    const dated = wi({ dueAt: new Date(NOON + 60_000).toISOString() })
    const t = dayTimeline([meetItem, dated], [tomorrow], NOON)
    expect(t.some((e) => e.kind === 'event')).toBe(false)
    expect(t[t.length - 1].id).toBe(meetItem.id)
  })

  it('marks meeting blocks so the row can offer to join', () => {
    const t = dayTimeline([], [block({ meeting: { roomId: 'r1' } })], NOON)
    expect(t[0].kind === 'event' && t[0].isMeeting).toBe(true)
  })
})
