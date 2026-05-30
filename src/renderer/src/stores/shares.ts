import { create } from 'zustand'
import type {
  ShareableKind,
  ShareLink,
  SharedItem,
  ShareScope
} from '@shared/types'
import { generateShareToken } from '../lib/shareTokens'
import { ShareService } from '../lib/shareService'
import { signalConfig } from '../lib/signalConfig'

// ShareService singleton — null in local-mock dev mode (no server),
// instantiated in prod / when explicitly configured. Created lazily so
// the renderer doesn't open a connection until the user actually uses
// the feature.
let svc: ShareService | null = null
function getShareService(): ShareService | null {
  if (!signalConfig.useRemote) return null
  if (!svc) svc = new ShareService(signalConfig.httpUrl)
  return svc
}

interface SharesStore {
  // Outgoing shares — links I've minted for my own entities.
  outgoing: ShareLink[]
  // Incoming — items shared with me by others (the "Shared with me" sidebar).
  inbox: SharedItem[]
  loaded: boolean
  refresh: () => Promise<void>
  // Mint a new share link for one of my entities. Returns the created
  // link; the dialog then copies its URL. When the remote service is
  // configured, also posts the snapshot up so other users can resolve
  // the token from the wider internet.
  createFor: (input: {
    kind: ShareableKind
    entityId: string
    label: string
    scope: ShareScope
    expiresAt?: number | null
    // Snapshot of the entity at share-time. Posted to the server so the
    // viewer URL resolves to actual content. In local-mock mode this is
    // dropped on the floor — only the local outgoing table tracks it.
    snapshot?: unknown
    fromHandle?: string
  }) => Promise<ShareLink>
  // Accept a pasted share link. Fetches the snapshot from the server (when
  // remote is configured) or treats the token as opaque (local-mock).
  // Adds the resolved item to the inbox + local DB.
  acceptByToken: (token: string) => Promise<SharedItem>
  revoke: (id: string) => Promise<void>
  remove: (id: string) => Promise<void>
  removeFromInbox: (id: string) => Promise<void>
}

export const useSharesStore = create<SharesStore>((set, get) => ({
  outgoing: [],
  inbox: [],
  loaded: false,
  refresh: async () => {
    const [outgoing, inbox] = await Promise.all([
      window.api.shares.listAll(),
      window.api.shares.inbox()
    ])
    set({ outgoing, inbox, loaded: true })
  },
  createFor: async ({
    kind,
    entityId,
    label,
    scope,
    expiresAt,
    snapshot,
    fromHandle
  }) => {
    const token = generateShareToken()
    // Local persistence first — this is the audit-of-record for the
    // owner, and we want it to land even if the network call below fails.
    const created = await window.api.shares.create({
      token,
      kind,
      entityId,
      label,
      scope,
      expiresAt: expiresAt ?? null
    })
    set({ outgoing: [created, ...get().outgoing] })
    // Then push the snapshot to the hosted service (when configured) so
    // recipients can actually resolve the link. Failure here is non-fatal
    // — the local row stays valid; the user can retry later.
    const service = getShareService()
    if (service && snapshot !== undefined) {
      try {
        await service.mint({
          token,
          kind,
          snapshot,
          fromHandle: fromHandle ?? 'anonymous',
          scope,
          expiresAt: expiresAt ?? null
        })
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[SharesStore] remote mint failed:', err)
      }
    }
    return created
  },
  acceptByToken: async (token) => {
    // Remote path: hit the server to get the actual snapshot the owner
    // shared. Local-mock path: insert a stub (the dev experience is "you
    // can paste your own link to see the inbox row land", not actual
    // cross-user resolution).
    const service = getShareService()
    let snapshot: unknown = { placeholder: true }
    let kind: ShareableKind = 'task'
    let fromHandle = 'someone'
    let scope: ShareScope = 'view'
    if (service) {
      const remote = await service.lookup(token)
      snapshot = remote.snapshot
      kind = remote.kind
      fromHandle = remote.fromHandle
      scope = remote.scope
    }
    const item = await window.api.shares.accept({
      token,
      kind,
      snapshot,
      fromHandle,
      scope
    })
    set({ inbox: [item, ...get().inbox] })
    return item
  },
  revoke: async (id) => {
    const target = get().outgoing.find((s) => s.id === id) ?? null
    await window.api.shares.revoke(id)
    set({
      outgoing: get().outgoing.map((s) =>
        s.id === id ? { ...s, revoked: true } : s
      )
    })
    // Best-effort remote revoke. Local row is already marked revoked
    // either way; the share manager UI shows the audit trail.
    const service = getShareService()
    if (service && target) {
      try {
        await service.revoke(target.token)
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[SharesStore] remote revoke failed:', err)
      }
    }
  },
  remove: async (id) => {
    await window.api.shares.delete(id)
    set({ outgoing: get().outgoing.filter((s) => s.id !== id) })
  },
  removeFromInbox: async (id) => {
    await window.api.shares.removeInbox(id)
    set({ inbox: get().inbox.filter((s) => s.id !== id) })
  }
}))
