// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  meetingOf, meetingEnded, placeLabel, joinUrlOf, parseAttendees, meetProviderLabel
} from '../../src/renderer/src/lib/meetInvite'
import type { FbNode } from '../../src/shared/types'

// DEC-063 — a Meet item points AT a meeting (the operator's option 2). The
// deciding case was his own: an RSVP you owe is a meeting that is not on your
// calendar, so it cannot BE a time block.
const item = (over: Partial<FbNode> = {}): FbNode =>
  ({ id: 'w1', title: 'Sync with Sam', kind: 'work_item', ...over }) as FbNode

const T = Date.parse('2026-09-02T14:00:00Z')

describe('dec_063 — an item only reads as an invitation when it is one', () => {
  it('dec_063_a_bare_meet_note_is_not_dressed_as_an_invite', () => {
    // "meet with Sam" with nothing known is a note to yourself. Rendering it as
    // an invitation would claim knowledge the item does not have.
    expect(meetingOf(item()).isInvite).toBe(false)
  })

  it('dec_063_any_one_of_when_where_or_rsvp_makes_it_an_invite', () => {
    expect(meetingOf(item({ meetStartAt: '2026-09-02T14:00:00Z' })).isInvite).toBe(true)
    expect(meetingOf(item({ meetUrl: 'https://meet.google.com/abc-defg-hij' })).isInvite).toBe(true)
    expect(meetingOf(item({ meetLocation: 'The coffee place on 3rd' })).isInvite).toBe(true)
    expect(meetingOf(item({ meetRsvp: 'needed' })).isInvite).toBe(true)
  })

  it('dec_063_an_unanswered_invitation_is_the_case_that_decided_the_model', () => {
    // No time, no link, no block — only an answer owed. Option 1 ("a Meet item
    // IS a time block") could not represent this at all.
    const m = meetingOf(item({ meetRsvp: 'needed' }))
    expect(m.awaitingRsvp).toBe(true)
    expect(m.isInvite).toBe(true)
    expect(m.startAtMs).toBeNull()
  })

  it('dec_063_an_answered_invitation_is_no_longer_waiting_on_you', () => {
    expect(meetingOf(item({ meetRsvp: 'yes' })).awaitingRsvp).toBe(false)
    expect(meetingOf(item({ meetRsvp: 'no' })).awaitingRsvp).toBe(false)
    expect(meetingOf(item({ meetRsvp: 'maybe' })).awaitingRsvp).toBe(false)
  })
})

describe('dec_063 — a join link must actually be a link', () => {
  it('dec_063_a_dead_join_button_is_worse_than_none', () => {
    expect(joinUrlOf('zoom')).toBeNull()
    expect(joinUrlOf('  ')).toBeNull()
    expect(joinUrlOf(null)).toBeNull()
    expect(joinUrlOf('javascript:alert(1)')).toBeNull() // not http(s): never offered
    expect(joinUrlOf('https://zoom.us/j/123')).toBe('https://zoom.us/j/123')
  })

  it('dec_063_the_provider_is_read_from_the_link_not_stored', () => {
    expect(meetProviderLabel('https://meet.google.com/abc')).toBe('Google Meet')
    expect(meetProviderLabel('https://acme.zoom.us/j/1')).toBe('Zoom')
    expect(meetProviderLabel('https://teams.microsoft.com/l/x')).toBe('Teams')
    expect(meetProviderLabel('https://example.com/room')).toBe('Join') // honest fallback
    expect(meetProviderLabel(null)).toBe('Join')
  })
})

describe('dec_063 — where it is', () => {
  it('dec_063_a_link_wins_over_an_address_for_a_hybrid_meeting', () => {
    const m = meetingOf(item({ meetUrl: 'https://meet.google.com/x', meetLocation: 'Room 4' }))
    expect(placeLabel(m.place)).toBe('Google Meet')
    expect(m.place.location).toBe('Room 4') // still carried, for whoever is walking
  })
  it('dec_063_an_address_stands_alone_for_an_in_person_meeting', () => {
    expect(placeLabel(meetingOf(item({ meetLocation: '12 Bridge St' })).place)).toBe('12 Bridge St')
  })
  it('dec_063_no_place_is_null_not_an_empty_label', () => {
    expect(placeLabel(meetingOf(item()).place)).toBeNull()
  })
})

describe('dec_063 — attendees are pasted, not formatted', () => {
  it('dec_063_splits_on_commas_semicolons_and_newlines', () => {
    expect(parseAttendees('a@x.com, b@x.com;c@x.com\nd@x.com')).toEqual(['a@x.com','b@x.com','c@x.com','d@x.com'])
  })
  it('dec_063_blank_entries_are_dropped_not_counted', () => {
    expect(parseAttendees('a@x.com,, ,b@x.com')).toEqual(['a@x.com','b@x.com'])
    expect(parseAttendees(null)).toEqual([])
  })
})

