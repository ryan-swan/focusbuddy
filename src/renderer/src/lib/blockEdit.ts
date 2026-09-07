import type { TimeBlock, TimeBlockPatch } from '@shared/types'
import { useTimeBlockStore } from '../stores/timeBlocks'
import { useActionHistory } from '../stores/actionHistory'
import { fmtTimeRange } from './bookTime'

// DEC-129 — saving an edit to a booked block, with the house undo toast: the
// calendar grid's own path, extracted so a block edited from the Today widget
// (double-click → the same BookTimeDialog) gets the same toast, undo and redo.
export async function saveBlockEdit(prev: TimeBlock, patch: TimeBlockPatch): Promise<void> {
  const updateBlock = useTimeBlockStore.getState().update
  await updateBlock(prev.id, patch)
  useActionHistory.getState().recordWithToast({
    label: `Saved “${patch.title ?? prev.title}” · ${fmtTimeRange(
      patch.startMs ?? prev.startMs,
      patch.durationMin ?? prev.durationMin
    )}`,
    undo: async () => {
      await updateBlock(prev.id, {
        taskId: prev.taskId,
        title: prev.title,
        startMs: prev.startMs,
        durationMin: prev.durationMin,
        meeting: prev.meeting ?? null
      })
    },
    redo: async () => {
      await updateBlock(prev.id, patch)
    }
  })
}
