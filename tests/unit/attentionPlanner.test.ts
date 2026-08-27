import { describe, it, expect } from 'vitest'
import type { FbNode, TimeBlock } from '../../src/shared/types'
import {
  DEFAULT_PLANNER_SETTINGS,
  MISSED_GRACE_MS,
  freeSlots,
  momentumByDesk,
  planDay,
  schedulableItems,
  sweepMissed,
  type PlannerSettings
} from '../../src/renderer/src/lib/attentionPlanner'

// DEC-052 Track B — the planner's rules, each one a ruling or a researched
// convention, pinned as behaviour.

const DAY0 = new Date(2026, 7, 27).getTime() // local midnight
const MIN = 60_000
const H = 60 * MIN

const S: PlannerSettings = { ...DEFAULT_PLANNER_SETTINGS }

const wi = (over: Partial<FbNode> & { id: string }): FbNode =>
  ({
    parentId: null,
    kind: 'work_item',
    title: over.id,
    description: '',
    status: 'open',
    sortOrder: 0,
    createdAt: DAY0,
    updatedAt: DAY0,
    workItemState: 'open',
    intentClass: 'to_do',
    groupId: null,
    ...over
  }) as FbNode

const blk = (over: Partial<TimeBlock> & { id: string; startMs: number; durationMin: number }): TimeBlock =>
  ({
    taskId: null,
    title: '',
    status: 'planned',
    origin: 'manual',
    locked: false,
    pushPolicy: 'local',
    createdAt: 0,
    updatedAt: 0,
    ...over
  }) as TimeBlock

describe('freeSlots', () => {
  it('an empty day is one slot spanning the working window', () => {
    const slots = freeSlots([], DAY0, S, DAY0) // "now" before the window
    expect(slots).toEqual([{ startMs: DAY0 + 9 * H, endMs: DAY0 + 17 * H }])
  })

  it('existing blocks split the window; the clock floors the first slot', () => {
    const blocks = [blk({ id: 'b1', startMs: DAY0 + 11 * H, durationMin: 60 })]
    const slots = freeSlots(blocks, DAY0, S, DAY0 + 10 * H) // it is 10:00
    expect(slots).toEqual([
      { startMs: DAY0 + 10 * H, endMs: DAY0 + 11 * H },
      { startMs: DAY0 + 12 * H, endMs: DAY0 + 17 * H }
    ])
  })

  it('missed/skipped blocks do NOT occupy — their time is reusable history', () => {
    const blocks = [
      blk({ id: 'b1', startMs: DAY0 + 9 * H, durationMin: 480, status: 'missed' }),
      blk({ id: 'b2', startMs: DAY0 + 13 * H, durationMin: 60, status: 'done' })
    ]
    const slots = freeSlots(blocks, DAY0, S, DAY0)
    // Only the DONE block occupies.
    expect(slots).toEqual([
      { startMs: DAY0 + 9 * H, endMs: DAY0 + 13 * H },
      { startMs: DAY0 + 14 * H, endMs: DAY0 + 17 * H }
    ])
  })

  it('slivers under 15 minutes are not offered', () => {
    const blocks = [blk({ id: 'b1', startMs: DAY0 + 9 * H + 10 * MIN, durationMin: 7 * 60 + 40 })]
    const slots = freeSlots(blocks, DAY0, S, DAY0)
    // 9:00–9:10 is a sliver; 16:50–17:00 is a sliver — neither offered.
    expect(slots).toEqual([])
  })
})

describe('schedulableItems — the honesty filter (DEC-052 #8, flow state)', () => {
  it('waiting/blocked/suggested are NEVER schedulable; snoozed and closed are out', () => {
    const now = DAY0 + 10 * H
    const items = [
      wi({ id: 'ok' }),
      wi({ id: 'w', workItemState: 'waiting' }),
      wi({ id: 'b', workItemState: 'blocked' }),
      wi({ id: 'sug', workItemState: 'suggested' }),
      wi({ id: 'done', workItemState: 'completed' }),
      wi({ id: 'snoozed', snoozeUntil: now + H }),
      wi({ id: 'inprog', workItemState: 'in_progress' })
    ]
    expect(schedulableItems(items, now).map((i) => i.id).sort()).toEqual(['inprog', 'ok'])
  })
})

