import { create } from 'zustand'
import type { PlexiSignRequest, PlexiSignPatch, SignAction } from '@shared/sign'

// PlexiSign store. A thin client over the main-process signing engine. Reads
// only real requests; an empty workspace has none. All signing transitions and
// the completion certificate are computed in main, so this store just reflects
// what comes back.

interface SignStore {
  requests: PlexiSignRequest[]
  loaded: boolean
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
  load: async () => {
    const requests = await window.api.sign.list().catch(() => [] as PlexiSignRequest[])
    set({ requests, loaded: true })
  },
  create: async (title, body, signerNames) => {
    const req = await window.api.sign.create({ title, body, signerNames }).catch(() => null)
    if (req) set((s) => ({ requests: upsert(s.requests, req) }))
    return req
  },
  update: async (id, patch) => {
    const req = await window.api.sign.update(id, patch).catch(() => null)
    set((s) => ({ requests: upsert(s.requests, req) }))
  },
  remove: async (id) => {
    await window.api.sign.delete(id).catch(() => null)
    set((s) => ({ requests: s.requests.filter((r) => r.id !== id) }))
  },
  send: async (id) => {
    const req = await window.api.sign.send(id).catch(() => null)
    set((s) => ({ requests: upsert(s.requests, req) }))
  },
  sign: async (id, action) => {
    const req = await window.api.sign.sign(id, action).catch(() => null)
    set((s) => ({ requests: upsert(s.requests, req) }))
  },
  decline: async (id, signerId, reason) => {
    const req = await window.api.sign.decline(id, signerId, reason).catch(() => null)
    set((s) => ({ requests: upsert(s.requests, req) }))
  },
  voidRequest: async (id) => {
    const req = await window.api.sign.void(id).catch(() => null)
    set((s) => ({ requests: upsert(s.requests, req) }))
  }
}))
