import { create } from 'zustand'
import type { PlexiApp, PlexiAppDraft, PlexiAppPatch } from '@shared/apps'

// PlexiBuild store. Thin wrapper over the main-process apps store via IPC. Reads
// only real apps; an empty workspace shows an honest empty state.

interface AppsStore {
  apps: PlexiApp[]
  loaded: boolean
  load: () => Promise<void>
  create: (draft: PlexiAppDraft) => Promise<PlexiApp | null>
  update: (id: string, patch: PlexiAppPatch) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useAppsStore = create<AppsStore>((set, get) => ({
  apps: [],
  loaded: false,
  load: async () => {
    const apps = await window.api.apps.list().catch(() => [] as PlexiApp[])
    set({ apps, loaded: true })
  },
  create: async (draft) => {
    const a = await window.api.apps.create(draft).catch(() => null)
    if (a) await get().load()
    return a
  },
  update: async (id, patch) => {
    await window.api.apps.update(id, patch).catch(() => null)
    await get().load()
  },
  remove: async (id) => {
    await window.api.apps.delete(id).catch(() => false)
    await get().load()
  }
}))
