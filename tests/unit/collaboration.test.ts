import { describe, it, expect } from 'vitest'
import {
  workingOverlapHours,
  followTheSunPairs,
  suggestedConnections,
  isolatedRemotes,
  reachableNow
} from '../../src/renderer/src/lib/peopleMap/collaboration'
import type { MapPerson } from '../../src/renderer/src/lib/peopleMap/usePeopleMap'
import type { PresenceStatus } from '../../src/renderer/src/stores/presence'

let n = 1
function person(p: Partial<MapPerson> & { tzOffsetMin?: number | null }): MapPerson {
  const id = `u${n++}`
  return {
    accountId: id,
    handle: p.handle ?? id,
    role: 'member',
    title: null,
    department: p.department ?? null,
    officeId: null,
    managerAccountId: p.managerAccountId ?? null,
    city: null,
    lat: p.lat ?? 0,
    lng: p.lng ?? 0,
    tzOffsetMin: p.tzOffsetMin === undefined ? 0 : p.tzOffsetMin,
    workWindow: p.workWindow ?? { start: 9, end: 17 },
    liveStatus: (p.liveStatus ?? 'offline') as PresenceStatus,
    liveWorkingOn: null,
    isSelf: false
  } as MapPerson
}

describe('workingOverlapHours', () => {
  it('is the full window for two people in the same time zone and window', () => {
    const a = person({ tzOffsetMin: 0, workWindow: { start: 9, end: 17 } })
    const b = person({ tzOffsetMin: 0, workWindow: { start: 9, end: 17 } })
    expect(workingOverlapHours(a, b)).toBe(8)
  })

  it('shrinks with a time-zone gap', () => {
    // London 9-17 (UTC) vs New York 9-17 (UTC-5 => 14-22 UTC). Overlap 14-17 = 3h.
    const london = person({ tzOffsetMin: 0, workWindow: { start: 9, end: 17 } })
    const ny = person({ tzOffsetMin: -300, workWindow: { start: 9, end: 17 } })
    expect(workingOverlapHours(london, ny)).toBe(3)
  })

  it('is zero for non-overlapping time zones', () => {
    // UTC 9-17 vs UTC+12 9-17 (=> 21-05 UTC next day). No overlap.
    const a = person({ tzOffsetMin: 0, workWindow: { start: 9, end: 17 } })
    const b = person({ tzOffsetMin: 720, workWindow: { start: 9, end: 17 } })
    expect(workingOverlapHours(a, b)).toBe(0)
  })

  it('returns 0 when either person has no time zone (unknown, not guessed)', () => {
    const a = person({ tzOffsetMin: 0 })
    const b = person({ tzOffsetMin: null })
    expect(workingOverlapHours(a, b)).toBe(0)
  })
})

describe('suggestedConnections', () => {
  it('pairs cross-department people with enough overlap and no manager link', () => {
    const a = person({ handle: 'eng', department: 'Engineering', tzOffsetMin: 0 })
    const b = person({ handle: 'sales', department: 'Sales', tzOffsetMin: 0 })
    const out = suggestedConnections([a, b])
    expect(out).toHaveLength(1)
    expect(out[0].overlapHours).toBe(8)
  })

  it('excludes a same-department pair', () => {
    const a = person({ department: 'Engineering', tzOffsetMin: 0 })
    const b = person({ department: 'Engineering', tzOffsetMin: 0 })
    expect(suggestedConnections([a, b])).toHaveLength(0)
  })

  it('excludes a direct manager link even across departments', () => {
    const mgr = person({ handle: 'mgr', department: 'Engineering', tzOffsetMin: 0 })
    const rep = person({ handle: 'rep', department: 'Sales', tzOffsetMin: 0, managerAccountId: mgr.accountId })
    expect(suggestedConnections([mgr, rep])).toHaveLength(0)
  })

  it('drops cross-team pairs whose overlap is below the threshold', () => {
    const a = person({ department: 'A', tzOffsetMin: 0, workWindow: { start: 9, end: 17 } })
    const b = person({ department: 'B', tzOffsetMin: 720, workWindow: { start: 9, end: 17 } })
    expect(suggestedConnections([a, b])).toHaveLength(0)
  })
})

describe('isolatedRemotes', () => {
  it('flags the person with low median overlap with the team', () => {
    // Three clustered in UTC, one far off in UTC+12.
    const team = [
      person({ tzOffsetMin: 0 }),
      person({ tzOffsetMin: 0 }),
      person({ tzOffsetMin: 0 })
    ]
    const far = person({ handle: 'remote', tzOffsetMin: 720 })
    const out = isolatedRemotes([...team, far])
    expect(out.map((r) => r.person.handle)).toContain('remote')
    expect(out[0].person.handle).toBe('remote')
  })

  it('returns nothing for a team too small to judge isolation', () => {
    expect(isolatedRemotes([person({ tzOffsetMin: 0 }), person({ tzOffsetMin: 720 })])).toEqual([])
  })
})

describe('followTheSunPairs', () => {
  it('pairs a wrapping-up person with a coming-online teammate, same team first', () => {
    // Build a clock where one person is at end-of-day and another at start.
    // Wrapping up: local hour in [end, end+3). Early hours: [start-3, start).
    // Use lat/lng 0 and tz to place local hour. now is fixed.
    const now = new Date('2026-06-26T12:00:00Z') // 12:00 UTC
    // tz 0, window 6-11 => at 12:00 local it is just past end (wrapping up).
    const wrappingEng = person({ handle: 'w-eng', department: 'Eng', tzOffsetMin: 0, lat: 0, lng: 0, workWindow: { start: 6, end: 11 } })
    // tz 0, window 13-21 => at 12:00 local it is one hour before start (early hours).
    const startingEng = person({ handle: 's-eng', department: 'Eng', tzOffsetMin: 0, lat: 0, lng: 0, workWindow: { start: 13, end: 21 } })
    const startingOther = person({ handle: 's-sales', department: 'Sales', tzOffsetMin: 0, lat: 0, lng: 0, workWindow: { start: 13, end: 21 } })
    const pairs = followTheSunPairs([wrappingEng, startingEng, startingOther], now)
    expect(pairs.length).toBeGreaterThanOrEqual(1)
    expect(pairs[0].from.handle).toBe('w-eng')
    // The same-team partner is preferred.
    expect(pairs[0].to.handle).toBe('s-eng')
    expect(pairs[0].sameTeam).toBe(true)
  })
})

describe('reachableNow', () => {
  it('includes online, focus and away, excludes busy and offline', () => {
    const people = [
      person({ handle: 'on', liveStatus: 'online' }),
      person({ handle: 'fo', liveStatus: 'focus' }),
      person({ handle: 'aw', liveStatus: 'away' }),
      person({ handle: 'bu', liveStatus: 'busy' }),
      person({ handle: 'of', liveStatus: 'offline' })
    ]
    expect(reachableNow(people).map((p) => p.handle)).toEqual(['on', 'fo', 'aw'])
  })
})
