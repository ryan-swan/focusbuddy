import { create } from 'zustand'
import type {
  DashboardCardKind,
  DashboardCardSize,
  DashboardColumns
} from '@shared/types'
import { DEFAULT_DASHBOARD_COLUMNS } from '@shared/types'

// Per-dashboard layouts. Each dashboard has a list of card IDs in render order,
// a column count (1/2/3), and a per-card size map. Keyed by 'home' (master
// dashboard) or a project node id, so every module personalises independently.

export const DEFAULT_LAYOUT: DashboardCardKind[] = [
  'daily-brief',
  'workspace-progress',
  'focus-session',
  'ai-assistant',
  'today-tasks',
  'recent-notes',
  'workspace-health',
  'quick-start',
  'stats',
  'folders',
  'recent-activity'
  // 'garden' / 'energy' deprecated — left in the type union for backward
  // compatibility with existing user layouts but removed from default +
  // palette in Dashboard.tsx
]

// The default size a card renders at when it has no explicit override.
export const DEFAULT_CARD_SIZE: DashboardCardSize = 'medium'

// The in-memory shape the store holds for a loaded dashboard. `null` means the
// key was loaded and the user has no custom layout, so the caller falls back to
// DEFAULT_LAYOUT + default column count + empty sizes.
export interface DashboardConfig {
  cardIds: DashboardCardKind[]
  columns: DashboardColumns
  sizes: Partial<Record<DashboardCardKind, DashboardCardSize>>
}

interface LayoutStore {
  // dashboardKey → config. undefined = not loaded yet, null = "use default".
  configs: Record<string, DashboardConfig | null>
  loadingKeys: Set<string>
  load: (key: string) => Promise<void>
  // Persist a new ordered card list (columns + sizes preserved from cache).
  setCards: (key: string, cardIds: DashboardCardKind[]) => Promise<void>
  // Persist a new column count (cards + sizes preserved).
  setColumns: (key: string, columns: DashboardColumns) => Promise<void>
  // Persist a single card's size (cards + columns preserved). Passing null
  // clears the override so the card returns to the default size.
  setCardSize: (
    key: string,
    card: DashboardCardKind,
    size: DashboardCardSize | null
  ) => Promise<void>
  // Wipe the user's custom layout and restore default.
  reset: (key: string) => Promise<void>
}

// Resolve the effective config for a key, applying defaults for anything unset.
function resolve(config: DashboardConfig | null | undefined): DashboardConfig {
  if (!config) {
    return { cardIds: [], columns: DEFAULT_DASHBOARD_COLUMNS, sizes: {} }
  }
  return config
}

export const useDashboardLayoutStore = create<LayoutStore>((set, get) => ({
  configs: {},
  loadingKeys: new Set(),
  load: async (key) => {
    if (get().loadingKeys.has(key)) return
    if (get().configs[key] !== undefined) return // already loaded
    const nextLoading = new Set(get().loadingKeys)
    nextLoading.add(key)
    set({ loadingKeys: nextLoading })
    try {
      const stored = await window.api.dashboard.getLayout(key)
      const config: DashboardConfig | null = stored
        ? {
            cardIds: stored.cardIds,
            columns: stored.columns,
            sizes: stored.sizes
          }
        : null
      set({ configs: { ...get().configs, [key]: config } })
    } finally {
      const after = new Set(get().loadingKeys)
      after.delete(key)
      set({ loadingKeys: after })
    }
  },
  setCards: async (key, cardIds) => {
    const current = resolve(get().configs[key])
    const next: DashboardConfig = { ...current, cardIds }
    set({ configs: { ...get().configs, [key]: next } })
    await window.api.dashboard.setLayout(key, {
      cardIds,
      columns: next.columns,
      sizes: next.sizes
    })
  },
  setColumns: async (key, columns) => {
    const current = resolve(get().configs[key])
    const next: DashboardConfig = { ...current, columns }
    set({ configs: { ...get().configs, [key]: next } })
    await window.api.dashboard.setLayout(key, {
      cardIds: next.cardIds,
      columns,
      sizes: next.sizes
    })
  },
  setCardSize: async (key, card, size) => {
    const current = resolve(get().configs[key])
    const sizes = { ...current.sizes }
    if (size === null) {
      delete sizes[card]
    } else {
      sizes[card] = size
    }
    const next: DashboardConfig = { ...current, sizes }
    set({ configs: { ...get().configs, [key]: next } })
    await window.api.dashboard.setLayout(key, {
      cardIds: next.cardIds,
      columns: next.columns,
      sizes
    })
  },
  reset: async (key) => {
    set({ configs: { ...get().configs, [key]: null } })
    await window.api.dashboard.resetLayout(key)
  }
}))
