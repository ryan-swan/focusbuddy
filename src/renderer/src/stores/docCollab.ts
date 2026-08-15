import { create } from 'zustand'
import { useAccountStore } from './account'
import { setDocSocketHandler, type DocSocketEvent } from '../lib/messagingSocket'
import {
  getLiveDoc,
  lockDoc,
  releaseDoc,
  putLiveBody,
  requestTakeover,
  listTakeovers,
  respondTakeover,
  type LiveDocFull,
  type LockState,
  type Takeover
} from '../lib/docCollabClient'

// Client state for collaborative (live) documents. Owns the session for the one
// live doc currently open in the editor — its lock, a heartbeat that keeps the
// lock alive while editing, and body sync to the server — plus the global queue
// of incoming takeover requests that PlexiInbox renders.

const HEARTBEAT_MS = 30_000
const SAVE_DEBOUNCE_MS = 600

let heartbeat: ReturnType<typeof setInterval> | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null

function token(): string | null {
  return useAccountStore.getState().sessionToken
}
function myId(): string | null {
  return useAccountStore.getState().account?.id ?? null
}

interface DocCollabStore {
  // Session for the open live doc
  openId: string | null
  meta: LiveDocFull | null
  bodyObj: unknown
  lock: LockState | null
  isHolder: boolean
  loading: boolean
  saving: boolean
  // Global
  takeovers: Takeover[] // pending requests where I am the current holder
  lastResponse: { docId: string; accepted: boolean; message: string | null } | null

  init: () => void
  // `lockFree` opens without acquiring the check-out lock — used when the surface
  // carries its edits on the CRDT substrate instead (a live folder with the
  // fb.sync.crdt.livefolders flag on), so it never falsely shows "locked by X" and
  // never blocks a concurrent editor. Default (no opts) is the check-out behaviour.
  openLive: (id: string, opts?: { lockFree?: boolean }) => Promise<void>
  closeLive: () => void
  saveBody: (body: unknown) => void
  acquire: () => Promise<void>
  requestTakeoverForOpen: (message: string) => Promise<void>
  refreshTakeovers: () => Promise<void>
  respond: (tid: string, accept: boolean, message: string) => Promise<void>
  clearLastResponse: () => void
}

function stopHeartbeat(): void {
  if (heartbeat) {
    clearInterval(heartbeat)
    heartbeat = null
  }
}

export const useDocCollabStore = create<DocCollabStore>((set, get) => ({
  openId: null,
  meta: null,
  bodyObj: null,
  lock: null,
  isHolder: false,
  loading: false,
  saving: false,
  takeovers: [],
  lastResponse: null,

  init: () => {
    setDocSocketHandler((e: DocSocketEvent) => handleEvent(e, set, get))
    void get().refreshTakeovers()
  },

  openLive: async (id, opts) => {
    const t = token()
    if (!t) return
    set({ openId: id, loading: true, meta: null, bodyObj: null, lock: null, isHolder: false })
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
    set({ meta: full, bodyObj, lock: full.lock, loading: false })
    // Try to check it out. If someone else holds it, we stay read-only. Skipped when
    // the substrate carries the surface (lockFree): edits are conflict-free CRDT.
    if (!opts?.lockFree) await get().acquire()
  },

  closeLive: () => {
    const t = token()
    const id = get().openId
    stopHeartbeat()
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    if (t && id && get().isHolder) void releaseDoc(t, id)
    set({ openId: null, meta: null, bodyObj: null, lock: null, isHolder: false, saving: false })
  },

  acquire: async () => {
    const t = token()
    const id = get().openId
    if (!t || !id) return
    const res = await lockDoc(t, id)
    if (get().openId !== id) return
    if (res.ok) {
      set({ lock: res.lock, isHolder: true })
      stopHeartbeat()
      heartbeat = setInterval(() => {
        const cur = get()
        if (cur.openId === id && cur.isHolder && token()) void lockDoc(token() as string, id)
      }, HEARTBEAT_MS)
    } else {
      set({ lock: res.lock, isHolder: false })
    }
  },

  saveBody: (body) => {
    set({ bodyObj: body })
    if (!get().isHolder) return // server would reject; read-only members don't write
    const id = get().openId
    const t = token()
    if (!id || !t) return
    set({ saving: true })
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(async () => {
      saveTimer = null
      const cur = get()
      if (cur.openId !== id) return
      const res = await putLiveBody(t, id, JSON.stringify(cur.bodyObj))
      if (get().openId !== id) return
      if (!res.ok) {
        // Lost the lock (e.g. a takeover was accepted). Drop to read-only.
        set({ saving: false, isHolder: false, lock: res.lock ?? get().lock })
        stopHeartbeat()
      } else {
        set({ saving: false })
      }
    }, SAVE_DEBOUNCE_MS)
  },

  requestTakeoverForOpen: async (message) => {
    const t = token()
    const id = get().openId
    if (!t || !id) return
    await requestTakeover(t, id, message)
  },

  refreshTakeovers: async () => {
    const t = token()
    if (!t) return
    const requests = await listTakeovers(t)
    set({ takeovers: requests })
  },

  respond: async (tid, accept, message) => {
    const t = token()
    if (!t) return
    await respondTakeover(t, tid, accept, message)
    set({ takeovers: get().takeovers.filter((x) => x.id !== tid) })
  },

  clearLastResponse: () => set({ lastResponse: null })
}))

// Interpret a real-time socket event against the current session + global queue.
function handleEvent(
  e: DocSocketEvent,
  set: (p: Partial<DocCollabStore>) => void,
  get: () => DocCollabStore
): void {
  if (e.type === 'docLockChanged') {
    if (e.docId !== get().openId) return
    const lock: LockState = { docId: e.docId, holder: e.holder, expiresAt: e.expiresAt }
    set({ lock, isHolder: e.holder?.accountId === myId() })
    if (e.holder?.accountId !== myId()) stopHeartbeat()
  } else if (e.type === 'docUpdated') {
    // A newer version exists. If we're not the writer, pull the latest body.
    if (e.docId !== get().openId || e.updatedBy === myId() || get().isHolder) return
    const t = token()
    if (!t) return
    void getLiveDoc(t, e.docId).then((full) => {
      if (!full || get().openId !== e.docId) return
      let bodyObj: unknown = null
      try {
        bodyObj = full.body ? JSON.parse(full.body) : null
      } catch {
        bodyObj = null
      }
      set({ bodyObj, meta: full, lock: full.lock })
    })
  } else if (e.type === 'docTakeoverRequest') {
    // Someone wants the doc I hold — surface it in PlexiInbox.
    const incoming: Takeover = {
      id: e.id,
      docId: e.docId,
      requesterAccountId: e.requesterAccountId,
      holderAccountId: myId() ?? '',
      message: e.message,
      status: 'pending',
      responseMessage: null,
      createdAt: Date.now(),
      resolvedAt: null,
      docTitle: e.docTitle,
      requesterHandle: e.requesterHandle
    }
    if (!get().takeovers.some((x) => x.id === e.id)) {
      set({ takeovers: [incoming, ...get().takeovers] })
    }
  } else if (e.type === 'docTakeoverResponse') {
    set({ lastResponse: { docId: e.docId, accepted: e.accepted, message: e.message } })
    // If my request was accepted and I have the doc open, the lock is now mine.
    if (e.accepted && e.docId === get().openId) void get().acquire()
  }
}
