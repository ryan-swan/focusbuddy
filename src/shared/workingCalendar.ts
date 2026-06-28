// A working-day calendar so the scheduler can skip non-working days the way
// Microsoft Project does. Pure and deterministic: given an anchor timestamp and a
// whole-day offset measured in WORKING days, it returns the calendar timestamp
// that many working days later, stepping over weekends (and optional holidays).
// Default is a Monday-to-Friday week, which is what most plans want.

const DAY_MS = 24 * 60 * 60 * 1000

export interface WorkingCalendar {
  // Seven booleans, index 0 = Sunday ... 6 = Saturday (JS getDay order). true =
  // a working day. Default below is Mon-Fri.
  workingDays: boolean[]
  // Optional holiday calendar-day timestamps (any time within the day counts).
  holidays?: number[]
}

export const DEFAULT_CALENDAR: WorkingCalendar = {
  workingDays: [false, true, true, true, true, true, false]
}

// Five-day default used when a project has no explicit calendar.
export function defaultCalendar(): WorkingCalendar {
  return DEFAULT_CALENDAR
}

function holidaySet(cal: WorkingCalendar): Set<string> {
  const s = new Set<string>()
  for (const h of cal.holidays ?? []) {
    const d = new Date(h)
    s.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`)
  }
  return s
}

function isWorking(ms: number, cal: WorkingCalendar, holidays: Set<string>): boolean {
  const d = new Date(ms)
  if (!cal.workingDays[d.getDay()]) return false
  if (holidays.size && holidays.has(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`)) return false
  return true
}

// Map a whole-day offset measured in working days to an absolute timestamp,
// starting from `anchorMs`. Offset 0 is the anchor itself moved forward to the
// first working day on or after it. Returns a function suitable for
// computeSchedule's `dayToMs` parameter. If every day is non-working (a broken
// calendar), it degrades to plain calendar days so scheduling still completes.
export function makeDayToMs(anchorMs: number, cal: WorkingCalendar = DEFAULT_CALENDAR): (dayOffset: number) => number {
  const holidays = holidaySet(cal)
  const anyWorking = cal.workingDays.some(Boolean)
  if (!anyWorking) return (offset: number) => anchorMs + offset * DAY_MS

  // Anchor moved forward to the first working day at midnight, so bars land on
  // whole days regardless of the anchor's time of day.
  let cursor = new Date(anchorMs)
  cursor.setHours(0, 0, 0, 0)
  while (!isWorking(cursor.getTime(), cal, holidays)) cursor = new Date(cursor.getTime() + DAY_MS)
  const startMs = cursor.getTime()

  // Cache offsets as we walk forward; cheap for the day-counts a plan spans.
  const cache: number[] = [startMs]
  const compute = (offset: number): number => {
    if (offset <= 0) return startMs
    if (offset < cache.length) return cache[offset]
    let ms = cache[cache.length - 1]
    for (let i = cache.length; i <= offset; i++) {
      // Advance to the next working day.
      ms += DAY_MS
      while (!isWorking(ms, cal, holidays)) ms += DAY_MS
      cache[i] = ms
    }
    return cache[offset]
  }
  return compute
}

// Count working days between two timestamps (inclusive of start day, exclusive of
// end), for deriving a duration from a planned start/finish pair.
export function workingDaysBetween(startMs: number, endMs: number, cal: WorkingCalendar = DEFAULT_CALENDAR): number {
  if (endMs <= startMs) return 0
  const holidays = holidaySet(cal)
  const anyWorking = cal.workingDays.some(Boolean)
  if (!anyWorking) return Math.max(1, Math.round((endMs - startMs) / DAY_MS))
  let count = 0
  let cursor = new Date(startMs)
  cursor.setHours(0, 0, 0, 0)
  const end = endMs
  while (cursor.getTime() < end) {
    if (isWorking(cursor.getTime(), cal, holidays)) count++
    cursor = new Date(cursor.getTime() + DAY_MS)
  }
  return Math.max(1, count)
}
