import { describe, it, expect } from 'vitest'
import { foldRow, rowValues } from '../../src/shared/crdtRowMerge'
import type { ChangeEvent } from '../../src/shared/crdtWidgetMerge'

// WS01 sync substrate — convergence for the third migrated type (table rows). A row
// syncs its cells, each an LWW register keyed by column; foldRow is the pure core
// the client engine runs. The headline guarantee: two people editing DIFFERENT
// cells of the same row both survive (which the poll's whole-row last-write-wins
// loses), and same-cell edits resolve to the later write, order-independently.

let seq = 0
function cell(rowId: string, column: string, actor: string, at: number, value: unknown): ChangeEvent {
  return {
    id: `r${seq++}`,
    ts: new Date(at).toISOString(),
    partitionKey: 'r:acct:a',
    objectType: 'row',
    objectId: rowId,
    field: 'cell',
    dataClass: 'register',
    actor,
    payload: { column, value, at }
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

describe('plx_syn — row CRDT convergence (WS01 third slice)', () => {
  it('concurrent edits to DIFFERENT cells of one row both survive', () => {
    // The whole point: A edits column "name", B edits column "status", same row,
    // concurrently. Both must be present regardless of delivery order — the poll's
    // whole-row LWW would drop one.
    const editName = cell('row1', 'name', 'a:dev1', 1000, 'Widget A')
    const editStatus = cell('row1', 'status', 'b:dev2', 1001, 'Done')
    for (const order of permutations([editName, editStatus])) {
      const v = rowValues(foldRow(order))
      expect(v).toEqual({ name: 'Widget A', status: 'Done' })
    }
  })

  it('concurrent edits to the SAME cell resolve to the later write (LWW)', () => {
    const early = cell('row1', 'name', 'a:dev1', 1000, 'Draft')
    const late = cell('row1', 'name', 'b:dev2', 2000, 'Final')
    for (const order of permutations([early, late])) {
      expect(rowValues(foldRow(order)).name).toBe('Final')
    }
  })

  it('same-cell, same-timestamp tie breaks by actor (all replicas agree)', () => {
    const a = cell('row1', 'name', 'a:dev1', 3000, 'Alpha')
    const z = cell('row1', 'name', 'z:dev9', 3000, 'Zeta')
    const picks = permutations([a, z]).map((o) => rowValues(foldRow(o)).name)
    for (const p of picks) expect(p).toBe(picks[0])
    expect(picks[0]).toBe('Zeta') // 'z' >= 'a'
  })

  it('a mix of same-cell and cross-cell edits converges deterministically', () => {
    const name1 = cell('row1', 'name', 'a:dev1', 1000, 'One')
    const name2 = cell('row1', 'name', 'b:dev2', 2000, 'Two')
    const status = cell('row1', 'status', 'a:dev1', 1500, 'Open')
    for (const order of permutations([name1, name2, status])) {
      expect(rowValues(foldRow(order))).toEqual({ name: 'Two', status: 'Open' })
    }
  })

  it('duplicated cell events (offline re-flush) do not change the result', () => {
    const c1 = cell('row1', 'name', 'a:dev1', 1000, 'One')
    const c2 = cell('row1', 'name', 'b:dev2', 2000, 'Two')
    expect(rowValues(foldRow([c1, c2, c1, c2, c2])).name).toBe('Two')
  })
})
