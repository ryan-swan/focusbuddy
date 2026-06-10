import { describe, it, expect } from 'vitest'
import type { TableSchema } from '../../src/shared/fields'
import {
  buildImportPlan,
  suggestMappings,
  type ColumnMapping,
  type ImportRow
} from '../../src/renderer/src/lib/tableImport'

const schema: TableSchema = {
  columns: [
    { id: 'col-email', type: 'text-short', label: 'Email', config: {} },
    { id: 'col-name', type: 'text-short', label: 'Name', config: {} },
    { id: 'col-mrr', type: 'number', label: 'MRR', config: {} }
  ] as TableSchema['columns']
}

const existingRows: ImportRow[] = [
  { id: 'row-1', cells: { 'col-email': 'a@x.com', 'col-name': 'Alice', 'col-mrr': 100 } },
  { id: 'row-2', cells: { 'col-email': 'b@x.com', 'col-name': 'Bob', 'col-mrr': 50 } }
]

// Map the file's Email/Name/MRR headers onto the existing columns.
const directMappings: ColumnMapping[] = [
  { sourceHeader: 'Email', target: { kind: 'existing', columnId: 'col-email' } },
  { sourceHeader: 'Name', target: { kind: 'existing', columnId: 'col-name' } },
  { sourceHeader: 'MRR', target: { kind: 'existing', columnId: 'col-mrr' } }
]

describe('buildImportPlan', () => {
  it('upserts by primary key: an existing email updates that row, a new email inserts', () => {
    const grid = {
      headers: ['Email', 'Name', 'MRR'],
      rows: [
        { Email: 'a@x.com', Name: 'Alice Cooper', MRR: '150' }, // matches row-1 -> update
        { Email: 'c@x.com', Name: 'Carol', MRR: '75' } // new -> insert
      ]
    }
    const plan = buildImportPlan({
      schema,
      existingRows,
      grid,
      mappings: directMappings,
      primaryKeyColumnId: 'col-email'
    })
    expect(plan.summary).toEqual({ inserted: 1, updated: 1, columnsAdded: 0, rowsSkipped: 0 })
    const update = plan.ops.find((o) => o.op === 'update')
    expect(update).toMatchObject({ op: 'update', rowId: 'row-1' })
    // MRR coerced to a number on the way in.
    expect((update as { cells: Record<string, unknown> }).cells['col-mrr']).toBe(150)
    const insert = plan.ops.find((o) => o.op === 'insert')
    expect((insert as { cells: Record<string, unknown> }).cells['col-email']).toBe('c@x.com')
  })

  it('matches the primary key case-insensitively', () => {
    const grid = { headers: ['Email', 'MRR'], rows: [{ Email: 'A@X.COM', MRR: '999' }] }
    const plan = buildImportPlan({
      schema,
      existingRows,
      grid,
      mappings: [
        { sourceHeader: 'Email', target: { kind: 'existing', columnId: 'col-email' } },
        { sourceHeader: 'MRR', target: { kind: 'existing', columnId: 'col-mrr' } }
      ],
      primaryKeyColumnId: 'col-email'
    })
    expect(plan.summary.updated).toBe(1)
    expect(plan.summary.inserted).toBe(0)
  })

  it('appends every row as new when no primary key is chosen', () => {
    const grid = {
      headers: ['Email', 'Name', 'MRR'],
      rows: [
        { Email: 'a@x.com', Name: 'Dup', MRR: '1' },
        { Email: 'z@x.com', Name: 'Zed', MRR: '2' }
      ]
    }
    const plan = buildImportPlan({
      schema,
      existingRows,
      grid,
      mappings: directMappings,
      primaryKeyColumnId: null
    })
    expect(plan.summary).toEqual({ inserted: 2, updated: 0, columnsAdded: 0, rowsSkipped: 0 })
    expect(plan.ops.every((o) => o.op === 'insert')).toBe(true)
  })

  it('creates a new column for an unmapped source header and writes its cells', () => {
    const grid = {
      headers: ['Email', 'Plan'],
      rows: [{ Email: 'a@x.com', Plan: 'Team' }]
    }
    const mappings: ColumnMapping[] = [
      { sourceHeader: 'Email', target: { kind: 'existing', columnId: 'col-email' } },
      { sourceHeader: 'Plan', target: { kind: 'new', columnId: 'new-plan', label: 'Plan', type: 'text-short' } }
    ]
    const plan = buildImportPlan({ schema, existingRows, grid, mappings, primaryKeyColumnId: 'col-email' })
    expect(plan.newColumns).toEqual([{ id: 'new-plan', label: 'Plan', type: 'text-short' }])
    expect(plan.summary.columnsAdded).toBe(1)
    const op = plan.ops[0]
    expect((op as { cells: Record<string, unknown> }).cells['new-plan']).toBe('Team')
  })

  it('skips wholly empty rows', () => {
    const grid = {
      headers: ['Email', 'Name'],
      rows: [
        { Email: '', Name: '' },
        { Email: 'd@x.com', Name: 'Dan' }
      ]
    }
    const plan = buildImportPlan({
      schema,
      existingRows,
      grid,
      mappings: directMappings.slice(0, 2),
      primaryKeyColumnId: null
    })
    expect(plan.summary.inserted).toBe(1)
    expect(plan.summary.rowsSkipped).toBe(1)
  })

  it('collapses duplicate incoming keys, last value wins', () => {
    const grid = {
      headers: ['Email', 'MRR'],
      rows: [
        { Email: 'new@x.com', MRR: '10' },
        { Email: 'new@x.com', MRR: '20' } // same key -> merged, last wins, single insert
      ]
    }
    const plan = buildImportPlan({
      schema,
      existingRows,
      grid,
      mappings: [
        { sourceHeader: 'Email', target: { kind: 'existing', columnId: 'col-email' } },
        { sourceHeader: 'MRR', target: { kind: 'existing', columnId: 'col-mrr' } }
      ],
      primaryKeyColumnId: 'col-email'
    })
    expect(plan.summary.inserted).toBe(1)
    expect((plan.ops[0] as { cells: Record<string, unknown> }).cells['col-mrr']).toBe(20)
  })

  it('ignores skipped columns', () => {
    const grid = { headers: ['Email', 'Junk'], rows: [{ Email: 'a@x.com', Junk: 'ignore me' }] }
    const plan = buildImportPlan({
      schema,
      existingRows,
      grid,
      mappings: [
        { sourceHeader: 'Email', target: { kind: 'existing', columnId: 'col-email' } },
        { sourceHeader: 'Junk', target: { kind: 'skip' } }
      ],
      primaryKeyColumnId: 'col-email'
    })
    expect(plan.summary.updated).toBe(1)
    const cells = (plan.ops[0] as { cells: Record<string, unknown> }).cells
    expect(Object.keys(cells)).toEqual(['col-email'])
  })
})

describe('suggestMappings', () => {
  it('maps matching headers to existing columns and proposes new ones otherwise', () => {
    const grid = {
      headers: ['email', 'Plan'],
      rows: [{ email: 'a@x.com', Plan: 'Team' }]
    }
    const out = suggestMappings(schema, grid, (h, i) => `new-${i}`)
    expect(out[0]).toEqual({ sourceHeader: 'email', target: { kind: 'existing', columnId: 'col-email' } })
    expect(out[1]).toEqual({
      sourceHeader: 'Plan',
      target: { kind: 'new', columnId: 'new-1', label: 'Plan', type: 'text-short' }
    })
  })
})
