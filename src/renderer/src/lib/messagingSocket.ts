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

let currentToken: string | null = null
let onMessageCb: ((m: IncomingMessage) => void) | null = null
let onDocEventCb: ((e: DocSocketEvent) => void) | null = null
let onYjsEventCb: ((e: YjsSocketEvent) => void) | null = null

/** Register a handler for live-document socket events. */
export function setDocSocketHandler(cb: ((e: DocSocketEvent) => void) | null): void {
  onDocEventCb = cb
}

/** Register a handler for real-time co-editing (Yjs) socket events. */
export function setYjsSocketHandler(cb: ((e: YjsSocketEvent) => void) | null): void {
  onYjsEventCb = cb
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
    } else if (msg.type === 'yjsSync' || msg.type === 'yjsUpdate') {
      // Real-time co-editing updates → the Yjs provider for the open doc.
      onYjsEventCb?.({ type: msg.type, payload: msg.payload } as YjsSocketEvent)
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
