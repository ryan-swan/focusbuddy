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

// ── DEC-064 — the editor's date/time fields ↔ the stored ISO instant ────────
// Split out and tested because a meeting written to the wrong hour is worse
// than one never written: it puts a person in the wrong place, confidently.
// The <input type="date"> / <input type="time"> pair speaks LOCAL wall-clock
// time, and `meet_start_at` stores an absolute instant, so the conversion has
// to go through the local timezone in both directions — never through
// toISOString().slice(), which silently shifts the day for anyone east or west
// of UTC at the wrong hour.

/** ISO instant → the `YYYY-MM-DD` and `HH:MM` a person sees, in THEIR zone. */
export function isoToLocalParts(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: '', time: '' }
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return { date: '', time: '' }
  const p = (n: number): string => String(n).padStart(2, '0')
  return {
    date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    time: `${p(d.getHours())}:${p(d.getMinutes())}`
  }
}

/**
 * The pair back to an instant. Returns null when there is no date — a time
 * without a day is not a moment, and storing one would invent a date.
 */
export function localPartsToIso(date: string, time: string): string | null {
  if (!date) return null
  const [y, m, d] = date.split('-').map(Number)
  if (!y || !m || !d) return null
  const [hh, mm] = (time || '09:00').split(':').map(Number)
  const dt = new Date(y, m - 1, d, Number.isFinite(hh) ? hh : 9, Number.isFinite(mm) ? mm : 0, 0, 0)
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString()
}
