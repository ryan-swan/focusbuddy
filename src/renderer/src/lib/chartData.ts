// Resolve a sheet range into the shared ChartData model by running the formula
// engine, so a chart plots the REAL computed values (a formula cell charts its
// result, not its text). Used by the Sheets chart renderer AND by a Slides chart
// element refreshing from its live source range, so both read data the same way.

import type { SheetTab } from '@shared/types'
import type { ChartData } from '@shared/chart'
import { displayCell, type Grid } from './sheetFormula'

export interface ChartRangeSpec {
  range: string // e.g. 'A1:C10'
  headerRow?: boolean // first row holds series labels
  headerCol?: boolean // first column holds category labels
}

function colToIndex(letters: string): number {
  let n = 0
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

export function parseRange(ref: string): { r0: number; c0: number; r1: number; c1: number } | null {
  const m = ref.toUpperCase().match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/)
  if (!m) return null
  const r0 = Math.min(+m[2], +m[4]) - 1
  const r1 = Math.max(+m[2], +m[4]) - 1
  const c0 = Math.min(colToIndex(m[1]), colToIndex(m[3]))
  const c1 = Math.max(colToIndex(m[1]), colToIndex(m[3]))
  return { r0, c0, r1, c1 }
}

export function buildChartData(spec: ChartRangeSpec, tab: SheetTab): ChartData {
  const grid: Grid = { columns: tab.columns, rows: tab.rows }
  const range = parseRange(spec.range)
  if (!range) return { categories: [], series: [] }
  const { r0, c0, r1, c1 } = range
  const dataR0 = spec.headerRow ? r0 + 1 : r0
  const dataC0 = spec.headerCol ? c0 + 1 : c0

  const series: ChartData['series'] = []
  for (let c = dataC0; c <= c1; c++) {
    const name = spec.headerRow ? displayCell(grid, r0, c) || `Series ${c - dataC0 + 1}` : `Series ${c - dataC0 + 1}`
    series.push({ name, values: [] })
  }

  const categories: string[] = []
  for (let r = dataR0; r <= r1; r++) {
    categories.push(spec.headerCol ? displayCell(grid, r, c0) : `Row ${r - dataR0 + 1}`)
    for (let c = dataC0; c <= c1; c++) {
      const n = Number(displayCell(grid, r, c))
      series[c - dataC0].values.push(Number.isFinite(n) ? n : 0)
    }
  }
  return { categories, series }
}
