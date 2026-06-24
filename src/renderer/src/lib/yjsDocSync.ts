import * as Y from 'yjs'

// Client half of the real-time co-editing protocol. The server half is the
// yjsJoin / yjsSync / yjsUpdate relay in focusbuddy-signal. This is deliberately
// transport-agnostic: it is handed a `send` function and is fed inbound messages
// via handleMessage(), so in the app it rides the existing messaging WebSocket
// and in tests it rides a plain in-memory bus. It owns no socket itself.
//
// Echo safety: updates applied from the network are tagged with this instance as
// their Yjs transaction origin, and the local-update handler ignores anything
// with that origin, so a received update is never re-broadcast.

export type YjsOut =
  | { type: 'yjsJoin'; payload: { docId: string } }
  | { type: 'yjsLeave'; payload: { docId: string } }
  | { type: 'yjsUpdate'; payload: { docId: string; update: string } }

export type YjsIn =
  | { type: 'yjsSync'; payload: { docId: string; updates: string[] } }
  | { type: 'yjsUpdate'; payload: { docId: string; update: string } }

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
  readonly docId: string
  private send: (m: YjsOut) => void
  private destroyed = false

  constructor(docId: string, doc: Y.Doc, send: (m: YjsOut) => void) {
    this.docId = docId
    this.doc = doc
    this.send = send
    this.doc.on('update', this.onLocalUpdate)
    // Ask the server to add us to the doc room and replay the log.
    this.send({ type: 'yjsJoin', payload: { docId } })
  }

  private onLocalUpdate = (update: Uint8Array, origin: unknown): void => {
    // Skip updates we applied from the network (origin === this) so we don't
    // bounce them back, and stop sending once destroyed.
    if (origin === this || this.destroyed) return
    this.send({ type: 'yjsUpdate', payload: { docId: this.docId, update: toB64(update) } })
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
    } else if (msg.type === 'yjsUpdate') {
      Y.applyUpdate(this.doc, fromB64(msg.payload.update), this)
    }
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.doc.off('update', this.onLocalUpdate)
    this.send({ type: 'yjsLeave', payload: { docId: this.docId } })
  }
}
