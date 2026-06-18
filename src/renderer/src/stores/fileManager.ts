import { create } from 'zustand'
import type { FileEntry } from '@shared/fields'

// State for the file/folder manager view. The current folder (cwd, null = root)
// drives the listing; view mode and sort are persisted so the manager opens the
// way the user left it. All mutations go through window.api.fileManager and then
// refresh, so the DB stays the single source of truth.

export type FileViewMode = 'list' | 'small' | 'large' | 'preview'
export type FileSortKey = 'name' | 'size' | 'type' | 'created' | 'modified'
export type SortDir = 'asc' | 'desc'

const PREFS_KEY = 'fb.files.prefs'

function readPrefs(): { viewMode: FileViewMode; sortKey: FileSortKey; sortDir: SortDir } {
  const fallback = { viewMode: 'list' as FileViewMode, sortKey: 'name' as FileSortKey, sortDir: 'asc' as SortDir }
  if (typeof localStorage === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    return raw ? { ...fallback, ...(JSON.parse(raw) as object) } : fallback
  } catch {
    return fallback
  }
}

function persistPrefs(p: { viewMode: FileViewMode; sortKey: FileSortKey; sortDir: SortDir }): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p))
  } catch {
    /* ignore */
  }
}

interface FileManagerStore {
  cwd: string | null
  crumbs: Array<{ id: string; name: string }>
  entries: FileEntry[]
  loading: boolean
  selectedId: string | null
  viewMode: FileViewMode
  sortKey: FileSortKey
  sortDir: SortDir

  refresh: () => Promise<void>
  openFolder: (id: string | null) => Promise<void>
  select: (id: string | null) => void
  setViewMode: (m: FileViewMode) => void
  setSort: (key: FileSortKey) => void

  createFolder: (name: string) => Promise<void>
  rename: (id: string, name: string) => Promise<void>
  move: (id: string, newParentId: string | null) => Promise<void>
  remove: (id: string) => Promise<void>
  importFiles: () => Promise<void>
  ingestBuffers: (files: Array<{ buffer: ArrayBuffer; originalName: string; mimeType: string }>) => Promise<void>
  fileExistingDocument: (docId: string) => Promise<void>
}

const prefs = readPrefs()

export const useFileManagerStore = create<FileManagerStore>((set, get) => ({
  cwd: null,
  crumbs: [],
  entries: [],
  loading: false,
  selectedId: null,
  viewMode: prefs.viewMode,
  sortKey: prefs.sortKey,
  sortDir: prefs.sortDir,

  refresh: async () => {
    const cwd = get().cwd
    set({ loading: true })
    const [entries, crumbs] = await Promise.all([
      window.api.fileManager.list(cwd),
      window.api.fileManager.path(cwd)
    ])
    set({ entries, crumbs, loading: false })
  },

  openFolder: async (id) => {
    set({ cwd: id, selectedId: null })
    await get().refresh()
  },

  select: (id) => set({ selectedId: id }),

  setViewMode: (m) => {
    set({ viewMode: m })
    persistPrefs({ viewMode: m, sortKey: get().sortKey, sortDir: get().sortDir })
  },

  setSort: (key) => {
    const { sortKey, sortDir } = get()
    const nextDir: SortDir = sortKey === key ? (sortDir === 'asc' ? 'desc' : 'asc') : 'asc'
    set({ sortKey: key, sortDir: nextDir })
    persistPrefs({ viewMode: get().viewMode, sortKey: key, sortDir: nextDir })
  },

  createFolder: async (name) => {
    await window.api.fileManager.createFolder(get().cwd, name)
    await get().refresh()
  },
  rename: async (id, name) => {
    await window.api.fileManager.rename(id, name)
    await get().refresh()
  },
  move: async (id, newParentId) => {
    const ok = await window.api.fileManager.move(id, newParentId)
    if (ok) await get().refresh()
  },
  remove: async (id) => {
    await window.api.fileManager.delete(id)
    set({ selectedId: null })
    await get().refresh()
  },
  importFiles: async () => {
    await window.api.fileManager.pickFiles(get().cwd)
    await get().refresh()
  },
  ingestBuffers: async (files) => {
    const cwd = get().cwd
    for (const f of files) {
      await window.api.files.ingestBuffer({ ...f, parentId: cwd })
    }
    await get().refresh()
  },
  fileExistingDocument: async (docId) => {
    await window.api.fileManager.fileDocument(docId, get().cwd)
    await get().refresh()
  }
}))

// Sort + always-folders-first comparator used by the view.
export function sortEntries(entries: FileEntry[], key: FileSortKey, dir: SortDir): FileEntry[] {
  const sign = dir === 'asc' ? 1 : -1
  const typeOf = (e: FileEntry): string => (e.kind === 'folder' ? '' : e.kind === 'doc' ? (e.docType ?? 'doc') : e.ext ?? '')
  return entries.slice().sort((a, b) => {
    // Folders always cluster above files/docs, regardless of sort direction.
    if ((a.kind === 'folder') !== (b.kind === 'folder')) return a.kind === 'folder' ? -1 : 1
    let cmp = 0
    switch (key) {
      case 'size':
        cmp = (a.sizeBytes ?? 0) - (b.sizeBytes ?? 0)
        break
      case 'type':
        cmp = typeOf(a).localeCompare(typeOf(b))
        break
      case 'created':
        cmp = a.createdAt - b.createdAt
        break
      case 'modified':
        cmp = a.updatedAt - b.updatedAt
        break
      default:
        cmp = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    }
    if (cmp === 0) cmp = a.name.localeCompare(b.name, undefined, { numeric: true })
    return cmp * sign
  })
}
