import { describe, it, expect } from 'vitest'
import * as Y from 'yjs'
import { Schema } from 'prosemirror-model'
import { seedYDocFromPm, COLLAB_FIELD } from '@renderer/lib/yjsSeed'

// A minimal ProseMirror schema (doc/paragraph/text) — enough to prove the
// idempotency property without dragging in the editor's full extension set. The
// property under test (pinned-clientID seeds merge without duplication) is about
// Yjs, not the specific schema.
const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*', toDOM: () => ['p', 0], parseDOM: [{ tag: 'p' }] },
    text: { group: 'inline' }
  },
  marks: {}
})

const pmWith = (text: string): object => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
})

describe('seedYDocFromPm', () => {
  it('seeds the content into the collab fragment', () => {
    const d = new Y.Doc()
    seedYDocFromPm(d, pmWith('Hello world'), schema)
    expect(d.getXmlFragment(COLLAB_FIELD).toString()).toContain('Hello world')
  })

  it('two independent seeds of identical content merge WITHOUT duplicating it', () => {
    const a = new Y.Doc()
    seedYDocFromPm(a, pmWith('Acme plan'), schema)
    const b = new Y.Doc()
    seedYDocFromPm(b, pmWith('Acme plan'), schema)
    // Simulate the relay merging both clients' seeds into each other.
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b))
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
    const ta = a.getXmlFragment(COLLAB_FIELD).toString()
    const tb = b.getXmlFragment(COLLAB_FIELD).toString()
    expect(ta).toBe(tb) // converged
    expect((ta.match(/Acme plan/g) || []).length).toBe(1) // exactly once, not doubled
  })

  it('does not reseed a fragment that already has content', () => {
    const d = new Y.Doc()
    seedYDocFromPm(d, pmWith('First'), schema)
    seedYDocFromPm(d, pmWith('Second'), schema)
    const t = d.getXmlFragment(COLLAB_FIELD).toString()
    expect(t).toContain('First')
    expect(t).not.toContain('Second')
  })
})
