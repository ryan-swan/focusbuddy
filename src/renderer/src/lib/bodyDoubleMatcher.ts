// Matching + signaling abstraction for the body double feature.
//
// In production this will be backed by a small hosted matching service +
// WebRTC for peer-to-peer audio. v1 implements a LOCAL ONLY mock matcher
// using BroadcastChannel — two FocusBuddy windows on the same machine can
// find each other and exchange chat messages, which is enough to develop
// and design the UX without standing up a real server.
//
// The Matcher interface is what the store consumes — when we swap in a
// real server-backed matcher, the store doesn't change.

import type {
  BodyDoubleChatMessage,
  BodyDoubleMode,
  BodyDoublePartner,
  BodyDoubleRequest
} from '@shared/types'

export interface MatcherEvents {
  // Fired when a partner is found and the session is provisionally matched.
  // The store transitions from `looking` to `matched` on this event.
  onPartnerMatched: (partner: BodyDoublePartner) => void
  // Fired when the partner sends a chat message.
  onChatMessage: (msg: BodyDoubleChatMessage) => void
  // Fired when the partner leaves the session (or we lose them). Triggers
  // the local store to transition to idle and surface a "they left" toast.
  onPartnerLeft: () => void
}

export interface Matcher {
  // Place a request on the queue. Resolves once the request is in flight;
  // the actual match (which might never come) is delivered via events.
  startLooking: (req: BodyDoubleRequest, events: MatcherEvents) => Promise<void>
  // Cancel an in-flight request and remove ourselves from the queue. Called
  // when the user clicks "Cancel" during the looking state.
  stopLooking: () => Promise<void>
  // Send a chat message to the matched partner. No-op when not in a session.
  sendChat: (text: string) => void
  // Politely end the active session — notifies the partner.
  endSession: () => Promise<void>
}

// ─── Local mock matcher (BroadcastChannel-based) ────────────────────────────
// Two FocusBuddy windows on the same machine can talk over a shared
// BroadcastChannel. Production will replace this with a WebSocket-based
// matcher hitting our hosted signaling service.

interface PoolEntry {
  fromHandle: string
  mode: BodyDoubleMode
  workingOn: string | null
  // Random per-session id so the matcher can target one specific window
  // when two are queuing at once.
  sessionId: string
  ts: number
}

interface BroadcastMessage {
  // 'announce': a window is in the matching pool.
  // 'match-offer': someone is offering a match to a specific sessionId.
  // 'match-accept': the recipient of an offer accepts; both transition to matched.
  // 'leave-pool': the window withdrew its request.
  // 'chat': in-session text message.
  // 'end': the partner is ending the session.
  type: 'announce' | 'match-offer' | 'match-accept' | 'leave-pool' | 'chat' | 'end'
  payload: unknown
}

const CHANNEL = 'fb-body-double-mock'

export class LocalMockMatcher implements Matcher {
  private channel: BroadcastChannel | null = null
  private mySessionId: string
  private myHandle: string | null = null
  private partnerSessionId: string | null = null
  private events: MatcherEvents | null = null
  private pool = new Map<string, PoolEntry>()
  private myRequest: BodyDoubleRequest | null = null
  private myEntry: PoolEntry | null = null
  private rescanTimer: ReturnType<typeof setTimeout> | null = null

  constructor() {
    this.mySessionId =
      Math.random().toString(36).slice(2, 9) +
      Math.random().toString(36).slice(2, 9)
  }

  async startLooking(
    req: BodyDoubleRequest,
    events: MatcherEvents
  ): Promise<void> {
    this.myRequest = req
    this.myHandle = req.handle
    this.events = events
    this.channel = new BroadcastChannel(CHANNEL)
    this.channel.onmessage = (e: MessageEvent) => this.onMessage(e.data as BroadcastMessage)
    this.myEntry = {
      fromHandle: req.handle,
      mode: req.mode,
      workingOn: req.workingOn ?? null,
      sessionId: this.mySessionId,
      ts: Date.now()
    }
    // Announce ourselves so any existing peers can find us.
    this.broadcast({ type: 'announce', payload: this.myEntry })
    // Tick periodically to try matching — covers the race where a window
    // arrived before us and is still waiting.
    this.scheduleRescan()
  }

