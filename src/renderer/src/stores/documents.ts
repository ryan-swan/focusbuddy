import { create } from 'zustand'
import type { DocType, DocumentMeta, FbDocument } from '@shared/types'
import { pullCloudDocs, pushCloudDoc, pushCloudDelete } from '../lib/cloudDocsSync'

// Documents store — the standalone office files (doc / sheet / slides). Holds
// the list for the hub and the one open document for the editor. Body edits are
// debounced to disk so typing stays smooth and we never lose work.

let saveTimer: ReturnType<typeof setTimeout> | null = null

interface DocumentsStore {
  list: DocumentMeta[]
  active: FbDocument | null
  loadingList: boolean
  saving: boolean

  refresh: () => Promise<void>
  open: (id: string) => Promise<void>
  close: () => void
  createBlank: (docType: DocType) => Promise<FbDocument>
  createWithAI: (input: {
    docType: DocType
    prompt: string
    audience?: string
  }) => Promise<{ ok: boolean; id?: string; error?: string; needsApiKey?: boolean }>
  saveBody: (body: unknown) => void
  rename: (title: string) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useDocumentsStore = create<DocumentsStore>((set, get) => ({
  list: [],
  active: null,
  loadingList: false,
  saving: false,

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
    // Flush any pending body save before leaving the editor.
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
      const a = get().active
      if (a) void window.api.documents.update(a.id, { body: a.body })
    }
    set({ active: null })
  },

  createBlank: async (docType) => {
    const title =
      docType === 'doc'
        ? 'Untitled document'
        : docType === 'sheet'
          ? 'Untitled sheet'
          : docType === 'slides'
            ? 'Untitled deck'
            : 'Untitled map'
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
      await window.api.documents.update(cur.id, { body: cur.body })
      set({ saving: false })
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

  remove: async (id) => {
    await window.api.documents.delete(id)
    void pushCloudDelete(id).catch(() => {})
    if (get().active?.id === id) set({ active: null })
    await get().refresh()
  }
}))
