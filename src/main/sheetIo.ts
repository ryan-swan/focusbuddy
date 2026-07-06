// Spreadsheet Office interop: import .xlsx/.csv into the v2 sheet body and
// export the body to .xlsx/.csv. Uses SheetJS (already a dependency). Honest
// about fidelity: values always; formulas where SheetJS exposes them; number
// formats best-effort; merged cells collapse to their top-left value; styling
// beyond what the body models is dropped; charts are not round-tripped.

import { dialog, BrowserWindow } from 'electron'
import { basename } from 'path'
import { readFile, writeFile } from 'fs/promises'
import * as XLSX from 'xlsx'
import type { SheetBodyV2, SheetTab, SheetNumberFormat, SheetValidation, SheetValidationRule } from '@shared/types'
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

  // Column widths (Excel gives char units or px; we store px). Indexed relative
  // to the tab's first column so it lines up with our columns[] array.
  const cols = ws['!cols'] as XLSX.ColInfo[] | undefined
  if (cols) {
    const colWidths: Record<number, number> = {}
    for (let i = 0; i < nCols; i++) {
      const ci = cols[range.s.c + i]
      if (!ci) continue
      // Prefer char width (wch) * 7 to invert our writer's px→char (px/7); wpx is
      // SheetJS's own conversion at a different metric, so it drifts.
      const px =
        ci.wch != null ? Math.round(ci.wch * 7) : ci.width != null ? Math.round(ci.width * 7) : ci.wpx != null ? ci.wpx : null
      if (px != null && px > 0) colWidths[i] = px
    }
    if (Object.keys(colWidths).length) tab.colWidths = colWidths
  }

  // Row heights (Excel gives px or points; we store px).
  const rowInfos = ws['!rows'] as XLSX.RowInfo[] | undefined
  if (rowInfos) {
    const rowHeights: Record<number, number> = {}
    for (let r = 0; r < nRows; r++) {
      const ri = rowInfos[range.s.r + r]
      if (!ri) continue
      // Prefer points (hpt) converted to px to invert our writer's px→pt; SheetJS's
      // hpx echoes the point value rather than a true 96dpi px.
      const px = ri.hpt != null ? Math.round((ri.hpt * 96) / 72) : ri.hpx != null ? ri.hpx : null
      if (px != null && px > 0) rowHeights[r] = px
    }
    if (Object.keys(rowHeights).length) tab.rowHeights = rowHeights
  }

  return tab
}

// Exposed for unit tests: convert a SheetJS worksheet to our tab model. Pure.
export function _worksheetToTabForTest(ws: XLSX.WorkSheet, name: string): SheetTab {
  return worksheetToTab(ws, name)
}

// Resolve each worksheet's XML by sheet name (name → part XML), reading the
// workbook's sheet list and rels. Shared by the freeze / validation readers,
// which recover structure SheetJS does not surface.
async function worksheetXmlByName(data: Uint8Array): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const { unzipSync, strFromU8 } = await import('fflate')
  const files = unzipSync(data) as Record<string, Uint8Array>
  const wbKey = Object.keys(files).find((n) => /xl\/workbook\.xml$/i.test(n))
  const relsKey = Object.keys(files).find((n) => /xl\/_rels\/workbook\.xml\.rels$/i.test(n))
  if (!wbKey || !relsKey) return out
  const rels = new Map<string, string>()
  for (const rel of strFromU8(files[relsKey]).match(/<Relationship\b[^>]*\/?>/g) ?? []) {
    const id = /Id="([^"]+)"/.exec(rel)?.[1]
    const target = /Target="([^"]+)"/.exec(rel)?.[1]
    if (id && target) rels.set(id, target.replace(/^\//, '').replace(/^xl\//, ''))
  }
  for (const sheetTag of strFromU8(files[wbKey]).match(/<sheet\b[^>]*\/?>/g) ?? []) {
    const name = /name="([^"]+)"/.exec(sheetTag)?.[1]
    const rid = /r:id="([^"]+)"/.exec(sheetTag)?.[1]
    if (!name || !rid) continue
    const target = rels.get(rid)
    if (!target) continue
    const key = Object.keys(files).find((n) => n.toLowerCase() === `xl/${target.toLowerCase()}`)
    if (key) out.set(name, strFromU8(files[key]))
  }
  return out
}

