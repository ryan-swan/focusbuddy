import ExcelJS from 'exceljs'
import type { SheetBodyV2, SheetCellFormat } from '@shared/types'
import { toExcelNumFmt, hexToArgb } from '@shared/sheetNumFmt'

// Styled .xlsx writer (exceljs). Kept out of sheetIo.ts so it carries no electron
// import and stays unit-testable: a test can build a workbook and read it back to
// confirm fonts, fills, number formats and column widths survive into real Excel.

// Apply a cell's visual format to an exceljs cell: font (bold/italic/underline/
// family/colour), solid fill, horizontal alignment, and number format.
export function applyExcelStyle(cell: ExcelJS.Cell, fmt: SheetCellFormat): void {
  const font: Partial<ExcelJS.Font> = {}
  if (fmt.bold) font.bold = true
  if (fmt.italic) font.italic = true
  if (fmt.underline) font.underline = true
  if (fmt.fontFamily) font.name = fmt.fontFamily
  const textArgb = hexToArgb(fmt.color)
  if (textArgb) font.color = { argb: textArgb }
  if (Object.keys(font).length > 0) cell.font = font
  const fillArgb = hexToArgb(fmt.bg)
  if (fillArgb) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillArgb } }
  if (fmt.align) cell.alignment = { horizontal: fmt.align }
  const z = toExcelNumFmt(fmt.numFmt)
  if (z) cell.numFmt = z
}

// Build a fully-styled .xlsx workbook from the sheet body.
export async function buildStyledXlsx(body: SheetBodyV2): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'PlexiDesk'
  for (const tab of body.sheets) {
    const ws = wb.addWorksheet((tab.name || 'Sheet').slice(0, 31))
    if (tab.colWidths) {
      for (const [c, px] of Object.entries(tab.colWidths)) {
        if (px) ws.getColumn(Number(c) + 1).width = Math.max(2, Math.round(px / 7))
      }
    }
    for (let r = 0; r < tab.rows.length; r++) {
      for (let c = 0; c < tab.rows[r].length; c++) {
        const raw = tab.rows[r][c]
        const cell = ws.getCell(r + 1, c + 1)
        if (raw.startsWith('=')) cell.value = { formula: raw.slice(1) }
        else {
          const n = Number(raw)
          cell.value = raw.trim() !== '' && Number.isFinite(n) ? n : raw
        }
        const fmt = tab.formats?.[`${r},${c}`]
        if (fmt) applyExcelStyle(cell, fmt)
      }
    }
    if (tab.freeze && (tab.freeze.rows > 0 || tab.freeze.cols > 0)) {
      ws.views = [{ state: 'frozen', xSplit: tab.freeze.cols, ySplit: tab.freeze.rows }]
    }
  }
  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer)
}
