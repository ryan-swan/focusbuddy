import { create } from 'zustand'
import type { WidgetLink } from '@shared/types'

// Spatial-link store. Mirrors the widgets store's per-task lifecycle:
// loadForTask wipes + fetches; clear empties on task switch. Optimistic
// updates so the SVG overlay redraws immediately without waiting for IPC.

interface LinksStore {
  links: WidgetLink[]
  loadingFor: string | null
  loadForTask: (taskId: string) => Promise<void>
  clear: () => void
  // Create a directed link from source → target. Returns the created link
  // (or the existing one if a same-direction duplicate is rejected).
  create: (sourceId: string, targetId: string, taskId: string) => Promise<WidgetLink | null>
  remove: (id: string) => Promise<void>
  // Drop every link that references a widget id — called when a widget is
  // deleted. The DB cascade handles the persistence side; this just keeps
  // the local store in sync so the SVG layer doesn't render dangling lines
  // until the next loadForTask.
  pruneByWidget: (widgetId: string) => void
}

export const useLinksStore = create<LinksStore>((set, get) => ({
  links: [],
  loadingFor: null,
  loadForTask: async (taskId) => {
    set({ loadingFor: taskId, links: [] })
    const links = await window.api.widgetLinks.listByTask(taskId)
    // Guard against a second loadForTask kicking off while this one was
    // mid-flight — only commit if our taskId is still the one being loaded.
    if (get().loadingFor === taskId) {
      set({ links, loadingFor: null })
    }
  },
  clear: () => set({ links: [], loadingFor: null }),
  create: async (sourceId, targetId, taskId) => {
    if (sourceId === targetId) return null
    const created = await window.api.widgetLinks.create(sourceId, targetId, taskId)
    if (!created) return null
    // Skip if we already have this link (e.g. server returned the existing
    // row because of UNIQUE conflict). Compare by id, not by endpoints —
    // the server is the source of truth for the canonical row.
    if (get().links.some((l) => l.id === created.id)) return created
    set({ links: [...get().links, created] })
    return created
  },
  remove: async (id) => {
    // Optimistic — remove locally first so the line disappears immediately.
    set({ links: get().links.filter((l) => l.id !== id) })
    await window.api.widgetLinks.delete(id)
  },
  pruneByWidget: (widgetId) => {
    set({
      links: get().links.filter(
        (l) => l.sourceWidgetId !== widgetId && l.targetWidgetId !== widgetId
      )
    })
  }
}))
