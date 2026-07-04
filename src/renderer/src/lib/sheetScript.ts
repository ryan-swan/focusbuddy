// PlexiSheets macros — an Office-Scripts-class automation surface. A macro is a
// snippet of JavaScript with a `main(sheet)` function; it runs against the active
// tab through a small, safe API and returns the mutated tab plus any logs. The
// result is applied through the normal undo path, so a macro is reviewable and
// reversible like any other edit. No fabrication: a script error is surfaced
// honestly and the sheet is left untouched.
//
// Scope note: scripts run via `new Function` in the renderer. They are the user's
// own local scripts on their own machine (like Excel's Office Scripts / VBA), not
// third-party code, so this is a deliberate local-automation surface, not a
// sandbox boundary. We still block obvious escapes (window/require/import/fetch)
// so a pasted script cannot quietly reach outside the sheet.

import type { SheetTab } from '@shared/types'
import { colLabel } from './sheetBody'

export interface SheetScriptResult {
  tab: SheetTab
  logs: string[]
  error: string | null
}

// The API object a macro receives as `sheet`. Deliberately small and value-based
// (strings in/out) so scripts are simple and deterministic.
export interface SheetScriptApi {
  rowCount(): number
  colCount(): number
  getValue(r: number, c: number): string
  setValue(r: number, c: number, value: unknown): void
  getColumn(c: number): string[]
  getRange(r0: number, c0: number, r1: number, c1: number): string[][]
  setRange(r0: number, c0: number, matrix: unknown[][]): void
  addRow(values?: unknown[]): void
  addColumn(name?: string): void
  columnName(c: number): string
  setColumnName(c: number, name: string): void
  clear(): void
  log(...args: unknown[]): void
}

// A few obvious escape hatches to refuse, so a pasted macro can't reach the
// network, filesystem, or the app shell. This is not a security sandbox (see the
// header note), just a guard against footguns.
const BLOCKED = /\b(window|globalThis|document|require|import|fetch|XMLHttpRequest|process|eval|Function|localStorage|indexedDB|WebSocket)\b/

export function runSheetScript(tab: SheetTab, code: string): SheetScriptResult {
  const logs: string[] = []
  if (BLOCKED.test(code)) {
    return {
      tab,
      logs,
      error:
        'This macro references something outside the sheet (network, filesystem, or the app). Macros can only read and write the sheet.'
    }
  }
  // Work on a mutable copy; only committed to a new tab if the script succeeds.
  const columns = tab.columns.slice()
  const rows = tab.rows.map((r) => r.slice())
  const grow = (r: number, c: number): void => {
    while (columns.length <= c) {
      columns.push(colLabel(columns.length))
      for (const row of rows) row.push('')
    }
    while (rows.length <= r) rows.push(new Array(columns.length).fill(''))
    for (const row of rows) while (row.length < columns.length) row.push('')
  }
  const api: SheetScriptApi = {
    rowCount: () => rows.length,
    colCount: () => columns.length,
    getValue: (r, c) => rows[r]?.[c] ?? '',
    setValue: (r, c, v) => {
      if (r < 0 || c < 0) return
      grow(r, c)
      rows[r][c] = v == null ? '' : String(v)
    },
    getColumn: (c) => rows.map((row) => row[c] ?? ''),
    getRange: (r0, c0, r1, c1) => {
      const out: string[][] = []
      for (let r = r0; r <= r1; r++) {
        const row: string[] = []
        for (let c = c0; c <= c1; c++) row.push(rows[r]?.[c] ?? '')
        out.push(row)
      }
      return out
    },
    setRange: (r0, c0, matrix) => {
      for (let i = 0; i < matrix.length; i++) {
        const row = matrix[i] ?? []
        for (let j = 0; j < row.length; j++) {
          grow(r0 + i, c0 + j)
          rows[r0 + i][c0 + j] = row[j] == null ? '' : String(row[j])
        }
      }
    },
    addRow: (values) => {
      const row = new Array(columns.length).fill('')
      if (values) for (let j = 0; j < Math.min(values.length, columns.length); j++) row[j] = values[j] == null ? '' : String(values[j])
      rows.push(row)
    },
    addColumn: (name) => {
      columns.push(name != null ? String(name) : colLabel(columns.length))
      for (const row of rows) row.push('')
    },
    columnName: (c) => columns[c] ?? '',
    setColumnName: (c, name) => {
      if (c >= 0 && c < columns.length) columns[c] = String(name)
    },
    clear: () => {
      rows.forEach((row) => row.fill(''))
    },
    log: (...args) => logs.push(args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '))
  }
  try {
    // The script body may define `main(sheet)`; we call it. A bare body (no main)
    // also runs, with `sheet` in scope, for quick one-liners.
    // eslint-disable-next-line no-new-func
    const fn = new Function(
      'sheet',
      `"use strict";\n${code}\n;\nif (typeof main === 'function') { return main(sheet); }`
    )
    fn(api)
  } catch (e) {
    return { tab, logs, error: (e as Error).message || 'Macro failed' }
  }
  return { tab: { ...tab, columns, rows }, logs, error: null }
}
