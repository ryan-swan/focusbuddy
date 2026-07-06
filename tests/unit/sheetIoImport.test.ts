import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { buildStyledXlsx } from '../../src/main/sheetXlsxWriter'
import { _worksheetToTabForTest as worksheetToTab, parseXlsxFreeze } from '../../src/main/sheetIo'
import type { SheetBodyV2 } from '../../src/shared/types'

// End-to-end fidelity: write a styled .xlsx (exceljs) then read it back through
// our real SheetJS importer. Column widths and row heights must survive the full
// export→import loop, not just the exceljs-only round-trip the writer test covers.

function body(): SheetBodyV2 {
  return {
    version: 2,
    sheets: [
      {
        id: 't1',
        name: 'Budget',
        columns: ['A', 'B'],
        rows: [
          ['Item', 'Amount'],
          ['Rent', '1200']
        ],
        colWidths: { 0: 210 },
        rowHeights: { 0: 40 }
      }
    ]
  }
}

describe('xlsx export → SheetJS import round-trip', () => {
  it('carries values and formats through the importer', async () => {
    const buf = await buildStyledXlsx(body())
    const wb = XLSX.read(buf, { type: 'buffer', cellFormula: true, cellNF: true })
    const tab = worksheetToTab(wb.Sheets[wb.SheetNames[0]], wb.SheetNames[0])
    expect(tab.rows[0]).toEqual(['Item', 'Amount'])
    expect(tab.rows[1][0]).toBe('Rent')
  })

  it('preserves a column width across export and import (previously dropped on import)', async () => {
    const buf = await buildStyledXlsx(body())
    const wb = XLSX.read(buf, { type: 'buffer', cellStyles: true })
    const tab = worksheetToTab(wb.Sheets[wb.SheetNames[0]], wb.SheetNames[0])
    expect(tab.colWidths).toBeTruthy()
    // 210px → 30 char on write → ~210px back (allow small rounding drift).
    expect(tab.colWidths![0]).toBeGreaterThan(180)
    expect(tab.colWidths![0]).toBeLessThan(240)
  })

  it('preserves a row height across export and import', async () => {
    const buf = await buildStyledXlsx(body())
    const wb = XLSX.read(buf, { type: 'buffer', cellStyles: true })
    const tab = worksheetToTab(wb.Sheets[wb.SheetNames[0]], wb.SheetNames[0])
    expect(tab.rowHeights).toBeTruthy()
    // 40px → 30pt on write → ~40px back.
    expect(tab.rowHeights![0]).toBeGreaterThan(34)
    expect(tab.rowHeights![0]).toBeLessThan(46)
  })

  it('recovers frozen panes that SheetJS drops (read from the package XML)', async () => {
    const withFreeze: SheetBodyV2 = {
      version: 2,
      sheets: [
        { id: 't1', name: 'Budget', columns: ['A', 'B'], rows: [['a', 'b'], ['c', 'd']], freeze: { rows: 1, cols: 2 } },
        { id: 't2', name: 'Plain', columns: ['A'], rows: [['x']] }
      ]
    }
    const buf = await buildStyledXlsx(withFreeze)
    const freeze = await parseXlsxFreeze(new Uint8Array(buf))
    expect(freeze['Budget']).toEqual({ rows: 1, cols: 2 })
    expect(freeze['Plain']).toBeUndefined() // no pane written, none invented
  })
})
