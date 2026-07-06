import { describe, it, expect } from 'vitest'
import { buildMeetingIcs, googleCalendarUrl } from '../../src/shared/ics'

const ev = {
  uid: 'room-abc@plexidesk',
  title: 'Design review, part 2',
  startMs: Date.UTC(2026, 6, 7, 9, 0, 0), // 2026-07-07 09:00:00 UTC
  durationMin: 45,
  joinUrl: 'haptyx://meet?room=room-abc'
}

describe('buildMeetingIcs', () => {
  it('emits a well-formed VCALENDAR/VEVENT with CRLF lines', () => {
    const ics = buildMeetingIcs(ev)
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR')).toBe(true)
    expect(ics).toContain('BEGIN:VEVENT')
    expect(ics).toContain('END:VEVENT')
    expect(ics).toContain('UID:room-abc@plexidesk')
    expect(ics).toContain('VERSION:2.0')
  })

  it('uses UTC basic timestamps for start and end', () => {
    const ics = buildMeetingIcs(ev)
    expect(ics).toContain('DTSTART:20260707T090000Z')
    // 09:00 + 45 min = 09:45
    expect(ics).toContain('DTEND:20260707T094500Z')
  })

  it('escapes commas in the summary and carries the join link', () => {
    const ics = buildMeetingIcs(ev)
    expect(ics).toContain('SUMMARY:Design review\\, part 2')
    expect(ics).toContain('URL:haptyx://meet?room=room-abc')
    expect(ics).toContain('Join the meeting: haptyx://meet?room=room-abc')
  })

  it('omits optional lines when no join url or description', () => {
    const ics = buildMeetingIcs({ uid: 'u', title: 'Sync', startMs: ev.startMs, durationMin: 30 })
    expect(ics).not.toContain('URL:')
    expect(ics).not.toContain('LOCATION:')
    expect(ics).not.toContain('DESCRIPTION:')
  })

  it('clamps a zero/negative duration to at least one minute', () => {
    const ics = buildMeetingIcs({ ...ev, durationMin: 0 })
    expect(ics).toContain('DTSTART:20260707T090000Z')
    expect(ics).toContain('DTEND:20260707T090100Z')
  })
})

describe('googleCalendarUrl', () => {
  it('builds a Google Calendar TEMPLATE link with encoded dates and title', () => {
    const url = googleCalendarUrl(ev)
    const u = new URL(url)
    expect(u.origin + u.pathname).toBe('https://calendar.google.com/calendar/render')
    expect(u.searchParams.get('action')).toBe('TEMPLATE')
    expect(u.searchParams.get('text')).toBe('Design review, part 2')
    expect(u.searchParams.get('dates')).toBe('20260707T090000Z/20260707T094500Z')
    expect(u.searchParams.get('location')).toBe('haptyx://meet?room=room-abc')
    expect(u.searchParams.get('details')).toContain('Join the meeting')
  })
})
