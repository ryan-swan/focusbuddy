// PlexiSheets macros run here, in the main process, inside a node:vm context.
//
// Why not the renderer? The renderer ships a strict Content Security Policy
// (script-src 'self', no 'unsafe-eval'), so `eval` / `new Function` are refused
// there. Rather than weaken that policy for the whole window, a macro is sent
// over IPC and executed in a dedicated vm context whose sandbox exposes only the
// sheet API plus a handful of safe pure globals (no require, no process, no
// module, no fetch). That is both CSP-clean and more locked-down than the old
// renderer path, which had ambient access to every global.
//
// This is a local-automation surface for the user's own scripts (like Excel's
// Office Scripts / VBA), not a boundary against hostile code. No fabrication: a
// script error is returned honestly and the sheet is left untouched.

import vm from 'node:vm'
import type { SheetTab } from '@shared/types'

export interface SheetMacroResult {
  tab: SheetTab
  logs: string[]
  error: string | null
}

// A -> Z, AA -> AZ, ... spreadsheet column label for a zero-based index.
function colLabel(index: number): string {
  let n = index
  let out = ''
  do {
    out = String.fromCharCode(65 + (n % 26)) + out
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return out
}

// Obvious escape hatches to refuse before we even build the context, so a pasted
// macro can't reach the network, filesystem, or the app shell.
const BLOCKED = /\b(require|import|process|globalThis|global|module|exports|eval|Function|fetch|XMLHttpRequest|WebSocket|Buffer|__dirname|__filename)\b/

export function runSheetMacro(tab: SheetTab, code: string): SheetMacroResult {
  const logs: string[] = []
  if (typeof code !== 'string' || !code.trim()) {
    return { tab, logs, error: 'The macro is empty.' }
  }
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

  const api = {
    rowCount: () => rows.length,
    colCount: () => columns.length,
    getValue: (r: number, c: number) => rows[r]?.[c] ?? '',
    setValue: (r: number, c: number, v: unknown) => {
      if (r < 0 || c < 0) return
      grow(r, c)
      rows[r][c] = v == null ? '' : String(v)
    },
    getColumn: (c: number) => rows.map((row) => row[c] ?? ''),
    getRange: (r0: number, c0: number, r1: number, c1: number) => {
      const out: string[][] = []
      for (let r = r0; r <= r1; r++) {
        const row: string[] = []
        for (let c = c0; c <= c1; c++) row.push(rows[r]?.[c] ?? '')
        out.push(row)
      }
      return out
    },
    setRange: (r0: number, c0: number, matrix: unknown[][]) => {
      for (let i = 0; i < matrix.length; i++) {
        const row = matrix[i] ?? []
        for (let j = 0; j < row.length; j++) {
          grow(r0 + i, c0 + j)
          rows[r0 + i][c0 + j] = row[j] == null ? '' : String(row[j])
        }
      }
    },
    addRow: (values?: unknown[]) => {
      const row = new Array(columns.length).fill('')
      if (values) for (let j = 0; j < Math.min(values.length, columns.length); j++) row[j] = values[j] == null ? '' : String(values[j])
      rows.push(row)
    },
    addColumn: (name?: string) => {
      columns.push(name != null ? String(name) : colLabel(columns.length))
      for (const row of rows) row.push('')
    },
    columnName: (c: number) => columns[c] ?? '',
    setColumnName: (c: number, name: string) => {
      if (c >= 0 && c < columns.length) columns[c] = String(name)
    },
    clear: () => {
      rows.forEach((row) => row.fill(''))
    },
    log: (...args: unknown[]) => logs.push(args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '))
  }

  // The sandbox exposes ONLY the sheet + a set of safe, pure globals. Anything not
  // listed here is undefined inside the macro.
  const sandbox: Record<string, unknown> = {
    sheet: api,
    Math,
    JSON,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Date,
    RegExp,
    parseInt,
    parseFloat,
    isNaN,
    isFinite
  }

  try {
    const context = vm.createContext(sandbox)
    vm.runInContext(
      `"use strict";\n${code}\n;\nif (typeof main === 'function') { main(sheet); }`,
      context,
      { timeout: 3000 }
    )
  } catch (e) {
    return { tab, logs, error: (e as Error).message || 'Macro failed' }
  }
  return { tab: { ...tab, columns, rows }, logs, error: null }
}
