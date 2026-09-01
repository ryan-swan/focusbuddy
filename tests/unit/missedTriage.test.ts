import { describe, it, expect } from 'vitest'
import type { TimeBlock } from '../../src/shared/types'
import { DEFAULT_PLANNER_SETTINGS } from '../../src/renderer/src/lib/attentionPlanner'
import {
  untriagedMissed,
  firstSlotOnDay,
  planReplacements,
  dayStartOf,
  MISSED_LOOKBACK_DAYS
} from '../../src/renderer/src/lib/missedTriage'

// DEC-075 — the missed-items queue. "Untriaged" is derivable, never stored:
// a still-'planned' block wholly before today was never touched. Every triage
// action moves it off 'planned', so nothing can re-prompt after handling.

const DAY = 86_400_000
const H = 3_600_000
const TODAY = new Date(2026, 7, 30).getTime() // local midnight
const S = { ...DEFAULT_PLANNER_SETTINGS }

const blk = (over: Partial<TimeBlock> & { id: string; startMs: number }): TimeBlock =>
  ({
    taskId: null,
    title: '',
    durationMin: 30,
    status: 'planned',
    origin: 'manual',
    locked: false,
    pushPolicy: 'local',
    createdAt: 0,
    updatedAt: 0,
    ...over
  }) as TimeBlock

describe('untriagedMissed', () => {
  it('only still-planned blocks wholly before today qualify', () => {
    const rows = [
      blk({ id: 'missed', startMs: TODAY - DAY + 10 * H }),
      blk({ id: 'done', startMs: TODAY - DAY + 11 * H, status: 'done' }),
      blk({ id: 'already-missed', startMs: TODAY - DAY + 12 * H, status: 'missed' }),
      blk({ id: 'skipped', startMs: TODAY - DAY + 13 * H, status: 'skipped' }),
      blk({ id: 'today', startMs: TODAY + 9 * H })
    ]
    expect(untriagedMissed(rows, TODAY).map((b) => b.id)).toEqual(['missed'])
  })

  it('a block straddling midnight is NOT missed — its day is not over', () => {
    const straddler = blk({ id: 's', startMs: TODAY - H, durationMin: 120 })
    expect(untriagedMissed([straddler], TODAY)).toEqual([])
  })

  it('the lookback bounds the first-run backlog', () => {
    const ancient = blk({ id: 'old', startMs: TODAY - (MISSED_LOOKBACK_DAYS + 2) * DAY + 10 * H })
    const recent = blk({ id: 'new', startMs: TODAY - 2 * DAY + 10 * H })
    expect(untriagedMissed([ancient, recent], TODAY).map((b) => b.id)).toEqual(['new'])
  })

  it('oldest first — triage reads chronologically', () => {
    const rows = [
      blk({ id: 'b', startMs: TODAY - DAY + 14 * H }),
      blk({ id: 'a', startMs: TODAY - 2 * DAY + 9 * H })
    ]
    expect(untriagedMissed(rows, TODAY).map((b) => b.id)).toEqual(['a', 'b'])
  })
})

describe('firstSlotOnDay', () => {
  it('an empty day opens at the working-window start', () => {
    const p = firstSlotOnDay([], [], TODAY, 30, S, TODAY)
    expect(p).toEqual({ startMs: TODAY + 9 * H, durationMin: 30 })
  })

  it('placements already made in this pass occupy their slot', () => {
    const first = firstSlotOnDay([], [], TODAY, 30, S, TODAY)!
    const second = firstSlotOnDay([], [first], TODAY, 30, S, TODAY)!
    expect(second.startMs).toBeGreaterThanOrEqual(first.startMs + 30 * 60_000)
  })

  it('a genuinely full day returns null — the caller owns the fallback', () => {
    const wall = blk({ id: 'wall', startMs: TODAY + 9 * H, durationMin: 8 * 60 })
    expect(firstSlotOnDay([wall], [], TODAY, 30, S, TODAY)).toBeNull()
  })
})

describe('planReplacements', () => {
  it('places sequentially and spills to the next day when today fills', () => {
    const wall = blk({ id: 'wall', startMs: TODAY + 9 * H, durationMin: 7 * 60 + 30 })
    const missed = [
      blk({ id: 'm1', startMs: TODAY - DAY + 9 * H }),
      blk({ id: 'm2', startMs: TODAY - DAY + 10 * H })
    ]
    const out = planReplacements([wall], missed, S, TODAY, TODAY)
    // DEC-092: the wall is padded by the 10-min gap, so today's tail slot is
    // 16:40–17:00; m1 takes it and m2 spills to tomorrow 9:00. (Original pin
    // had m1 at 16:30, flush against the wall.)
    expect(out.get('m1')!.startMs).toBe(TODAY + 16 * H + 40 * 60_000)
    expect(out.get('m2')!.startMs).toBe(TODAY + DAY + 9 * H)
  })

  it('nowhere in the window → original clock time today, visibly, never dropped', () => {
    const walls = Array.from({ length: 8 }, (_, d) =>
      blk({ id: `w${d}`, startMs: TODAY + d * DAY + 9 * H, durationMin: 8 * 60 })
    )
    const missed = [blk({ id: 'm', startMs: TODAY - DAY + 14 * H, durationMin: 45 })]
    const out = planReplacements(walls, missed, S, TODAY, TODAY)
    expect(out.get('m')).toEqual({ startMs: TODAY + 14 * H, durationMin: 45 })
  })

  it('every missed block gets a placement', () => {
    const missed = Array.from({ length: 5 }, (_, k) =>
      blk({ id: `m${k}`, startMs: TODAY - DAY + (9 + k) * H })
    )
    const out = planReplacements([], missed, S, TODAY, TODAY)
    expect(out.size).toBe(5)
  })
})

describe('dayStartOf', () => {
  it('local midnight of the moment', () => {
    expect(dayStartOf(TODAY + 15 * H)).toBe(TODAY)
  })
})
