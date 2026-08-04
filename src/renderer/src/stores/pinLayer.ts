import { create } from 'zustand'
import type { PinDraft, PinKind, PinnedItem } from '../lib/pinnable'

// The global pin layer store (spec §7). Pins are a local viewing aid that follows
// the user across navigation, persisted in localStorage. Dedupe is by (kind,
// refId) so pinning the same object twice is a no-op. Capped so it can't grow
// unbounded.

const KEY = 'fb.pinLayer.v1'

function load(): PinnedItem[] {
  try {
    const raw = localStorage.getItem(KEY)
    const arr = raw ? (JSON.parse(raw) as PinnedItem[]) : []
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function persist(items: PinnedItem[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items))
  } catch {
    /* ignore quota / private mode */
  }
}

function newId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `pin-${Date.now()}-${Math.round(Math.random() * 1e6)}`
  }
}

interface PinLayerStore {
  items: PinnedItem[]
  pin: (draft: PinDraft) => PinnedItem
  unpin: (id: string) => void
  isPinned: (kind: PinKind, refId: string) => boolean
  markPlaced: (id: string, deskId: string) => void
  clear: () => void
}

export const usePinLayer = create<PinLayerStore>((set, get) => ({
  items: load(),
  pin: (draft) => {
    const existing = get().items.find((i) => i.kind === draft.kind && i.refId === draft.refId)
    if (existing) return existing
    const item: PinnedItem = { ...draft, id: newId(), placedOn: [], createdAt: Date.now() }
    const items = [item, ...get().items].slice(0, 100)
    set({ items })
    persist(items)
    return item
  },
  unpin: (id) => {
    const items = get().items.filter((i) => i.id !== id)
    set({ items })
    persist(items)
  },
  isPinned: (kind, refId) => get().items.some((i) => i.kind === kind && i.refId === refId),
  markPlaced: (id, deskId) => {
    const items = get().items.map((i) =>
      i.id === id && !i.placedOn.includes(deskId) ? { ...i, placedOn: [...i.placedOn, deskId] } : i
    )
    set({ items })
    persist(items)
  },
  clear: () => {
    set({ items: [] })
    persist([])
  }
}))

// Thin handle for debugging + e2e (same convention as __fbView/__fbWidgets): the
// real store, not a mock. Changes nothing about user behaviour.
if (typeof window !== 'undefined') {
  ;(window as unknown as { __fbPinLayer?: typeof usePinLayer }).__fbPinLayer = usePinLayer
}