describe('planDay', () => {
  it('packs ranked items into the day with gaps, and stops at the ceiling', () => {
    const now = DAY0 + 9 * H
    const items = [wi({ id: 'a' }), wi({ id: 'b' }), wi({ id: 'c' })]
    const small: PlannerSettings = { ...S, maxDailyPlannedMin: 70, defaultBlockMin: 30, gapMin: 10 }
    const out = planDay(items, [], small, DAY0, now)
    // 30 + 30 fills 60; the 10 remaining is under a useful sitting → 2 blocks.
    expect(out.length).toBe(2)
    expect(out[0].startMs).toBe(DAY0 + 9 * H)
    expect(out[1].startMs).toBe(DAY0 + 9 * H + 40 * MIN) // 30 block + 10 gap
  })

  it('existing commitments COUNT toward the ceiling', () => {
    const now = DAY0 + 9 * H
    const blocks = [blk({ id: 'b1', startMs: DAY0 + 13 * H, durationMin: 300 })]
    const small: PlannerSettings = { ...S, maxDailyPlannedMin: 320 }
    const out = planDay([wi({ id: 'a' }), wi({ id: 'b' })], blocks, small, DAY0, now)
    // 300 committed of a 320 ceiling → room for ONE 20-minute sitting.
    expect(out.length).toBe(1)
    expect(out[0].durationMin).toBe(20)
  })

  it('overdue/due-today outrank, and the reason says so', () => {
    const now = DAY0 + 9 * H
    const items = [
      wi({ id: 'plain' }),
      wi({ id: 'due', dueAt: new Date(now + 2 * H).toISOString() })
    ]
    const out = planDay(items, [], S, DAY0, now)
    expect(out[0].itemId).toBe('due')
    expect(out[0].reason).toBe('Due today')
  })

  it('momentum boosts a desk you have been closing on, with the desk named', () => {
    const now = DAY0 + 9 * H
    const items = [
      wi({ id: 'other' }),
      wi({ id: 'streaky', parentId: 'desk1' }),
      // Two recent closures on desk1 = the streak.
      wi({ id: 'c1', parentId: 'desk1', workItemState: 'completed', updatedAt: now - H }),
      wi({ id: 'c2', parentId: 'desk1', workItemState: 'completed', updatedAt: now - 2 * H })
    ]
    const out = planDay(items, [], S, DAY0, now, {
      deskTitles: new Map([['desk1', 'CETRA']])
    })
    expect(out[0].itemId).toBe('streaky')
    expect(out[0].reason).toContain('CETRA')
  })

  it('dismissed/archived closures build NO momentum', () => {
    const now = DAY0 + 9 * H
    const items = [
      wi({ id: 'd1', parentId: 'desk1', workItemState: 'dismissed', updatedAt: now - H }),
      wi({ id: 'd2', parentId: 'desk1', workItemState: 'archived', updatedAt: now - H })
    ]
    expect(momentumByDesk(items, now).size).toBe(0)
  })

  it('the intent mode restricts AND orders by the given ids', () => {
    const now = DAY0 + 9 * H
    const items = [wi({ id: 'a' }), wi({ id: 'b' }), wi({ id: 'c' })]
    const out = planDay(items, [], S, DAY0, now, { onlyItemIds: ['c', 'a'] })
    expect(out.map((p) => p.itemId)).toEqual(['c', 'a'])
  })

  it('items already placed by hand are skipped', () => {
    const now = DAY0 + 9 * H
    const out = planDay([wi({ id: 'a' }), wi({ id: 'b' })], [], S, DAY0, now, {
      placedIds: new Set(['a'])
    })
    expect(out.map((p) => p.itemId)).toEqual(['b'])
  })

  it('a full day proposes nothing rather than overbooking', () => {
    const now = DAY0 + 9 * H
    const blocks = [blk({ id: 'b1', startMs: DAY0 + 9 * H, durationMin: 8 * 60 })]
    expect(planDay([wi({ id: 'a' })], blocks, S, DAY0, now)).toEqual([])
  })
})

describe('sweepMissed — replan never moves anything', () => {
  it('only PAST planned blocks past the one-hour grace are swept', () => {
    const now = DAY0 + 12 * H
    const blocks = [
      // Ended 11:00 — inside grace at 12:00? 11:00 + 1h grace = 12:00, not < now. Kept.
      blk({ id: 'grace', startMs: DAY0 + 10 * H, durationMin: 60 }),
      // Ended 9:00 — well past grace. Swept.
      blk({ id: 'missed', startMs: DAY0 + 8 * H, durationMin: 60 }),
      // Done blocks are history, never swept.
      blk({ id: 'done', startMs: DAY0 + 7 * H, durationMin: 60, status: 'done' }),
      // Future block untouched.
      blk({ id: 'future', startMs: DAY0 + 14 * H, durationMin: 60 })
    ]
    expect(sweepMissed(blocks, now).map((b) => b.id)).toEqual(['missed'])
  })

  it('the grace constant is one hour (the 5:04 rule)', () => {
    expect(MISSED_GRACE_MS).toBe(60 * 60 * 1000)
  })
})
