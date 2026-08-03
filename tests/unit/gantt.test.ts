import { describe, it, expect } from 'vitest'
import {
  computeSchedule,
  topoSort,
  detectDrift,
  rescheduleOnDrift,
  DAY_MS,
  type GanttInput
} from '../../src/shared/gantt'

const ANCHOR = 1_700_000_000_000 // fixed anchor; no Date.now in shared code

function t(id: string, durationDays: number, deps: string[] = [], isMilestone = false): GanttInput {
  return { id, durationDays, deps, isMilestone }
}

describe('topoSort', () => {
  it('orders predecessors before successors', () => {
    const { order, hasCycle } = topoSort([t('c', 1, ['b']), t('a', 1), t('b', 1, ['a'])])
    expect(hasCycle).toBe(false)
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'))
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('c'))
  })
  it('detects a cycle and still returns every node', () => {
    const { order, hasCycle } = topoSort([t('a', 1, ['b']), t('b', 1, ['a'])])
    expect(hasCycle).toBe(true)
    expect(order.sort()).toEqual(['a', 'b'])
  })
  it('ignores self-dependencies and unknown predecessor ids', () => {
    const { order, hasCycle } = topoSort([t('a', 1, ['a', 'ghost']), t('b', 1, ['a'])])
    expect(hasCycle).toBe(false)
    expect(order).toEqual(['a', 'b'])
  })
})

describe('computeSchedule forward pass', () => {
  it('schedules a linear chain end to end', () => {
    const r = computeSchedule([t('a', 2), t('b', 3, ['a']), t('c', 1, ['b'])], ANCHOR)
    const byId = new Map(r.tasks.map((x) => [x.id, x]))
    expect(byId.get('a')!.earliestStart).toBe(0)
    expect(byId.get('a')!.earliestFinish).toBe(2)
    expect(byId.get('b')!.earliestStart).toBe(2)
    expect(byId.get('b')!.earliestFinish).toBe(5)
    expect(byId.get('c')!.earliestStart).toBe(5)
    expect(byId.get('c')!.earliestFinish).toBe(6)
    expect(r.projectDurationDays).toBe(6)
  })

  it('starts a task after the latest of several predecessors', () => {
    // a(2) and b(5) both precede c; c can only start at day 5.
    const r = computeSchedule([t('a', 2), t('b', 5), t('c', 1, ['a', 'b'])], ANCHOR)
    const c = r.tasks.find((x) => x.id === 'c')!
    expect(c.earliestStart).toBe(5)
    expect(c.earliestFinish).toBe(6)
  })

  it('maps day offsets to absolute timestamps from the anchor', () => {
    const r = computeSchedule([t('a', 2), t('b', 3, ['a'])], ANCHOR)
    const b = r.tasks.find((x) => x.id === 'b')!
    expect(b.startMs).toBe(ANCHOR + 2 * DAY_MS)
    expect(b.endMs).toBe(ANCHOR + 5 * DAY_MS)
  })

  it('honours an explicit minimum start but lets a dependency push past it', () => {
    // b wants to start no earlier than day 4, but a only finishes at day 2, so
    // b honours its floor and starts at 4. c depends on b and is pushed to 7.
    const r = computeSchedule(
      [t('a', 2), { id: 'b', durationDays: 3, deps: ['a'], minStartDay: 4 }, t('c', 1, ['b'])],
      ANCHOR
    )
    const byId = new Map(r.tasks.map((x) => [x.id, x]))
    expect(byId.get('b')!.earliestStart).toBe(4)
    expect(byId.get('b')!.earliestFinish).toBe(7)
    expect(byId.get('c')!.earliestStart).toBe(7)
  })

  it('lets a late dependency override a too-early minimum start', () => {
    // d insists on day 1 but its predecessor finishes at day 5, so it starts at 5.
    const r = computeSchedule(
      [t('p', 5), { id: 'd', durationDays: 1, deps: ['p'], minStartDay: 1 }],
      ANCHOR
    )
    expect(r.tasks.find((x) => x.id === 'd')!.earliestStart).toBe(5)
  })

  it('treats a milestone as zero duration', () => {
    const r = computeSchedule([t('a', 3), t('m', 99, ['a'], true)], ANCHOR)
    const m = r.tasks.find((x) => x.id === 'm')!
    expect(m.durationDays).toBe(0)
    expect(m.earliestStart).toBe(3)
    expect(m.earliestFinish).toBe(3)
  })
})

