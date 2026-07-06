// Calendar interop for meetings: a standards-compliant iCalendar (.ics) event and
// an "add to Google Calendar" URL, so a Plexi meeting can be saved to Apple
// Calendar, Outlook or Google. Pure (no Electron/DOM) so it is unit-testable and
// usable from both the main and renderer processes.

export interface CalendarEvent {
  uid: string
  title: string
  startMs: number
  durationMin: number
  joinUrl?: string
  description?: string
}

// UTC timestamp in iCalendar basic format: 20260707T090000Z.
function icsStamp(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

// iCalendar text escaping: backslash, semicolon, comma and newlines.
function esc(s: string): string {
  return (s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

function fullDescription(ev: CalendarEvent): string {
  return [ev.description, ev.joinUrl ? `Join the meeting: ${ev.joinUrl}` : ''].filter(Boolean).join('\n')
}

// A complete VCALENDAR/VEVENT document. Lines are CRLF-joined per RFC 5545.
export function buildMeetingIcs(ev: CalendarEvent): string {
  const start = icsStamp(ev.startMs)
  const end = icsStamp(ev.startMs + Math.max(1, ev.durationMin) * 60_000)
  const desc = fullDescription(ev)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PlexiDesk//Meeting//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${ev.uid}`,
    `DTSTAMP:${start}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${esc(ev.title || 'Meeting')}`,
    desc ? `DESCRIPTION:${esc(desc)}` : '',
    ev.joinUrl ? `URL:${esc(ev.joinUrl)}` : '',
    ev.joinUrl ? `LOCATION:${esc(ev.joinUrl)}` : '',
    'END:VEVENT',
    'END:VCALENDAR'
  ].filter(Boolean)
  return lines.join('\r\n')
}

// A "create event" link for Google Calendar's web composer.
export function googleCalendarUrl(ev: CalendarEvent): string {
  const dates = `${icsStamp(ev.startMs)}/${icsStamp(ev.startMs + Math.max(1, ev.durationMin) * 60_000)}`
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: ev.title || 'Meeting',
    dates,
    details: fullDescription(ev),
    location: ev.joinUrl || ''
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}
