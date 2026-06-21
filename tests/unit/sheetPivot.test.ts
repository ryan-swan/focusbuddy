import { describe, it, expect } from 'vitest'
import { computePivot } from '../../src/renderer/src/lib/sheetPivot'
import type { SheetPivotSpec } from '../../src/shared/types'

// A 4-row table at A1:C5: Dept, Region, Amount
const data: string[][] = [
  ['Dept', 'Region', 'Amount'],
  ['Eng', 'US', '100'],
  ['Sales', 'US', '90'],
  ['Eng', 'EU', '50'],
  ['Sales', 'EU', '60']
]
const getCell = (r: number, c: number): string => data[r]?.[c] ?? ''
const base: Omit<SheetPivotSpec, 'agg'> = { id: 'p', range: 'A1:C5', rowField: 0, valueField: 2 }

describe('computePivot', () => {
  it('sum by row field', () => {
    const res = computePivot(getCell, { ...base, agg: 'sum' })!
    expect(res.rowFieldLabel).toBe('Dept')
    expect(res.valueFieldLabel).toBe('Amount')
    expect(res.rows.map((r) => [r.key, r.total])).toEqual([['Eng', 150], ['Sales', 150]])
    expect(res.grandTotal).toBe(300)
  })
  it('count aggregates row occurrences', () => {
    const res = computePivot(getCell, { ...base, agg: 'count' })!
    expect(res.rows.map((r) => [r.key, r.total])).toEqual([['Eng', 2], ['Sales', 2]])
    expect(res.grandTotal).toBe(4)
  })
  it('avg/min/max', () => {
    expect(computePivot(getCell, { ...base, agg: 'avg' })!.rows[0].total).toBe(75)
    expect(computePivot(getCell, { ...base, agg: 'min' })!.rows[0].total).toBe(50)
    expect(computePivot(getCell, { ...base, agg: 'max' })!.rows[1].total).toBe(90)
  })
  it('pivots across a column field', () => {
    const res = computePivot(getCell, { ...base, colField: 1, agg: 'sum' })!
    expect(res.colKeys).toEqual(['EU', 'US'])
    const eng = res.rows.find((r) => r.key === 'Eng')!
    expect(eng.cells).toEqual([50, 100]) // EU, US
    expect(eng.total).toBe(150)
  })
  it('skips non-numeric values for numeric aggregates', () => {
    const d2 = [['K', 'V'], ['a', 'x'], ['a', '10']]
    const res = computePivot((r, c) => d2[r]?.[c] ?? '', { id: 'p', range: 'A1:B3', rowField: 0, valueField: 1, agg: 'sum' })!
    expect(res.rows[0].total).toBe(10)
  })
  it('returns null on a bad range', () => {
    expect(computePivot(getCell, { ...base, range: 'nope', agg: 'sum' })).toBeNull()
  })
})
