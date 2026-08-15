import { create } from 'zustand'
import type { FolderEntry } from '../lib/liveFolder'

// WS01 sync substrate — the materialised tree of a LIVE folder, per folder id.
//
// A live folder has no main-process table: its durable store is the CRDT change log
// on the signal server, replayed on join. So this renderer-only store IS the live
// folder's local copy while it is open. The flow is:
//
//   1. The view opens the folder → seed() lays down the frozen body_json BASELINE.
//   2. The sync engine joins `lfe:folder:<id>` → the server replays the change log,
//      and the engine applies each delta on top of the baseline via the apply* here.
//   3. A local edit optimistically updates here AND emits a CRDT event (see engine).
//
// The engine owns the LWW registers (name / parent) and only calls applyName /
// applyParent when a remote value wins, so these are dumb setters — exactly the
// contract every other type's store apply follows. Deletes are remove-wins: a
// tombstoned id is dropped and a late create for it is ignored (the engine guards
// creates against its own tombstone set too).

interface LiveFolderEntriesStore {
  // folderId → the live entries of that folder (order is not significant; the view
  // sorts via childrenOf). Absent until the folder is opened + seeded.
  entries: Record<string, FolderEntry[]>

  seed: (folderId: string, baseline: FolderEntry[]) => void
  clear: (folderId: string) => void
  applyCreate: (folderId: string, entry: FolderEntry) => void
  applyDelete: (folderId: string, entryId: string) => void
  applyName: (folderId: string, entryId: string, name: string) => void
  applyParent: (folderId: string, entryId: string, parentId: string | null) => void
}

export const useLiveFolderEntriesStore = create<LiveFolderEntriesStore>((set, get) => ({
  entries: {},

  seed: (folderId, baseline) => {
    // Only seed if not already populated by a live edit that raced the open, so a
    // reopen doesn't clobber deltas already applied. A fresh open starts empty.
    if (get().entries[folderId]) return
    set({ entries: { ...get().entries, [folderId]: baseline.map((e) => ({ ...e })) } })
  },

  clear: (folderId) => {
    const next = { ...get().entries }
    delete next[folderId]
    set({ entries: next })
  },

  applyCreate: (folderId, entry) => {
    const list = get().entries[folderId] ?? []
    if (list.some((e) => e.id === entry.id)) return // already present (echo/dup)
    set({ entries: { ...get().entries, [folderId]: [...list, { ...entry }] } })
  },

  applyDelete: (folderId, entryId) => {
    const list = get().entries[folderId]
    if (!list) return
    const filtered = list.filter((e) => e.id !== entryId)
    if (filtered.length === list.length) return
    set({ entries: { ...get().entries, [folderId]: filtered } })
  },

  applyName: (folderId, entryId, name) => {
    const list = get().entries[folderId]
    if (!list) return
    let changed = false
    const next = list.map((e) => {
      if (e.id !== entryId || e.name === name) return e
      changed = true
      return { ...e, name }
    })
    if (changed) set({ entries: { ...get().entries, [folderId]: next } })
  },

  applyParent: (folderId, entryId, parentId) => {
    const list = get().entries[folderId]
    if (!list) return
    let changed = false
    const next = list.map((e) => {
      if (e.id !== entryId || e.parentId === parentId) return e
      changed = true
      return { ...e, parentId }
    })
    if (changed) set({ entries: { ...get().entries, [folderId]: next } })
  }
}))

// Expose the materialised live-folder tree on window so e2e specs can assert
// convergence directly. A thin handle to the real store, not a mock.
if (typeof window !== 'undefined') {
  ;(window as unknown as { __fbLiveFolders?: typeof useLiveFolderEntriesStore }).__fbLiveFolders =
    useLiveFolderEntriesStore
}
