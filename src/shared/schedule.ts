// Pure recurring-schedule math, shared by PlexiReports and PlexiFlow so both
// advance a schedule the same way and can be unit-tested without a database. The
// only subtlety is the month case: a naive setMonth(+1) on a day-29/30/31 anchor
// overflows (Jan 31 becomes Mar 3), skipping February, so this clamps the day to
// the last valid day of the target month instead.

export type Recurrence = 'daily' | 'weekly' | 'monthly'

export function advanceSchedule(every: Recurrence, fromMs: number): number {
  const d = new Date(fromMs)
  if (every === 'daily') {
    d.setDate(d.getDate() + 1)
  } else if (every === 'weekly') {
    d.setDate(d.getDate() + 7)
  } else {
    const day = d.getDate()
    d.setDate(1)
    d.setMonth(d.getMonth() + 1)
    const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    d.setDate(Math.min(day, daysInMonth))
  }
  return d.getTime()
}
