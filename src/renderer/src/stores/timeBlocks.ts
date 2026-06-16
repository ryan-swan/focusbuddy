import { create } from 'zustand'
import type { TimeBlock, TimeBlockDraft, TimeBlockPatch } from '@shared/types'

// Calendar time blocks for the currently-viewed range. The view sets the range
// (a week / a day); the store loads the blocks that overlap it and keeps an
// in-memory copy that create/update/remove patch optimistically-ish (we trust
// the main process result and replace).

interface TimeBlockStore {
  blocks: TimeBlock[]
  rangeFrom: number | null
  rangeTo: number | null
  loadRange: (fromMs: number, toMs: number) => Promise<void>
  reload: () => Promise<void>
  create: (draft: TimeBlockDraft) => Promise<TimeBlock>
  update: (id: string, patch: TimeBlockPatch) => Promise<void>
  remove: (id: string) => Promise<void>
}

// A block is in the loaded window if it overlaps [from, to).
function overlaps(b: TimeBlock, from: number, to: number): boolean {
  return b.startMs < to && b.startMs + b.durationMin * 60000 > from
}

export const useTimeBlockStore = create<TimeBlockStore>((set, get) => ({
  blocks: [],
  rangeFrom: null,
  rangeTo: null,
  loadRange: async (fromMs, toMs) => {
    const blocks = await window.api.timeBlocks.list(fromMs, toMs)
    set({ blocks, rangeFrom: fromMs, rangeTo: toMs })
  },
  reload: async () => {
    const { rangeFrom, rangeTo } = get()
    if (rangeFrom == null || rangeTo == null) return
    const blocks = await window.api.timeBlocks.list(rangeFrom, rangeTo)
    set({ blocks })
  },
  create: async (draft) => {
    const created = await window.api.timeBlocks.create(draft)
    const { rangeFrom, rangeTo, blocks } = get()
    if (rangeFrom != null && rangeTo != null && overlaps(created, rangeFrom, rangeTo)) {
      set({ blocks: [...blocks, created].sort((a, b) => a.startMs - b.startMs) })
    }
    return created
  },
  update: async (id, patch) => {
    const updated = await window.api.timeBlocks.update(id, patch)
    if (!updated) return
    const { rangeFrom, rangeTo, blocks } = get()
    const stillInRange =
      rangeFrom != null && rangeTo != null && overlaps(updated, rangeFrom, rangeTo)
    const next = blocks.filter((b) => b.id !== id)
    if (stillInRange) next.push(updated)
    set({ blocks: next.sort((a, b) => a.startMs - b.startMs) })
  },
  remove: async (id) => {
    await window.api.timeBlocks.delete(id)
    set({ blocks: get().blocks.filter((b) => b.id !== id) })
  }
}))
