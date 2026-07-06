import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { buildStyledXlsx } from '../../src/main/sheetXlsxWriter'
import {
  _worksheetToTabForTest as worksheetToTab,
  parseXlsxFreeze,
  parseXlsxValidations,
  parseXlsxCondFormatting
} from '../../src/main/sheetIo'
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

  it('round-trips data validations (dropdown list, number bound, non-empty)', async () => {
    const withVal: SheetBodyV2 = {
      version: 2,
      sheets: [
        {
          id: 't1',
          name: 'Form',
          columns: ['A', 'B', 'C'],
          rows: [['', '', '']],
          validations: [
            { id: 'v1', range: 'A1:A10', rule: { kind: 'list', values: ['Yes', 'No', 'Maybe'] } },
            { id: 'v2', range: 'B1:B10', rule: { kind: 'number', op: 'between', value: 1, value2: 100 } },
            { id: 'v3', range: 'C1:C10', rule: { kind: 'textNotEmpty' }, strict: true }
          ]
        }
      ]
    }
    const buf = await buildStyledXlsx(withVal)
    const vals = await parseXlsxValidations(new Uint8Array(buf))
    const rules = vals['Form']
    expect(rules).toBeTruthy()
    const list = rules.find((r) => r.rule.kind === 'list')
    expect(list?.range.startsWith('A1')).toBe(true)
    expect((list!.rule as { values: string[] }).values).toEqual(['Yes', 'No', 'Maybe'])
    const num = rules.find((r) => r.rule.kind === 'number')
    expect(num?.rule).toMatchObject({ kind: 'number', op: 'between', value: 1, value2: 100 })
    expect(rules.some((r) => r.rule.kind === 'textNotEmpty')).toBe(true)
  })

  it('round-trips conditional formatting (compare styles + colour scale)', async () => {
    const withCf: SheetBodyV2 = {
      version: 2,
      sheets: [
        {
          id: 't1',
          name: 'Report',
          columns: ['A', 'B', 'C', 'D'],
          rows: [['1', 'x', 'y', '5']],
          condRules: [
            { id: 'c1', range: 'A1:A20', kind: 'compare', op: 'gt', value: '10', bg: '#fde68a', color: '#ff0000', bold: true },
            { id: 'c2', range: 'B1:B20', kind: 'compare', op: 'contains', value: 'urgent', bg: '#fecaca' },
            { id: 'c3', range: 'C1:C20', kind: 'compare', op: 'notEmpty', bg: '#bbf7d0' },
            { id: 'c4', range: 'D1:D20', kind: 'colorScale', minColor: '#ffffff', midColor: '#fdba74', maxColor: '#3b82f6' }
          ]
        }
      ]
    }
    const buf = await buildStyledXlsx(withCf)
    const cf = await parseXlsxCondFormatting(new Uint8Array(buf))
    const rules = cf['Report']
    expect(rules).toBeTruthy()

    const gt = rules.find((r) => r.range.startsWith('A1'))!
    expect(gt).toMatchObject({ kind: 'compare', op: 'gt', value: '10', bg: '#fde68a', color: '#ff0000', bold: true })

    const contains = rules.find((r) => r.range.startsWith('B1'))!
    expect(contains).toMatchObject({ kind: 'compare', op: 'contains', value: 'urgent', bg: '#fecaca' })

    const notEmpty = rules.find((r) => r.range.startsWith('C1'))!
    expect(notEmpty).toMatchObject({ kind: 'compare', op: 'notEmpty', bg: '#bbf7d0' })

    const scale = rules.find((r) => r.range.startsWith('D1'))!
    expect(scale).toMatchObject({ kind: 'colorScale', minColor: '#ffffff', midColor: '#fdba74', maxColor: '#3b82f6' })
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
