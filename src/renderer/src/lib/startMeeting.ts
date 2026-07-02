import { useViewStore } from '../stores/view'
import { useMeetingRoomStore } from '../stores/meetingRoom'

// One launcher for starting a meeting from anywhere in the app — a document, a
// sheet, a slide deck, a drawing, a design, a chat, a desk, or the calendar.
// Every surface calls launchMeeting() so the behaviour is identical no matter
// where it starts from: navigate to the meeting view and open a live room.
//
// The origin is remembered so the end-of-meeting wrap-up can suggest a logical
// place to save what comes out of the conversation. A meeting started from a
// desk defaults its transcript and follow-ups to that desk's folder; one started
// from a document defaults near that document. The origin is advisory — the user
// always confirms where things land — so it is fine for it to be absent.

export type MeetingOrigin =
  | { kind: 'doc'; id: string; title: string }
  | { kind: 'sheet'; id: string; title: string }
  | { kind: 'slides'; id: string; title: string }
  | { kind: 'draw'; id: string; title: string }
  | { kind: 'design'; id: string; title: string }
  | { kind: 'chat'; channelId: string; title: string }
  | { kind: 'desk'; nodeId: string; title: string }
  | { kind: 'calendar'; title: string }
  | { kind: 'standalone'; title: string }

let currentOrigin: MeetingOrigin | null = null

export function getMeetingOrigin(): MeetingOrigin | null {
  return currentOrigin
}

// Cleared by the wrap-up flow once it has read the origin, so a later meeting
// started from a plain "Start a meeting" button does not inherit a stale source.
export function clearMeetingOrigin(): void {
  currentOrigin = null
}

// Launch a live meeting. `title` names the room (falls back to the origin's
// title, then a generic label). Returns the room id, or null if a room could
// not be opened (for example the user is already in a meeting).
export async function launchMeeting(origin?: MeetingOrigin): Promise<string | null> {
  currentOrigin = origin ?? { kind: 'standalone', title: 'Meeting' }
  const title = origin?.title?.trim() || 'Meeting'
  useViewStore.getState().goMeetings()
  return useMeetingRoomStore.getState().start(title)
}

// Join a specific, already-known room — the host and every invitee of a
// scheduled calendar meeting open the SAME room id, so this is what the "Join"
// button on a calendar meeting and the haptyx://meet?room= deep link both call.
export async function joinMeetingRoom(roomId: string, title?: string): Promise<void> {
  currentOrigin = { kind: 'calendar', title: title || 'Meeting' }
  useViewStore.getState().goMeetings()
  await useMeetingRoomStore.getState().join(roomId, title || 'Meeting')
}

// A fresh room id for a scheduled meeting, matching the live-room format so the
// same id is valid whether the room is opened now or later.
export function newMeetingRoomId(): string {
  const rand = (): string =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
  return `meet-${rand()}-${rand()}`
}
