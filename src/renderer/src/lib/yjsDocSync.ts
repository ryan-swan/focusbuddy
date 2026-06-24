import * as Y from 'yjs'
import {
  Awareness,
  encodeAwarenessUpdate,
  applyAwarenessUpdate,
  removeAwarenessStates
} from 'y-protocols/awareness'

// Client half of the real-time co-editing protocol. The server half is the
// yjsJoin / yjsSync / yjsUpdate / yjsAwareness relay in focusbuddy-signal. This
// is deliberately transport-agnostic: it is handed a `send` function and is fed
// inbound messages via handleMessage(), so in the app it rides the existing
// messaging WebSocket and in tests it rides a plain in-memory bus.
//
// Echo safety: both document updates and awareness updates applied from the
// network are tagged with this instance as their origin, and the local handlers
// ignore that origin, so a received update is never re-broadcast.

export type YjsOut =
  | { type: 'yjsJoin'; payload: { docId: string } }
  | { type: 'yjsLeave'; payload: { docId: string } }
  | { type: 'yjsUpdate'; payload: { docId: string; update: string } }
  | { type: 'yjsAwareness'; payload: { docId: string; update: string } }

export type YjsIn =
  | { type: 'yjsSync'; payload: { docId: string; updates: string[] } }
  | { type: 'yjsUpdate'; payload: { docId: string; update: string } }
  | { type: 'yjsAwareness'; payload: { docId: string; update: string } }

// base64 helpers that work in both the renderer (browser) and node/jsdom tests.
function toB64(u8: Uint8Array): string {
  let s = ''
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i])
  return btoa(s)
}
function fromB64(s: string): Uint8Array {
  const bin = atob(s)
  const u8 = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i)
  return u8
}

export class YjsDocSync {
  readonly doc: Y.Doc
  readonly awareness: Awareness
  readonly docId: string
  private send: (m: YjsOut) => void
  private destroyed = false
  private synced = false
  // Fired once, after the server's replay log has been applied. The caller uses
  // it to seed the doc from its body only if it's still empty (nothing replayed).
  private onFirstSync?: () => void

  constructor(docId: string, doc: Y.Doc, send: (m: YjsOut) => void, onFirstSync?: () => void) {
    this.docId = docId
    this.doc = doc
    this.send = send
    this.onFirstSync = onFirstSync
    this.awareness = new Awareness(doc)
    this.doc.on('update', this.onLocalUpdate)
    this.awareness.on('update', this.onAwarenessUpdate)
    // Ask the server to add us to the doc room and replay the log.
    this.send({ type: 'yjsJoin', payload: { docId } })
  }

  private onLocalUpdate = (update: Uint8Array, origin: unknown): void => {
    if (origin === this || this.destroyed) return
    this.send({ type: 'yjsUpdate', payload: { docId: this.docId, update: toB64(update) } })
  }

  private onAwarenessUpdate = (
    changes: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown
  ): void => {
    if (origin === this || this.destroyed) return
    const changed = [...changes.added, ...changes.updated, ...changes.removed]
    const update = encodeAwarenessUpdate(this.awareness, changed)
    this.send({ type: 'yjsAwareness', payload: { docId: this.docId, update: toB64(update) } })
  }

  // Feed a server message in. Ignores messages for other docs.
  handleMessage(msg: YjsIn): void {
    if (this.destroyed) return
    const docId = (msg as { payload?: { docId?: string } }).payload?.docId
    if (docId !== this.docId) return
    if (msg.type === 'yjsSync') {
      Y.transact(
        this.doc,
        () => {
          for (const u of msg.payload.updates) Y.applyUpdate(this.doc, fromB64(u), this)
        },
        this
      )
      if (!this.synced) {
        this.synced = true
        this.onFirstSync?.()
      }
    } else if (msg.type === 'yjsUpdate') {
      Y.applyUpdate(this.doc, fromB64(msg.payload.update), this)
    } else if (msg.type === 'yjsAwareness') {
      applyAwarenessUpdate(this.awareness, fromB64(msg.payload.update), this)
    }
  }

  // Re-join after a socket reconnect: re-enter the room, push our full document
  // state (so edits made while disconnected reach the server — Yjs merges
  // idempotently), and re-broadcast our cursor so peers see us again.
  rejoin(): void {
    if (this.destroyed) return
    this.send({ type: 'yjsJoin', payload: { docId: this.docId } })
    this.send({ type: 'yjsUpdate', payload: { docId: this.docId, update: toB64(Y.encodeStateAsUpdate(this.doc)) } })
    const states = [...this.awareness.getStates().keys()]
    if (states.length) {
      this.send({
        type: 'yjsAwareness',
        payload: { docId: this.docId, update: toB64(encodeAwarenessUpdate(this.awareness, states)) }
      })
    }
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.doc.off('update', this.onLocalUpdate)
    this.awareness.off('update', this.onAwarenessUpdate)
    // Tell peers our cursor is gone, then tear down.
    removeAwarenessStates(this.awareness, [this.doc.clientID], this)
    this.awareness.destroy()
    this.send({ type: 'yjsLeave', payload: { docId: this.docId } })
  }
}