  async stopLooking(): Promise<void> {
    if (this.channel) {
      this.broadcast({ type: 'leave-pool', payload: { sessionId: this.mySessionId } })
    }
    this.clear()
  }

  sendChat(text: string): void {
    if (!this.channel || !this.partnerSessionId || !this.myHandle) return
    this.broadcast({
      type: 'chat',
      payload: {
        toSessionId: this.partnerSessionId,
        fromSessionId: this.mySessionId,
        fromHandle: this.myHandle,
        text,
        id: Math.random().toString(36).slice(2, 10),
        ts: Date.now()
      }
    })
  }

  async endSession(): Promise<void> {
    if (this.channel && this.partnerSessionId) {
      this.broadcast({
        type: 'end',
        payload: {
          toSessionId: this.partnerSessionId,
          fromSessionId: this.mySessionId
        }
      })
    }
    this.clear()
  }

  private onMessage(msg: BroadcastMessage): void {
    if (!this.events) return
    switch (msg.type) {
      case 'announce': {
        const entry = msg.payload as PoolEntry
        if (entry.sessionId === this.mySessionId) return
        this.pool.set(entry.sessionId, entry)
        this.tryMatch()
        break
      }
      case 'match-offer': {
        const offer = msg.payload as {
          toSessionId: string
          fromSessionId: string
          fromHandle: string
          fromMode: BodyDoubleMode
          fromWorkingOn: string | null
        }
        if (offer.toSessionId !== this.mySessionId) return
        if (this.partnerSessionId) return // already matched
        // Accept the first offer that meets our mode compatibility.
        if (!this.myRequest) return
        if (!modesCompatible(this.myRequest.mode, offer.fromMode)) return
        this.partnerSessionId = offer.fromSessionId
        this.broadcast({
          type: 'match-accept',
          payload: {
            toSessionId: offer.fromSessionId,
            fromSessionId: this.mySessionId,
            fromHandle: this.myRequest.handle,
            fromWorkingOn: this.myRequest.workingOn ?? null
          }
        })
        this.events.onPartnerMatched({
          handle: offer.fromHandle,
          workingOn: offer.fromWorkingOn,
          joinedAt: Date.now()
        })
        break
      }
      case 'match-accept': {
        const accept = msg.payload as {
          toSessionId: string
          fromSessionId: string
          fromHandle: string
          fromWorkingOn: string | null
        }
        if (accept.toSessionId !== this.mySessionId) return
        if (this.partnerSessionId) return
        this.partnerSessionId = accept.fromSessionId
        this.events.onPartnerMatched({
          handle: accept.fromHandle,
          workingOn: accept.fromWorkingOn,
          joinedAt: Date.now()
        })
        break
      }
      case 'leave-pool': {
        const { sessionId } = msg.payload as { sessionId: string }
        this.pool.delete(sessionId)
        if (sessionId === this.partnerSessionId) {
          this.events.onPartnerLeft()
          this.clear()
        }
        break
      }
      case 'chat': {
        const m = msg.payload as {
          toSessionId: string
          fromSessionId: string
          fromHandle: string
          text: string
          id: string
          ts: number
        }
        if (m.toSessionId !== this.mySessionId) return
        if (m.fromSessionId !== this.partnerSessionId) return
        this.events.onChatMessage({
          id: m.id,
          senderHandle: m.fromHandle,
          text: m.text,
          ts: m.ts
        })
        break
      }
      case 'end': {
        const m = msg.payload as { toSessionId: string; fromSessionId: string }
        if (m.toSessionId !== this.mySessionId) return
        if (m.fromSessionId !== this.partnerSessionId) return
        this.events.onPartnerLeft()
        this.clear()
        break
      }
    }
  }

