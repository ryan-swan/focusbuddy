import { create } from 'zustand'
import type { DocType, DocumentMeta, FbDocument } from '@shared/types'
import { pullCloudDocs, pushCloudDoc, pushCloudDelete } from '../lib/cloudDocsSync'
import { recordActionWithToast } from './actionHistory'
import { useMessagingStore } from './messaging'

// Documents store — the standalone office files (doc / sheet / slides). Holds
// the list for the hub and the one open document for the editor. Body edits are
// debounced to disk so typing stays smooth and we never lose work.
//
// Deleting is a two-stage affair, mirroring Drive: remove() soft-deletes into
// the Documents Trash (undoable via the toast and recoverable from the Trash
// section any time after), and only purge() — the Trash view's "Delete
// forever" — actually destroys the row and tells the cloud to forget it.

let saveTimer: ReturnType<typeof setTimeout> | null = null

interface DocumentsStore {
  list: DocumentMeta[]
  trashed: DocumentMeta[]
  active: FbDocument | null
  loadingList: boolean
  saving: boolean
  // Set when the last debounced persist REJECTED. The editor shows an honest
  // "Couldn't save" banner instead of a stuck "Saving" and the in-memory edit
  // is retried on the next change. Cleared on the next successful write.
  saveError: boolean

  refresh: () => Promise<void>
  refreshTrashed: () => Promise<void>
  open: (id: string) => Promise<void>
  close: () => void
  createBlank: (docType: DocType, title?: string) => Promise<FbDocument>
  createWithAI: (input: {
    docType: DocType
    prompt: string
    audience?: string
  }) => Promise<{ ok: boolean; id?: string; error?: string; needsApiKey?: boolean }>
  /** Import a Visio .vsdx into a new map document (opens a file picker). */
  importMap: () => Promise<{ ok: boolean; id?: string; error?: string; canceled?: boolean }>
  saveBody: (body: unknown) => void
  rename: (title: string) => Promise<void>
  /** Move to the Documents Trash (restorable; surfaces an Undo toast). */
  remove: (id: string) => Promise<void>
  /** Bring a trashed document back into the live list. */
  restore: (id: string) => Promise<void>
  /** Delete forever, from the Trash view only. */
  purge: (id: string) => Promise<void>
}

export const useDocumentsStore = create<DocumentsStore>((set, get) => ({
  list: [],
  trashed: [],
  active: null,
  loadingList: false,
  saving: false,
  saveError: false,

  refresh: async () => {
    set({ loadingList: true })
    // Pull cloud changes first (no-op unless the flag is on + signed in), so the
    // list reflects edits made in the other app / on another device.
    await pullCloudDocs().catch(() => {})
    const list = await window.api.documents.list()
    set({ list, loadingList: false })
  },

  open: async (id) => {
    const doc = await window.api.documents.get(id)
    set({ active: doc })
  },

  close: () => {
    // Flush any pending body save before leaving the editor. A failure here is
    // logged (not swallowed) so a lost final buffer is at least diagnosable.
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
      const a = get().active
      if (a) {
        void window.api.documents.update(a.id, { body: a.body }).catch((err) => {
          // eslint-disable-next-line no-console
          console.error('[documents.close] final flush failed', err)
        })
      }
    }
    set({ active: null })
  },

  createBlank: async (docType, customTitle) => {
    const title =
      customTitle?.trim() ||
      (docType === 'doc'
        ? 'Untitled document'
        : docType === 'sheet'
          ? 'Untitled sheet'
          : docType === 'slides'
            ? 'Untitled deck'
            : docType === 'design'
              ? 'Untitled design'
              : 'Untitled map')
    const doc = await window.api.documents.create({ docType, title })
    void pushCloudDoc(doc).catch(() => {})
    await get().refresh()
    return doc
  },

  createWithAI: async (input) => {
    const r = await window.api.documents.generate(input)
    if (!r.ok) return { ok: false, error: r.error, needsApiKey: r.needsApiKey }
    const doc = await window.api.documents.create({
      docType: input.docType,
      title: r.title || 'Untitled',
      body: r.body as FbDocument['body']
    })
    void pushCloudDoc(doc).catch(() => {})
    await get().refresh()
    return { ok: true, id: doc.id }
  },

  importMap: async () => {
    const r = await window.api.map.import()
    // A cancelled picker returns ok:false with no error — surface that distinctly
    // from a real failure so the caller stays quiet rather than showing an error.
    if (!r.ok) return r.error ? { ok: false, error: r.error } : { ok: false, canceled: true }
    if (!r.body) return { ok: false, error: 'That Visio file had nothing to import.' }
    const doc = await window.api.documents.create({
      docType: 'map',
      title: r.title || 'Imported Visio diagram',
      body: r.body as FbDocument['body']
    })
    void pushCloudDoc(doc).catch(() => {})
    await get().refresh()
    return { ok: true, id: doc.id }
  },

  // Optimistic local update + debounced persist. The editor calls this on every
  // change; we coalesce writes to ~600ms of idle.
  saveBody: (body) => {
    const a = get().active
    if (!a) return
    set({ active: { ...a, body: body as FbDocument['body'] }, saving: true })
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(async () => {
      saveTimer = null
      const cur = get().active
      if (!cur || cur.id !== a.id) return
      try {
        await window.api.documents.update(cur.id, { body: cur.body })
        set({ saving: false, saveError: false })
      } catch (err) {
        // Never lose work silently: keep the in-memory edit, drop the stuck
        // "Saving" state, and flag the error so the editor shows a banner. The
        // next edit re-attempts the write.
        // eslint-disable-next-line no-console
        console.error('[documents.saveBody] persist failed', err)
        set({ saving: false, saveError: true })
        return
      }
      // Mirror to the cloud (no-op when the flag is off). On a rev conflict the
      // server copy wins and is reflected in the open editor.
      const { conflictedTo } = await pushCloudDoc(cur).catch(() => ({ conflictedTo: undefined }))
      if (conflictedTo && get().active?.id === conflictedTo.id) set({ active: conflictedTo })
    }, 600)
  },

  rename: async (title) => {
    const a = get().active
    if (!a) return
    const next = { ...a, title }
    set({ active: next })
    await window.api.documents.update(a.id, { title })
    void pushCloudDoc(next).catch(() => {})
    await get().refresh()
  },

  refreshTrashed: async () => {
    const trashed = await window.api.documents.listTrashed()
    set({ trashed })
  },

  remove: async (id) => {
    const meta = get().list.find((d) => d.id === id)
    await window.api.documents.delete(id)
    // No cloud delete here: the document is only in the local Trash. The cloud
    // copy is forgotten when (and only when) the user purges it.
    // Best-effort archive of this doc's chat channel (un-archives if restored+reopened).
    void useMessagingStore.getState().archiveObjectChannel('document', id)
    if (get().active?.id === id) set({ active: null })
    await Promise.all([get().refresh(), get().refreshTrashed()])
    recordActionWithToast({
      label: `Moved "${meta?.title ?? 'document'}" to trash`,
      undo: async () => {
        await window.api.documents.restore(id)
        await Promise.all([get().refresh(), get().refreshTrashed()])
      },
      redo: async () => {
        await window.api.documents.delete(id)
        if (get().active?.id === id) set({ active: null })
        await Promise.all([get().refresh(), get().refreshTrashed()])
      }
    })
  },

  restore: async (id) => {
    await window.api.documents.restore(id)
    await Promise.all([get().refresh(), get().refreshTrashed()])
  },

  purge: async (id) => {
    await window.api.documents.purge(id)
    void pushCloudDelete(id).catch(() => {})
    await get().refreshTrashed()
  }
}))
