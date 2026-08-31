import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FbNode, TimeBlock } from '../../src/shared/types'
import {
  DEFAULT_PLANNER_SETTINGS,
  freeSlots,
  planDay,
  relatedness,
  chainRelated,
  parsePlanDays,
  parseReschedule,
  movableToday,
  planSplit,
  type PlannerSettings
} from '../../src/renderer/src/lib/attentionPlanner'

// ── DEC-092 — the planner learns the calendar it is writing into ────────────
// Operator live QA: a replan crammed items zero minutes after existing
// blocks, interleaved unrelated work, and "reschedule the rest of my day for
// a split between tomorrow and wednesday" got "No open items match that."
// Now: padded slots (a bigger, adjustable buffer around actual meetings),
// affinity-scored placement + discretionary clustering, and a RESCHEDULE
// route that moves today's remaining blocks instead of searching topics.

const S: PlannerSettings = { ...DEFAULT_PLANNER_SETTINGS } // 9–17, gap 10, buffer 15
const MON = new Date(2026, 7, 31).getTime() // Monday, local midnight
const MIN = 60_000
const H = 60 * MIN

const wi = (id: string, over: Partial<FbNode> = {}): FbNode =>
  ({
    id,
    parentId: null,
    kind: 'work_item',
    title: id,
    description: '',
    status: 'open',
    sortOrder: 0,
    createdAt: MON,
    updatedAt: MON,
    workItemState: 'open',
    intentClass: 'to_do',
    groupId: null,
    ...over
  }) as FbNode

const blk = (
  id: string,
  startMs: number,
  durationMin: number,
  over: Partial<TimeBlock> = {}
): TimeBlock =>
  ({
    id,
    taskId: null,
    title: '',
    status: 'planned',
    origin: 'manual',
    locked: false,
    pushPolicy: 'local',
    createdAt: 0,
    updatedAt: 0,
    startMs,
    durationMin,
    ...over
  }) as TimeBlock

describe('DEC-092 — freeSlots: existing commitments get breathing room', () => {
  it('an ordinary planned block is padded by the gap on BOTH sides', () => {
    const slots = freeSlots([blk('b', MON + 11 * H, 60)], MON, S, MON)
    expect(slots[0].endMs).toBe(MON + 11 * H - 10 * MIN)
    expect(slots[1].startMs).toBe(MON + 12 * H + 10 * MIN)
  })
  it('a MEETING is padded by the meeting buffer (15 by default)', () => {
    const meeting = blk('m', MON + 11 * H, 60, { meeting: { roomId: 'r1', invitees: [] } as never })
    const slots = freeSlots([meeting], MON, S, MON)
    expect(slots[0].endMs).toBe(MON + 11 * H - 15 * MIN)
    expect(slots[1].startMs).toBe(MON + 12 * H + 15 * MIN)
  })
  it('buffer "off" never gives a meeting LESS room than a plain block', () => {
    const meeting = blk('m', MON + 11 * H, 60, { meeting: { roomId: 'r1', invitees: [] } as never })
    const slots = freeSlots([meeting], MON, { ...S, meetingBufferMin: 0 }, MON)
    expect(slots[0].endMs).toBe(MON + 11 * H - 10 * MIN)
  })
  it('done blocks are history — no padding around what already happened', () => {
    const slots = freeSlots([blk('d', MON + 11 * H, 60, { status: 'done' })], MON, S, MON)
    expect(slots[0].endMs).toBe(MON + 11 * H)
    expect(slots[1].startMs).toBe(MON + 12 * H)
  })
  it('slots carry WHO borders them (the linked item), for affinity', () => {
    const slots = freeSlots([blk('b', MON + 11 * H, 60, { taskId: 'it-1' })], MON, S, MON)
    expect(slots[0].afterItemId).toBe('it-1')
    expect(slots[1].beforeItemId).toBe('it-1')
  })
})

describe('DEC-092 — relatedness + chainRelated', () => {
  it('desk > tags/mentions > class', () => {
    const a = wi('a', { parentId: 'desk1', tags: 'x', intentClass: 'to_do' })
    expect(relatedness(a, wi('b', { parentId: 'desk1' }))).toBeGreaterThanOrEqual(3)
    expect(relatedness(a, wi('c', { tags: 'x,y' }))).toBeGreaterThanOrEqual(2)
    expect(relatedness(a, wi('d', { intentClass: 'to_do' }))).toBe(1)
    expect(relatedness(a, wi('e', { intentClass: 'to_review' }))).toBe(0)
  })
  it('clusters desk-mates; a due item is an immovable barrier', () => {
    const due = wi('due', { dueAt: new Date(MON + 12 * H).toISOString() })
    const pool = [
      wi('a1', { parentId: 'A' }),
      wi('b1', { parentId: 'B' }),
      due,
      wi('a2', { parentId: 'A' })
    ]
    const out = chainRelated(pool, new Set(['due']))
    // a2 may NOT cross the due barrier to join a1.
    expect(out.map((i) => i.id)).toEqual(['a1', 'b1', 'due', 'a2'])
    const noDue = chainRelated(
      [wi('a1', { parentId: 'A' }), wi('b1', { parentId: 'B' }), wi('a2', { parentId: 'A' })],
      new Set()
    )
    expect(noDue.map((i) => i.id)).toEqual(['a1', 'a2', 'b1'])
  })
})