  private tryMatch(): void {
    if (this.partnerSessionId) return
    if (!this.myRequest || !this.myEntry) return
    // Find the oldest compatible peer in the pool.
    let oldest: PoolEntry | null = null
    for (const entry of this.pool.values()) {
      if (entry.sessionId === this.mySessionId) continue
      if (!modesCompatible(this.myRequest.mode, entry.mode)) continue
      if (!oldest || entry.ts < oldest.ts) oldest = entry
    }
    if (!oldest) return
    // Send an offer; they'll accept if they're still in their looking state.
    this.broadcast({
      type: 'match-offer',
      payload: {
        toSessionId: oldest.sessionId,
        fromSessionId: this.mySessionId,
        fromHandle: this.myRequest.handle,
        fromMode: this.myRequest.mode,
        fromWorkingOn: this.myRequest.workingOn ?? null
      }
    })
  }

  private scheduleRescan(): void {
    if (this.rescanTimer) clearTimeout(this.rescanTimer)
    // Re-announce every 1.5s so peers that opened after us still see us.
    this.rescanTimer = setTimeout(() => {
      if (!this.channel || this.partnerSessionId) return
      if (this.myEntry) {
        this.broadcast({ type: 'announce', payload: this.myEntry })
      }
      this.scheduleRescan()
    }, 1500)
  }

  private broadcast(msg: BroadcastMessage): void {
    this.channel?.postMessage(msg)
  }

  private clear(): void {
    if (this.rescanTimer) clearTimeout(this.rescanTimer)
    this.rescanTimer = null
    this.channel?.close()
    this.channel = null
    this.pool.clear()
    this.partnerSessionId = null
    this.myEntry = null
    this.myRequest = null
    this.events = null
  }
}

// Mode compatibility: paired users must be on the same wavelength. We
// accept exact-match for simplicity in v1. A future enhancement could let
// the silent-preference user opt into "willing to upgrade to greetings if
// the partner wants" — but for now, mismatched modes are a no-match.
function modesCompatible(a: BodyDoubleMode, b: BodyDoubleMode): boolean {
  return a === b
}

// ─── Remote matcher (WebSocket to focusbuddy-signal) ────────────────────────
//
// Connects to the hosted signaling service. Wraps the wire protocol from
// projects/focusbuddy-signal/src/protocol.ts into the local Matcher
// interface — the store, the dialog, and every UI consumer stays the same.
//
// The protocol types are intentionally NOT imported across the project
// boundary (the server is a sibling project with its own tsconfig). We
// re-declare the bare-minimum message shapes inline so the renderer can
// build without a cross-project type dependency.

// Outbound message vocabulary — mirrors ClientToServer in
// projects/focusbuddy-signal/src/protocol.ts. Keep these in sync when the
// server protocol evolves.
type ClientToServer =
  | {
      type: 'announce'
      payload: { mode: BodyDoubleMode; workingOn: string | null; handle: string }
    }
  | { type: 'cancel' }
  | { type: 'chat'; payload: { text: string } }
  | { type: 'end' }
  | { type: 'ping' }

// Inbound message vocabulary — mirrors ServerToClient.
interface ServerMatchedMsg {
  type: 'matched'
  payload: { partner: { handle: string; workingOn: string | null; joinedAt: number } }
}
interface ServerChatMsg {
  type: 'chat'
  payload: { id: string; senderHandle: string; text: string; ts: number }
}
interface ServerPartnerLeftMsg {
  type: 'partnerLeft'
}
interface ServerErrorMsg {
  type: 'error'
  payload: { message: string }
}
interface ServerPongMsg {
  type: 'pong'
}
type ServerToClient =
  | ServerMatchedMsg
  | ServerChatMsg
  | ServerPartnerLeftMsg
  | ServerErrorMsg
  | ServerPongMsg

export class RemoteMatcher implements Matcher {
  private url: string
  private socket: WebSocket | null = null
  private events: MatcherEvents | null = null
  // Heartbeat timer — pings the server every PING_INTERVAL_MS so proxies
  // that drop idle WebSockets (Fly, CloudFront, etc.) don't kill us mid-
  // session. Server responds with `pong`; we don't enforce a reply window
  // in v1, but it's the place to add a "missed N heartbeats → reconnect"
  // policy when we want richer resilience.
  private pingTimer: ReturnType<typeof setInterval> | null = null
  // Pending startLooking promise — resolves once the WebSocket is open
  // and the announce message has been sent. Lets the store's async
  // startLooking await a real network transition rather than racing.
  private connectedResolve: (() => void) | null = null

