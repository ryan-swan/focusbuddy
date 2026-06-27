import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { buildStyledXlsx } from '../../src/main/sheetXlsxWriter'
import { hexToArgb } from '../../src/shared/sheetNumFmt'
import type { SheetBodyV2 } from '../../src/shared/types'

// Proves the .xlsx export keeps visual styles: build a styled workbook, read it
// back with exceljs, and confirm fonts, fills, number formats, formulas and column
// widths survived. This is the fidelity guarantee the panel asked for.

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
          ['Rent', '1200'],
          ['Total', '=B2']
        ],
        formats: {
          '0,0': { bold: true, bg: '#fde68a' }, // header: bold + amber fill
          '0,1': { bold: true, align: 'right' },
          '1,1': { numFmt: { kind: 'currency', decimals: 2, symbol: '$' } },
          '2,0': { italic: true, color: '#ff0000' }
        },
        colWidths: { 0: 210 }
      }
    ]
  }
}

describe('buildStyledXlsx round-trip', () => {
  it('preserves bold, fill, alignment, colour, number format, formula and width', async () => {
    const buf = await buildStyledXlsx(body())
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ArrayBuffer)
    const ws = wb.getWorksheet('Budget')!
    expect(ws).toBeTruthy()

    // Bold + amber fill header.
    const a1 = ws.getCell('A1')
    expect(a1.value).toBe('Item')
    expect(a1.font?.bold).toBe(true)
    expect((a1.fill as ExcelJS.FillPattern)?.fgColor?.argb).toBe(hexToArgb('#fde68a'))

    // Right-aligned bold header.
    expect(ws.getCell('B1').alignment?.horizontal).toBe('right')

    // Currency number format on the amount.
    expect(ws.getCell('B2').numFmt).toBe('"$"#,##0.00')
    expect(ws.getCell('B2').value).toBe(1200)

    // Italic red text.
    const a3 = ws.getCell('A3')
    expect(a3.font?.italic).toBe(true)
    expect(a3.font?.color?.argb).toBe(hexToArgb('#ff0000'))

    // Formula kept live.
    expect((ws.getCell('B3').value as ExcelJS.CellFormulaValue).formula).toBe('B2')

    // Column width carried (210px / 7 = 30).
    expect(ws.getColumn(1).width).toBe(30)
  })
})
