import { create } from 'zustand'
import type { DashboardCardKind } from '@shared/types'

// Per-dashboard layouts. Each dashboard has a list of card IDs in render order.
// Keyed by 'home' (master dashboard) or a project node id.

export const DEFAULT_LAYOUT: DashboardCardKind[] = [
  'quick-start',
  'stats',
  'today-tasks',
  'folders',
  'recent-activity'
  // 'garden' deprecated — left in the type union for backward compatibility with
  // existing user layouts but removed from default + palette in Dashboard.tsx
]

interface LayoutStore {
  // dashboardKey → ordered card list. null = not loaded yet (we'll fall back to default)
  layouts: Record<string, DashboardCardKind[] | null>
  loadingKeys: Set<string>
  // Fetch and cache the layout for the given dashboard
  load: (key: string) => Promise<void>
  // Get the cached layout (or default if missing/not-yet-loaded)
  get: (key: string) => DashboardCardKind[]
  // Persist a new layout and update local cache
  set: (key: string, cardIds: DashboardCardKind[]) => Promise<void>
  // Wipe the user's custom layout and restore default
  reset: (key: string) => Promise<void>
}

export const useDashboardLayoutStore = create<LayoutStore>((set, get) => ({
  layouts: {},
  loadingKeys: new Set(),
  load: async (key) => {
    if (get().loadingKeys.has(key)) return
    if (get().layouts[key] !== undefined) return // already loaded (might be null = "use default")
    const nextLoading = new Set(get().loadingKeys)
    nextLoading.add(key)
    set({ loadingKeys: nextLoading })
    try {
      const stored = await window.api.dashboard.getLayout(key)
      set({
        layouts: {
          ...get().layouts,
          [key]: stored?.cardIds ?? null
        }
      })
    } finally {
      const after = new Set(get().loadingKeys)
      after.delete(key)
      set({ loadingKeys: after })
    }
  },
  get: (key) => {
    const cached = get().layouts[key]
    if (cached && cached.length > 0) return cached
    return DEFAULT_LAYOUT
  },
  set: async (key, cardIds) => {
    set({ layouts: { ...get().layouts, [key]: cardIds } })
    await window.api.dashboard.setLayout(key, cardIds)
  },
  reset: async (key) => {
    set({ layouts: { ...get().layouts, [key]: null } })
    await window.api.dashboard.resetLayout(key)
  }
}))