  constructor(url: string) {
    this.url = url
  }

  async startLooking(
    req: BodyDoubleRequest,
    events: MatcherEvents
  ): Promise<void> {
    this.events = events
    this.socket = new WebSocket(this.url)
    return new Promise((resolve, reject) => {
      this.connectedResolve = resolve
      const sock = this.socket
      if (!sock) {
        reject(new Error('Failed to create WebSocket'))
        return
      }
      const onOpen = (): void => {
        this.send({
          type: 'announce',
          payload: {
            mode: req.mode,
            workingOn: req.workingOn ?? null,
            handle: req.handle
          }
        })
        this.startHeartbeat()
        this.connectedResolve?.()
        this.connectedResolve = null
      }
      const onMessage = (e: MessageEvent): void => {
        try {
          const msg = JSON.parse(String(e.data)) as ServerToClient
          this.dispatch(msg)
        } catch {
          // ignore malformed frames
        }
      }
      const onClose = (): void => {
        // Treat unexpected close as partnerLeft if we were paired. The
        // store will go back to idle and surface a friendly toast.
        if (this.events) this.events.onPartnerLeft()
        this.clear()
      }
      const onError = (): void => {
        // Connection failed (server unreachable, DNS, etc.). Reject the
        // startLooking promise so the store surfaces it as an error.
        if (this.connectedResolve) {
          reject(new Error('Could not reach the matching service.'))
          this.connectedResolve = null
        }
      }
      sock.addEventListener('open', onOpen)
      sock.addEventListener('message', onMessage)
      sock.addEventListener('close', onClose)
      sock.addEventListener('error', onError)
    })
  }

  async stopLooking(): Promise<void> {
    this.send({ type: 'cancel' })
    this.close()
  }

  sendChat(text: string): void {
    this.send({ type: 'chat', payload: { text } })
  }

  async endSession(): Promise<void> {
    this.send({ type: 'end' })
    this.close()
  }

  private dispatch(msg: ServerToClient): void {
    if (!this.events) return
    switch (msg.type) {
      case 'matched':
        this.events.onPartnerMatched({
          handle: msg.payload.partner.handle,
          workingOn: msg.payload.partner.workingOn,
          joinedAt: msg.payload.partner.joinedAt
        })
        break
      case 'chat':
        this.events.onChatMessage({
          id: msg.payload.id,
          senderHandle: msg.payload.senderHandle,
          text: msg.payload.text,
          ts: msg.payload.ts
        })
        break
      case 'partnerLeft':
        this.events.onPartnerLeft()
        // Don't close the socket — the user might want to immediately
        // re-announce without re-handshaking.
        break
      case 'error':
        // v1 doesn't surface server errors to the store's events
        // interface — log and move on. Future: add an onError to the
        // MatcherEvents shape so the dialog can show "the matching
        // service rejected your request: …".
        // eslint-disable-next-line no-console
        console.warn('[RemoteMatcher] server error:', msg.payload.message)
        break
      case 'pong':
        // heartbeat ack — no-op
        break
    }
  }

  private send(msg: ClientToServer): void {
    const sock = this.socket
    if (!sock || sock.readyState !== WebSocket.OPEN) return
    try {
      sock.send(JSON.stringify(msg))
    } catch {
      // ignore — close will surface the underlying problem
    }
  }

  private startHeartbeat(): void {
    if (this.pingTimer) clearInterval(this.pingTimer)
    this.pingTimer = setInterval(() => this.send({ type: 'ping' }), 25_000)
  }

  private close(): void {
    try {
      this.socket?.close()
    } catch {
      // ignore
    }
    this.clear()
  }

  private clear(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
    this.socket = null
    this.events = null
    this.connectedResolve = null
  }
}