// Frozen panes keyed by sheet name. SheetJS does not surface freeze panes, so we
// read them straight from the package XML (<pane xSplit ySplit state="frozen">).
// xSplit is the number of frozen columns, ySplit the frozen rows.
export async function parseXlsxFreeze(data: Uint8Array): Promise<Record<string, { rows: number; cols: number }>> {
  const out: Record<string, { rows: number; cols: number }> = {}
  try {
    for (const [name, xml] of await worksheetXmlByName(data)) {
      const pane = /<pane\b[^>]*>/.exec(xml)?.[0]
      if (!pane || !/state="frozen(Split)?"/.test(pane)) continue
      const cols = Number(/xSplit="(\d+)"/.exec(pane)?.[1] ?? 0)
      const rows = Number(/ySplit="(\d+)"/.exec(pane)?.[1] ?? 0)
      if (rows > 0 || cols > 0) out[name] = { rows, cols }
    }
  } catch {
    // A malformed package just yields no freeze info; never throw here.
  }
  return out
}

type NumOp = 'gt' | 'lt' | 'ge' | 'le' | 'eq' | 'between'
const XLSX_OP_TO_NUM: Record<string, NumOp> = {
  greaterThan: 'gt',
  lessThan: 'lt',
  greaterThanOrEqual: 'ge',
  lessThanOrEqual: 'le',
  equal: 'eq',
  between: 'between'
}

// Data validations keyed by sheet name. SheetJS drops them, so read the
// <dataValidation> elements from the worksheet XML. Only rules we model are
// recovered; a range-based list source (not an inline quoted list) is skipped
// rather than guessed.
export async function parseXlsxValidations(data: Uint8Array): Promise<Record<string, SheetValidation[]>> {
  const out: Record<string, SheetValidation[]> = {}
  try {
    for (const [name, xml] of await worksheetXmlByName(data)) {
      const rules: SheetValidation[] = []
      let i = 0
      for (const dv of xml.match(/<dataValidation\b[\s\S]*?(?:\/>|<\/dataValidation>)/g) ?? []) {
        const sqref = /sqref="([^"]+)"/.exec(dv)?.[1]?.split(/\s+/)[0]
        if (!sqref) continue
        const type = /type="([^"]+)"/.exec(dv)?.[1] ?? ''
        const opAttr = /operator="([^"]+)"/.exec(dv)?.[1]
        const strict = /allowBlank="1"/.test(dv) ? false : true
        const decode = (s?: string): string | undefined =>
          s?.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim()
        const f1 = decode(/<formula1>([\s\S]*?)<\/formula1>/.exec(dv)?.[1])
        const f2 = decode(/<formula2>([\s\S]*?)<\/formula2>/.exec(dv)?.[1])
        let rule: SheetValidationRule | null = null
        if (type === 'list' && f1) {
          const m = /^"(.*)"$/.exec(f1) // inline quoted list only
          if (m) rule = { kind: 'list', values: m[1].split(',').map((s) => s.trim()).filter(Boolean) }
        } else if ((type === 'decimal' || type === 'whole') && f1 != null && Number.isFinite(Number(f1))) {
          // Excel omits operator="between" because it is the numeric default, so a
          // missing operator with two operands means a between-rule.
          const nop: NumOp = opAttr ? XLSX_OP_TO_NUM[opAttr] ?? 'gt' : f2 != null ? 'between' : 'gt'
          rule = { kind: 'number', op: nop, value: Number(f1), ...(nop === 'between' && f2 != null ? { value2: Number(f2) } : {}) }
        } else if (type === 'textLength' && (opAttr === 'greaterThan' || !opAttr)) {
          rule = { kind: 'textNotEmpty' }
        }
        if (rule) rules.push({ id: `imp-dv-${i++}`, range: sqref, rule, ...(strict ? { strict: true } : {}) })
      }
      if (rules.length) out[name] = rules
    }
  } catch {
    // Malformed package: no validations recovered, never throw.
  }
  return out
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
    // cellStyles: true so SheetJS parses column widths (!cols) and row heights
    // (!rows) out of the file; without it those structural dimensions are dropped.
    const wb = XLSX.read(buf, { type: 'buffer', cellFormula: true, cellNF: true, cellText: true, cellStyles: true })
    const sheets = wb.SheetNames.map((sn) => worksheetToTab(wb.Sheets[sn], sn))
    if (!sheets.length) return { ok: false, error: 'That workbook has no sheets.' }
    // Recover frozen panes and data validations (SheetJS drops both) from the XML.
    const bytes = new Uint8Array(buf)
    const freeze = await parseXlsxFreeze(bytes)
    const validations = await parseXlsxValidations(bytes)
    for (const tab of sheets) {
      const f = freeze[tab.name]
      if (f) tab.freeze = f
      const v = validations[tab.name]
      if (v) tab.validations = v
    }
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
