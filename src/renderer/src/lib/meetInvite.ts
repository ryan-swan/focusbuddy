// DEC-063 — a Meet item reads as an INVITATION, not a task.
//
// The operator: "in the 'Meet' item queue, they shouldn't read as tasks, they
// should read as actual invites with the links to the meetings or the address
// for the in person meeting. Or the RSVP if it is for responding to."
//
// He ruled the pointing model (option 2) over "a Meet item IS a time block",
// and his own example decided it: an RSVP you owe is a meeting that is NOT on
// your calendar, so there is no block for it to be. The item therefore carries
// the meeting's own shape and links to a block only once something is
// scheduled.
//
// This module is the pure half — given an item, what does the invitation say?
// Kept separate from the row so the answer can be tested directly rather than
// inferred from rendered markup, and so the calendar, the queue and any future
// surface all read one definition.

import type { FbNode, MeetRsvp } from '@shared/types'

/** Where a meeting happens — the two are not mutually exclusive (hybrid). */
export interface MeetPlace {
  /** A join link, whoever hosts it. */
  url: string | null
  /** A physical address, room, or plain-language place. */
  location: string | null
}

export interface MeetInvite {
  startAtMs: number | null
  durationMin: number | null
  place: MeetPlace
  /** Emails of people outside Plexii. Internal people ride `mentions`. */
  attendees: string[]
  rsvp: MeetRsvp | null
  /**
   * True when this item has enough of a meeting to be worth showing AS one.
   * A bare "meet with Sam" — no time, no place, no answer owed — is still just
   * a note to yourself, and dressing it as an invitation would be a lie about
   * how much is known.
   */
  isInvite: boolean
  /** Somebody is waiting on an answer. The reason a Meet item interrupts. */
  awaitingRsvp: boolean
}

const clean = (v: string | null | undefined): string | null => {
  const t = (v ?? '').trim()
  return t.length > 0 ? t : null
}

/** Parse the stored attendee list. Tolerant: people paste, they do not format. */
export function parseAttendees(raw: string | null | undefined): string[] {
  return (raw ?? '')
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/**
 * A join URL only counts if it is one — a half-typed "zoom" is not a link, and
 * offering a dead "Join" button is worse than offering none.
 */
export function joinUrlOf(raw: string | null | undefined): string | null {
  const t = clean(raw)
  if (!t) return null
  try {
    const u = new URL(t)
    return u.protocol === 'https:' || u.protocol === 'http:' ? t : null
  } catch {
    return null
  }
}

/** The provider, read from the link rather than stored as a taxonomy. */
export function meetProviderLabel(url: string | null): string {
  if (!url) return 'Join'
  const h = (() => {
    try {
      return new URL(url).hostname.toLowerCase()
    } catch {
      return ''
    }
  })()
  if (h.includes('meet.google')) return 'Google Meet'
  if (h.includes('zoom')) return 'Zoom'
  if (h.includes('teams.microsoft') || h.includes('teams.live')) return 'Teams'
  if (h.includes('webex')) return 'Webex'
  if (h.includes('haptyx') || h.includes('plexi')) return 'Plexii'
  return 'Join'
}

export function meetingOf(item: FbNode): MeetInvite {
  const startMs = (() => {
    const t = clean(item.meetStartAt)
    if (!t) return null
    const ms = Date.parse(t)
    return Number.isFinite(ms) ? ms : null
  })()
  const url = joinUrlOf(item.meetUrl)
  const location = clean(item.meetLocation)
  const attendees = parseAttendees(item.meetAttendees)
  const rsvp = (item.meetRsvp ?? null) as MeetRsvp | null
  const awaitingRsvp = rsvp === 'needed'
  return {
    startAtMs: startMs,
    durationMin: item.meetDurationMin ?? null,
    place: { url, location },
    attendees,
    rsvp,
    isInvite: startMs !== null || url !== null || location !== null || rsvp !== null,
    awaitingRsvp
  }
}

/** Is this meeting already over? Used to stop offering "Join" for the past. */
export function meetingEnded(invite: MeetInvite, nowMs: number): boolean {
  if (invite.startAtMs === null) return false
  return invite.startAtMs + (invite.durationMin ?? 60) * 60_000 < nowMs
}

/**
 * The one-line "where" a row shows. Link first when both exist: a hybrid
 * meeting is one you can attend from here, and the address is the fallback for
 * the person who is walking.
 */
export function placeLabel(place: MeetPlace): string | null {
  if (place.url) return meetProviderLabel(place.url)
  return place.location
}
