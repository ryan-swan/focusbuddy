import { describe, it, expect } from 'vitest'
import { foldRegisterFields, type ChangeEvent } from '../../src/shared/crdtWidgetMerge'

// WS01 sync substrate — convergence for the fourth and fifth migrated types,
// timeblocks and files. Both are plain named scalar LWW registers, so they share
// one generic fold (foldRegisterFields). The guarantee is the same as the other
// types: any delivery order (or duplicates after a reconnect) converges to one
// deterministic state, and independent fields never clobber each other.

let seq = 0
function reg(
  objectType: ChangeEvent['objectType'],
  objectId: string,
  field: ChangeEvent['field'],
  actor: string,
  at: number,
  value: unknown
): ChangeEvent {
  return {
    id: `e${seq++}`,
    ts: new Date(at).toISOString(),
    partitionKey: 't:acct:a',
    objectType,
    objectId,
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

const TB_FIELDS = new Set(['start', 'duration', 'title', 'status'])
const FILE_FIELDS = new Set(['name', 'parent'])

describe('plx_syn — timeblock CRDT convergence (WS01 fourth slice)', () => {
  it('concurrent move (start) + retitle of one block both survive', () => {
    const move = reg('timeblock', 'b1', 'start', 'a:dev1', 1000, 1_700_000_000_000)
    const rename = reg('timeblock', 'b1', 'title', 'b:dev2', 1001, 'Standup')
    for (const order of permutations([move, rename])) {
      const regs = foldRegisterFields(order, TB_FIELDS)
      expect(regs.get('start')?.value).toBe(1_700_000_000_000)
      expect(regs.get('title')?.value).toBe('Standup')
    }
  })

  it('concurrent edits to the same field resolve to the later write (LWW)', () => {
    const early = reg('timeblock', 'b1', 'duration', 'a:dev1', 1000, 30)
    const late = reg('timeblock', 'b1', 'duration', 'b:dev2', 2000, 60)
    for (const order of permutations([early, late])) {
      expect(foldRegisterFields(order, TB_FIELDS).get('duration')?.value).toBe(60)
    }
  })

  it('same-field same-timestamp tie breaks by actor (all replicas agree)', () => {
    const a = reg('timeblock', 'b1', 'status', 'a:dev1', 3000, 'planned')
    const z = reg('timeblock', 'b1', 'status', 'z:dev9', 3000, 'done')
    const picks = permutations([a, z]).map((o) => foldRegisterFields(o, TB_FIELDS).get('status')?.value)
    for (const p of picks) expect(p).toBe(picks[0])
    expect(picks[0]).toBe('done') // 'z' >= 'a'
  })
})

describe('plx_syn — file/folder CRDT convergence (WS01 fifth slice)', () => {
  it('concurrent rename + move of one entry both survive', () => {
    const rename = reg('file', 'f1', 'name', 'a:dev1', 1000, 'Report.pdf')
    const move = reg('file', 'f1', 'parent', 'b:dev2', 1001, 'folderB')
    for (const order of permutations([rename, move])) {
      const regs = foldRegisterFields(order, FILE_FIELDS)
      expect(regs.get('name')?.value).toBe('Report.pdf')
      expect(regs.get('parent')?.value).toBe('folderB')
    }
  })

  it('a move to root (null parent) converges as the latest write', () => {
    const toB = reg('file', 'f1', 'parent', 'a:dev1', 1000, 'folderB')
    const toRoot = reg('file', 'f1', 'parent', 'b:dev2', 2000, null)
    for (const order of permutations([toB, toRoot])) {
      expect(foldRegisterFields(order, FILE_FIELDS).get('parent')?.value).toBeNull()
    }
  })

  it('duplicated events (offline re-flush) do not change the result', () => {
    const n1 = reg('file', 'f1', 'name', 'a:dev1', 1000, 'A.txt')
    const n2 = reg('file', 'f1', 'name', 'b:dev2', 2000, 'B.txt')
    expect(foldRegisterFields([n1, n2, n1, n2, n2], FILE_FIELDS).get('name')?.value).toBe('B.txt')
  })
})
