import { describe, it, expect } from 'vitest'
import { computeSchedule, type GanttInput } from '../../src/shared/gantt'
import { makeDayToMs, workingDaysBetween, type WorkingCalendar } from '../../src/shared/workingCalendar'

// The PlexiProjects 2.0 engine: typed dependencies (FS/SS/FF/SF) + lag, and a
// working-day calendar that skips weekends. All pure and deterministic.

const A0 = 0 // anchor at epoch for offset assertions (no calendar)

function sched(inputs: GanttInput[]) {
  const r = computeSchedule(inputs, A0)
  const by = new Map(r.tasks.map((t) => [t.id, t]))
  return (id: string) => by.get(id)!
}

describe('dependency types', () => {
  const A: GanttInput = { id: 'A', durationDays: 3, deps: [] }
  const mkB = (type: 'FS' | 'SS' | 'FF' | 'SF', lag = 0): GanttInput => ({
    id: 'B',
    durationDays: 2,
    deps: [],
    links: [{ id: 'A', type, lag }]
  })

  it('FS (default): B starts when A finishes', () => {
    const at = sched([A, mkB('FS')])
    expect(at('A').earliestStart).toBe(0)
    expect(at('A').earliestFinish).toBe(3)
    expect(at('B').earliestStart).toBe(3)
    expect(at('B').earliestFinish).toBe(5)
  })

  it('FS with lag pushes the successor out by the lag', () => {
    const at = sched([A, mkB('FS', 2)])
    expect(at('B').earliestStart).toBe(5) // 3 + 2
  })

  it('SS: B starts when A starts', () => {
    const at = sched([A, mkB('SS')])
    expect(at('B').earliestStart).toBe(0)
  })

  it('FF: B finishes when A finishes', () => {
    const at = sched([A, mkB('FF')])
    expect(at('B').earliestFinish).toBe(3) // so start = 3 - 2 = 1
    expect(at('B').earliestStart).toBe(1)
  })

  it('SF resolves without crashing and clamps a negative start to 0', () => {
    const at = sched([A, mkB('SF')])
    expect(at('B').earliestStart).toBe(0)
  })

  it('a bare deps[] id still behaves as FS lag 0 (backward compatible)', () => {
    const at = sched([A, { id: 'B', durationDays: 2, deps: ['A'] }])
    expect(at('B').earliestStart).toBe(3)
  })
})

describe('working-day calendar', () => {
  // 2024-01-01 is a Monday in local time.
  const monday = new Date(2024, 0, 1).getTime()
  const cal: WorkingCalendar = { workingDays: [false, true, true, true, true, true, false] }
  const DAY = 24 * 60 * 60 * 1000

  it('maps working-day offsets over the weekend', () => {
    const dayToMs = makeDayToMs(monday, cal)
    expect(dayToMs(0)).toBe(new Date(2024, 0, 1).getTime()) // Mon
    expect(dayToMs(4)).toBe(new Date(2024, 0, 5).getTime()) // Fri
    expect(dayToMs(5)).toBe(new Date(2024, 0, 8).getTime()) // next Mon, skipped Sat+Sun
    expect((dayToMs(5) - dayToMs(0)) / DAY).toBe(7)
  })

  it('counts working days between two dates, skipping the weekend', () => {
    const monNext = new Date(2024, 0, 8).getTime()
    expect(workingDaysBetween(monday, monNext, cal)).toBe(5) // Mon-Fri
  })

  it('a task planned on the anchor day starts at offset 0, not 1 (overdue stays overdue)', () => {
    // Regression: workingDaysBetween once floored to 1, so a task planned on the
    // anchor day got pushed a day (and, across a weekend, its end slid past
    // "now"), wrongly clearing an overdue flag. A start offset of 0 is valid.
    const sunday = new Date(2026, 5, 21).getTime() // anchor day (a Sunday)
    expect(workingDaysBetween(sunday, sunday, cal)).toBe(0)
    const dayToMs = makeDayToMs(sunday, cal)
    const r = computeSchedule(
      [{ id: 'A', durationDays: Math.max(1, workingDaysBetween(sunday, new Date(2026, 5, 25).getTime(), cal)), deps: [], minStartDay: 0 }],
      sunday,
      dayToMs
    )
    const a = r.tasks.find((t) => t.id === 'A')!
    // Anchor moves to Mon Jun 22; a ~4-working-day task ends Fri Jun 26, well
    // before the following Sunday, so an overdue check still fires.
    expect(a.endMs).toBeLessThan(new Date(2026, 5, 28).getTime())
  })

  it('computeSchedule with a calendar places task timestamps on working days', () => {
    const dayToMs = makeDayToMs(monday, cal)
    const r = computeSchedule(
      [
        { id: 'A', durationDays: 5, deps: [] },
        { id: 'B', durationDays: 1, deps: ['A'] }
      ],
      monday,
      dayToMs
    )
    const b = r.tasks.find((t) => t.id === 'B')!
    // A spans 5 working days from Mon, finishing offset 5 = next Mon; B starts then.
    expect(b.startMs).toBe(new Date(2024, 0, 8).getTime())
  })
})
