import { useEffect, useState } from 'react'
import type { DocType } from '@shared/types'

// A tiny shared cache of office-document metadata (title + type) keyed by id, so
// that many small surfaces which only need to render a document's name and icon
// (table doc-ref chips, doc-embed cards, search rows) resolve from one fetch
// instead of each calling documents.list(). It refreshes on a short TTL and can
// be primed synchronously when a caller already has fresh metadata in hand.

export interface DocMeta {
  title: string
  docType: DocType
}

// Drag MIME for a PlexiOffice document, carrying a JSON {id,docType,title} so a
// drop target (a table cell, a doc-embed slot) can reference it and render its
// chip immediately without a fetch. Set by any surface that shows a document
// (Documents list, Files/Drive doc entries).
export const DOC_DRAG_MIME = 'application/x-fb-document'

export interface DocDragPayload {
  id: string
  docType: DocType
  title: string
}

export function setDocDrag(e: { dataTransfer: DataTransfer | null }, doc: DocDragPayload): void {
  if (!e.dataTransfer) return
  e.dataTransfer.setData(DOC_DRAG_MIME, JSON.stringify(doc))
  e.dataTransfer.setData('text/plain', doc.title)
  e.dataTransfer.effectAllowed = 'copyLink'
}

export function readDocDrag(dt: DataTransfer | null): DocDragPayload | null {
  if (!dt) return null
  const raw = dt.getData(DOC_DRAG_MIME)
  if (!raw) return null
  try {
    const p = JSON.parse(raw) as DocDragPayload
    return p && typeof p.id === 'string' ? p : null
  } catch {
    return null
  }
}

const cache = new Map<string, DocMeta>()
let loadedAt = 0
let inflight: Promise<void> | null = null
const TTL_MS = 8000
const listeners = new Set<() => void>()

function notify(): void {
  for (const l of listeners) l()
}

export function getDocMeta(id: string): DocMeta | undefined {
  return cache.get(id)
}

// Seed the cache with metadata the caller already knows (e.g. straight from a
// picker), so a freshly-referenced document renders immediately.
export function primeDocMeta(id: string, meta: DocMeta): void {
  cache.set(id, meta)
  notify()
}

export async function ensureDocMetaLoaded(force = false): Promise<void> {
  if (!force && inflight) return inflight
  inflight = (async () => {
    try {
      const docs = await window.api.documents.list()
      cache.clear()
      for (const d of docs) cache.set(d.id, { title: d.title, docType: d.docType })
      loadedAt = performance.now()
    } finally {
      inflight = null
      notify()
    }
  })()
  return inflight
}

// React hook: ensures the cache is warm and re-renders when it updates. Returns
// a resolver for the given ids.
export function useDocMetas(ids: string[]): Record<string, DocMeta> {
  const [, setTick] = useState(0)
  useEffect(() => {
    const bump = (): void => setTick((t) => t + 1)
    listeners.add(bump)
    const stale = loadedAt === 0 || performance.now() - loadedAt > TTL_MS
    if (stale) void ensureDocMetaLoaded()
    return () => {
      listeners.delete(bump)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const out: Record<string, DocMeta> = {}
  for (const id of ids) {
    const m = cache.get(id)
    if (m) out[id] = m
  }
  return out
}
