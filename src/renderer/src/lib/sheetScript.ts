// PlexiSheets macros — renderer client.
//
// The renderer ships a strict CSP (script-src 'self', no 'unsafe-eval'), so a
// macro cannot be evaluated here. Instead the script is sent over IPC and run in
// a node:vm context in the main process (see src/main/sheetMacro.ts), which is
// both CSP-clean and more locked-down than a renderer eval would be. This module
// is just the typed client for that call; the engine and its safety guard live
// in main. No fabrication: an error from the runner is surfaced as-is and the
// sheet is left untouched.

import type { SheetTab } from '@shared/types'

export interface SheetScriptResult {
  tab: SheetTab
  logs: string[]
  error: string | null
}

// The API a macro receives as `sheet`, documented here for the editor's help text
// and for callers. The concrete implementation lives in the main-process runner.
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

export async function runSheetScript(tab: SheetTab, code: string): Promise<SheetScriptResult> {
  try {
    return await window.api.sheet.runMacro({ tab, code })
  } catch (e) {
    return { tab, logs: [], error: (e as Error).message || 'Could not run the macro.' }
  }
}
