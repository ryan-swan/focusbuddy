import { describe, it, expect } from 'vitest'
import { bucketByDay, bucketByWeek, periodDelta, countByKey } from '../../src/renderer/src/lib/dashboardMetrics'

const DAY = 24 * 60 * 60 * 1000
const NOW = 1_000 * DAY // a fixed "now" so tests are deterministic

describe('bucketByDay', () => {
  it('zero-fills with no data (honest empty series)', () => {
    expect(bucketByDay([], 7, NOW)).toEqual([0, 0, 0, 0, 0, 0, 0])
  })
  it('counts into the right day buckets, most recent last', () => {
    const today = NOW - 1
    const twoDaysAgo = NOW - 2 * DAY - 1
    const b = bucketByDay([today, today, twoDaysAgo], 7, NOW)
    expect(b.length).toBe(7)
    expect(b[6]).toBe(2) // today
    expect(b[4]).toBe(1) // two days ago
    expect(b.reduce((a, c) => a + c, 0)).toBe(3)
  })
  it('ignores timestamps outside the window', () => {
    expect(bucketByDay([NOW - 100 * DAY], 7, NOW).reduce((a, c) => a + c, 0)).toBe(0)
  })
})

describe('bucketByWeek', () => {
  it('buckets by week', () => {
    const b = bucketByWeek([NOW - 1, NOW - 8 * DAY], 4, NOW)
    expect(b.length).toBe(4)
    expect(b[3]).toBe(1) // this week
    expect(b[2]).toBe(1) // last week
  })
})

describe('periodDelta', () => {
  it('returns undefined with no prior baseline (never fabricates a trend)', () => {
    expect(periodDelta([NOW - 1, NOW - 2], DAY * 7, NOW)).toBeUndefined()
  })
  it('computes an up delta against a real baseline', () => {
    const cur = [NOW - 1, NOW - 2, NOW - 3] // 3 this week
    const prev = [NOW - 8 * DAY, NOW - 9 * DAY] // 2 last week
    const d = periodDelta([...cur, ...prev], DAY * 7, NOW)
    expect(d).toEqual({ dir: 'up', text: '+50%' })
  })
  it('computes a down delta', () => {
    const cur = [NOW - 1] // 1
    const prev = [NOW - 8 * DAY, NOW - 9 * DAY] // 2
    expect(periodDelta([...cur, ...prev], DAY * 7, NOW)).toEqual({ dir: 'down', text: '-50%' })
  })
})

describe('countByKey', () => {
  it('groups and sorts by frequency desc', () => {
    const out = countByKey([{ k: 'a' }, { k: 'b' }, { k: 'a' }], (i) => i.k)
    expect(out).toEqual([{ label: 'a', value: 2 }, { label: 'b', value: 1 }])
  })
})
