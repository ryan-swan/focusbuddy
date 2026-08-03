import { create } from 'zustand'
import type { FbFile } from '@shared/fields'

// Object-URL cache so we can render the same file in multiple widgets without
// re-reading the bytes per render. Cleared on file delete.
const objectUrlCache = new Map<string, string>()

// Thumbnail cache. Key = `${fileId}:${size}`. Value = data: URL ready to drop
// into an <img src>. QuickLook generation is ~50-300ms per file, so caching
// across re-renders is required for a smooth canvas.
const thumbnailCache = new Map<string, string>()
const inFlightThumbs = new Map<string, Promise<string | null>>()

interface FilesStore {
  files: Record<string, FbFile>
  // In-flight ingest tracking for UI affordances.
  uploading: number
  ensureLoaded: (id: string) => Promise<FbFile | null>
  ingestPath: (path: string) => Promise<FbFile>
  ingestBlob: (blob: File | Blob, originalName: string) => Promise<FbFile>
  pickAndIngest: (opts?: { title?: string }) => Promise<FbFile | null>
  remove: (id: string) => Promise<void>
  // Returns a blob: URL for the file's bytes. Cached for re-use; safe to call
  // repeatedly. The URL is revoked when the file is deleted.
  blobUrl: (id: string) => Promise<string | null>
  // Returns a data: URL of a QuickLook PNG thumbnail. Cached across renders.
  // Returns null if the OS can't preview this file.
  thumbnail: (id: string, size?: number) => Promise<string | null>
  // Open a locally ingested file in its default app.
  openLocal: (id: string) => Promise<{ ok: true } | { ok: false; error: string }>
  // Open a cloud URL in the default browser.
  openExternal: (
    url: string
  ) => Promise<{ ok: true } | { ok: false; error: string }>
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
  // Drop any thumbnail variants too — cheap, key prefix match.
  for (const key of Array.from(thumbnailCache.keys())) {
    if (key.startsWith(`${id}:`)) thumbnailCache.delete(key)
  }
}

async function fetchThumbnail(id: string, size: number): Promise<string | null> {
  const cacheKey = `${id}:${size}`
  const cached = thumbnailCache.get(cacheKey)
  if (cached) return cached
  const existing = inFlightThumbs.get(cacheKey)
  if (existing) return existing
  const p = (async (): Promise<string | null> => {
    const result = await window.api.files.thumbnail(id, { size })
    if (!result) return null
    const dataUrl = `data:${result.mimeType};base64,${result.base64}`
    thumbnailCache.set(cacheKey, dataUrl)
    return dataUrl
  })().finally(() => {
    inFlightThumbs.delete(cacheKey)
  })
  inFlightThumbs.set(cacheKey, p)
  return p
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
  pickAndIngest: async (opts) => {
    set({ uploading: get().uploading + 1 })
    try {
      const file = await window.api.files.pickAndIngest(opts)
      if (file) {
        set({ files: { ...get().files, [file.id]: file } })
      }
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
  blobUrl: async (id) => blobUrlForFile(id),
  thumbnail: async (id, size = 512) => fetchThumbnail(id, size),
  openLocal: async (id) => window.api.files.open(id),
  openExternal: async (url) => window.api.files.openExternal(url)
}))
