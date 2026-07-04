import { describe, it, expect } from 'vitest'
import { runSheetScript } from '../../src/renderer/src/lib/sheetScript'
import type { SheetTab } from '../../src/shared/types'

function tab(): SheetTab {
  return {
    id: 't',
    name: 'S',
    columns: ['A', 'B'],
    rows: [
      ['1', ''],
      ['2', ''],
      ['3', '']
    ]
  }
}

describe('sheetScript — macro runner', () => {
  it('runs main(sheet) and mutates the tab (doubling column A into B)', () => {
    const r = runSheetScript(
      tab(),
      `function main(sheet){ for (let i=0;i<sheet.rowCount();i++){ sheet.setValue(i,1, Number(sheet.getValue(i,0))*2) } }`
    )
    expect(r.error).toBeNull()
    expect(r.tab.rows.map((row) => row[1])).toEqual(['2', '4', '6'])
  })

  it('captures logs', () => {
    const r = runSheetScript(tab(), `sheet.log('rows', sheet.rowCount())`)
    expect(r.error).toBeNull()
    expect(r.logs).toEqual(['rows 3'])
  })

  it('addRow / addColumn grow the sheet', () => {
    const r = runSheetScript(tab(), `sheet.addColumn('C'); sheet.addRow(['9','8','7'])`)
    expect(r.error).toBeNull()
    expect(r.tab.columns).toEqual(['A', 'B', 'C'])
    expect(r.tab.rows[r.tab.rows.length - 1]).toEqual(['9', '8', '7'])
  })

  it('setValue past the extent grows rows and columns', () => {
    const r = runSheetScript(tab(), `sheet.setValue(4, 3, 'x')`)
    expect(r.error).toBeNull()
    expect(r.tab.rows.length).toBe(5)
    expect(r.tab.columns.length).toBe(4)
    expect(r.tab.rows[4][3]).toBe('x')
  })

  it('a thrown error is reported honestly and the tab is left untouched', () => {
    const before = tab()
    const r = runSheetScript(before, `throw new Error('boom')`)
    expect(r.error).toContain('boom')
    expect(r.tab).toBe(before) // unchanged reference
  })

  it('refuses macros that reach outside the sheet', () => {
    const before = tab()
    const r = runSheetScript(before, `fetch('https://evil.example')`)
    expect(r.error).toMatch(/outside the sheet/)
    expect(r.tab).toBe(before) // no mutation attempted
  })

  it('setRange writes a block', () => {
    const r = runSheetScript(tab(), `sheet.setRange(0,1,[['x'],['y'],['z']])`)
    expect(r.error).toBeNull()
    expect(r.tab.rows.map((row) => row[1])).toEqual(['x', 'y', 'z'])
  })
})
