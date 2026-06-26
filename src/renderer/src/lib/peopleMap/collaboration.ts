import type { MapPerson } from './usePeopleMap'
import { daylightFor } from './daylight'

// Team-rhythm intelligence for the People Map Collaboration tab. Every number
// here is derived from real org and presence data: working-hours windows, time
// zone offsets, live presence, departments and manager links. Nothing is
// fabricated, and where a signal cannot be computed (a person with no time zone)
// they are simply left out rather than guessed.

// Convert a local working window [start,end) to a UTC interval, in hours, as a
// pair that may be negative or exceed 24 (callers normalize via overlap math).
function toUtcInterval(startLocal: number, endLocal: number, tzOffsetMin: number): [number, number] {
  const tz = tzOffsetMin / 60
  return [startLocal - tz, endLocal - tz]
}

// Overlap in hours between two intervals on a 24-hour circle. Both intervals are
// given in UTC hours and may wrap; we test the second against the first at -24,
// 0 and +24 shifts so a window straddling midnight still overlaps correctly.
function circularOverlap(a: [number, number], b: [number, number]): number {
  const len = (i: [number, number]): number => i[1] - i[0]
  let best = 0
  for (const shift of [-24, 0, 24]) {
    const lo = Math.max(a[0], b[0] + shift)
    const hi = Math.min(a[1], b[1] + shift)
    best = Math.max(best, Math.min(hi - lo, len(a), len(b)))
  }
  return Math.max(0, best)
}

/** Daily working-hours overlap, in hours, between two people. Returns 0 when
 *  either lacks a time zone, since their overlap is genuinely unknown. */
export function workingOverlapHours(a: MapPerson, b: MapPerson): number {
  if (a.tzOffsetMin == null || b.tzOffsetMin == null) return 0
  const ai = toUtcInterval(a.workWindow.start, a.workWindow.end, a.tzOffsetMin)
  const bi = toUtcInterval(b.workWindow.start, b.workWindow.end, b.tzOffsetMin)
  return Math.round(circularOverlap(ai, bi) * 10) / 10
}

export interface HandoffPair {
  from: MapPerson // wrapping up their day
  to: MapPerson // coming online to carry it
  sameTeam: boolean
}

/** Follow-the-sun handoffs: people wrapping up paired with teammates just coming
 *  online who could carry the thread. Same-department pairs are preferred and
 *  listed first. Uses the live clock, so it changes through the day. */
export function followTheSunPairs(people: MapPerson[], now: Date): HandoffPair[] {
  const labelOf = (p: MapPerson): string | null =>
    p.tzOffsetMin != null && p.lat != null && p.lng != null
      ? daylightFor(p.lat, p.lng, p.tzOffsetMin, now, p.workWindow).workLabel
      : null
  const wrapping = people.filter((p) => labelOf(p) === 'Wrapping up')
  const starting = people.filter((p) => labelOf(p) === 'Early hours' || (labelOf(p) === 'Working hours' && p.liveStatus !== 'offline'))
  const pairs: HandoffPair[] = []
  const usedTo = new Set<string>()
  for (const from of wrapping) {
    // Prefer a same-department teammate who has not already been paired.
    const candidates = starting.filter((s) => s.accountId !== from.accountId && !usedTo.has(s.accountId))
    const sameDept = candidates.find((s) => s.department && s.department === from.department)
    const to = sameDept ?? candidates[0]
    if (to) {
      usedTo.add(to.accountId)
      pairs.push({ from, to, sameTeam: !!sameDept })
    }
  }
  return pairs.sort((a, b) => Number(b.sameTeam) - Number(a.sameTeam))
}

export interface Connection {
  a: MapPerson
  b: MapPerson
  overlapHours: number
}

/** Suggested cross-team connections: people in different departments, with
 *  neither reporting to the other, who nonetheless share a healthy working-hours
 *  overlap, so a working relationship is practical but may not exist yet.
 *  Strongest overlaps first, capped. */
export function suggestedConnections(people: MapPerson[], minOverlap = 3, cap = 6): Connection[] {
  const out: Connection[] = []
  for (let i = 0; i < people.length; i++) {
    for (let j = i + 1; j < people.length; j++) {
      const a = people[i]
      const b = people[j]
      if (!a.department || !b.department || a.department === b.department) continue
      if (a.managerAccountId === b.accountId || b.managerAccountId === a.accountId) continue
      const overlapHours = workingOverlapHours(a, b)
      if (overlapHours >= minOverlap) out.push({ a, b, overlapHours })
    }
  }
  return out.sort((x, y) => y.overlapHours - x.overlapHours).slice(0, cap)
}

export interface IsolatedRemote {
  person: MapPerson
  medianOverlap: number
}

/** Remotes isolated by time zone: people whose typical working-hours overlap
 *  with the rest of the team is low, so they are hard to reach synchronously.
 *  Framed for a supportive nudge, not a mark against them. Lowest overlap first. */
export function isolatedRemotes(people: MapPerson[], threshold = 2, cap = 5): IsolatedRemote[] {
  const withTz = people.filter((p) => p.tzOffsetMin != null)
  if (withTz.length < 3) return [] // too small a team to call anyone isolated
  const out: IsolatedRemote[] = []
  for (const person of withTz) {
    const overlaps = withTz
      .filter((o) => o.accountId !== person.accountId)
      .map((o) => workingOverlapHours(person, o))
      .sort((a, b) => a - b)
    if (overlaps.length === 0) continue
    const mid = Math.floor(overlaps.length / 2)
    const median = overlaps.length % 2 ? overlaps[mid] : (overlaps[mid - 1] + overlaps[mid]) / 2
    if (median < threshold) out.push({ person, medianOverlap: Math.round(median * 10) / 10 })
  }
  return out.sort((a, b) => a.medianOverlap - b.medianOverlap).slice(0, cap)
}

/** People reachable for a synchronous conversation right now: anyone whose live
 *  presence is online, focus or away (present at the keyboard recently), not
 *  busy and not offline. */
export function reachableNow(people: MapPerson[]): MapPerson[] {
  return people.filter((p) => p.liveStatus === 'online' || p.liveStatus === 'focus' || p.liveStatus === 'away')
}
