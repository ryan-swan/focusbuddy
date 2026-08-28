// DEC-063 — how an invitation says when it is.
//
// Separate from meetInvite.ts because this is presentation and that is meaning,
// and separate from the row so the wording can be tested. A meeting's time is
// read at a glance more often than it is read carefully: "Today 2:00 PM" is the
// answer to "can I make it", where a full date is not.
const DAY = 86_400_000

const time = (ms: number): string =>
  new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

/** Local midnight, so "today" means the calendar day and not 24 hours. */
const startOfDay = (ms: number): number => {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function formatMeetWhen(
  startMs: number,
  durationMin: number | null,
  nowMs: number
): string {
  const days = Math.round((startOfDay(startMs) - startOfDay(nowMs)) / DAY)
  const when =
    days === 0
      ? `Today ${time(startMs)}`
      : days === 1
        ? `Tomorrow ${time(startMs)}`
        : days === -1
          ? `Yesterday ${time(startMs)}`
          : days > 1 && days < 7
            ? `${new Date(startMs).toLocaleDateString(undefined, { weekday: 'long' })} ${time(startMs)}`
            : `${new Date(startMs).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${time(startMs)}`
  // The end time only earns its space when a duration was actually given —
  // inventing "– 3:00 PM" from a default would state something nobody said.
  if (!durationMin) return when
  return `${when} – ${time(startMs + durationMin * 60_000)}`
}
