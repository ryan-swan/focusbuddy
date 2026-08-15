import { describe, it, expect } from 'vitest'
import { foldLifecycle, foldAttrs, type ChangeEvent } from '../../src/shared/crdtWidgetMerge'

// WS01 sync substrate — convergence for widget LINKS (the connector wires between
// widgets on a desk). A wire is a lifecycle object (create carries its endpoints,
// delete tombstones it) plus behaviour fields (type / verb / enabled) folded as
// generic LWW attr registers. Routed with the wire's task node, so a SHARED DESK's
// wires converge across grantees exactly like its widgets. The engine folds a
// wire with this same algebra, so proving it here proves the wire converges.

let seq = 0
const PK = 'l:desk:root1'

function createEv(id: string, at: number, snapshot: Record<string, unknown>): ChangeEvent {
  return { id: `e${seq++}`, ts: new Date(at).toISOString(), partitionKey: PK, objectType: 'link', objectId: id, field: 'create', dataClass: 'set', actor: 'a:dev1', payload: { snapshot, at } }
}
function deleteEv(id: string, at: number, actor = 'b:dev2'): ChangeEvent {
  return { id: `e${seq++}`, ts: new Date(at).toISOString(), partitionKey: PK, objectType: 'link', objectId: id, field: 'delete', dataClass: 'set', actor, payload: { at } }
}
function attrEv(id: string, attr: string, at: number, actor: string, value: unknown): ChangeEvent {
  return { id: `e${seq++}`, ts: new Date(at).toISOString(), partitionKey: PK, objectType: 'link', objectId: id, field: 'attr', dataClass: 'register', actor, payload: { attr, value, at } }
}

function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr]
  const out: T[][] = []
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)]
    for (const p of permutations(rest)) out.push([arr[i], ...p])
  }
  return out
}

const SNAP = { id: 'l1', sourceWidgetId: 'w1', targetWidgetId: 'w2', taskId: 't1', type: 'context', verb: '', enabled: true }

describe('plx_syn — widget-link (wire) convergence (WS01 link)', () => {
  it('create → the wire exists with its endpoints', () => {
    const s = foldLifecycle([createEv('l1', 1000, SNAP)])
    expect(s.deleted).toBe(false)
    expect(s.created).toEqual(SNAP)
  })

  it('create then delete → tombstoned (remove-wins), any order', () => {
    for (const order of permutations([createEv('l1', 1000, SNAP), deleteEv('l1', 2000)])) {
      const s = foldLifecycle(order)
      expect(s.deleted).toBe(true)
      expect(s.created).toBeNull() // a delete is never undone by the create
    }
  })

  it('type/verb/enabled are LWW attrs — the latest write per field wins, any order', () => {
    const evs = [
      createEv('l1', 1000, SNAP),
      attrEv('l1', 'type', 2000, 'a:dev1', 'transform'),
      attrEv('l1', 'type', 3000, 'b:dev2', 'mirror'),
      attrEv('l1', 'enabled', 2500, 'a:dev1', false),
      attrEv('l1', 'verb', 2600, 'b:dev2', 'summarise')
    ]
    for (const order of permutations(evs)) {
      const attrs = foldAttrs(order)
      expect(attrs.get('type')?.value).toBe('mirror') // 3000 beats 2000
      expect(attrs.get('enabled')?.value).toBe(false)
      expect(attrs.get('verb')?.value).toBe('summarise')
    }
  })

  it('duplicate events (offline replay) are idempotent', () => {
    const base = [createEv('l1', 1000, SNAP), attrEv('l1', 'type', 2000, 'a:dev1', 'transform')]
    const once = foldAttrs(base).get('type')?.value
    const twice = foldAttrs([...base, ...base]).get('type')?.value
    expect(twice).toBe(once)
    expect(twice).toBe('transform')
  })

  it('two grantees retyping the same wire concurrently converge deterministically', () => {
    // Same timestamp, different actors → the actor tiebreak resolves it identically
    // on every replica, in any order.
    const evs = [
      createEv('l1', 1000, SNAP),
      attrEv('l1', 'type', 5000, 'a:dev1', 'transform'),
      attrEv('l1', 'type', 5000, 'b:dev2', 'mirror')
    ]
    const winners = new Set<unknown>()
    for (const order of permutations(evs)) winners.add(foldAttrs(order).get('type')?.value)
    expect(winners.size).toBe(1) // all permutations agree on one winner
  })
})
