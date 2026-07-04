// The shared chart core. One data model + one set of chart types that BOTH
// PlexiSheets and PlexiSlides render through, so a chart authored in a sheet and
// one placed on a slide are the same object. Kept pure (no React, no recharts, no
// Electron) so it can be built in the renderer, snapshotted into a slide, and
// unit-tested directly. No fabrication: a missing value plots as 0, never an
// invented number, and an empty series renders an honest empty chart.

export type ChartType = 'bar' | 'line' | 'pie' | 'area' | 'scatter'

export interface ChartSeries {
  name: string
  values: number[]
}

// Categories run along the x-axis (or become pie slices); each series is one
// line/area/bar group with one value per category.
export interface ChartData {
  categories: string[]
  series: ChartSeries[]
}

export interface ChartCore {
  type: ChartType
  title?: string
  data: ChartData
  // Stack bars/areas instead of grouping them side by side.
  stacked?: boolean
}

export const CHART_PALETTE = ['#3b82f6', '#22c55e', '#f97316', '#a855f7', '#ec4899', '#06b6d4', '#eab308', '#ef4444']

export const CHART_TYPES: Array<{ type: ChartType; label: string }> = [
  { type: 'bar', label: 'Bar' },
  { type: 'line', label: 'Line' },
  { type: 'area', label: 'Area' },
  { type: 'pie', label: 'Pie' },
  { type: 'scatter', label: 'Scatter' }
]

export function emptyChartData(): ChartData {
  return { categories: [], series: [] }
}

// Flatten ChartData into the row-per-category shape recharts consumes, plus the
// list of series keys. Series names are de-duplicated (recharts keys must be
// unique) by suffixing repeats, which also stops a repeated header silently
// collapsing two columns into one.
export function toRechartsRows(data: ChartData): { rows: Array<Record<string, string | number>>; keys: string[] } {
  const keys: string[] = []
  const seen = new Map<string, number>()
  for (const s of data.series) {
    const base = s.name && s.name.trim() ? s.name : `Series ${keys.length + 1}`
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    keys.push(n === 0 ? base : `${base} (${n + 1})`)
  }
  const rows = data.categories.map((cat, i) => {
    const row: Record<string, string | number> = { name: cat }
    data.series.forEach((s, si) => {
      const v = s.values[i]
      row[keys[si]] = Number.isFinite(v) ? v : 0
    })
    return row
  })
  return { rows, keys }
}