describe('dec_063 — a finished meeting stops offering to join', () => {
  it('dec_063_ended_when_start_plus_duration_is_past', () => {
    const m = meetingOf(item({ meetStartAt: '2026-09-02T14:00:00Z', meetDurationMin: 30 }))
    expect(meetingEnded(m, T + 29 * 60_000)).toBe(false)
    expect(meetingEnded(m, T + 31 * 60_000)).toBe(true)
  })
  it('dec_063_an_hour_is_assumed_when_no_duration_was_given', () => {
    const m = meetingOf(item({ meetStartAt: '2026-09-02T14:00:00Z' }))
    expect(meetingEnded(m, T + 59 * 60_000)).toBe(false)
    expect(meetingEnded(m, T + 61 * 60_000)).toBe(true)
  })
  it('dec_063_a_meeting_with_no_time_never_counts_as_ended', () => {
    // An unanswered invitation must not silently expire out of the queue.
    expect(meetingEnded(meetingOf(item({ meetRsvp: 'needed' })), T)).toBe(false)
  })
})

describe('dec_063 — a bad stored value never crashes the queue', () => {
  it('dec_063_unparseable_start_is_null_not_NaN', () => {
    expect(meetingOf(item({ meetStartAt: 'not a date' })).startAtMs).toBeNull()
  })
})

// DEC-063 — the composer and the block payload, pinned structurally.
describe('dec_063 — the calendar composer can express a real meeting', () => {
  const read = (rel: string): string =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('node:fs').readFileSync(new URL(rel, import.meta.url), 'utf8') as string

  it('dec_063_link_location_and_end_time_are_offered', () => {
    const grid = read('../../src/renderer/src/components/views/WeekTimeGrid.tsx')
    expect(grid).toContain('block-join-url')
    expect(grid).toContain('block-location')
    // The end time, not just the duration: "60 min" is arithmetic against a
    // start time the person can no longer see.
    expect(grid).toContain('startMs + duration * 60_000')
    // ...and only for a meeting. Focus time has no location and no link.
    expect(grid).toContain('{isMeeting && (')
  })

  it('dec_063_an_external_link_beats_the_minted_plexii_room', () => {
    // If someone pasted a Zoom URL, that IS the meeting; the minted room is the
    // fallback, not the destination.
    const grid = read('../../src/renderer/src/components/views/WeekTimeGrid.tsx')
    expect(grid).toContain('const ext = block.meeting?.joinUrl')
    expect(grid).toContain('if (ext) void window.api.files.openExternal(ext)')
  })

  it('dec_063_the_meeting_payload_carries_them_without_a_migration', () => {
    const types = read('../../src/shared/types.ts')
    expect(types).toContain('joinUrl?: string | null')
    expect(types).toContain('location?: string | null')
    // roomId stays required and always minted, so an in-person meeting can
    // still be joined remotely without editing anything.
    expect(types).toMatch(/export interface TimeBlockMeeting \{\s*\n\s*roomId: string/)
  })

  it('dec_063_the_queue_row_renders_meet_items_as_invitations', () => {
    const att = read('../../src/renderer/src/components/views/AttentionView.tsx')
    expect(att).toContain("queueOf(i) === 'to_meet' ? meetingOf(i) : null")
    expect(att).toContain('invite?.isInvite ?')
    expect(att).toContain("updateFields(i.id, { meetRsvp: answer })") // answer in place
  })
})

// DEC-064 — the editor's date/time pair ↔ the stored instant. A meeting written
// to the wrong hour is worse than one never written: it puts a person in the
// wrong place, confidently.
describe('dec_064 — local wall-clock in, absolute instant out', () => {
  it('dec_064_round_trips_through_the_local_zone', async () => {
    const { isoToLocalParts, localPartsToIso } = await import('../../src/renderer/src/lib/meetWhen')
    const iso = localPartsToIso('2026-09-02', '14:30')
    expect(iso).not.toBeNull()
    expect(isoToLocalParts(iso)).toEqual({ date: '2026-09-02', time: '14:30' })
  })

  it('dec_064_keeps_the_day_the_user_picked_whatever_the_offset', async () => {
    const { isoToLocalParts, localPartsToIso } = await import('../../src/renderer/src/lib/meetWhen')
    // Late-evening local time is the case where toISOString().slice(0,10)
    // silently rolls the date forward for anyone west of UTC.
    expect(isoToLocalParts(localPartsToIso('2026-09-02', '23:45')).date).toBe('2026-09-02')
    // ...and early morning is where it rolls BACK for anyone east of it.
    expect(isoToLocalParts(localPartsToIso('2026-09-02', '00:15')).date).toBe('2026-09-02')
  })

  it('dec_064_a_time_with_no_date_is_not_a_moment', async () => {
    const { localPartsToIso } = await import('../../src/renderer/src/lib/meetWhen')
    expect(localPartsToIso('', '14:30')).toBeNull()
    expect(localPartsToIso('not-a-date', '14:30')).toBeNull()
  })

  it('dec_064_a_date_with_no_time_defaults_rather_than_refusing', async () => {
    const { isoToLocalParts, localPartsToIso } = await import('../../src/renderer/src/lib/meetWhen')
    expect(isoToLocalParts(localPartsToIso('2026-09-02', '')).time).toBe('09:00')
  })

  it('dec_064_a_missing_or_broken_instant_yields_empty_fields', async () => {
    const { isoToLocalParts } = await import('../../src/renderer/src/lib/meetWhen')
    expect(isoToLocalParts(null)).toEqual({ date: '', time: '' })
    expect(isoToLocalParts('nonsense')).toEqual({ date: '', time: '' })
  })
})
