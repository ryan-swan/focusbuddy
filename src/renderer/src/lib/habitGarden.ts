import type { FocusSession } from '@shared/types'

export interface DayBucket {
  dateKey: string // YYYY-MM-DD (local time)
  date: Date
  sessionCount: number
  totalSeconds: number
  doneCount: number
  isToday: boolean
}

function localDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Build an N-day window ending today (inclusive). Each bucket is keyed by local date.
// Sessions with no completed_at (still running) are excluded — only count earned wins.
export function buildGarden(sessions: FocusSession[], days = 30): DayBucket[] {
  const buckets: DayBucket[] = []
  const todayKey = localDateKey(new Date())
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - i)
    buckets.push({
      dateKey: localDateKey(d),
      date: d,
      sessionCount: 0,
      totalSeconds: 0,
      doneCount: 0,
      isToday: localDateKey(d) === todayKey
    })
  }
  const byKey = new Map(buckets.map((b) => [b.dateKey, b]))
  for (const s of sessions) {
    if (s.completedAt == null || s.actualSeconds == null) continue
    if (s.outcome === 'abandoned' && (s.actualSeconds ?? 0) < 60) continue // < 1 min abandoned = noise
    const key = localDateKey(new Date(s.completedAt))
    const b = byKey.get(key)
    if (!b) continue
    b.sessionCount += 1
    b.totalSeconds += s.actualSeconds
    if (s.outcome === 'done' || s.outcome === 'continued') b.doneCount += 1
  }
  return buckets
}

// Map a session count to a 0..1 bloom intensity. Saturates at 4+ sessions/day so
// "did some work" and "had a hyperfocus day" don't look orders of magnitude different.
export function bloomIntensity(sessionCount: number): number {
  if (sessionCount <= 0) return 0
  if (sessionCount >= 4) return 1
  return 0.35 + (sessionCount - 1) * 0.22
}

export interface GardenSummary {
  totalSessions: number
  totalSeconds: number
  daysWithActivity: number
  todaySessions: number
  todaySeconds: number
}

export function summarize(buckets: DayBucket[]): GardenSummary {
  let totalSessions = 0
  let totalSeconds = 0
  let daysWithActivity = 0
  let todaySessions = 0
  let todaySeconds = 0
  for (const b of buckets) {
    totalSessions += b.sessionCount
    totalSeconds += b.totalSeconds
    if (b.sessionCount > 0) daysWithActivity += 1
    if (b.isToday) {
      todaySessions = b.sessionCount
      todaySeconds = b.totalSeconds
    }
  }
  return {
    totalSessions,
    totalSeconds,
    daysWithActivity,
    todaySessions,
    todaySeconds
  }
}
