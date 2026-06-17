import { describe, it, expect } from 'vitest'
import {
  insertRowAt,
  deleteRowAt,
  insertColAt,
  deleteColAt,
  applyFormat,
  writeMatrix,
  fillDown,
  sortByColumn,
  parseTsv,
  rangeToTsv,
  normalizeRange
} from '@renderer/components/documents/sheet/sheetOps'
import type { SheetTab } from '@shared/types'

function tab(): SheetTab {
  return {
    id: 't',
    name: 'S',
    columns: ['A', 'B', 'C'],
    rows: [
      ['1', '2', '3'],
      ['4', '5', '6'],
      ['7', '8', '9']
    ],
    formats: { '2,1': { bold: true } } // bold on row 2, col 1 (value '8')
  }
}

describe('row/column structural ops shift formats', () => {
  it('insertRowAt shifts formats below the insertion down', () => {
    const t = insertRowAt(tab(), 1)
    expect(t.rows).toHaveLength(4)
    expect(t.rows[1]).toEqual(['', '', '']) // new blank row
    expect(t.formats?.['3,1']?.bold).toBe(true) // moved from 2,1 -> 3,1
    expect(t.formats?.['2,1']).toBeUndefined()
  })
  it('deleteRowAt drops the deleted row format and shifts the rest up', () => {
    const t = deleteRowAt(tab(), 0)
    expect(t.rows).toHaveLength(2)
    expect(t.formats?.['1,1']?.bold).toBe(true) // 2,1 -> 1,1
  })
  it('insertColAt shifts formats right', () => {
    const t = insertColAt(tab(), 0)
    expect(t.columns).toHaveLength(4)
    expect(t.formats?.['2,2']?.bold).toBe(true) // 2,1 -> 2,2
  })
  it('deleteColAt removes a column and its formats', () => {
    const t = deleteColAt(tab(), 1)
    expect(t.columns).toHaveLength(2)
    expect(t.rows[0]).toEqual(['1', '3'])
    expect(t.formats?.['2,1']).toBeUndefined() // the bold cell was in deleted col
  })
})

describe('formatting and data ops', () => {
  it('applyFormat merges a patch across a range', () => {
    const t = applyFormat(tab(), normalizeRange({ r: 0, c: 0 }, { r: 1, c: 0 }), { color: '#f00' })
    expect(t.formats?.['0,0']?.color).toBe('#f00')
    expect(t.formats?.['1,0']?.color).toBe('#f00')
  })
  it('writeMatrix writes and grows the grid', () => {
    const t = writeMatrix(tab(), 2, 2, [['x', 'y'], ['z', 'w']])
    expect(t.rows[2][2]).toBe('x')
    expect(t.rows[3][3]).toBe('w')
    expect(t.columns.length).toBeGreaterThanOrEqual(4)
  })
  it('fillDown copies the top row of a range downward', () => {
    const t = fillDown(tab(), normalizeRange({ r: 0, c: 0 }, { r: 2, c: 0 }))
    expect(t.rows.map((r) => r[0])).toEqual(['1', '1', '1'])
  })
  it('sortByColumn sorts numerically ascending and descending', () => {
    const t: SheetTab = { id: 't', name: 'S', columns: ['A'], rows: [['3'], ['1'], ['2']] }
    expect(sortByColumn(t, 0, 'asc').rows.map((r) => r[0])).toEqual(['1', '2', '3'])
    expect(sortByColumn(t, 0, 'desc').rows.map((r) => r[0])).toEqual(['3', '2', '1'])
  })
})

describe('clipboard TSV', () => {
  it('round-trips a range through TSV', () => {
    const t = tab()
    const r = normalizeRange({ r: 0, c: 0 }, { r: 1, c: 1 })
    const tsv = rangeToTsv(t, r)
    expect(tsv).toBe('1\t2\n4\t5')
    expect(parseTsv(tsv)).toEqual([['1', '2'], ['4', '5']])
  })
})
