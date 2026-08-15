import { create } from 'zustand'
import { useAccountStore } from './account'
import { getLiveDoc, type LiveDocFull } from '../lib/docCollabClient'

// Client state for the currently-open live document or live folder: its metadata
// and baseline body, fetched once on open. There is NO check-out lock any more —
// live documents co-edit in real time via Yjs, and live folders converge on the
// CRDT substrate — so this store just holds the open object's meta + body for the
// editor/view to read (the view drives its own real-time channel from there).

function token(): string | null {
  return useAccountStore.getState().sessionToken
}

interface DocCollabStore {
  openId: string | null
  meta: LiveDocFull | null
  bodyObj: unknown
  loading: boolean

  openLive: (id: string) => Promise<void>
  closeLive: () => void
}

export const useDocCollabStore = create<DocCollabStore>((set, get) => ({
  openId: null,
  meta: null,
  bodyObj: null,
  loading: false,

  openLive: async (id) => {
    const t = token()
    if (!t) return
    set({ openId: id, loading: true, meta: null, bodyObj: null })
    const full = await getLiveDoc(t, id)
    if (!full || get().openId !== id) {
      set({ loading: false })
      return
    }
    let bodyObj: unknown = null
    try {
      bodyObj = full.body ? JSON.parse(full.body) : null
    } catch {
      bodyObj = null
    }
    set({ meta: full, bodyObj, loading: false })
  },

  closeLive: () => {
    set({ openId: null, meta: null, bodyObj: null })
  }
}))
