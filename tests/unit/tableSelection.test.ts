// Table cell-selection + bulk-paste helpers. Paste coerces per column type and
// clips to existing rows (never invents rows), reporting what was clipped.

import { describe, it, expect } from 'vitest'
import { normCellRange, inCellRange, cellsToTsv, planTablePaste } from '@renderer/lib/tableSelection'
import type { FbRow, FieldDefinition } from '@shared/fields'

function col(id: string, label: string, type: FieldDefinition['type'] = 'text-short'): FieldDefinition {
  return { id, type, label, config: {} } as FieldDefinition
}
function row(id: string, cells: Record<string, unknown>): FbRow {
  return { id, tableId: 't', cells, sortOrder: 0, createdAt: 0, updatedAt: 0 }
}

const columns = [col('c1', 'Name'), col('c2', 'City'), col('c3', 'Count', 'number')]
const rows = [
  row('r1', { c1: 'Ann', c2: 'NYC', c3: 1 }),
  row('r2', { c1: 'Bob', c2: 'LA', c3: 2 }),
  row('r3', { c1: 'Cy', c2: 'SF', c3: 3 })
]

describe('normCellRange / inCellRange', () => {
  it('normalizes regardless of drag direction', () => {
    expect(normCellRange({ r: 2, c: 3 }, { r: 0, c: 1 })).toEqual({ r0: 0, c0: 1, r1: 2, c1: 3 })
  })
  it('membership test', () => {
    const range = { r0: 0, c0: 0, r1: 1, c1: 1 }
    expect(inCellRange(range, 1, 1)).toBe(true)
    expect(inCellRange(range, 2, 0)).toBe(false)
    expect(inCellRange(null, 0, 0)).toBe(false)
  })
})

describe('cellsToTsv', () => {
  it('serializes a selected range to TSV', () => {
    const tsv = cellsToTsv(rows, columns, { r0: 0, c0: 0, r1: 1, c1: 1 })
    expect(tsv).toBe('Ann\tNYC\nBob\tLA')
  })
})

describe('planTablePaste', () => {
  it('fills a whole selection from a single clipboard cell', () => {
    const plan = planTablePaste({
      rows,
      columns,
      range: { r0: 0, c0: 0, r1: 1, c1: 0 },
      matrix: [['Zed']]
    })
    expect(plan.clippedRows).toBe(0)
    expect(plan.updates).toEqual([
      { rowId: 'r1', cells: { c1: 'Zed' } },
      { rowId: 'r2', cells: { c1: 'Zed' } }
    ])
  })

  it('writes a block from the top-left, coercing per column type', () => {
    const plan = planTablePaste({
      rows,
      columns,
      range: { r0: 0, c0: 1, r1: 0, c1: 1 },
      matrix: [
        ['Paris', '10'],
        ['Rome', '20']
      ]
    })
    // c2 is text, c3 is number -> '10' coerces to 10
    expect(plan.updates).toEqual([
      { rowId: 'r1', cells: { c2: 'Paris', c3: 10 } },
      { rowId: 'r2', cells: { c2: 'Rome', c3: 20 } }
    ])
    expect(plan.clippedRows).toBe(0)
  })

  it('clips to existing rows and reports the overflow', () => {
    const plan = planTablePaste({
      rows,
      columns,
      range: { r0: 2, c0: 0, r1: 2, c1: 0 },
      matrix: [['x'], ['y'], ['z']] // 3 rows starting at row index 2 -> needs rows 2,3,4
    })
    expect(plan.updates).toEqual([{ rowId: 'r3', cells: { c1: 'x' } }])
    expect(plan.clippedRows).toBe(2)
  })
})
