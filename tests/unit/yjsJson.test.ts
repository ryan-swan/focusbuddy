import { describe, it, expect } from 'vitest'
import * as Y from 'yjs'
import { reconcileMap, yToJson } from '@renderer/lib/yjsJson'

// Sync helper: apply a JSON body to a doc's root map.
function setBody(doc: Y.Doc, body: Record<string, unknown>): void {
  Y.transact(doc, () => reconcileMap(doc.getMap('root'), body))
}
function getBody(doc: Y.Doc): unknown {
  return yToJson(doc.getMap('root'))
}
function sync(a: Y.Doc, b: Y.Doc): void {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b))
}

describe('yjsJson reconcile', () => {
  it('round-trips a nested body', () => {
    const d = new Y.Doc()
    const body = { sheets: [{ name: 'Tab', cells: { A1: 'hi', B2: '42' } }], names: [] }
    setBody(d, body)
    expect(getBody(d)).toEqual(body)
  })

  it('merges concurrent edits to DIFFERENT cells (both survive)', () => {
    const d1 = new Y.Doc()
    const d2 = new Y.Doc()
    setBody(d1, { sheets: [{ cells: { A1: 'x', B1: 'y' } }] })
    sync(d1, d2) // both share the base

    // Concurrent: client 1 edits A1, client 2 edits B1.
    setBody(d1, { sheets: [{ cells: { A1: 'CHANGED1', B1: 'y' } }] })
    setBody(d2, { sheets: [{ cells: { A1: 'x', B1: 'CHANGED2' } }] })
    sync(d1, d2)

    const r1 = getBody(d1) as { sheets: Array<{ cells: Record<string, string> }> }
    expect(getBody(d1)).toEqual(getBody(d2)) // converged
    expect(r1.sheets[0].cells.A1).toBe('CHANGED1') // client 1's edit survived
    expect(r1.sheets[0].cells.B1).toBe('CHANGED2') // client 2's edit survived
  })

  it('handles add + remove of keys and array growth/shrink', () => {
    const d = new Y.Doc()
    setBody(d, { a: 1, b: 2, list: [1, 2, 3] })
    setBody(d, { a: 1, c: 3, list: [1, 2] }) // remove b, add c, drop a list item
    expect(getBody(d)).toEqual({ a: 1, c: 3, list: [1, 2] })
  })
})
