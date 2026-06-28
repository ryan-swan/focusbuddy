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

// PlexiCam live-call signaling, relayed verbatim from the server to the call store.
export type CallSocketEvent =
  | { type: 'callIncoming'; payload: { callId: string; from: { accountId: string; handle: string }; media: 'audio' | 'video' } }
  | { type: 'callSignal'; payload: { callId: string; from: string; data: string } }
  | { type: 'callAccepted'; payload: { callId: string; from: string } }
  | { type: 'callDeclined'; payload: { callId: string; from: string } }
  | { type: 'callEnded'; payload: { callId: string; from: string } }

// PlexiMeet multi-party room signaling → the meeting store. A mesh of peer
// connections; the server only relays roster + SDP/ICE, never the media.
export type MeetingSocketEvent =
  | { type: 'meetingRoster'; payload: { roomId: string; peers: Array<{ accountId: string; handle: string }> } }
  | { type: 'meetingPeerJoined'; payload: { roomId: string; peer: { accountId: string; handle: string } } }
  | { type: 'meetingPeerLeft'; payload: { roomId: string; accountId: string } }
  | { type: 'meetingSignal'; payload: { roomId: string; from: string; data: string } }
  | { type: 'meetingInvited'; payload: { roomId: string; from: { accountId: string; handle: string }; title: string | null } }

let currentToken: string | null = null
let onMessageCb: ((m: IncomingMessage) => void) | null = null
let onDocEventCb: ((e: DocSocketEvent) => void) | null = null
let onYjsEventCb: ((e: YjsSocketEvent) => void) | null = null
let onPresenceCb: ((e: PresenceSocketEvent) => void) | null = null
let onCallCb: ((e: CallSocketEvent) => void) | null = null
let onMeetingCb: ((e: MeetingSocketEvent) => void) | null = null

/** Register a handler for PlexiMeet room socket events. */
export function setMeetingSocketHandler(cb: ((e: MeetingSocketEvent) => void) | null): void {
  onMeetingCb = cb
}

// A live emoji-reaction change on a message in some conversation.
export type ReactionEvent = { conversationId: string; messageId: string; emoji: string; accountId: string; added: boolean }
let onReactionCb: ((e: ReactionEvent) => void) | null = null
export function setReactionHandler(cb: ((e: ReactionEvent) => void) | null): void {
  onReactionCb = cb
}

// Someone is typing in a conversation. Ephemeral; the store clears it on a timeout.
export type TypingEvent = { conversationId: string; accountId: string; handle: string }
let onTypingCb: ((e: TypingEvent) => void) | null = null
export function setTypingHandler(cb: ((e: TypingEvent) => void) | null): void {
  onTypingCb = cb
}

/** Tell the server we are typing in a conversation. No-op if the socket isn't open. */
export function sendTyping(conversationId: string): void {
  sendSocketMessage({ type: 'typing', payload: { conversationId } })
}

// PlexiPeople knock-to-connect: someone knocked to reach you.
export type KnockEvent = { from: { accountId: string; handle: string }; note: string | null }
let onKnockCb: ((e: KnockEvent) => void) | null = null
export function setKnockHandler(cb: ((e: KnockEvent) => void) | null): void {
  onKnockCb = cb
}

export interface MessageEditEvent {
  conversationId: string
  messageId: string
  body: string
  editedAt: number
}
export interface MessageDeleteEvent {
  conversationId: string
  messageId: string
}
let onMessageEditCb: ((e: MessageEditEvent) => void) | null = null
let onMessageDeleteCb: ((e: MessageDeleteEvent) => void) | null = null
export function setMessageEditHandler(cb: ((e: MessageEditEvent) => void) | null): void {
  onMessageEditCb = cb
}
export function setMessageDeleteHandler(cb: ((e: MessageDeleteEvent) => void) | null): void {
  onMessageDeleteCb = cb
}

/** Knock to reach a person you can see, with an optional short note. */
export function sendKnock(to: string, note?: string): void {
  sendSocketMessage({ type: 'knock', payload: { to, note } })
}
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
export function setCallSocketHandler(cb: ((e: CallSocketEvent) => void) | null): void {
  onCallCb = cb
}

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
    } else if (msg.type === 'reaction') {
      onReactionCb?.(msg.payload as ReactionEvent)
    } else if (msg.type === 'messageEdited') {
      onMessageEditCb?.(msg.payload as MessageEditEvent)
    } else if (msg.type === 'messageDeleted') {
      onMessageDeleteCb?.(msg.payload as MessageDeleteEvent)
    } else if (msg.type === 'typing') {
      onTypingCb?.(msg.payload as TypingEvent)
    } else if (msg.type === 'knocked') {
      onKnockCb?.(msg.payload as KnockEvent)
    } else if (
      msg.type === 'callIncoming' ||
      msg.type === 'callSignal' ||
      msg.type === 'callAccepted' ||
      msg.type === 'callDeclined' ||
      msg.type === 'callEnded'
    ) {
      // PlexiCam live-call signaling → the call store.
      onCallCb?.({ type: msg.type, payload: msg.payload } as CallSocketEvent)
    } else if (
      msg.type === 'meetingRoster' ||
      msg.type === 'meetingPeerJoined' ||
      msg.type === 'meetingPeerLeft' ||
      msg.type === 'meetingSignal' ||
      msg.type === 'meetingInvited'
    ) {
      // PlexiMeet multi-party room signaling → the meeting store.
      onMeetingCb?.({ type: msg.type, payload: msg.payload } as MeetingSocketEvent)
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
