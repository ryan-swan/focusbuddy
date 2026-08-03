import { describe, it, expect } from 'vitest'
import { advanceSchedule } from '../../src/shared/schedule'

// Build a local-time date so assertions match advanceSchedule's local-time math.
function at(y: number, m: number, d: number, h = 9): number {
  return new Date(y, m - 1, d, h).getTime()
}
function parts(ms: number): { y: number; m: number; d: number } {
  const dt = new Date(ms)
  return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() }
}

describe('advanceSchedule', () => {
  it('daily adds one calendar day', () => {
    expect(parts(advanceSchedule('daily', at(2026, 6, 26)))).toEqual({ y: 2026, m: 6, d: 27 })
  })

  it('weekly adds seven days across a month boundary', () => {
    expect(parts(advanceSchedule('weekly', at(2026, 6, 28)))).toEqual({ y: 2026, m: 7, d: 5 })
  })

  it('monthly from Jan 31 lands on Feb 28, not March, in a non-leap year', () => {
    // The bug being guarded: setMonth(+1) on Jan 31 overflows to Mar 3.
    expect(parts(advanceSchedule('monthly', at(2027, 1, 31)))).toEqual({ y: 2027, m: 2, d: 28 })
  })

  it('monthly from Jan 31 lands on Feb 29 in a leap year', () => {
    expect(parts(advanceSchedule('monthly', at(2028, 1, 31)))).toEqual({ y: 2028, m: 2, d: 29 })
  })

  it('monthly from a mid-month day keeps the day', () => {
    expect(parts(advanceSchedule('monthly', at(2026, 6, 15)))).toEqual({ y: 2026, m: 7, d: 15 })
  })

  it('monthly from Dec rolls the year over', () => {
    expect(parts(advanceSchedule('monthly', at(2026, 12, 15)))).toEqual({ y: 2027, m: 1, d: 15 })
  })

  it('monthly from Jan 30 also clamps to Feb 28 in a non-leap year', () => {
    expect(parts(advanceSchedule('monthly', at(2027, 1, 30)))).toEqual({ y: 2027, m: 2, d: 28 })
  })
})
