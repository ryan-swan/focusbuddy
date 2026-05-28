import { create } from 'zustand'
import type { FbFile } from '@shared/fields'

// Object-URL cache so we can render the same file in multiple widgets without
// re-reading the bytes per render. Cleared on file delete.
const objectUrlCache = new Map<string, string>()

interface FilesStore {
  files: Record<string, FbFile>
  // In-flight ingest tracking for UI affordances.
  uploading: number
  ensureLoaded: (id: string) => Promise<FbFile | null>
  ingestPath: (path: string) => Promise<FbFile>
  ingestBlob: (blob: File | Blob, originalName: string) => Promise<FbFile>
  remove: (id: string) => Promise<void>
  // Returns a blob: URL for the file's bytes. Cached for re-use; safe to call
  // repeatedly. The URL is revoked when the file is deleted.
  blobUrl: (id: string) => Promise<string | null>
}

async function blobUrlForFile(id: string): Promise<string | null> {
  const cached = objectUrlCache.get(id)
  if (cached) return cached
  const result = await window.api.files.read(id)
  if (!result) return null
  const blob = new Blob([result.buffer], { type: result.mimeType })
  const url = URL.createObjectURL(blob)
  objectUrlCache.set(id, url)
  return url
}

function revokeCached(id: string): void {
  const url = objectUrlCache.get(id)
  if (url) {
    URL.revokeObjectURL(url)
    objectUrlCache.delete(id)
  }
}

export const useFilesStore = create<FilesStore>((set, get) => ({
  files: {},
  uploading: 0,
  ensureLoaded: async (id) => {
    const existing = get().files[id]
    if (existing) return existing
    const fetched = await window.api.files.get(id)
    if (fetched) {
      set({ files: { ...get().files, [id]: fetched } })
    }
    return fetched
  },
  ingestPath: async (path) => {
    set({ uploading: get().uploading + 1 })
    try {
      const file = await window.api.files.ingestPath(path)
      set({ files: { ...get().files, [file.id]: file } })
      return file
    } finally {
      set({ uploading: Math.max(0, get().uploading - 1) })
    }
  },
  ingestBlob: async (blob, originalName) => {
    set({ uploading: get().uploading + 1 })
    try {
      const buffer = await blob.arrayBuffer()
      const file = await window.api.files.ingestBuffer({
        buffer,
        originalName,
        mimeType: blob.type || 'application/octet-stream'
      })
      set({ files: { ...get().files, [file.id]: file } })
      return file
    } finally {
      set({ uploading: Math.max(0, get().uploading - 1) })
    }
  },
  remove: async (id) => {
    await window.api.files.delete(id)
    revokeCached(id)
    const next = { ...get().files }
    delete next[id]
    set({ files: next })
  },
  blobUrl: async (id) => {
    return blobUrlForFile(id)
  }
}))
