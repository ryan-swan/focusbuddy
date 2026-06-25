import { signalConfig } from './signalConfig'
import type { ChatMessage } from './messagingClient'

// A persistent, authenticated WebSocket for real-time message delivery. Opened
// once the user is signed in; authenticates with the account session token so
// the server can route DMs and shared-space chat to this connection. Auto-
// reconnects with backoff. This is separate from the ephemeral body-double
// matcher socket (which connects only while looking for a partner).

type IncomingMessage = { conversationId: string; message: ChatMessage }

// Live-document events ride the same authenticated socket. The doc-collab store
// registers a handler; null when no live doc work is active.
export type DocSocketEvent =
  | { type: 'docLockChanged'; docId: string; holder: { accountId: string; handle: string } | null; expiresAt: number | null }
  | { type: 'docUpdated'; docId: string; version: number; updatedBy: string }
  | {
      type: 'docTakeoverRequest'
      id: string
      docId: string
      docTitle: string
      requesterAccountId: string
      requesterHandle: string
      message: string | null
    }
  | { type: 'docTakeoverResponse'; id: string; docId: string; accepted: boolean; message: string | null }

let socket: WebSocket | null = null
// Real-time co-editing (Yjs CRDT) rides the same socket. The live-doc editor
// registers a handler while a doc is open; null otherwise.
export type YjsSocketEvent =
  | { type: 'yjsSync'; payload: { docId: string; updates: string[] } }
  | { type: 'yjsUpdate'; payload: { docId: string; update: string } }
  | { type: 'yjsAwareness'; payload: { docId: string; update: string } }

// Account-level presence (the People Map) rides the same authenticated socket.
// The presence store registers a handler; null when presence isn't active.
export type PresencePeer = {
  accountId: string
  handle: string
  status: 'online' | 'away' | 'focus' | 'busy' | 'offline'
  workingOn: string | null
  surface: string | null
  updatedAt: number
}
export type PresenceSocketEvent =
  | { type: 'presenceSnapshot'; payload: { peers: PresencePeer[] } }
  | { type: 'presenceUpdate'; payload: PresencePeer & { online: boolean } }

let currentToken: string | null = null
let onMessageCb: ((m: IncomingMessage) => void) | null = null
let onDocEventCb: ((e: DocSocketEvent) => void) | null = null
let onYjsEventCb: ((e: YjsSocketEvent) => void) | null = null
let onPresenceCb: ((e: PresenceSocketEvent) => void) | null = null
// Fired each time the socket (re)authenticates, so the Yjs provider can re-join
// its room after a reconnect (the server-side room membership is per-socket).
let onSocketOpenCb: (() => void) | null = null
// Same idea for presence: re-send presenceJoin after a reconnect, since the
// server tracks presence membership per-socket.
let onPresenceOpenCb: (() => void) | null = null

// A comment was added / resolved / deleted on a doc the account can see.
export interface DocCommentEvent {
  docId: string
  action: 'added' | 'updated' | 'deleted'
  comment: {
    id: string
    docId: string
    authorAccountId: string
    parentId: string | null
    body: string
    resolved: boolean
    createdAt: number
  }
}
let onDocCommentCb: ((e: DocCommentEvent) => void) | null = null

/** Register a handler for live-document socket events. */
export function setDocSocketHandler(cb: ((e: DocSocketEvent) => void) | null): void {
  onDocEventCb = cb
}

/** Register a handler for real-time co-editing (Yjs) socket events. */
export function setYjsSocketHandler(cb: ((e: YjsSocketEvent) => void) | null): void {
  onYjsEventCb = cb
}

/** Register a handler that fires whenever the socket (re)authenticates. */
export function setSocketOpenHandler(cb: (() => void) | null): void {
  onSocketOpenCb = cb
}

/** Register a handler for account-presence socket events (People Map). */
export function setPresenceSocketHandler(cb: ((e: PresenceSocketEvent) => void) | null): void {
  onPresenceCb = cb
}

/** Register a handler that fires on every (re)auth so presence can re-join. */
export function setPresenceOpenHandler(cb: (() => void) | null): void {
  onPresenceOpenCb = cb
}

/** Register a handler for live comment changes on the open document. */
export function setDocCommentHandler(cb: ((e: DocCommentEvent) => void) | null): void {
  onDocCommentCb = cb
}

