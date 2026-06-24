import { describe, it, expect } from 'vitest'
import * as Y from 'yjs'
import { YjsDocSync, type YjsOut } from '@renderer/lib/yjsDocSync'

// A fake server relay mirroring focusbuddy-signal: keeps the update log, replies
// to a join with the log, and forwards each update to the OTHER clients. Delivery
// is async (setTimeout) to mimic a real socket and avoid synchronous re-entrancy
// while a client is still constructing.
class Relay {
  private log: string[] = []
  private clients = new Map<object, (m: unknown) => void>()
  register(key: object, deliver: (m: unknown) => void): void {
    this.clients.set(key, deliver)
  }
  onSend(sender: object, msg: YjsOut): void {
    setTimeout(() => {
      if (msg.type === 'yjsJoin') {
        this.clients.get(sender)?.({ type: 'yjsSync', payload: { docId: msg.payload.docId, updates: [...this.log] } })
      } else if (msg.type === 'yjsUpdate') {
        this.log.push(msg.payload.update)
        for (const [key, deliver] of this.clients) if (key !== sender) deliver(msg)
      } else if (msg.type === 'yjsAwareness') {
        // Ephemeral: relay to others, never logged.
        for (const [key, deliver] of this.clients) if (key !== sender) deliver(msg)
      }
    }, 0)
  }
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 10))

function makeClient(relay: Relay, docId: string): YjsDocSync {
  const holder: { sync?: YjsDocSync } = {}
  relay.register(holder, (m) => holder.sync?.handleMessage(m as never))
  holder.sync = new YjsDocSync(docId, new Y.Doc(), (m) => relay.onSend(holder, m))
  return holder.sync
}

describe('YjsDocSync', () => {
  it('relays an edit so the other client converges', async () => {
    const relay = new Relay()
    const a = makeClient(relay, 'doc1')
    const b = makeClient(relay, 'doc1')
    await tick()
    a.doc.getText('content').insert(0, 'Hello')
    await tick()
    expect(b.doc.getText('content').toString()).toBe('Hello')
  })

  it('converges on edits from both sides without echo loops', async () => {
    const relay = new Relay()
    const a = makeClient(relay, 'doc1')
    const b = makeClient(relay, 'doc1')
    await tick()
    a.doc.getText('content').insert(0, 'Hello')
    await tick()
    b.doc.getText('content').insert(5, ' world')
    await tick()
    expect(a.doc.getText('content').toString()).toBe('Hello world')
    expect(b.doc.getText('content').toString()).toBe('Hello world')
  })

  it('a late joiner replays the log and converges', async () => {
    const relay = new Relay()
    const a = makeClient(relay, 'doc1')
    await tick()
    a.doc.getText('content').insert(0, 'Seeded')
    await tick()
    const c = makeClient(relay, 'doc1')
    await tick()
    expect(c.doc.getText('content').toString()).toBe('Seeded')
  })

  it('ignores messages addressed to a different doc', async () => {
    const relay = new Relay()
    const a = makeClient(relay, 'doc1')
    await tick()
    a.handleMessage({ type: 'yjsUpdate', payload: { docId: 'OTHER', update: 'zzzz' } })
    expect(a.doc.getText('content').toString()).toBe('')
  })

  it('relays awareness (cursor presence) to other clients', async () => {
    const relay = new Relay()
    const a = makeClient(relay, 'doc1')
    const b = makeClient(relay, 'doc1')
    await tick()
    a.awareness.setLocalStateField('user', { name: 'Alice', color: '#ff0000' })
    await tick()
    const seen = [...b.awareness.getStates().values()].some(
      (s) => (s as { user?: { name?: string } })?.user?.name === 'Alice'
    )
    expect(seen).toBe(true)
  })

  it('rejoin re-enters the room and pushes state (reconnect)', () => {
    const sent: Array<{ type: string }> = []
    const sync = new YjsDocSync('doc1', new Y.Doc(), (m) => sent.push(m))
    sent.length = 0 // drop the constructor's initial join
    sync.rejoin()
    expect(sent.some((m) => m.type === 'yjsJoin')).toBe(true)
    expect(sent.some((m) => m.type === 'yjsUpdate')).toBe(true)
  })
})
