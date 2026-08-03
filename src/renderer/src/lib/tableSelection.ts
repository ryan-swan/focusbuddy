// Pure helpers for cell-range selection, copy, and bulk paste in the typed Table
// widget. The table stores rows as objects keyed by column id (unlike the sheet's
// positional string grid), so paste coerces each value to the destination
// column's type via coerceCellValue — a bad value becomes the typed empty/null,
// never a fabricated one. Clipboard interchange is plain TSV, the same format the
// sheet, Excel, and Google Sheets use.

import type { FbRow, FieldDefinition } from '@shared/fields'
import { coerceCellValue } from './actionExecutor'

export interface RC {
  r: number
  c: number
}

export interface RCRange {
  r0: number
  c0: number
  r1: number
  c1: number
}

export function normCellRange(a: RC, b: RC): RCRange {
  return {
    r0: Math.min(a.r, b.r),
    c0: Math.min(a.c, b.c),
    r1: Math.max(a.r, b.r),
    c1: Math.max(a.c, b.c)
  }
}

export function inCellRange(range: RCRange | null, r: number, c: number): boolean {
  if (!range) return false
  return r >= range.r0 && r <= range.r1 && c >= range.c0 && c <= range.c1
}

// Render one stored cell value as plain text for the clipboard.
function cellText(v: unknown): string {
  if (v == null) return ''
  if (Array.isArray(v)) return v.join(', ')
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  return String(v)
}

// Serialize a selected range of table cells to TSV.
export function cellsToTsv(rows: FbRow[], columns: FieldDefinition[], range: RCRange): string {
  const lines: string[] = []
  for (let r = range.r0; r <= range.r1; r++) {
    const cells: string[] = []
    for (let c = range.c0; c <= range.c1; c++) {
      const col = columns[c]
      cells.push(col ? cellText(rows[r]?.cells[col.id]) : '')
    }
    lines.push(cells.join('\t'))
  }
  return lines.join('\n')
}

export interface TablePastePlan {
  updates: { rowId: string; cells: Record<string, unknown> }[]
  clippedRows: number // rows the paste would have needed but that don't exist
}

// Compute the row updates for pasting `matrix` into the table selection.
// A single clipboard cell fills the whole selection; a block is written from the
// selection's top-left at its own size. Values are coerced per destination
// column. The paste is clipped to existing rows (never invents rows) and the
// count of clipped rows is reported so the caller can tell the user honestly.
export function planTablePaste(opts: {
  rows: FbRow[]
  columns: FieldDefinition[]
  range: RCRange
  matrix: string[][]
}): TablePastePlan {
  const { rows, columns, range, matrix } = opts
  const single = matrix.length === 1 && matrix[0].length === 1
  const updatesMap = new Map<string, Record<string, unknown>>()

  const writeCell = (rIndex: number, cIndex: number, raw: string): void => {
    const row = rows[rIndex]
    const col = columns[cIndex]
    if (!row || !col) return
    const cur = updatesMap.get(row.id) ?? {}
    cur[col.id] = coerceCellValue(col.type, raw, col.config)
    updatesMap.set(row.id, cur)
  }

  let neededRows = 0
  if (single) {
    const raw = matrix[0][0]
    for (let r = range.r0; r <= range.r1; r++)
      for (let c = range.c0; c <= range.c1; c++) writeCell(r, c, raw)
    neededRows = range.r1 + 1
  } else {
    for (let i = 0; i < matrix.length; i++)
      for (let j = 0; j < matrix[i].length; j++) writeCell(range.r0 + i, range.c0 + j, matrix[i][j])
    neededRows = range.r0 + matrix.length
  }

  return {
    updates: Array.from(updatesMap.entries()).map(([rowId, cells]) => ({ rowId, cells })),
    clippedRows: Math.max(0, neededRows - rows.length)
  }
}
