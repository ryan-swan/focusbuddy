// Pure structural operations on a spreadsheet tab.
//
// Every mutation returns a new SheetTab (immutable), so the editor can snapshot
// for undo and React can diff cheaply. Crucially, inserting or deleting rows and
// columns also shifts the sparse format map and column widths so formatting
// follows its cells. Formula references are intentionally NOT reindexed in this
// pass (a documented limit surfaced in the UI): inserting a row will not rewrite
// =SUM(A1:A3).

import type { SheetCellFormat, SheetTab } from '@shared/types'
import { colLabel, fmtKey, parseFmtKey } from '../../../lib/sheetBody'

export interface CellRange {
  r0: number
  c0: number
  r1: number
  c1: number
}

export function normalizeRange(a: { r: number; c: number }, b: { r: number; c: number }): CellRange {
  return {
    r0: Math.min(a.r, b.r),
    c0: Math.min(a.c, b.c),
    r1: Math.max(a.r, b.r),
    c1: Math.max(a.c, b.c)
  }
}

export function rangeCells(range: CellRange): Array<{ r: number; c: number }> {
  const out: Array<{ r: number; c: number }> = []
  for (let r = range.r0; r <= range.r1; r++) for (let c = range.c0; c <= range.c1; c++) out.push({ r, c })
  return out
}

export function setCell(tab: SheetTab, r: number, c: number, value: string): SheetTab {
  const rows = tab.rows.map((row, ri) => (ri === r ? row.map((cell, ci) => (ci === c ? value : cell)) : row))
  return { ...tab, rows }
}

export function setColumnName(tab: SheetTab, c: number, name: string): SheetTab {
  return { ...tab, columns: tab.columns.map((col, ci) => (ci === c ? name : col)) }
}

export function addRow(tab: SheetTab): SheetTab {
  return { ...tab, rows: [...tab.rows, new Array(tab.columns.length).fill('')] }
}

export function addColumn(tab: SheetTab): SheetTab {
  return {
    ...tab,
    columns: [...tab.columns, colLabel(tab.columns.length)],
    rows: tab.rows.map((row) => [...row, ''])
  }
}

// Remap the format map after a row/column insert or delete. `axis` selects which
// coordinate shifts; `at` is the insert/delete index; `delta` is +1 (insert) or
// -1 (delete).
function shiftFormats(
  formats: Record<string, SheetCellFormat> | undefined,
  axis: 'row' | 'col',
  at: number,
  delta: 1 | -1
): Record<string, SheetCellFormat> | undefined {
  if (!formats) return formats
  const next: Record<string, SheetCellFormat> = {}
  for (const [key, fmt] of Object.entries(formats)) {
    const { r, c } = parseFmtKey(key)
    const coord = axis === 'row' ? r : c
    if (delta === -1 && coord === at) continue // deleted line's formats drop
    const shifted = coord >= at ? coord + delta : coord
    const nr = axis === 'row' ? shifted : r
    const nc = axis === 'col' ? shifted : c
    next[fmtKey(nr, nc)] = fmt
  }
  return next
}

function shiftWidths(
  widths: Record<number, number> | undefined,
  at: number,
  delta: 1 | -1
): Record<number, number> | undefined {
  if (!widths) return widths
  const next: Record<number, number> = {}
  for (const [k, w] of Object.entries(widths)) {
    const c = Number(k)
    if (delta === -1 && c === at) continue
    next[c >= at ? c + delta : c] = w
  }
  return next
}

export function insertRowAt(tab: SheetTab, index: number): SheetTab {
  const rows = [...tab.rows]
  rows.splice(index, 0, new Array(tab.columns.length).fill(''))
  return { ...tab, rows, formats: shiftFormats(tab.formats, 'row', index, 1) }
}

export function deleteRowAt(tab: SheetTab, index: number): SheetTab {
  if (tab.rows.length <= 1) return tab
  const rows = tab.rows.filter((_, i) => i !== index)
  return { ...tab, rows, formats: shiftFormats(tab.formats, 'row', index, -1) }
}

export function insertColAt(tab: SheetTab, index: number): SheetTab {
  const columns = [...tab.columns]
  columns.splice(index, 0, colLabel(tab.columns.length))
  const rows = tab.rows.map((row) => {
    const r = [...row]
    r.splice(index, 0, '')
    return r
  })
  return {
    ...tab,
    columns,
    rows,
    formats: shiftFormats(tab.formats, 'col', index, 1),
    colWidths: shiftWidths(tab.colWidths, index, 1)
  }
}

