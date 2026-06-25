import { describe, it, expect } from 'vitest'
import type { FbRow, FieldDefinition } from '../../src/shared/fields'
import {
  computeChartData,
  cellToNumber,
  cellToLabel,
  seriesKey,
  defaultChartConfig,
  type ChartConfig
} from '../../src/shared/charts'

// Columns: a single-select "team" (category) and a number "deals" (value).
const columns: FieldDefinition[] = [
  { id: 'team', type: 'single-select', label: 'Team', config: { options: [
    { id: 'opt-mk', label: 'Marketing' },
    { id: 'opt-sl', label: 'Sales' }
  ] } } as FieldDefinition,
  { id: 'deals', type: 'number', label: 'Deals', config: {} } as FieldDefinition
]

function row(id: string, team: string, deals: unknown): FbRow {
  return { id, tableId: 't1', cells: { team, deals }, sortOrder: 0, createdAt: 0, updatedAt: 0 }
}

const rows: FbRow[] = [
  row('r1', 'opt-mk', 3),
  row('r2', 'opt-mk', 5),
  row('r3', 'opt-sl', 10),
  row('r4', 'opt-sl', 2)
]

const base = (over: Partial<ChartConfig>): ChartConfig => ({
  ...defaultChartConfig(),
  tableId: 't1',
  ...over
})

// A label resolver mirroring what the widget passes (select ids -> labels).
const labelFor = (columnId: string, value: unknown): string => {
  const col = columns.find((c) => c.id === columnId)
  if (col?.type === 'single-select') {
    const opts = (col.config as { options: { id: string; label: string }[] }).options
    return opts.find((o) => o.id === value)?.label ?? cellToLabel(value)
  }
  return cellToLabel(value)
}

describe('cellToNumber', () => {
  it('passes real numbers through', () => expect(cellToNumber(42)).toBe(42))
  it('parses numeric text', () => expect(cellToNumber('1,250.5')).toBe(1250.5))
  it('coerces booleans', () => expect(cellToNumber(true)).toBe(1))
  it('rejects non-numeric', () => expect(cellToNumber('hello')).toBeNull())
  it('rejects null/empty', () => {
    expect(cellToNumber(null)).toBeNull()
    expect(cellToNumber('')).toBeNull()
  })
})

describe('computeChartData — grouped bar (sum of deals by team)', () => {
  const out = computeChartData(base({ type: 'bar', xColumnId: 'team', series: [{ columnId: 'deals', agg: 'sum' }] }), rows, columns, labelFor)
  const key = seriesKey({ columnId: 'deals', agg: 'sum' }, 0)
  it('groups by the resolved category label', () => {
    expect(out.data.map((d) => d.x).sort()).toEqual(['Marketing', 'Sales'])
  })
  it('sums each group from real cells', () => {
    const mk = out.data.find((d) => d.x === 'Marketing')!
    const sl = out.data.find((d) => d.x === 'Sales')!
    expect(mk[key]).toBe(8)
    expect(sl[key]).toBe(12)
  })
  it('is not empty', () => expect(out.empty).toBe(false))
})

describe('computeChartData — count aggregation', () => {
  it('counts rows per group regardless of value', () => {
    const out = computeChartData(base({ type: 'bar', xColumnId: 'team', series: [{ columnId: 'deals', agg: 'count' }] }), rows, columns, labelFor)
    const key = seriesKey({ columnId: 'deals', agg: 'count' }, 0)
    expect(out.data.find((d) => d.x === 'Marketing')![key]).toBe(2)
    expect(out.data.find((d) => d.x === 'Sales')![key]).toBe(2)
  })
})

describe('computeChartData — average of an empty set is honest null', () => {
  it('returns null, not a fabricated zero, when no numeric values', () => {
    const textRows: FbRow[] = [row('r1', 'opt-mk', 'n/a'), row('r2', 'opt-mk', '')]
    const out = computeChartData(base({ type: 'bar', xColumnId: 'team', series: [{ columnId: 'deals', agg: 'avg' }] }), textRows, columns, labelFor)
    const key = seriesKey({ columnId: 'deals', agg: 'avg' }, 0)
    expect(out.data.find((d) => d.x === 'Marketing')![key]).toBeNull()
  })
})

describe('computeChartData — KPI aggregates across all rows', () => {
  it('sums every row into one number', () => {
    const out = computeChartData(base({ type: 'kpi', series: [{ columnId: 'deals', agg: 'sum' }] }), rows, columns, labelFor)
    expect(out.kpi).toBe(20)
    expect(out.data).toEqual([])
  })
  it('averages correctly', () => {
    const out = computeChartData(base({ type: 'kpi', series: [{ columnId: 'deals', agg: 'avg' }] }), rows, columns, labelFor)
    expect(out.kpi).toBe(5)
  })
})

describe('computeChartData — honest empty states', () => {
  it('is empty with no bound table', () => {
    const out = computeChartData(defaultChartConfig(), rows, columns, labelFor)
    expect(out.empty).toBe(true)
    expect(out.data).toEqual([])
  })
  it('is empty with no series', () => {
    const out = computeChartData(base({ type: 'bar', xColumnId: 'team', series: [] }), rows, columns, labelFor)
    expect(out.empty).toBe(true)
  })
  it('is empty with zero rows', () => {
    const out = computeChartData(base({ type: 'bar', xColumnId: 'team', series: [{ columnId: 'deals', agg: 'sum' }] }), [], columns, labelFor)
    expect(out.empty).toBe(true)
  })
})

describe('computeChartData — no x column groups all rows into one bucket', () => {
  it('produces a single "All" group', () => {
    const out = computeChartData(base({ type: 'bar', xColumnId: null, series: [{ columnId: 'deals', agg: 'sum' }] }), rows, columns, labelFor)
    const key = seriesKey({ columnId: 'deals', agg: 'sum' }, 0)
    expect(out.data).toHaveLength(1)
    expect(out.data[0].x).toBe('All')
    expect(out.data[0][key]).toBe(20)
  })
})
