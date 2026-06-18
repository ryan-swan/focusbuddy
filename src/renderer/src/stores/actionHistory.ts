import { create } from 'zustand'

// One unified undo/redo timeline for structural workspace actions — creating,
// deleting, moving, renaming, resizing, recolouring, linking tasks, folders and
// widgets. It is deliberately SEPARATE from text editing (inputs, the doc/sheet/
// slides/files editors keep their own per-character undo) and from irreversible
// outbound actions (sending mail/chat), which use confirms instead.
//
// Each entry carries its own inverse (undo) and replay (redo) as closures, so
// the stores that mutate via IPC just describe how to reverse themselves. Undo
// runs the inverse and pushes the entry onto the redo stack; a fresh action
// clears redo. A short label drives the "Undid X" / "Deleted — Undo" toast.

export interface HistoryEntry {
  label: string
  undo: () => Promise<void> | void
  redo: () => Promise<void> | void
}

interface ActionHistoryStore {
  past: HistoryEntry[]
  future: HistoryEntry[]
  busy: boolean
  toast: { kind: 'undo' | 'redo' | 'action'; label: string; entry?: HistoryEntry } | null

  record: (entry: HistoryEntry) => void
  /** Record an action AND surface a toast offering to undo it (for deletes). */
  recordWithToast: (entry: HistoryEntry) => void
  undo: () => Promise<void>
  redo: () => Promise<void>
  clear: () => void
  dismissToast: () => void
}

const MAX = 100

export const useActionHistory = create<ActionHistoryStore>((set, get) => ({
  past: [],
  future: [],
  busy: false,
  toast: null,

  record: (entry) => {
    set({ past: [...get().past, entry].slice(-MAX), future: [] })
  },

  recordWithToast: (entry) => {
    set({
      past: [...get().past, entry].slice(-MAX),
      future: [],
      toast: { kind: 'action', label: entry.label, entry }
    })
  },

  undo: async () => {
    if (get().busy) return
    const past = get().past
    const entry = past[past.length - 1]
    if (!entry) return
    set({ busy: true, past: past.slice(0, -1) })
    try {
      await entry.undo()
      set({ future: [...get().future, entry], toast: { kind: 'undo', label: entry.label } })
    } finally {
      set({ busy: false })
    }
  },

  redo: async () => {
    if (get().busy) return
    const future = get().future
    const entry = future[future.length - 1]
    if (!entry) return
    set({ busy: true, future: future.slice(0, -1) })
    try {
      await entry.redo()
      set({ past: [...get().past, entry], toast: { kind: 'redo', label: entry.label } })
    } finally {
      set({ busy: false })
    }
  },

  clear: () => set({ past: [], future: [], toast: null }),
  dismissToast: () => set({ toast: null })
}))

// Convenience for stores: push an inverse action onto the timeline.
export function recordAction(entry: HistoryEntry): void {
  useActionHistory.getState().record(entry)
}
export function recordActionWithToast(entry: HistoryEntry): void {
  useActionHistory.getState().recordWithToast(entry)
}
