import { create } from 'zustand'
import type { WidgetKind } from '@shared/types'
import { WIDGET_SHORTCUTS } from './widgetCatalog'

// User-remappable canvas quick-add keys — the second half of the shortcuts
// story (the Cmd+/ reference shipped first). Defaults come from
// WIDGET_SHORTCUTS; overrides persist in localStorage as widgetKind -> letter
// (single A-Z only, no modifier chords, matching how the canvas listener
// works). An override of '' disables that quick-add entirely. The modifier
// shortcuts (Cmd+K and friends) stay fixed: they are advertised app identity,
// and remapping them would desynchronise every doc and menu label.

const KEY = 'fb.keymap.quickadd'

type Overrides = Partial<Record<WidgetKind, string>>

function load(): Overrides {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as Overrides
  } catch {
    /* defaults */
  }
  return {}
}

interface KeymapStore {
  overrides: Overrides
  setKey: (kind: WidgetKind, key: string | null) => void
  reset: () => void
}

export const useKeymap = create<KeymapStore>((set, get) => ({
  overrides: load(),
  setKey: (kind, key) => {
    const next: Overrides = { ...get().overrides }
    if (key === null) delete next[kind]
    else next[kind] = key // '' disables
    set({ overrides: next })
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      /* best-effort */
    }
  },
  reset: () => {
    set({ overrides: {} })
    try {
      localStorage.removeItem(KEY)
    } catch {
      /* best-effort */
    }
  }
}))

/** Effective kind -> key map (defaults + overrides, disabled entries removed). */
export function effectiveQuickAddMap(): Partial<Record<WidgetKind, string>> {
  const out: Partial<Record<WidgetKind, string>> = { ...WIDGET_SHORTCUTS }
  for (const [kind, key] of Object.entries(useKeymap.getState().overrides)) {
    if (key === '' || key == null) delete out[kind as WidgetKind]
    else out[kind as WidgetKind] = key.toUpperCase()
  }
  return out
}

/** Effective key -> kind reverse map, consulted by the canvas key handler. */
export function effectiveShortcutToKind(): Record<string, WidgetKind> {
  const out: Record<string, WidgetKind> = {}
  for (const [kind, key] of Object.entries(effectiveQuickAddMap())) {
    if (key) out[key] = kind as WidgetKind
  }
  return out
}
