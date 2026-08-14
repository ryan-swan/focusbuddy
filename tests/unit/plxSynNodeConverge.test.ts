import { describe, it, expect } from 'vitest'
import { foldNode } from '../../src/shared/crdtNodeMerge'
import type { ChangeEvent } from '../../src/shared/crdtWidgetMerge'

// WS01 sync substrate — convergence for the second migrated type (nodes). A node
// syncs two LWW registers, title and parent; foldNode is the pure core the client
// engine runs. Same guarantee as widgets: any delivery order (or duplicates after a
// reconnect) converges to one deterministic state.

let seq = 0
function reg(objectId: string, field: 'title' | 'parent', actor: string, at: number, value: unknown): ChangeEvent {
  return {
    id: `n${seq++}`,
    ts: new Date(at).toISOString(),
    partitionKey: 'n:acct:a',
    objectType: 'node',
    objectId,
    field: field as never,
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

describe('plx_syn — node CRDT convergence (WS01 second slice)', () => {
  it('title (LWW): concurrent renames converge to the latest, deterministically', () => {
    const early = reg('n1', 'title', 'a:dev1', 1000, 'Draft')
    const late = reg('n1', 'title', 'b:dev2', 2000, 'Final')
    for (const order of permutations([early, late])) {
      expect(foldNode(order).title?.value).toBe('Final')
    }
  })

  it('title: an equal-timestamp tie breaks by actor (all replicas agree)', () => {
    const a = reg('n1', 'title', 'a:dev1', 3000, 'Alpha')
    const z = reg('n1', 'title', 'z:dev9', 3000, 'Zeta')
    const results = permutations([a, z]).map((o) => foldNode(o).title?.value)
    for (const r of results) expect(r).toBe(results[0])
    expect(results[0]).toBe('Zeta') // 'z' >= 'a'
  })

  it('parent (LWW): a reparent converges to the latest parent, incl. null (root)', () => {
    const toRoot = reg('n1', 'parent', 'a:dev1', 1000, null)
    const toB = reg('n1', 'parent', 'b:dev2', 2000, 'parentB')
    for (const order of permutations([toRoot, toB])) {
      expect(foldNode(order).parent?.value).toBe('parentB')
    }
    const later = reg('n1', 'parent', 'c:dev3', 3000, null)
    for (const order of permutations([toRoot, toB, later])) {
      expect(foldNode(order).parent?.value).toBeNull() // latest wins, null included
    }
  })

  it('title and parent are independent registers (a rename never clobbers a move)', () => {
    const rename = reg('n1', 'title', 'a:dev1', 5000, 'Renamed')
    const move = reg('n1', 'parent', 'b:dev2', 4000, 'parentX')
    for (const order of permutations([rename, move])) {
      const s = foldNode(order)
      expect(s.title?.value).toBe('Renamed')
      expect(s.parent?.value).toBe('parentX')
    }
  })

  it('duplicated events (offline re-flush) do not change the result', () => {
    const t1 = reg('n1', 'title', 'a:dev1', 1000, 'One')
    const t2 = reg('n1', 'title', 'b:dev2', 2000, 'Two')
    expect(foldNode([t1, t2, t1, t2, t2]).title?.value).toBe(foldNode([t1, t2]).title?.value)
  })
})
