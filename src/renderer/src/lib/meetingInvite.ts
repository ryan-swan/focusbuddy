// Sends the join details for a scheduled meeting to its invitees over the user's
// connected mailbox. This is the "sent out to invitees" half of a calendar
// meeting: each invitee gets an email with the time and a link that opens the
// room in PlexiDesk. If no mailbox is connected we say so honestly rather than
// pretending the invites went out.

export interface MeetingInviteResult {
  sent: number
  failed: string[]
  noAccount: boolean
}

// The deep link that opens (or joins) the meeting room in the desktop app. The
// same link is used by the host's calendar "Join" button and by every invitee.
export function meetingJoinLink(roomId: string): string {
  return `haptyx://meet?room=${encodeURIComponent(roomId)}`
}

function fmtWhen(startMs: number): string {
  try {
    return new Date(startMs).toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
  } catch {
    return new Date(startMs).toString()
  }
}

export async function sendMeetingInvites(input: {
  title: string
  startMs: number
  durationMin: number
  roomId: string
  invitees: string[]
  hostName?: string
}): Promise<MeetingInviteResult> {
  const to = input.invitees.map((e) => e.trim().toLowerCase()).filter((e) => e.includes('@'))
  if (to.length === 0) return { sent: 0, failed: [], noAccount: false }

  const link = meetingJoinLink(input.roomId)
  const when = fmtWhen(input.startMs)
  const host = input.hostName?.trim()
  const body = [
    `${host ? `${host} has invited you to a meeting.` : 'You have been invited to a meeting.'}`,
    '',
    `What: ${input.title}`,
    `When: ${when} (${input.durationMin} min)`,
    '',
    `Join the meeting in PlexiDesk: ${link}`,
    '',
    'Open the link on a device with PlexiDesk installed to join at the scheduled time.'
  ].join('\n')

  const failed: string[] = []
  let sent = 0
  let noAccount = false
  for (const addr of to) {
    const res = await window.api.mail.send({
      to: [addr],
      subject: `Meeting invitation: ${input.title}`,
      text: body
    })
    if (res.ok) {
      sent += 1
    } else {
      failed.push(addr)
      // A missing mailbox is the same for every recipient — record it once so
      // the UI can tell the user to connect mail rather than listing failures.
      if (/no mail account/i.test(res.error)) noAccount = true
    }
  }
  return { sent, failed, noAccount }
}
