// DEC-131 — the assistant Calendar tab's pure parts: which slot a picked day
// opens the Book-time dialog on, and the 42 cells of a month at a glance.

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** The slot a picked day opens on: the next round half hour today, 9:00 on
 *  any other day — the Book-time dialog's own convention. */
export function defaultSlotFor(day: Date, nowMs = Date.now()): number {
  const now = new Date(nowMs)
  if (sameDay(day, now)) {
    const d = new Date(now)
    d.setSeconds(0, 0)
    d.setMinutes(d.getMinutes() <= 30 ? 30 : 60)
    return d.getTime()
  }
  const d = startOfDay(day)
  d.setHours(9, 0, 0, 0)
  return d.getTime()
}

/** The 42 cells of a month view, starting on the Sunday on or before the 1st. */
export function monthCells(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const start = new Date(first)
  start.setDate(first.getDate() - first.getDay())
  const cells: Date[] = []
  for (let i = 0; i < 42; i++) cells.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
  return cells
}
