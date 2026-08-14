import { describe, it, expect } from 'vitest'
import { foldWidget, resolvedSection, foldRegisterFields, type ChangeEvent } from '../../src/shared/crdtWidgetMerge'

// WS01 sync substrate — the convergence guarantee for the first migrated type.
//
// The design's promise is that two clients editing the same widget, with events
// delivered in ANY order (or duplicated after an offline reconnect), converge to
// ONE deterministic state with zero lost edits. foldWidget is the pure core the
// client engine runs, so proving it here proves what ships. The live two-window
// Playwright spec exercises the same core over the real socket; this test pins the
// algebra.

let seq = 0
function geomEvent(
  objectId: string,
  actor: string,
  at: number,
  geom: { x: number; y: number; width: number; height: number }
): ChangeEvent {
  return {
    id: `e${seq++}`,
    ts: new Date(at).toISOString(),
    partitionKey: 'w:acct:a',
    objectType: 'widget',
    objectId,
    field: 'geom',
    dataClass: 'register',
    actor,
    payload: { geom, at }
  }
}
function memberEvent(
  objectId: string,
  actor: string,
  op: 'add' | 'remove',
  section: string,
  tags: string[]
): ChangeEvent {
  return {
    id: `e${seq++}`,
    ts: new Date().toISOString(),
    partitionKey: 'w:acct:a',
    objectType: 'widget',
    objectId,
    field: 'members',
    dataClass: 'set',
    actor,
    payload: { op, section, tags }
  }
}

// Every permutation of a small event list, so "order-independent" is tested, not
// asserted. Factorial blow-up is fine for <= 6 events.
function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr]
  const out: T[][] = []
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)]
    for (const p of permutations(rest)) out.push([arr[i], ...p])
  }
  return out
}

describe('plx_syn — widget CRDT convergence (WS01 first slice)', () => {
  it('geometry (LWW register): concurrent drags converge to the latest, deterministically', () => {
    // Two clients drag the same widget. Client B's edit is later in time, so it wins
    // — and it wins no matter what order the two events arrive in.
    const early = geomEvent('w1', 'a:dev1', 1000, { x: 10, y: 10, width: 200, height: 100 })
    const late = geomEvent('w1', 'b:dev2', 2000, { x: 55, y: 77, width: 200, height: 100 })
    for (const order of permutations([early, late])) {
      const state = foldWidget(order)
      expect(state.geom?.value).toEqual({ x: 55, y: 77, width: 200, height: 100 })
      expect(state.geom?.actor).toBe('b:dev2')
    }
  })

  it('geometry: an equal-timestamp tie breaks deterministically by actor (no divergence)', () => {
    // Genuinely concurrent (same ms) edits must still converge to ONE value, chosen
    // the same way on every replica. lwwMerge breaks the tie by actor id.
    const a = geomEvent('w1', 'a:dev1', 3000, { x: 1, y: 1, width: 50, height: 50 })
    const b = geomEvent('w1', 'z:dev9', 3000, { x: 2, y: 2, width: 50, height: 50 })
    const results = permutations([a, b]).map((o) => foldWidget(o).geom?.value)
    for (const r of results) expect(r).toEqual(results[0]) // all permutations agree
    expect(results[0]).toEqual({ x: 2, y: 2, width: 50, height: 50 }) // 'z' >= 'a'
  })

  it('geometry: a duplicated event (offline re-flush) does not change the result', () => {
    const e1 = geomEvent('w1', 'a:dev1', 1000, { x: 10, y: 10, width: 200, height: 100 })
    const e2 = geomEvent('w1', 'b:dev2', 2000, { x: 55, y: 77, width: 200, height: 100 })
    const once = foldWidget([e1, e2])
    const twice = foldWidget([e1, e2, e1, e2, e2]) // idempotent under duplication
    expect(twice.geom?.value).toEqual(once.geom?.value)
  })

  it('membership (OR-Set): concurrent add + remove converge with no lost member', () => {
    // Client A adds w1 to section S; concurrently client B (having seen the add)
    // removes it. Delivery order must not matter, and the remove wins over its own
    // observed add without erasing an unrelated concurrent add.
    const addToS = memberEvent('w1', 'a:dev1', 'add', 'S', ['tagS'])
    const removeS = memberEvent('w1', 'b:dev2', 'remove', 'S', ['tagS'])
    for (const order of permutations([addToS, removeS])) {
      expect(foldWidget(order).sections).toEqual([]) // observed add removed on both
    }
  })

  it('membership: a remove delivered BEFORE its add still converges (tombstone wins)', () => {
    // Reordered delivery across a partition: the remove references the exact tag, so
    // it tombstones the add whenever the add arrives — order-independent.
    const add = memberEvent('w1', 'a:dev1', 'add', 'S', ['t1'])
    const remove = memberEvent('w1', 'a:dev1', 'remove', 'S', ['t1'])
    expect(foldWidget([remove, add]).sections).toEqual([])
    expect(foldWidget([add, remove]).sections).toEqual([])
  })

  it('membership: a move A -> B converges to B (remove A, add B, any order)', () => {
    const inA = memberEvent('w1', 'a:dev1', 'add', 'A', ['tA'])
    const removeA = memberEvent('w1', 'a:dev1', 'remove', 'A', ['tA'])
    const addB = memberEvent('w1', 'a:dev1', 'add', 'B', ['tB'])
    for (const order of permutations([inA, removeA, addB])) {
      const s = foldWidget(order)
      expect(s.sections).toEqual(['B'])
      expect(resolvedSection(s)).toBe('B')
    }
  })

  it('ordering (widget zIndex): stacking order is an LWW-per-item register', () => {
    // Two clients raise the same widget; the later raise wins deterministically.
    const early: ChangeEvent = {
      id: 'o1', ts: new Date(1000).toISOString(), partitionKey: 'w:acct:a', objectType: 'widget',
      objectId: 'w1', field: 'order', dataClass: 'register', actor: 'a:dev1', payload: { value: 5, at: 1000 }
    }
    const late: ChangeEvent = {
      id: 'o2', ts: new Date(2000).toISOString(), partitionKey: 'w:acct:a', objectType: 'widget',
      objectId: 'w1', field: 'order', dataClass: 'register', actor: 'b:dev2', payload: { value: 9, at: 2000 }
    }
    for (const order of permutations([early, late])) {
      expect(foldRegisterFields(order, new Set(['order'])).get('order')?.value).toBe(9)
    }
  })

  it('resolvedSection: a transient double-membership resolves the same on every replica', () => {
    // Two concurrent adds to different sections (no remove yet) leave two live
    // memberships mid-convergence; resolvedSection must pick deterministically so no
    // two replicas disagree until the losing remove propagates.
    const addB = memberEvent('w1', 'a:dev1', 'add', 'B', ['tB'])
    const addA = memberEvent('w1', 'b:dev2', 'add', 'A', ['tA'])
    const picks = permutations([addA, addB]).map((o) => resolvedSection(foldWidget(o)))
    for (const p of picks) expect(p).toBe(picks[0])
    expect(picks[0]).toBe('A') // deterministic: lowest id
  })
})