/** Send a raw message over the authenticated socket (used by the Yjs provider).
 *  No-op if the socket isn't open; the provider re-joins on reconnect. */
export function sendSocketMessage(msg: object): void {
  try {
    socket?.send(JSON.stringify(msg))
  } catch {
    /* socket not ready — ignore */
  }
}
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let backoffMs = 1000
let pingTimer: ReturnType<typeof setInterval> | null = null
let closedByUs = false

function clearTimers(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  if (pingTimer) {
    clearInterval(pingTimer)
    pingTimer = null
  }
}

function open(): void {
  if (!currentToken) return
  try {
    socket = new WebSocket(signalConfig.wsUrl)
  } catch {
    scheduleReconnect()
    return
  }

  socket.onopen = () => {
    backoffMs = 1000
    // Authenticate this socket as the signed-in account.
    socket?.send(JSON.stringify({ type: 'authenticate', payload: { token: currentToken } }))
    // Heartbeat so idle-proxy timeouts don't drop us.
    pingTimer = setInterval(() => {
      try {
        socket?.send(JSON.stringify({ type: 'ping' }))
      } catch {
        /* ignore */
      }
    }, 25_000)
  }

  socket.onmessage = (ev) => {
    let msg: { type?: string; payload?: unknown }
    try {
      msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '') as typeof msg
    } catch {
      return
    }
    if (msg.type === 'message' && msg.payload) {
      const p = msg.payload as {
        conversationId: string
        message: Omit<ChatMessage, 'conversationId'>
      }
      onMessageCb?.({
        conversationId: p.conversationId,
        message: { ...p.message, conversationId: p.conversationId } as ChatMessage
      })
    } else if (
      msg.type === 'docLockChanged' ||
      msg.type === 'docUpdated' ||
      msg.type === 'docTakeoverRequest' ||
      msg.type === 'docTakeoverResponse'
    ) {
      // Forward live-document events verbatim; the doc-collab store interprets them.
      onDocEventCb?.({ type: msg.type, ...(msg.payload as object) } as DocSocketEvent)
    } else if (msg.type === 'yjsSync' || msg.type === 'yjsUpdate' || msg.type === 'yjsAwareness') {
      // Real-time co-editing updates + cursor presence → the Yjs provider.
      onYjsEventCb?.({ type: msg.type, payload: msg.payload } as YjsSocketEvent)
    } else if (msg.type === 'presenceSnapshot' || msg.type === 'presenceUpdate') {
      // Account-level presence (who's online across the org/team) → presence store.
      onPresenceCb?.({ type: msg.type, payload: msg.payload } as PresenceSocketEvent)
    } else if (msg.type === 'docComment') {
      onDocCommentCb?.(msg.payload as DocCommentEvent)
    } else if (msg.type === 'authenticated') {
      // Socket is live again (initial connect or after a reconnect) — let the
      // Yjs provider re-join its room and presence re-announce itself.
      onSocketOpenCb?.()
      onPresenceOpenCb?.()
    }
  }

  socket.onclose = () => {
    clearTimers()
    socket = null
    if (!closedByUs) scheduleReconnect()
  }

  socket.onerror = () => {
    try {
      socket?.close()
    } catch {
      /* onclose handles reconnect */
    }
  }
}

function scheduleReconnect(): void {
  if (reconnectTimer || closedByUs) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    open()
  }, backoffMs)
  backoffMs = Math.min(backoffMs * 2, 30_000)
}

/** Connect (or re-point) the messaging socket for a signed-in account. */
export function connectMessagingSocket(
  token: string,
  onMessage: (m: IncomingMessage) => void
): void {
  closedByUs = false
  onMessageCb = onMessage
  if (currentToken === token && socket && socket.readyState === WebSocket.OPEN) return
  currentToken = token
  // Tear down any prior connection before reconnecting under the new token.
  if (socket) {
    try {
      socket.close()
    } catch {
      /* ignore */
    }
    socket = null
  }
  clearTimers()
  open()
}

/** Disconnect on sign-out. */
export function disconnectMessagingSocket(): void {
  closedByUs = true
  currentToken = null
  onMessageCb = null
  clearTimers()
  if (socket) {
    try {
      socket.close()
    } catch {
      /* ignore */
    }
    socket = null
  }
}
