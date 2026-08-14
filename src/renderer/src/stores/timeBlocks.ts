import { create } from 'zustand'
import type { TimeBlock, TimeBlockDraft, TimeBlockPatch } from '@shared/types'
import { recordAction, recordActionWithToast } from './actionHistory'
import { crdtEmitTimeBlock } from '../lib/crdtBridge'

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
  /** scope 'series' deletes this occurrence and all future ones in its series. */
  remove: (id: string, scope?: 'one' | 'series') => Promise<void>
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
    // Structural undo: creating a block (or a repeating series) reverses by
    // deleting it (scope 'series' also stops the materialiser regrowing it).
    recordAction({
      label: `Scheduled "${created.title || 'time block'}"`,
      undo: async () => {
        await window.api.timeBlocks.delete(created.id, created.seriesId ? 'series' : 'one')
        await get().reload()
      },
      redo: async () => {
        await window.api.timeBlocks.create(draft)
        await get().reload()
      }
    })
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
    // WS01 sync substrate (flagged, off by default): mirror start/duration/title/
    // status changes into the CRDT change log as LWW registers. Recurrence/series
    // edits + creation/deletion stay on the poll. No-op until the engine registers.
    crdtEmitTimeBlock(id, patch)
  },
  remove: async (id, scope = 'one') => {
    const existing = get().blocks.find((b) => b.id === id)
    await window.api.timeBlocks.delete(id, scope)
    await get().reload()
    if (!existing) return
    // Undo recreates the block from what we knew about it. A series delete
    // reverses into a fresh series with the same pattern (ids change, which
    // the calendar does not care about).
    recordActionWithToast({
      label: scope === 'series' ? `Deleted "${existing.title || 'block'}" series` : `Deleted "${existing.title || 'block'}"`,
      undo: async () => {
        await window.api.timeBlocks.create({
          taskId: existing.taskId,
          title: existing.title,
          startMs: existing.startMs,
          durationMin: existing.durationMin,
          meeting: existing.meeting ?? null,
          recurrence: scope === 'series' ? (existing.recurrence ?? null) : null
        })
        await get().reload()
      },
      redo: async () => {
        // Best effort: the recreated block has a new id, so redo removes the
        // block at the same start in the same series shape.
        const again = get().blocks.find(
          (b) => b.startMs === existing.startMs && b.title === existing.title
        )
        if (again) await window.api.timeBlocks.delete(again.id, scope)
        await get().reload()
      }
    })
  }
}))
