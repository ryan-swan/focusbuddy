import type { TimeBlock, TimeBlockDraft } from '@shared/types'
import { useTimeBlockStore } from '../stores/timeBlocks'
import { useActionHistory } from '../stores/actionHistory'
import { fmtTimeRange, scheduleInviteHold, HOLD_INVITES_MS, type InviteHold } from './bookTime'

// DEC-131 — booking a block from the Book-time dialog, with the house undo
// toast and the invite hold: the calendar grid's own path, extracted so the
// assistant's Calendar tab (a day picked on its month view) books exactly the
// way the Calendar page does. The dialog closes FIRST (the caller's job), the
// block is created, and the stated hold means outbound invites wait a window
// Undo can cancel. Nothing sends today (CR-08/CR-09 — no outbound path, no
// hosted links); the expiry callback is the future send site.
export async function bookBlockWithToast(draft: TimeBlockDraft): Promise<TimeBlock> {
  const { create: createBlock, remove: removeBlock } = useTimeBlockStore.getState()
  const block = await createBlock(draft)
  const meeting = draft.meeting ?? null
  const hold: InviteHold | null =
    meeting && meeting.invitees.length > 0
      ? scheduleInviteHold(() => {
          /* future: sendMeetingInvites(...) — deliberately silent */
        }, HOLD_INVITES_MS)
      : null
  const verb = meeting ? 'Scheduled' : 'Booked'
  useActionHistory.getState().recordWithToast({
    label: `${verb} “${draft.title || 'Focus'}” · ${fmtTimeRange(draft.startMs, draft.durationMin)}${
      hold ? ` · invites hold ${HOLD_INVITES_MS / 1000}s` : ''
    }`,
    undo: async () => {
      hold?.cancel()
      await removeBlock(block.id)
    },
    redo: async () => {
      await createBlock(draft)
    }
  })
  return block
}
