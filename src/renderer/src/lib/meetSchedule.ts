// DEC-068 — putting a Meet item on the calendar.
//
// DEC-063 chose the pointing model: an item carries the meeting's shape and
// links to a block only once something is actually scheduled. This is that
// link, and it is one-directional by design — the item is the record of the
// meeting, the block is a reservation of time for it.
//
// The link itself already existed and needed nothing new: `TimeBlock.taskId`
// points at a node, and work items ARE nodes (ARCHITECTURE §2.2), which is the
// same association the calendar's drag-to-schedule has always written. What was
// missing was the translation — turning what the item knows into what a block
// needs — and that is pure, so it is here rather than in a click handler.

import type { FbNode, TimeBlockDraft, TimeBlockMeeting } from '@shared/types'
import { meetingOf, parseAttendees } from './meetInvite'

/** How long a meeting runs when nobody said. Deliberately not zero-length. */
export const DEFAULT_MEET_MIN = 30

export interface ScheduleRefusal {
  ok: false
  /** Said in the words the surface can show the person, not an error code. */
  reason: string
}
export interface ScheduleReady {
  ok: true
  draft: TimeBlockDraft
}
export type ScheduleOutcome = ScheduleReady | ScheduleRefusal

/**
 * Turn a Meet item into the block that would hold it.
 *
 * Refuses rather than guesses. A meeting with no start time is exactly the case
 * DEC-063 exists to represent — an invitation you have not answered yet — and
 * inventing a time for it would put something on the calendar that nobody
 * agreed to. The caller shows the refusal; it never silently does nothing.
 */
export function blockDraftForMeeting(
  item: FbNode,
  roomIdFor: () => string
): ScheduleOutcome {
  const invite = meetingOf(item)
  if (invite.startAtMs === null) {
    return { ok: false, reason: 'Give it a date and time first — a meeting with no start has nothing to reserve.' }
  }

  // The block carries the meeting so the calendar can show a Join button and an
  // address without reading back through the item. A room id is always minted:
  // it costs nothing, and it means an in-person meeting can still be joined
  // remotely without editing anything (the same rule the composer follows).
  const meeting: TimeBlockMeeting = {
    roomId: roomIdFor(),
    invitees: parseAttendees(item.meetAttendees),
    joinUrl: invite.place.url,
    location: invite.place.location
  }

  return {
    ok: true,
    draft: {
      taskId: item.id,
      title: item.title ?? 'Meeting',
      startMs: invite.startAtMs,
      durationMin: invite.durationMin ?? DEFAULT_MEET_MIN,
      meeting,
      // A person put this on the calendar, so the planner may not move it.
      // 'auto' is reserved for blocks the planner placed itself.
      origin: 'manual'
    }
  }
}

/**
 * Does a block already hold this item? The queue and the editor both need to
 * know, so the question is asked once here.
 *
 * Matched on taskId rather than on time: a block the user has since dragged
 * elsewhere is still THIS meeting's block, and offering to schedule it again
 * would quietly create a duplicate.
 */
export function blockForItem<T extends { taskId: string | null }>(
  blocks: readonly T[],
  itemId: string
): T | null {
  return blocks.find((b) => b.taskId === itemId) ?? null
}
