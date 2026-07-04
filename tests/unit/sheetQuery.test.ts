import { describe, it, expect } from 'vitest'
import { applyQuery, stepLabel, type QueryTable, type QueryStep } from '../../src/renderer/src/lib/sheetQuery'

const src: QueryTable = {
  columns: ['Name', 'Region', 'Amount'],
  rows: [
    ['Alice', 'EU', '100'],
    ['Bob', 'US', '50'],
    ['Cara', 'EU', '200'],
    ['Bob', 'US', '50'],
    ['Dan', 'APAC', '75']
  ]
}

describe('sheetQuery — applyQuery pipeline', () => {
  it('filter keeps matching rows', () => {
    const out = applyQuery(src, [{ kind: 'filter', col: 1, op: 'eq', value: 'EU' }])
    expect(out.rows.map((r) => r[0])).toEqual(['Alice', 'Cara'])
  })
  it('numeric filter (Amount >= 75)', () => {
    const out = applyQuery(src, [{ kind: 'filter', col: 2, op: 'ge', value: '75' }])
    expect(out.rows.map((r) => r[0])).toEqual(['Alice', 'Cara', 'Dan'])
  })
  it('sort numerically descending', () => {
    const out = applyQuery(src, [{ kind: 'sort', col: 2, dir: 'desc' }])
    expect(out.rows.map((r) => r[2])).toEqual(['200', '100', '75', '50', '50'])
  })
  it('remove and keep columns', () => {
    expect(applyQuery(src, [{ kind: 'removeColumns', cols: [1] }]).columns).toEqual(['Name', 'Amount'])
    const keep = applyQuery(src, [{ kind: 'keepColumns', cols: [0, 2] }])
    expect(keep.columns).toEqual(['Name', 'Amount'])
    expect(keep.rows[0]).toEqual(['Alice', '100'])
  })
  it('rename a column', () => {
    expect(applyQuery(src, [{ kind: 'rename', col: 2, name: 'Revenue' }]).columns).toEqual(['Name', 'Region', 'Revenue'])
  })
  it('remove duplicate rows', () => {
    const out = applyQuery(src, [{ kind: 'removeDuplicates' }])
    expect(out.rows.length).toBe(4) // the duplicate Bob/US/50 collapses
  })
  it('keepTop and skip', () => {
    expect(applyQuery(src, [{ kind: 'keepTop', n: 2 }]).rows.map((r) => r[0])).toEqual(['Alice', 'Bob'])
    expect(applyQuery(src, [{ kind: 'skip', n: 3 }]).rows.map((r) => r[0])).toEqual(['Bob', 'Dan'])
  })
  it('promoteHeaders lifts the first row to column names', () => {
    const t: QueryTable = { columns: ['A', 'B'], rows: [['Year', 'Sales'], ['2025', '10']] }
    const out = applyQuery(t, [{ kind: 'promoteHeaders' }])
    expect(out.columns).toEqual(['Year', 'Sales'])
    expect(out.rows).toEqual([['2025', '10']])
  })
  it('trim and changeCase transform a column', () => {
    const t: QueryTable = { columns: ['X'], rows: [['  hi  '], ['Yo']] }
    expect(applyQuery(t, [{ kind: 'trim', col: 0 }]).rows).toEqual([['hi'], ['Yo']])
    expect(applyQuery(t, [{ kind: 'changeCase', col: 0, to: 'upper' }]).rows).toEqual([['  HI  '], ['YO']])
  })
  it('steps compose and refresh is deterministic (re-applying yields the same output)', () => {
    const steps: QueryStep[] = [
      { kind: 'filter', col: 1, op: 'eq', value: 'EU' },
      { kind: 'sort', col: 2, dir: 'desc' },
      { kind: 'keepColumns', cols: [0, 2] },
      { kind: 'rename', col: 1, name: 'Revenue' }
    ]
    const a = applyQuery(src, steps)
    const b = applyQuery(src, steps)
    expect(a).toEqual(b)
    expect(a.columns).toEqual(['Name', 'Revenue'])
    expect(a.rows).toEqual([['Cara', '200'], ['Alice', '100']])
  })
  it('stepLabel is human readable', () => {
    expect(stepLabel({ kind: 'filter', col: 1, op: 'eq', value: 'EU' }, src.columns)).toMatch(/Filter Region/)
  })
  it('does not mutate the source', () => {
    const before = JSON.stringify(src)
    applyQuery(src, [{ kind: 'sort', col: 2, dir: 'asc' }, { kind: 'removeColumns', cols: [0] }])
    expect(JSON.stringify(src)).toBe(before)
  })
})
