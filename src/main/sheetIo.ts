// Spreadsheet Office interop: import .xlsx/.csv into the v2 sheet body and
// export the body to .xlsx/.csv. Uses SheetJS (already a dependency). Honest
// about fidelity: values always; formulas where SheetJS exposes them; number
// formats best-effort; merged cells collapse to their top-left value; styling
// beyond what the body models is dropped; charts are not round-tripped.

import { dialog, BrowserWindow } from 'electron'
import { basename } from 'path'
import { readFile, writeFile } from 'fs/promises'
import * as XLSX from 'xlsx'
import type { SheetBodyV2, SheetTab, SheetNumberFormat } from '@shared/types'
import { mapNumFmt, toExcelNumFmt } from '@shared/sheetNumFmt'
import { buildStyledXlsx } from './sheetXlsxWriter'

export interface SheetImportResult {
  ok: boolean
  body?: SheetBodyV2
  name?: string
  error?: string
}
export interface SheetExportResult {
  ok: boolean
  path?: string
  error?: string
}

function focusedWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
}

let seq = 0
function tabId(): string {
  seq += 1
  return `imp-${seq}`
}


function worksheetToTab(ws: XLSX.WorkSheet, name: string): SheetTab {
  const ref = ws['!ref']
  if (!ref) return { id: tabId(), name, columns: ['A'], rows: [['']] }
  const range = XLSX.utils.decode_range(ref)
  const nCols = range.e.c - range.s.c + 1
  const nRows = range.e.r - range.s.r + 1
  const columns = Array.from({ length: nCols }, (_, i) => XLSX.utils.encode_col(range.s.c + i))
  const rows: string[][] = []
  const formats: Record<string, SheetNumberFormat> = {}

  for (let r = 0; r < nRows; r++) {
    const row: string[] = []
    for (let c = 0; c < nCols; c++) {
      const addr = XLSX.utils.encode_cell({ r: range.s.r + r, c: range.s.c + c })
      const cell = ws[addr] as XLSX.CellObject | undefined
      if (!cell) {
        row.push('')
        continue
      }
      // Prefer the formula (so it stays live in our engine); else the value.
      if (cell.f) row.push(`=${cell.f}`)
      else if (cell.w != null) row.push(String(cell.w))
      else if (cell.v != null) row.push(String(cell.v))
      else row.push('')
      const nf = mapNumFmt(cell.z as string | undefined)
      if (nf) formats[`${r},${c}`] = nf
    }
    rows.push(row)
  }

  const tab: SheetTab = { id: tabId(), name, columns, rows }
  if (Object.keys(formats).length) {
    tab.formats = Object.fromEntries(Object.entries(formats).map(([k, numFmt]) => [k, { numFmt }]))
  }
  return tab
}

export async function importSheet(): Promise<SheetImportResult> {
  const win = focusedWindow()
  const res = await dialog.showOpenDialog(win!, {
    title: 'Import spreadsheet',
    properties: ['openFile'],
    filters: [{ name: 'Spreadsheets', extensions: ['xlsx', 'xls', 'csv'] }]
  })
  if (res.canceled || !res.filePaths[0]) return { ok: false }
  const path = res.filePaths[0]
  try {
    const buf = await readFile(path)
    const wb = XLSX.read(buf, { type: 'buffer', cellFormula: true, cellNF: true, cellText: true })
    const sheets = wb.SheetNames.map((sn) => worksheetToTab(wb.Sheets[sn], sn))
    if (!sheets.length) return { ok: false, error: 'That workbook has no sheets.' }
    return { ok: true, name: basename(path), body: { version: 2, sheets, activeSheet: 0 } }
  } catch (e) {
    return { ok: false, error: `Could not read that file: ${(e as Error).message}` }
  }
}

function tabToWorksheet(tab: SheetTab): XLSX.WorkSheet {
  const aoa: (string | number)[][] = tab.rows.map((row) =>
    row.map((cell) => {
      if (cell.startsWith('=')) return cell // becomes a formula below
      const n = Number(cell)
      return cell.trim() !== '' && Number.isFinite(n) ? n : cell
    })
  )
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  // Re-encode formula cells with the {f} form so Excel keeps them live.
  for (let r = 0; r < tab.rows.length; r++) {
    for (let c = 0; c < tab.rows[r].length; c++) {
      const raw = tab.rows[r][c]
      if (raw.startsWith('=')) {
        const addr = XLSX.utils.encode_cell({ r, c })
        ws[addr] = { t: 'n', f: raw.slice(1) } as XLSX.CellObject
      }
    }
  }
  // Carry per-cell number formats so currency/percent/date render in Excel rather
  // than as bare numbers. (Fonts/fills/colours need a styled writer — exceljs — and
  // are a separate fidelity pass; this keeps numeric meaning intact today.)
  if (tab.formats) {
    for (const [key, fmt] of Object.entries(tab.formats)) {
      const z = toExcelNumFmt(fmt.numFmt)
      if (!z) continue
      const [r, c] = key.split(',').map(Number)
      const addr = XLSX.utils.encode_cell({ r, c })
      const existing = ws[addr] as XLSX.CellObject | undefined
      if (existing) existing.z = z
    }
  }
  // Column widths (px → approximate Excel character width).
  if (tab.colWidths && Object.keys(tab.colWidths).length > 0) {
    const maxCol = Math.max(...tab.rows.map((r) => r.length), 1)
    ws['!cols'] = Array.from({ length: maxCol }, (_, c) => {
      const px = tab.colWidths?.[c]
      return px ? { wch: Math.max(2, Math.round(px / 7)) } : {}
    })
  }
  return ws
}

export async function exportSheet(input: {
  body: SheetBodyV2
  format: 'xlsx' | 'csv'
  name: string
}): Promise<SheetExportResult> {
  const win = focusedWindow()
  const safe = (input.name || 'spreadsheet').replace(/[/\\?%*:|"<>]/g, '-')
  const res = await dialog.showSaveDialog(win!, {
    title: `Export as ${input.format.toUpperCase()}`,
    defaultPath: `${safe}.${input.format}`,
    filters: [{ name: input.format.toUpperCase(), extensions: [input.format] }]
  })
  if (res.canceled || !res.filePath) return { ok: false }
  try {
    if (input.format === 'csv') {
      // CSV is single-sheet, computed/raw values only (no formats, no formulas).
      const ws = tabToWorksheet(input.body.sheets[input.body.activeSheet ?? 0])
      const csv = XLSX.utils.sheet_to_csv(ws)
      await writeFile(res.filePath, csv)
    } else {
      // xlsx export goes through exceljs so visual styles (fonts, fills, colours,
      // alignment) survive into real Excel, not just values + number formats.
      const out = await buildStyledXlsx(input.body)
      await writeFile(res.filePath, out)
    }
    return { ok: true, path: res.filePath }
  } catch (e) {
    return { ok: false, error: `Could not export: ${(e as Error).message}` }
  }
}
