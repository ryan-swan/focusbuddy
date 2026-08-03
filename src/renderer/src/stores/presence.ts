import { create } from 'zustand'
import {
  sendSocketMessage,
  setPresenceSocketHandler,
  setPresenceOpenHandler,
  type PresencePeer,
  type PresenceLocation,
  type PresenceSocketEvent
} from '../lib/messagingSocket'
import { useFocusSessionStore } from './focusSession'
import { useViewStore } from './view'

// Account-level presence (the "People Map"): who across your org/team is online
// right now and what they're doing. Rides the same authenticated messaging
// socket. The server computes visibility (org + team co-members) and fans out
// updates, so this store only sends our own state and renders what it receives.
//
// No sample data — peers is empty until the server sends a real snapshot. If
// nobody else is online, the panel honestly shows an empty team.

export type PresenceStatus = PresencePeer['status']

interface PresenceStore {
  // Visible teammates currently online, keyed by accountId. Self is excluded
  // by the server.
  peers: Record<string, PresencePeer>
  // This client's own published status.
  myStatus: PresenceStatus
  myWorkingOn: string | null
  // Appear-offline: when true, the server hides us from everyone else's presence
  // even while we're connected. We still see everyone normally. This is our own
  // switch with no admin override; the choice persists across restarts.
  myInvisible: boolean
  // True once we've joined presence on the live socket.
  active: boolean

  start: () => void
  stop: () => void
  setStatus: (status: PresenceStatus, workingOn?: string | null) => void
  setInvisible: (invisible: boolean) => void
}

let unsubFocus: (() => void) | null = null
let unsubView: (() => void) | null = null
// The desk id we last announced, so a view change only re-sends presence when the
// desk actually changes (not on every unrelated view store update).
let lastLocationId: string | null = null

// The appear-offline choice is the user's, so it persists locally and is
// re-asserted on every (re)connect. The client is the authority on its own
// visibility; nothing server-side or admin-side can override it.
const INVISIBLE_KEY = 'plexi.presence.invisible'
function loadInvisible(): boolean {
  try {
    return localStorage.getItem(INVISIBLE_KEY) === '1'
  } catch {
    return false
  }
}
function saveInvisible(v: boolean): void {
  try {
    localStorage.setItem(INVISIBLE_KEY, v ? '1' : '0')
  } catch {
    /* ignore */
  }
}

function applyEvent(e: PresenceSocketEvent, set: (fn: (s: PresenceStore) => Partial<PresenceStore>) => void): void {
  if (e.type === 'presenceSnapshot') {
    const peers: Record<string, PresencePeer> = {}
    for (const p of e.payload.peers) peers[p.accountId] = p
    set(() => ({ peers }))
  } else {
    const p = e.payload
    set((s) => {
      const next = { ...s.peers }
      if (p.online) {
        next[p.accountId] = {
          accountId: p.accountId,
          handle: p.handle,
          firstName: p.firstName ?? null,
          lastName: p.lastName ?? null,
          status: p.status,
          workingOn: p.workingOn,
          location: p.location ?? null,
          updatedAt: p.updatedAt
        }
      } else {
        delete next[p.accountId]
      }
      return { peers: next }
    })
  }
}

// Derive our presence status from real app state. A live focus session means
// heads-down; otherwise we're online. (Idle/away can be layered on later.)
function deriveStatus(): { status: PresenceStatus; workingOn: string | null } {
  const focus = useFocusSessionStore.getState().active
  if (focus) return { status: 'focus', workingOn: 'In a focus session' }
  return { status: 'online', workingOn: null }
}

// Where we currently are, so a desk can show who is on it. Only a desk (a 'task'
// view) is a collaboration surface today; every other view reports no location.
function deriveLocation(): PresenceLocation | null {
  const view = useViewStore.getState().view
  if (view.kind === 'task' && view.taskId) return { kind: 'desk', id: view.taskId }
  return null
}

export const usePresenceStore = create<PresenceStore>((set, get) => ({
  peers: {},
  myStatus: 'online',
  myWorkingOn: null,
  myInvisible: loadInvisible(),
  active: false,

  start: () => {
    if (get().active) return
    setPresenceSocketHandler((e) => applyEvent(e, set))
    // Re-announce on every (re)authentication, since the server tracks presence
    // per-socket and a reconnect starts a fresh one. We carry our visibility
    // choice every time so a reconnect never briefly outs an invisible user.
    setPresenceOpenHandler(() => {
      const { status, workingOn } = deriveStatus()
      sendSocketMessage({
        type: 'presenceJoin',
        payload: { status, workingOn, location: deriveLocation(), visible: !get().myInvisible }
      })
      set(() => ({ myStatus: status, myWorkingOn: workingOn }))
    })
    // Join now in case the socket is already authenticated (no open event coming).
    const { status, workingOn } = deriveStatus()
    sendSocketMessage({
      type: 'presenceJoin',
      payload: { status, workingOn, location: deriveLocation(), visible: !get().myInvisible }
    })
    // Keep our status in sync with focus-session changes.
    unsubFocus = useFocusSessionStore.subscribe(() => {
      const d = deriveStatus()
      if (d.status !== get().myStatus || d.workingOn !== get().myWorkingOn) {
        get().setStatus(d.status, d.workingOn)
      }
    })
    // Re-announce our location when we move between desks (or leave one), so a
    // desk's "who is here" stays honest. Only fires when the desk id changes.
    unsubView = useViewStore.subscribe(() => {
      const loc = deriveLocation()
      const id = loc?.id ?? null
      if (id !== lastLocationId) {
        lastLocationId = id
        if (get().active) get().setStatus(get().myStatus, get().myWorkingOn)
      }
    })
    lastLocationId = deriveLocation()?.id ?? null
    set(() => ({ active: true, myStatus: status, myWorkingOn: workingOn }))
  },

  stop: () => {
    if (!get().active && Object.keys(get().peers).length === 0) return
    if (unsubFocus) {
      unsubFocus()
      unsubFocus = null
    }
    if (unsubView) {
      unsubView()
      unsubView = null
    }
    sendSocketMessage({ type: 'presenceLeave' })
    setPresenceSocketHandler(null)
    setPresenceOpenHandler(null)
    set(() => ({ active: false, peers: {} }))
  },

  setStatus: (status, workingOn) => {
    // Carry visibility + current location on every update so a status change
    // while invisible never re-announces us, and a desk always knows where we are.
    sendSocketMessage({
      type: 'presenceUpdate',
      payload: { status, workingOn: workingOn ?? null, location: deriveLocation(), visible: !get().myInvisible }
    })
    set(() => ({ myStatus: status, myWorkingOn: workingOn ?? null }))
  },

  setInvisible: (invisible) => {
    saveInvisible(invisible)
    set(() => ({ myInvisible: invisible }))
    // Tell the server. The server turns this into an honest offline (going
    // invisible) or online (coming back) event for our audience.
    const { myStatus, myWorkingOn } = get()
    sendSocketMessage({
      type: 'presenceUpdate',
      payload: { status: myStatus, workingOn: myWorkingOn, location: deriveLocation(), visible: !invisible }
    })
  }
}))