describe('DEC-092 — placement prefers the company of related work', () => {
  it('an item lands beside the existing block from its own desk', () => {
    const items = [
      wi('anchor', { parentId: 'A' }),
      wi('mine', { parentId: 'A' }),
      wi('other', { parentId: 'B' })
    ]
    const anchorBlock = blk('ab', MON + 13 * H, 30, { taskId: 'anchor' })
    const out = planDay(items, [anchorBlock], S, MON, MON, {
      onlyItemIds: ['other', 'mine']
    })
    const mine = out.find((p) => p.itemId === 'mine')!
    const other = out.find((p) => p.itemId === 'other')!
    // "other" front-loads; "mine" crosses the day to sit beside its desk's
    // block (13:30 end + 10min gap = 13:40), and says so.
    expect(other.startMs).toBe(MON + 9 * H)
    expect(mine.startMs).toBe(MON + 13 * H + 40 * MIN)
    expect(mine.reason).toContain('Grouped beside')
  })
  it('with nothing related, the day still front-loads (earliness prior)', () => {
    const out = planDay([wi('x'), wi('y')], [], S, MON, MON, { onlyItemIds: ['x', 'y'] })
    expect(out[0].startMs).toBe(MON + 9 * H)
    expect(out[1].startMs).toBe(MON + 9 * H + 40 * MIN)
    expect(out[0].reason).not.toContain('Grouped beside')
  })
})

describe('DEC-092 — the reschedule route', () => {
  const NOW = MON + 13 * H // 1pm Monday
  it("the operator's verbatim prompt parses as a MOVE to two days", () => {
    const r = parseReschedule(
      'Taking an impromptu day off, reschedule the rest of my day today for a split between tomorrow and wednesday',
      NOW
    )
    expect(r).not.toBeNull()
    expect(r!.targetDays).toEqual([MON + 24 * H, MON + 48 * H]) // Tue, Wed
  })
  it('parsePlanDays returns every named day in text order', () => {
    expect(parsePlanDays('split between wednesday and tomorrow', NOW)).toEqual([
      MON + 48 * H,
      MON + 24 * H
    ])
  })
  it('no move verb, or no reference to today → not a reschedule', () => {
    expect(parseReschedule('plan the cetra work tomorrow', NOW)).toBeNull()
    expect(parseReschedule('move the needle on marketing', NOW)).toBeNull()
  })
  it('movableToday: future, planned, linked — never meetings or pins', () => {
    const list = [
      blk('gone', MON + 10 * H, 30, { taskId: 'i1' }), // already past
      blk('ok', MON + 14 * H, 30, { taskId: 'i2' }),
      blk('meet', MON + 15 * H, 30, { taskId: 'i3', meeting: { roomId: 'r' } as never }),
      blk('pin', MON + 16 * H, 30, { taskId: 'i4', locked: true }),
      blk('plain', MON + 16 * H + 30 * MIN, 20)
    ]
    expect(movableToday(list, NOW).map((b) => b.id)).toEqual(['ok'])
  })
  it('planSplit deals items across the named days', () => {
    const items = [wi('i1'), wi('i2'), wi('i3'), wi('i4')]
    const out = planSplit(items, [], S, [MON + 24 * H, MON + 48 * H], NOW, ['i1', 'i2', 'i3', 'i4'])
    const dayOf = (ms: number): number => Math.floor((ms - MON) / (24 * H))
    expect(new Set(out.map((p) => dayOf(p.startMs)))).toEqual(new Set([1, 2]))
    expect(out).toHaveLength(4)
  })
})

const SRC = join(__dirname, '../..', 'src')
const read = (p: string): string => readFileSync(join(SRC, p), 'utf-8')

describe('DEC-092 — wiring pins', () => {
  const cal = read('renderer/src/components/views/CalendarView.tsx')
  it('the reschedule branch runs BEFORE topic selection', () => {
    expect(cal).toContain('parseReschedule(askText, nowMs)')
    expect(cal.indexOf('parseReschedule(askText')).toBeLessThan(cal.indexOf('intentNamesTopic(askText)'))
  })
  it('the moved items are NOT excluded as already-scheduled (the empty-reschedule trap)', () => {
    expect(cal).toContain('out = planSplit(items, blocks, planSettings, resched.targetDays, nowMs, ids, {\n          deskTitles\n        })')
  })
  it('accept REPLACES: source blocks leave in the same undo batch; dropped rows keep theirs', () => {
    expect(cal).toContain('if (accepted.has(mv.itemId)) await rm(mv.blockId)')
    expect(cal).toContain('Moved ${take.length} blocks')
  })
  it('the meeting buffer is adjustable and its effect is said out loud', () => {
    expect(cal).toContain('data-testid="meeting-buffer-select"')
    expect(cal).toContain('min clear around your meetings.')
  })
  it('the ii mark centres on the first line of the intent bar', () => {
    expect(cal).toContain('shrink-0 mt-[6px] text-[rgb(var(--accent))]')
  })
})
