import { create } from 'zustand'
import {
  emptyDeckConfig,
  parseDeckConfig,
  serializeDeckConfig,
  type ActionButton,
  type DeckButton,
  type DeckConfig,
  type FolderButton
} from '@shared/streamdeck'

// Universal SpeedDeck store. Every SpeedDeck widget in "Universal" scope
// reads from THIS store and writes back to it; the store mirrors itself
// to disk via the speeddeck:* IPC. Two windows showing two SpeedDeck
// widgets in universal mode see the same config — write in one, the
// other updates on the next save cycle.
//
// Also doubles as the cross-deck clipboard for copy/cut/paste/duplicate
// — the clipboard is intentionally cross-deck so a button created in a
// task deck can be pasted into the universal deck or vice versa.

interface SpeedDeckStore {
  // The universal config. Null until hydrated from main.
  universal: DeckConfig | null
  // Whether hydration has finished (so the widget can render an empty
  // shell briefly instead of flashing wrong content).
  hydrated: boolean
  // Cross-deck button clipboard. Used by copy/cut/paste/duplicate.
  clipboard: DeckButton | null
  // Hydrate from disk via IPC. Idempotent.
  hydrate: () => Promise<void>
  // Replace the universal config. Persists via IPC.
  setUniversal: (next: DeckConfig) => Promise<void>
  // Imperative mutation helper — passes a draft to the mutator, persists
  // the result. Used by the widget to apply edits without round-tripping
  // through setUniversal manually.
  mutateUniversal: (mutator: (draft: DeckConfig) => DeckConfig) => Promise<void>
  // Clipboard API.
  setClipboard: (button: DeckButton | null) => void
}

let saveTimer: number | null = null
function debounce<T extends (...args: never[]) => unknown>(fn: T, ms: number): T {
  return ((...args) => {
    if (saveTimer !== null) window.clearTimeout(saveTimer)
    saveTimer = window.setTimeout(() => {
      saveTimer = null
      fn(...args)
    }, ms)
  }) as T
}

const persistDebounced = debounce(async (json: string) => {
  await window.api.speeddeck.saveUniversal(json)
}, 300)

export const useSpeedDeckStore = create<SpeedDeckStore>((set, get) => ({
  universal: null,
  hydrated: false,
  clipboard: null,

  hydrate: async () => {
    if (get().hydrated) return
    try {
      const raw = await window.api.speeddeck.loadUniversal()
      const parsed = parseDeckConfig(raw)
      set({ universal: parsed, hydrated: true })
    } catch {
      set({ universal: emptyDeckConfig(), hydrated: true })
    }
  },

  setUniversal: async (next) => {
    set({ universal: next })
    persistDebounced(serializeDeckConfig(next))
  },

  mutateUniversal: async (mutator) => {
    const cur = get().universal ?? emptyDeckConfig()
    const next = mutator(cur)
    set({ universal: next })
    persistDebounced(serializeDeckConfig(next))
  },

  setClipboard: (button) => set({ clipboard: button })
}))

// Convenience helper — used by the widget's "Copy" + "Duplicate" paths.
// Produces a deep-cloned button with a fresh id so pasting doesn't clash
// with the source.
export function cloneButtonWithNewIds(
  button: DeckButton,
  freshFolderPageId: () => string,
  freshButtonId: () => string
): { button: DeckButton; spawnPage?: { id: string; name: string } } {
  if (button.kind === 'action') {
    const cloned: ActionButton = {
      ...button,
      id: freshButtonId()
    }
    return { button: cloned }
  }
  // Folder: new id + new pageId. The caller materialises the new page.
  const newPageId = freshFolderPageId()
  const cloned: FolderButton = {
    ...button,
    id: freshButtonId(),
    pageId: newPageId
  }
  return {
    button: cloned,
    spawnPage: { id: newPageId, name: button.label || 'Folder' }
  }
}
