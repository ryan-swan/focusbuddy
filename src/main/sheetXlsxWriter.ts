import ExcelJS from 'exceljs'
import type { SheetBodyV2, SheetCellFormat, SheetValidation } from '@shared/types'
import { toExcelNumFmt, hexToArgb } from '@shared/sheetNumFmt'

const NUM_OP: Record<string, ExcelJS.DataValidationOperator> = {
  gt: 'greaterThan',
  lt: 'lessThan',
  ge: 'greaterThanOrEqual',
  le: 'lessThanOrEqual',
  eq: 'equal',
  between: 'between'
}

// Parse an A1 range ("B2:C20" or a single "B2") into 1-based row/col bounds.
function parseA1(range: string): { r1: number; c1: number; r2: number; c2: number } | null {
  const cell = (a: string): { r: number; c: number } | null => {
    const m = /^([A-Za-z]+)(\d+)$/.exec(a.trim())
    if (!m) return null
    let c = 0
    for (const ch of m[1].toUpperCase()) c = c * 26 + (ch.charCodeAt(0) - 64)
    return { c, r: Number(m[2]) }
  }
  const [a, b] = range.split(':')
  const s = cell(a)
  if (!s) return null
  const e = b ? cell(b) : s
  if (!e) return null
  return { r1: Math.min(s.r, e.r), c1: Math.min(s.c, e.c), r2: Math.max(s.r, e.r), c2: Math.max(s.c, e.c) }
}

// Map our validation rule to an exceljs data-validation model. Returns null for a
// rule exceljs cannot represent, so nothing invalid is written.
function validationModel(v: SheetValidation): ExcelJS.DataValidation | null {
  const allowBlank = !v.strict
  const r = v.rule
  if (r.kind === 'list') {
    if (!r.values.length) return null
    // A quoted, comma-joined literal list is Excel's inline dropdown source.
    return { type: 'list', allowBlank, formulae: [`"${r.values.join(',').replace(/"/g, "'")}"`] }
  }
  if (r.kind === 'number') {
    return {
      type: 'decimal',
      operator: NUM_OP[r.op] ?? 'greaterThan',
      allowBlank,
      formulae: r.op === 'between' && r.value2 != null ? [String(r.value), String(r.value2)] : [String(r.value)]
    }
  }
  if (r.kind === 'textNotEmpty') {
    return { type: 'textLength', operator: 'greaterThan', allowBlank: false, formulae: ['0'] }
  }
  return null
}

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
    if (tab.rowHeights) {
      // exceljs row height is in points; our stored heights are px (96dpi).
      for (const [r, px] of Object.entries(tab.rowHeights)) {
        if (px) ws.getRow(Number(r) + 1).height = Math.round((px * 72) / 96)
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
    // Data validation (dropdown lists, number bounds, non-empty text) so a
    // constrained cell keeps its rule in Excel. exceljs sets validation per cell,
    // so apply the model across the rule's range.
    for (const v of tab.validations ?? []) {
      const model = validationModel(v)
      const box = parseA1(v.range)
      if (!model || !box) continue
      for (let r = box.r1; r <= box.r2; r++) {
        for (let c = box.c1; c <= box.c2; c++) {
          ws.getCell(r, c).dataValidation = { ...model }
        }
      }
    }
  }
  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer)
}
