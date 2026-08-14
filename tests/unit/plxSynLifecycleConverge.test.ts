import { describe, it, expect } from 'vitest'
import { foldLifecycle, foldRegisterFields, type ChangeEvent } from '../../src/shared/crdtWidgetMerge'

// WS01 sync substrate — convergence for object LIFECYCLE (create + delete) and the
// remaining widget content fields. Lifecycle is a remove-wins existence CRDT: a
// delete tombstones the object permanently, so a create never resurrects it, in any
// delivery order. Content fields (content/title/color/status) are LWW registers,
// folded by the shared foldRegisterFields.

let seq = 0
function createEv(id: string, at: number, snapshot: Record<string, unknown>): ChangeEvent {
  return {
    id: `e${seq++}`,
    ts: new Date(at).toISOString(),
    partitionKey: 'w:acct:a',
    objectType: 'widget',
    objectId: id,
    field: 'create',
    dataClass: 'set',
    actor: 'a:dev1',
    payload: { snapshot, at }
  }
}
function deleteEv(id: string, at: number, actor = 'b:dev2'): ChangeEvent {
  return {
    id: `e${seq++}`,
    ts: new Date(at).toISOString(),
    partitionKey: 'w:acct:a',
    objectType: 'widget',
    objectId: id,
    field: 'delete',
    dataClass: 'set',
    actor,
    payload: { at }
  }
}
function fieldEv(id: string, field: ChangeEvent['field'], at: number, actor: string, value: unknown): ChangeEvent {
  return {
    id: `e${seq++}`,
    ts: new Date(at).toISOString(),
    partitionKey: 'w:acct:a',
    objectType: 'widget',
    objectId: id,
    field,
    dataClass: 'register',
    actor,
    payload: { value, at }
  }
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

const WIDGET_FIELDS = new Set(['content', 'title', 'color', 'status'])

describe('plx_syn — lifecycle CRDT convergence (WS01 create/delete)', () => {
  it('create only → the object exists with its snapshot', () => {
    const snap = { id: 'w1', taskId: 't1', kind: 'sticky', content: 'hi' }
    const s = foldLifecycle([createEv('w1', 1000, snap)])
    expect(s.deleted).toBe(false)
    expect(s.created).toEqual(snap)
  })

  it('create then delete → tombstoned (remove-wins), any order', () => {
    const snap = { id: 'w1', taskId: 't1', kind: 'sticky' }
    const create = createEv('w1', 1000, snap)
    const del = deleteEv('w1', 2000)
    for (const order of permutations([create, del])) {
      const s = foldLifecycle(order)
      expect(s.deleted).toBe(true)
      expect(s.created).toBeNull() // a delete is never undone by the create
    }
  })

  it('a delete delivered BEFORE its create still tombstones (order-independent)', () => {
    const create = createEv('w1', 2000, { id: 'w1', taskId: 't1', kind: 'sticky' })
    const del = deleteEv('w1', 1000)
    expect(foldLifecycle([del, create]).deleted).toBe(true)
    expect(foldLifecycle([del, create]).created).toBeNull()
  })

  it('duplicated create/delete events (offline re-flush) do not change the result', () => {
    const create = createEv('w1', 1000, { id: 'w1', taskId: 't1', kind: 'sticky' })
    const del = deleteEv('w1', 2000)
    expect(foldLifecycle([create, del, create, del, del]).deleted).toBe(true)
  })

  it('widget content fields converge as LWW registers, cross-field independent', () => {
    const content = fieldEv('w1', 'content', 1000, 'a:dev1', 'hello')
    const title = fieldEv('w1', 'title', 1001, 'b:dev2', 'My Sticky')
    const contentLater = fieldEv('w1', 'content', 2000, 'c:dev3', 'goodbye')
    for (const order of permutations([content, title, contentLater])) {
      const regs = foldRegisterFields(order, WIDGET_FIELDS)
      expect(regs.get('content')?.value).toBe('goodbye') // latest content wins
      expect(regs.get('title')?.value).toBe('My Sticky') // title untouched by content edits
    }
  })
})
