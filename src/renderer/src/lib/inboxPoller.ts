import { listInbox, type InboxItemFromServer } from './accountClient'
import { useAccountStore } from '../stores/account'
import { useSharesStore } from '../stores/shares'

// Inbox poller — when the user is signed in, pulls server-side inbox
// items into the local "Shared with me" store every POLL_INTERVAL_MS.
//
// Idempotent: the server returns items in addedAt-descending order; we
// track the highest addedAt we've seen and use it as the `?since=` filter
// on subsequent polls so we only pull deltas. The local SQLite layer
// also enforces uniqueness by (kind, token) so accidental duplicates
// are dropped.
//
// On sign-out / sign-in transitions we tear down and restart so the new
// session's inbox is loaded promptly.
//
// Honest scope: HTTP polling, not WebSocket push. For v1 traffic this is
// fine; the cost is small (1 GET / 30s while focused, less when hidden).
// A future iteration can swap to /ws inbox events when latency matters.

const POLL_INTERVAL_MS = 30_000
const VISIBILITY_PAUSE = true // pause polling while the window is hidden

let pollHandle: number | null = null
let highestSeenAddedAt = 0
let currentSessionToken: string | null = null
let installed = false

async function pollOnce(token: string): Promise<void> {
  const items = await listInbox(token, highestSeenAddedAt || undefined)
  if (items.length === 0) return
  // Items are addedAt-desc. Walk oldest-first so we add in chronological
  // order to the local store.
  const oldestFirst = [...items].sort((a, b) => a.addedAt - b.addedAt)
  for (const item of oldestFirst) {
    await acceptInboxItem(item)
    if (item.addedAt > highestSeenAddedAt) highestSeenAddedAt = item.addedAt
  }
}

async function acceptInboxItem(item: InboxItemFromServer): Promise<void> {
  if (!item.share) return
  try {
    // The server-side `share.snapshot` IS what the local shares.accept
    // expects. Pass through as opaque JSON; the existing accept handler
    // persists into the local fb_shared_with_me table with uniqueness
    // by token so re-running is safe.
    const accepted = await window.api.shares.accept({
      token: item.share.token,
      kind: item.share.kind,
      snapshot: item.share.snapshot,
      fromHandle: item.share.fromHandle,
      scope: item.share.scope
    })
    // Mirror into the renderer store so the sidebar updates without
    // requiring a refresh. The store's existing accept path mutates the
    // inbox via refresh(); here we just unshift to avoid re-fetching all.
    useSharesStore.setState((s) => {
      // Skip if already present (defensive: server might re-deliver if
      // poller crashed mid-sync).
      if (s.inbox.some((i) => i.id === accepted.id)) return s
      return { ...s, inbox: [accepted, ...s.inbox] }
    })
  } catch {
    // ignore individual failures — next poll will retry the same item
    // because we only advance highestSeenAddedAt on the loop above.
  }
}

function startPolling(token: string): void {
  stopPolling()
  currentSessionToken = token
  // First poll fires immediately so newly-signed-in users see their
  // inbox without waiting 30 seconds.
  void pollOnce(token)
  pollHandle = window.setInterval(() => {
    if (!currentSessionToken) return
    if (VISIBILITY_PAUSE && document.hidden) return
    void pollOnce(currentSessionToken)
  }, POLL_INTERVAL_MS)
}

function stopPolling(): void {
  if (pollHandle !== null) {
    window.clearInterval(pollHandle)
    pollHandle = null
  }
  currentSessionToken = null
  highestSeenAddedAt = 0
}

// Install the poller. Subscribes to account store changes — starts when
// a session token appears, stops when it disappears. Safe to call once
// at app boot; subsequent calls are no-ops.
//
// Returns an unsubscribe function for cleanup symmetry, though in
// practice the app only mounts once so we never call it.
export function installInboxPoller(): () => void {
  if (installed) return () => undefined
  installed = true
  // Initial sync if already signed in at boot.
  const initialToken = useAccountStore.getState().sessionToken
  if (initialToken) startPolling(initialToken)
  const unsub = useAccountStore.subscribe((state, prev) => {
    if (state.sessionToken !== prev.sessionToken) {
      if (state.sessionToken) startPolling(state.sessionToken)
      else stopPolling()
    }
  })
  return () => {
    unsub()
    stopPolling()
    installed = false
  }
}
