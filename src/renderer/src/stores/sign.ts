import { create } from 'zustand'
import type { PlexiSignRequest, PlexiSignPatch, SignAction } from '@shared/sign'

// PlexiSign store. A thin client over the main-process signing engine. Reads
// only real requests; an empty workspace has none. All signing transitions and
// the completion certificate are computed in main, so this store just reflects
// what comes back.

interface SignStore {
  requests: PlexiSignRequest[]
  loaded: boolean
  // Last action error, surfaced to the user. Null when the last action succeeded.
  error: string | null
  clearError: () => void
  load: () => Promise<void>
  create: (title: string, body: string, signerNames: string[]) => Promise<PlexiSignRequest | null>
  update: (id: string, patch: PlexiSignPatch) => Promise<void>
  remove: (id: string) => Promise<void>
  send: (id: string) => Promise<void>
  sign: (id: string, action: SignAction) => Promise<void>
  decline: (id: string, signerId: string, reason: string) => Promise<void>
  voidRequest: (id: string) => Promise<void>
}

function upsert(list: PlexiSignRequest[], req: PlexiSignRequest | null): PlexiSignRequest[] {
  if (!req) return list
  const i = list.findIndex((r) => r.id === req.id)
  const next = i >= 0 ? list.map((r) => (r.id === req.id ? req : r)) : [req, ...list]
  return next.sort((a, b) => b.updatedAt - a.updatedAt)
}

export const useSignStore = create<SignStore>((set) => ({
  requests: [],
  loaded: false,
  error: null,
  clearError: () => set({ error: null }),
  load: async () => {
    const requests = await window.api.sign.list().catch(() => [] as PlexiSignRequest[])
    set({ requests, loaded: true })
  },
  create: async (title, body, signerNames) => {
    const req = await window.api.sign.create({ title, body, signerNames }).catch(() => null)
    if (req) set((s) => ({ requests: upsert(s.requests, req), error: null }))
    else set({ error: 'Could not create the agreement.' })
    return req
  },
  update: async (id, patch) => {
    const req = await window.api.sign.update(id, patch).catch(() => null)
    set((s) => ({ requests: upsert(s.requests, req) }))
  },
  remove: async (id) => {
    const ok = await window.api.sign
      .delete(id)
      .then(() => true)
      .catch(() => false)
    // Only drop the row from the UI if it was actually deleted.
    if (ok) set((s) => ({ requests: s.requests.filter((r) => r.id !== id), error: null }))
    else set({ error: 'Could not delete the agreement.' })
  },
  send: async (id) => {
    // A null result means the IPC threw; a no-op returns the unchanged request.
    const req = await window.api.sign.send(id).catch(() => null)
    if (req) set((s) => ({ requests: upsert(s.requests, req), error: null }))
    else set({ error: 'Could not send the agreement for signature.' })
  },
  sign: async (id, action) => {
    const req = await window.api.sign.sign(id, action).catch(() => null)
    if (req) set((s) => ({ requests: upsert(s.requests, req), error: null }))
    else set({ error: 'Could not record the signature. Please try again.' })
  },
  decline: async (id, signerId, reason) => {
    const req = await window.api.sign.decline(id, signerId, reason).catch(() => null)
    if (req) set((s) => ({ requests: upsert(s.requests, req), error: null }))
    else set({ error: 'Could not record the decline.' })
  },
  voidRequest: async (id) => {
    const req = await window.api.sign.void(id).catch(() => null)
    if (req) set((s) => ({ requests: upsert(s.requests, req), error: null }))
    else set({ error: 'Could not void the agreement.' })
  }
}))
