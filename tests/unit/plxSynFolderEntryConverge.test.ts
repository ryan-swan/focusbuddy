import { describe, it, expect } from 'vitest'
import { foldLifecycle, foldRegisterFields, type ChangeEvent } from '../../src/shared/crdtWidgetMerge'

// WS01 sync substrate — convergence for a LIVE FOLDER's tree, modelled as
// `folderentry` CRDT objects. Each entry reuses the proven fields exactly as a node
// does: `create` carries the entry snapshot, `delete` tombstones it (remove-wins),
// and `name` + `parent` are LWW registers folded by the shared foldRegisterFields.
// This is what lets two grantees reorganise the same shared folder WITHOUT the
// check-out lock and still converge to one identical tree, in any delivery order.
//
// The engine (lib/crdtSync.ts applyFolderEntry) folds per objectId with exactly this
// algebra, so proving it here proves the surface converges independent of transport.

let seq = 0
const PK = 'lfe:folder:F1'

function createEv(id: string, at: number, snapshot: Record<string, unknown>): ChangeEvent {
  return { id: `e${seq++}`, ts: new Date(at).toISOString(), partitionKey: PK, objectType: 'folderentry', objectId: id, field: 'create', dataClass: 'set', actor: 'a:dev1', payload: { snapshot, at } }
}
function deleteEv(id: string, at: number, actor = 'b:dev2'): ChangeEvent {
  return { id: `e${seq++}`, ts: new Date(at).toISOString(), partitionKey: PK, objectType: 'folderentry', objectId: id, field: 'delete', dataClass: 'set', actor, payload: { at } }
}
function regEv(id: string, field: 'name' | 'parent', at: number, actor: string, value: unknown): ChangeEvent {
  return { id: `e${seq++}`, ts: new Date(at).toISOString(), partitionKey: PK, objectType: 'folderentry', objectId: id, field, dataClass: 'register', actor, payload: { value, at } }
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

const ENTRY_FIELDS = new Set(['name', 'parent'])

interface Materialised {
  id: string
  name: string
  parentId: string | null
  kind: string
}

// Fold a whole folder's events into its converged entry tree, exactly as the engine
// does: per objectId, lifecycle decides existence, then name/parent LWW registers
// override the create snapshot's values.
function foldFolder(events: ChangeEvent[]): Map<string, Materialised> {
  const byId = new Map<string, ChangeEvent[]>()
  for (const ev of events) {
    const list = byId.get(ev.objectId) ?? []
    list.push(ev)
    byId.set(ev.objectId, list)
  }
  const out = new Map<string, Materialised>()
  for (const [id, evs] of byId) {
    const life = foldLifecycle(evs)
    if (life.deleted || !life.created) continue
    const regs = foldRegisterFields(evs, ENTRY_FIELDS)
    const snap = life.created
    out.set(id, {
      id,
      kind: snap.kind as string,
      name: (regs.get('name')?.value as string | undefined) ?? (snap.name as string),
      parentId: (regs.has('parent') ? (regs.get('parent')!.value as string | null) : (snap.parentId as string | null)) ?? null
    })
  }
  return out
}

function normalise(tree: Map<string, Materialised>): Materialised[] {
  return [...tree.values()].sort((a, b) => a.id.localeCompare(b.id))
}

describe('plx_syn — live-folder tree convergence (WS01 folderentry)', () => {
  it('create a folder + a file in it → both exist with their snapshot', () => {
    const evs = [
      createEv('d1', 1000, { id: 'd1', parentId: null, kind: 'folder', name: 'Docs' }),
      createEv('f1', 1100, { id: 'f1', parentId: 'd1', kind: 'file', name: 'report.pdf' })
    ]
    const t = foldFolder(evs)
    expect(t.size).toBe(2)
    expect(t.get('f1')!.parentId).toBe('d1')
    expect(t.get('d1')!.name).toBe('Docs')
  })

  it('rename is LWW — the later write wins, in any delivery order', () => {
    const evs = [
      createEv('f1', 1000, { id: 'f1', parentId: null, kind: 'file', name: 'draft' }),
      regEv('f1', 'name', 2000, 'a:dev1', 'v1'),
      regEv('f1', 'name', 3000, 'b:dev2', 'final')
    ]
    for (const order of permutations(evs)) {
      expect(foldFolder(order).get('f1')!.name).toBe('final')
    }
  })

  it('move (reparent) is LWW — converges to the latest parent, any order', () => {
    const evs = [
      createEv('a', 1000, { id: 'a', parentId: null, kind: 'folder', name: 'A' }),
      createEv('b', 1000, { id: 'b', parentId: null, kind: 'folder', name: 'B' }),
      createEv('x', 1000, { id: 'x', parentId: 'a', kind: 'file', name: 'x' }),
      regEv('x', 'parent', 2000, 'a:dev1', 'b')
    ]
    for (const order of permutations(evs)) {
      expect(foldFolder(order).get('x')!.parentId).toBe('b')
    }
  })

  it('delete is remove-wins — a folder + its subtree stay gone, even with a late create', () => {
    // The view emits a delete for every doomed id (the folder + each descendant).
    const evs = [
      createEv('d1', 1000, { id: 'd1', parentId: null, kind: 'folder', name: 'Docs' }),
      createEv('f1', 1100, { id: 'f1', parentId: 'd1', kind: 'file', name: 'a' }),
      deleteEv('d1', 3000),
      deleteEv('f1', 3000)
    ]
    for (const order of permutations(evs)) {
      const t = foldFolder(order)
      expect(t.has('d1')).toBe(false)
      expect(t.has('f1')).toBe(false)
    }
  })

  it('duplicate events (offline replay) are idempotent — same tree', () => {
    const base = [
      createEv('d1', 1000, { id: 'd1', parentId: null, kind: 'folder', name: 'Docs' }),
      createEv('f1', 1100, { id: 'f1', parentId: 'd1', kind: 'file', name: 'a' }),
      regEv('f1', 'name', 2000, 'a:dev1', 'renamed')
    ]
    const once = normalise(foldFolder(base))
    const twice = normalise(foldFolder([...base, ...base]))
    expect(twice).toEqual(once)
  })

  it('two grantees editing different entries concurrently both survive', () => {
    // A renames d1; B (a different account) adds and renames a file — no lost edit.
    const evs = [
      createEv('d1', 1000, { id: 'd1', parentId: null, kind: 'folder', name: 'Docs' }),
      regEv('d1', 'name', 2000, 'a:dev1', 'Documents'),
      createEv('f2', 2100, { id: 'f2', parentId: null, kind: 'file', name: 'new' }),
      regEv('f2', 'name', 2200, 'b:dev2', 'notes.txt')
    ]
    const converged = normalise(foldFolder(evs))
    for (const order of permutations(evs)) {
      expect(normalise(foldFolder(order))).toEqual(converged)
    }
    const t = foldFolder(evs)
    expect(t.get('d1')!.name).toBe('Documents')
    expect(t.get('f2')!.name).toBe('notes.txt')
  })
})
