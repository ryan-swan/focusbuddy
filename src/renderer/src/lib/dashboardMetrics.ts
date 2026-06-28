// Pure helpers for the module dashboards: bucket real timestamps into a
// time-series and compute an honest period-over-period delta. No invented data:
// empty input yields zero-filled buckets (a real "nothing happened" series), and
// a delta is only returned when there is a real prior-period baseline to compare
// against, so a tile never shows a made-up trend.

const DAY_MS = 24 * 60 * 60 * 1000

// Count timestamps into `count` consecutive day buckets ending at `now`, oldest
// first. The last element is the most recent (today). Always returns `count`
// numbers, zeros included, so a sparkline reflects real gaps.
export function bucketByDay(timestamps: number[], count: number, now: number): number[] {
  const buckets = new Array(count).fill(0)
  const start = now - count * DAY_MS
  for (const ts of timestamps) {
    if (ts < start || ts > now) continue
    let idx = Math.floor((ts - start) / DAY_MS)
    if (idx < 0) idx = 0
    if (idx >= count) idx = count - 1
    buckets[idx] += 1
  }
  return buckets
}

// Same, in week-wide buckets.
export function bucketByWeek(timestamps: number[], count: number, now: number): number[] {
  const weekMs = 7 * DAY_MS
  const buckets = new Array(count).fill(0)
  const start = now - count * weekMs
  for (const ts of timestamps) {
    if (ts < start || ts > now) continue
    let idx = Math.floor((ts - start) / weekMs)
    if (idx < 0) idx = 0
    if (idx >= count) idx = count - 1
    buckets[idx] += 1
  }
  return buckets
}

// A StatTile delta from the count in the last `periodMs` vs the period before it.
// Returns undefined when there is no real prior-period baseline (prev === 0), so
// the tile honestly shows no trend rather than a fabricated one.
export function periodDelta(
  timestamps: number[],
  periodMs: number,
  now: number
): { dir: 'up' | 'down' | 'flat'; text: string } | undefined {
  const curStart = now - periodMs
  const prevStart = now - 2 * periodMs
  let cur = 0
  let prev = 0
  for (const ts of timestamps) {
    if (ts >= curStart && ts <= now) cur += 1
    else if (ts >= prevStart && ts < curStart) prev += 1
  }
  if (prev === 0) return undefined
  const pct = Math.round(((cur - prev) / prev) * 100)
  const dir = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat'
  return { dir, text: `${pct > 0 ? '+' : ''}${pct}%` }
}

// Group items by a string key into [{ label, value }] sorted by value desc.
export function countByKey<T>(items: T[], keyOf: (item: T) => string): Array<{ label: string; value: number }> {
  const map = new Map<string, number>()
  for (const it of items) {
    const k = keyOf(it)
    map.set(k, (map.get(k) ?? 0) + 1)
  }
  return [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)
}
