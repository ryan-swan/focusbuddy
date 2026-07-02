import type { ShareScope } from '@shared/types'

// The authorization a meeting grants its attendees on the artifact it was
// started from. When you launch a meeting from a document, sheet, deck, drawing,
// design or desk and add attendees, the artifact is shared with each of them at
// the level you pick here, so access "trickles down" from the meeting to its
// source. The three levels map onto the existing share model (scope + expiry):
//
//   view-once   a read-only link that expires shortly after the meeting, for
//               when someone should see the artifact for this meeting only.
//   view-always a read-only link that does not expire, for lasting view access.
//   collaborate a working copy the attendee can take into their own workspace
//               and edit (the "copy" scope), for people who will contribute.
//
// The model has no single-open semantic, so view-once is honestly a
// time-boxed view that expires after the meeting rather than after one open.
export type MeetingAccessLevel = 'view-once' | 'view-always' | 'collaborate'

export interface MeetingAccessOption {
  level: MeetingAccessLevel
  label: string
  hint: string
}

export const MEETING_ACCESS_OPTIONS: MeetingAccessOption[] = [
  { level: 'view-once', label: 'Allow view for this meeting', hint: 'Read-only, expires after the meeting.' },
  { level: 'view-always', label: 'Always allow view', hint: 'Read-only access that does not expire.' },
  { level: 'collaborate', label: 'Invite to collaborate', hint: 'They get an editable copy to work on.' }
]

// Resolve a level into the share scope + expiry to mint. `endsAtMs` is when the
// meeting is expected to end, used to time-box the view-once link (with a short
// grace window so a link clicked late still resolves).
export function accessToShare(
  level: MeetingAccessLevel,
  endsAtMs: number
): { scope: ShareScope; expiresAt: number | null } {
  switch (level) {
    case 'view-once':
      return { scope: 'view', expiresAt: endsAtMs + 60 * 60 * 1000 } // meeting end + 1h grace
    case 'view-always':
      return { scope: 'view', expiresAt: null }
    case 'collaborate':
      return { scope: 'copy', expiresAt: null }
  }
}