export function deleteColAt(tab: SheetTab, index: number): SheetTab {
  if (tab.columns.length <= 1) return tab
  return {
    ...tab,
    columns: tab.columns.filter((_, i) => i !== index),
    rows: tab.rows.map((row) => row.filter((_, i) => i !== index)),
    formats: shiftFormats(tab.formats, 'col', index, -1),
    colWidths: shiftWidths(tab.colWidths, index, -1)
  }
}

// Merge a format patch into every cell of a range.
export function applyFormat(tab: SheetTab, range: CellRange, patch: Partial<SheetCellFormat>): SheetTab {
  const formats = { ...(tab.formats ?? {}) }
  for (const { r, c } of rangeCells(range)) {
    const key = fmtKey(r, c)
    formats[key] = { ...formats[key], ...patch }
  }
  return { ...tab, formats }
}

// Write a matrix of values starting at the top-left of a range (used by paste,
// fill and AI). Grows the tab if the matrix overflows.
export function writeMatrix(tab: SheetTab, top: number, left: number, matrix: string[][]): SheetTab {
  const needRows = top + matrix.length
  const needCols = left + Math.max(0, ...matrix.map((r) => r.length))
  let columns = tab.columns
  let rows = tab.rows.map((r) => [...r])
  while (columns.length < needCols) columns = [...columns, colLabel(columns.length)]
  while (rows.length < needRows) rows.push(new Array(columns.length).fill(''))
  rows = rows.map((r) => {
    while (r.length < columns.length) r.push('')
    return r
  })
  for (let i = 0; i < matrix.length; i++) {
    for (let j = 0; j < matrix[i].length; j++) {
      rows[top + i][left + j] = matrix[i][j]
    }
  }
  return { ...tab, columns, rows }
}

// Fill the whole range with the value(s) from its first row (fill down).
export function fillDown(tab: SheetTab, range: CellRange): SheetTab {
  let rows = tab.rows.map((r) => [...r])
  for (let c = range.c0; c <= range.c1; c++) {
    const src = rows[range.r0]?.[c] ?? ''
    for (let r = range.r0 + 1; r <= range.r1; r++) rows[r][c] = src
  }
  return { ...tab, rows }
}

// Fill the whole range with the value(s) from its first column (fill right).
export function fillRight(tab: SheetTab, range: CellRange): SheetTab {
  const rows = tab.rows.map((r) => [...r])
  for (let r = range.r0; r <= range.r1; r++) {
    const src = rows[r]?.[range.c0] ?? ''
    for (let c = range.c0 + 1; c <= range.c1; c++) rows[r][c] = src
  }
  return { ...tab, rows }
}

// Sort the data rows by a column. A header row is not assumed; the caller can
// exclude it by sorting a sub-range later. Numbers sort numerically, text
// alphabetically, with numbers before text.
export function sortByColumn(tab: SheetTab, col: number, dir: 'asc' | 'desc'): SheetTab {
  const rows = [...tab.rows]
  rows.sort((a, b) => {
    const av = a[col] ?? ''
    const bv = b[col] ?? ''
    const an = Number(av)
    const bn = Number(bv)
    const aNum = av.trim() !== '' && Number.isFinite(an)
    const bNum = bv.trim() !== '' && Number.isFinite(bn)
    let cmp: number
    if (aNum && bNum) cmp = an - bn
    else if (aNum) cmp = -1
    else if (bNum) cmp = 1
    else cmp = av.localeCompare(bv)
    return dir === 'asc' ? cmp : -cmp
  })
  return { ...tab, rows }
}

export function setColWidth(tab: SheetTab, col: number, width: number): SheetTab {
  return { ...tab, colWidths: { ...(tab.colWidths ?? {}), [col]: Math.max(48, Math.round(width)) } }
}

// Parse clipboard TSV (how Excel/Sheets put a copied range on the clipboard)
// into a matrix. Tabs split columns, newlines split rows.
export function parseTsv(text: string): string[][] {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n$/, '')
    .split('\n')
    .map((line) => line.split('\t'))
}

// Serialize a range to TSV for the clipboard, using raw cell text.
export function rangeToTsv(tab: SheetTab, range: CellRange): string {
  const lines: string[] = []
  for (let r = range.r0; r <= range.r1; r++) {
    const cells: string[] = []
    for (let c = range.c0; c <= range.c1; c++) cells.push(tab.rows[r]?.[c] ?? '')
    lines.push(cells.join('\t'))
  }
  return lines.join('\n')
}
