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

// Map a SheetJS number-format code (cell.z) to our format model, best-effort.
function mapNumFmt(z: string | undefined): SheetNumberFormat | undefined {
  if (!z || z === 'General') return undefined
  const lc = z.toLowerCase()
  if (lc.includes('%')) return { kind: 'percent', decimals: (z.split('.')[1]?.length ?? 0) }
  if (lc.includes('$') || lc.includes('"$"') || lc.includes('usd')) {
    return { kind: 'currency', decimals: z.includes('.') ? z.split('.')[1].replace(/[^0]/g, '').length : 2, symbol: '$' }
  }
  if (/[ymd]/.test(lc) && !lc.includes('e')) return { kind: 'date', pattern: 'YYYY-MM-DD' }
  if (lc.includes('#,##0') || lc.includes('0.0')) {
    const decimals = z.includes('.') ? z.split('.')[1].replace(/[^0]/g, '').length : 0
    return { kind: 'number', decimals, thousands: z.includes(',') }
  }
  return undefined
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
      const wb = XLSX.utils.book_new()
      for (const tab of input.body.sheets) {
        XLSX.utils.book_append_sheet(wb, tabToWorksheet(tab), tab.name.slice(0, 31) || 'Sheet')
      }
      const out = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
      await writeFile(res.filePath, out)
    }
    return { ok: true, path: res.filePath }
  } catch (e) {
    return { ok: false, error: `Could not export: ${(e as Error).message}` }
  }
}
