// Q14, the delivery half — briefs for the OTHER attendees.
//
// The blocker this round closes: the wrap-up runs on the host's machine
// after everyone has left, and the meetingSignal relay dies with the room.
// The out-of-room channel was in the house all along: PlexiChat DMs are
// server-persisted and delivered live or on next open — the same channel
// "record a message for a teammate who is away" already trusts.
//
// The brief travels as a READABLE message (prose first, one plexii://brief
// marker as the last line), so an attendee on an old client still gets a
// useful DM — the machine layer degrades to prose, never to noise. Sending
// is gated by the HOST's per-series shareBriefs knob (default OFF — sending
// is its own act, the SPEC-027 doctrine); FILING on the other side is gated
// by the RECIPIENT's own followBriefs choice (briefInbox.ts). Both sides
// sovereign.

import { startDm, sendMessage } from './messagingClient'
import { useMessagingStore } from '../stores/messaging'
import { buildBriefMessage } from './meetingLink'

export interface BriefAttendee {
  accountId: string
  handle: string
}

/** Send the brief DM to each attendee. Best-effort per recipient — one
 *  failed handle never blocks the rest. Returns how many were sent. */
export async function sendBriefsToAttendees(input: {
  seriesId: string
  meetingId: string
  title: string
  summary: string
  attendees: BriefAttendee[]
  selfAccountId: string | null
}): Promise<number> {
  const token = useMessagingStore.getState().token
  if (!token) return 0
  const body = buildBriefMessage({
    title: input.title,
    summary: input.summary,
    seriesId: input.seriesId,
    meetingId: input.meetingId
  })
  let sent = 0
  for (const a of input.attendees) {
    if (!a.handle || a.accountId === input.selfAccountId) continue
    try {
      // messagingClient directly — the STORE's startDm would also switch the
      // user's open conversation, and the wrap-up must not hijack their chat.
      const convId = await startDm(token, a.handle)
      if (!convId) continue
      const msg = await sendMessage(token, convId, body)
      if (msg) sent += 1
    } catch {
      /* one unreachable attendee is their loss of one brief, not an error */
    }
  }
  return sent
}
