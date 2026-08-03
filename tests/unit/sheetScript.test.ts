// The macro runner lives in the main process (node:vm), because the renderer's
// CSP forbids eval / new Function. These tests exercise that runner directly.
import { describe, it, expect } from 'vitest'
import { runSheetMacro } from '../../src/main/sheetMacro'
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

describe('sheetMacro — main-process macro runner', () => {
  it('runs main(sheet) and mutates the tab (doubling column A into B)', () => {
    const r = runSheetMacro(
      tab(),
      `function main(sheet){ for (let i=0;i<sheet.rowCount();i++){ sheet.setValue(i,1, Number(sheet.getValue(i,0))*2) } }`
    )
    expect(r.error).toBeNull()
    expect(r.tab.rows.map((row) => row[1])).toEqual(['2', '4', '6'])
  })

  it('runs a bare body with sheet in scope', () => {
    const r = runSheetMacro(tab(), `sheet.setValue(0, 1, 'hi')`)
    expect(r.error).toBeNull()
    expect(r.tab.rows[0][1]).toBe('hi')
  })

  it('captures logs', () => {
    const r = runSheetMacro(tab(), `sheet.log('rows', sheet.rowCount())`)
    expect(r.error).toBeNull()
    expect(r.logs).toEqual(['rows 3'])
  })

  it('addRow / addColumn grow the sheet', () => {
    const r = runSheetMacro(tab(), `sheet.addColumn('C'); sheet.addRow(['9','8','7'])`)
    expect(r.error).toBeNull()
    expect(r.tab.columns).toEqual(['A', 'B', 'C'])
    expect(r.tab.rows[r.tab.rows.length - 1]).toEqual(['9', '8', '7'])
  })

  it('setValue past the extent grows rows and columns', () => {
    const r = runSheetMacro(tab(), `sheet.setValue(4, 3, 'x')`)
    expect(r.error).toBeNull()
    expect(r.tab.rows.length).toBe(5)
    expect(r.tab.columns.length).toBe(4)
    expect(r.tab.rows[4][3]).toBe('x')
  })

  it('a thrown error is reported honestly and the tab is left untouched', () => {
    const before = tab()
    const r = runSheetMacro(before, `throw new Error('boom')`)
    expect(r.error).toContain('boom')
    expect(r.tab).toBe(before) // unchanged reference
  })

  it('refuses macros that reach outside the sheet', () => {
    const before = tab()
    const r = runSheetMacro(before, `fetch('https://evil.example')`)
    expect(r.error).toMatch(/outside the sheet/)
    expect(r.tab).toBe(before) // no mutation attempted
  })

  it('the vm sandbox is bare — ambient host globals are not exposed', () => {
    // setTimeout is a normal host global but is deliberately absent from the
    // sandbox, proving the context is bare rather than inheriting the host's.
    const r = runSheetMacro(tab(), `sheet.setValue(0,1, typeof setTimeout)`)
    expect(r.error).toBeNull()
    expect(r.tab.rows[0][1]).toBe('undefined')
  })

  it('setRange writes a block', () => {
    const r = runSheetMacro(tab(), `sheet.setRange(0,1,[['x'],['y'],['z']])`)
    expect(r.error).toBeNull()
    expect(r.tab.rows.map((row) => row[1])).toEqual(['x', 'y', 'z'])
  })
})