describe('computeSchedule critical path', () => {
  it('identifies the critical path and gives the off-path task slack', () => {
    // Chain a(2)->b(5)->d(1) is length 8; the parallel c(3) feeding d has slack.
    const r = computeSchedule(
      [t('a', 2), t('b', 5, ['a']), t('c', 3, ['a']), t('d', 1, ['b', 'c'])],
      ANCHOR
    )
    const byId = new Map(r.tasks.map((x) => [x.id, x]))
    expect(byId.get('a')!.critical).toBe(true)
    expect(byId.get('b')!.critical).toBe(true)
    expect(byId.get('d')!.critical).toBe(true)
    // c: earliest start 2, earliest finish 5, but b finishes at 7, so c has 2 slack.
    expect(byId.get('c')!.critical).toBe(false)
    expect(byId.get('c')!.slackDays).toBe(2)
    expect(r.criticalPath).toEqual(['a', 'b', 'd'])
    expect(r.projectDurationDays).toBe(8)
  })

  it('marks a single chain entirely critical', () => {
    const r = computeSchedule([t('a', 1), t('b', 1, ['a'])], ANCHOR)
    expect(r.criticalPath).toEqual(['a', 'b'])
    expect(r.tasks.every((x) => x.critical)).toBe(true)
  })
})

describe('computeSchedule cycles', () => {
  it('flags a cycle but still returns a schedule', () => {
    const r = computeSchedule([t('a', 1, ['b']), t('b', 1, ['a'])], ANCHOR)
    expect(r.hasCycle).toBe(true)
    expect(r.tasks).toHaveLength(2)
  })
})

describe('detectDrift', () => {
  it('reports a slip that exceeds slack as pushing successors', () => {
    const sched = computeSchedule([t('a', 2), t('b', 3, ['a'])], ANCHOR)
    // a was critical (zero slack); it finished at day 4 instead of 2 -> pushes b.
    const drift = detectDrift(sched, new Map([['a', 4]]))
    expect(drift).toHaveLength(1)
    expect(drift[0]).toMatchObject({ id: 'a', slipDays: 2, pushesSuccessors: true })
  })

  it('a slip within slack does not push successors', () => {
    // c has 2 days of slack; finishing 1 day late is absorbed.
    const sched = computeSchedule(
      [t('a', 2), t('b', 5, ['a']), t('c', 3, ['a']), t('d', 1, ['b', 'c'])],
      ANCHOR
    )
    const drift = detectDrift(sched, new Map([['c', 6]])) // c EF was 5, actual 6, slack 2
    expect(drift[0]).toMatchObject({ id: 'c', slipDays: 1, pushesSuccessors: false })
  })

  it('reports nothing when everything finished on time', () => {
    const sched = computeSchedule([t('a', 2), t('b', 3, ['a'])], ANCHOR)
    expect(detectDrift(sched, new Map([['a', 2]]))).toEqual([])
  })
})

describe('rescheduleOnDrift', () => {
  it('pushes successors forward by a predecessor slip', () => {
    const inputs = [t('a', 2), t('b', 3, ['a'])]
    // a actually finished on day 4 (2 late). b must now start at 4, finish at 7.
    const r = rescheduleOnDrift(inputs, ANCHOR, new Map([['a', 4]]))
    const byId = new Map(r.tasks.map((x) => [x.id, x]))
    expect(byId.get('b')!.earliestStart).toBe(4)
    expect(byId.get('b')!.earliestFinish).toBe(7)
    expect(r.projectDurationDays).toBe(7)
  })

  it('leaves the plan unchanged when there is no drift', () => {
    const inputs = [t('a', 2), t('b', 3, ['a'])]
    const base = computeSchedule(inputs, ANCHOR)
    const r = rescheduleOnDrift(inputs, ANCHOR, new Map())
    expect(r.projectDurationDays).toBe(base.projectDurationDays)
  })

  it('keeps a milestone zero-duration even when its actual finish is late', () => {
    // m is a milestone after a(2). Marked done on day 5, well past its day-2 slot.
    // A milestone must never become a bar; it stays an instant.
    const inputs = [t('a', 2), t('m', 0, ['a'], true)]
    const r = rescheduleOnDrift(inputs, ANCHOR, new Map([['m', 5]]))
    const m = r.tasks.find((x) => x.id === 'm')!
    expect(m.isMilestone).toBe(true)
    expect(m.durationDays).toBe(0)
    expect(m.earliestStart).toBe(m.earliestFinish)
  })

  it('still pushes a successor when its predecessor task slips', () => {
    const inputs = [t('a', 2), t('m', 0, ['a'], true)]
    // a actually finished on day 5; the milestone shifts to day 5 but stays 0-dur.
    const r = rescheduleOnDrift(inputs, ANCHOR, new Map([['a', 5]]))
    const m = r.tasks.find((x) => x.id === 'm')!
    expect(m.earliestStart).toBe(5)
    expect(m.durationDays).toBe(0)
  })
})

describe('computeSchedule edge cases', () => {
  it('returns an empty schedule for a project with no tasks', () => {
    const r = computeSchedule([], ANCHOR)
    expect(r.tasks).toEqual([])
    expect(r.projectDurationDays).toBe(0)
    expect(r.criticalPath).toEqual([])
    expect(r.hasCycle).toBe(false)
  })

  it('an all-milestone project has a zero-length schedule and no crash', () => {
    const r = computeSchedule([t('m1', 0, [], true), t('m2', 0, ['m1'], true)], ANCHOR)
    expect(r.projectDurationDays).toBe(0)
    expect(r.tasks.every((x) => x.durationDays === 0)).toBe(true)
  })
})
