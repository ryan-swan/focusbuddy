import { create } from 'zustand'
import type { KnowledgeEntry, KnowledgeDraft, KnowledgePatch } from '@shared/knowledge'

// PlexiBrain knowledge base store. Thin wrapper over the main-process store via
// IPC; the renderer holds the current list and writes through. Reads only real
// entries, never seeds samples, so an empty brain shows an honest empty state.

interface KnowledgeStore {
  entries: KnowledgeEntry[]
  loaded: boolean
  load: () => Promise<void>
  create: (draft: KnowledgeDraft) => Promise<KnowledgeEntry | null>
  update: (id: string, patch: KnowledgePatch) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useKnowledgeStore = create<KnowledgeStore>((set, get) => ({
  entries: [],
  loaded: false,
  load: async () => {
    const entries = await window.api.knowledge.list().catch(() => [] as KnowledgeEntry[])
    set({ entries, loaded: true })
  },
  create: async (draft) => {
    const entry = await window.api.knowledge.create(draft).catch(() => null)
    if (entry) await get().load()
    return entry
  },
  update: async (id, patch) => {
    await window.api.knowledge.update(id, patch).catch(() => null)
    await get().load()
  },
  remove: async (id) => {
    await window.api.knowledge.delete(id).catch(() => false)
    await get().load()
  }
}))
