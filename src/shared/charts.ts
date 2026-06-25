// PlexiDash chart model. A chart widget reads the real rows of a Table (the
// typed Airtable-style fb_tables store) and renders an aggregated view: bar,
// line, area, pie, or a single KPI number. The config lives in widget.content
// as JSON, mirroring how the table widget stores its schema.
//
// This module is pure (no React, no store, no DOM) so the aggregation is unit
// testable on its own. The widget component feeds it real rows + columns and
// hands the result to recharts. Nothing here invents data: if a column holds no
// numbers, its aggregate is an honest zero (or null for averages of nothing),
// and an unbound chart returns an empty series rather than a placeholder.

import type { FieldDefinition, FieldType, FbRow } from './fields'

export type ChartType = 'bar' | 'line' | 'area' | 'pie' | 'kpi'

export type Aggregation = 'sum' | 'avg' | 'count' | 'min' | 'max'

export interface ChartSeries {
  // The column whose values are aggregated for this series. For agg 'count' the
  // column is only used for labelling; every row in a group counts.
  columnId: string
  agg: Aggregation
  // Optional override label + colour; otherwise derived from the column + palette.
  label?: string
  color?: string
}

export interface ChartConfig {
  // The fb_tables id this chart reads. null = unbound (the widget shows a picker).
  tableId: string | null
  type: ChartType
  // Category column: the x-axis for bar/line/area, the slice label for pie.
  // null/absent groups every row into one bucket (useful with a single series).
  xColumnId: string | null
  // One or more numeric series. For 'kpi' only series[0] is used, aggregated
  // across all rows with no grouping.
  series: ChartSeries[]
  title?: string
}

export const CHART_PALETTE = [
  '#6366f1',
  '#0ea5e9',
  '#10b981',
  '#f59e0b',
  '#ec4899',
  '#8b5cf6',
  '#14b8a6',
  '#ef4444'
]

export const AGG_LABELS: Record<Aggregation, string> = {
  sum: 'Sum',
  avg: 'Average',
  count: 'Count',
  min: 'Min',
  max: 'Max'
}

export const CHART_TYPE_LABELS: Record<ChartType, string> = {
  bar: 'Bar',
  line: 'Line',
  area: 'Area',
  pie: 'Pie',
  kpi: 'KPI'
}

export const CHART_TYPE_ICONS: Record<ChartType, string> = {
  bar: 'bar_chart',
  line: 'show_chart',
  area: 'area_chart',
  pie: 'pie_chart',
  kpi: 'pin'
}

export function defaultChartConfig(): ChartConfig {
  return { tableId: null, type: 'bar', xColumnId: null, series: [] }
}

// Field types that make sense as a numeric series (y). 'number' is the obvious
// one; the rest can still be counted, so 'count' works on any column.
export function isNumericField(type: FieldType): boolean {
  return type === 'number'
}

// Coerce a stored cell value to a number for aggregation, or null when it isn't
// numeric. Mirrors how the table renders numbers: real number cells pass
// straight through, numeric-looking text parses, everything else is null.
export function cellToNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'string') {
    const n = parseFloat(value.replace(/[^0-9.eE+-]/g, ''))
    return Number.isFinite(n) ? n : null
  }
  return null
}

// Render a category value (the x/group key) to a display label. Selects store
// option ids, but for charting the raw stored value is shown; the widget can map
// ids to option labels before calling in. Empty/blank becomes a clear marker.
export function cellToLabel(value: unknown): string {
  if (value === null || value === undefined || value === '') return '(empty)'
  if (Array.isArray(value)) return value.length ? value.join(', ') : '(empty)'
  return String(value)
}

function aggregate(values: number[], agg: Aggregation, rowCount: number): number | null {
  if (agg === 'count') return rowCount
  if (values.length === 0) return agg === 'avg' ? null : 0
  switch (agg) {
    case 'sum':
      return values.reduce((a, b) => a + b, 0)
    case 'avg':
      return values.reduce((a, b) => a + b, 0) / values.length
    case 'min':
      return Math.min(...values)
    case 'max':
      return Math.max(...values)
    default:
      return 0
  }
}

// A safe, collision-resistant data key for a series in the recharts row objects.
export function seriesKey(s: ChartSeries, index: number): string {
  return `s${index}_${s.columnId}`
}

export interface ChartDatum {
  // The category label for this group (x-axis tick / pie slice name).
  x: string
  // One numeric (or null) entry per series, keyed by seriesKey(series, i).
  [key: string]: string | number | null
}

export interface ComputedChart {
  data: ChartDatum[]
  // KPI convenience: the single aggregated value when type === 'kpi'.
  kpi: number | null
  // True when there is genuinely nothing to show (no bound table, no rows, or no
  // series). The widget renders an honest empty state instead of a blank chart.
  empty: boolean
}

// The heart of PlexiDash: turn real rows into aggregated chart data. Grouping is
// by the x column's value; each series aggregates its column within the group.
// For 'kpi' there is no grouping, just one aggregate over all rows.
export function computeChartData(
  config: ChartConfig,
  rows: FbRow[],
  columns: FieldDefinition[],
  // Optional resolver so select-option ids can be shown as their labels on the
  // category axis. Falls back to the raw value when absent.
  labelForCell?: (columnId: string, value: unknown) => string
): ComputedChart {
  const colById = new Map(columns.map((c) => [c.id, c]))
  const label = (columnId: string, value: unknown): string =>
    labelForCell ? labelForCell(columnId, value) : cellToLabel(value)

  if (!config.tableId || config.series.length === 0) {
    return { data: [], kpi: null, empty: true }
  }

  if (config.type === 'kpi') {
    const s = config.series[0]
    const nums: number[] = []
    for (const r of rows) {
      const n = cellToNumber(r.cells[s.columnId])
      if (n !== null) nums.push(n)
    }
    const value = aggregate(nums, s.agg, rows.length)
    return { data: [], kpi: value, empty: rows.length === 0 }
  }

  // Group rows by the x column (or a single "All" bucket when none chosen).
  const groups = new Map<string, FbRow[]>()
  for (const r of rows) {
    const key =
      config.xColumnId && colById.has(config.xColumnId)
        ? label(config.xColumnId, r.cells[config.xColumnId])
        : 'All'
    const bucket = groups.get(key)
    if (bucket) bucket.push(r)
    else groups.set(key, [r])
  }

  const data: ChartDatum[] = []
  for (const [x, bucket] of groups) {
    const datum: ChartDatum = { x }
    config.series.forEach((s, i) => {
      const nums: number[] = []
      for (const r of bucket) {
        const n = cellToNumber(r.cells[s.columnId])
        if (n !== null) nums.push(n)
      }
      datum[seriesKey(s, i)] = aggregate(nums, s.agg, bucket.length)
    })
    data.push(datum)
  }

  return { data, kpi: null, empty: rows.length === 0 }
}

// Human label for a series (legend / tooltip): explicit override, else the
// column's label with its aggregation, e.g. "Revenue (Sum)".
export function seriesLabel(s: ChartSeries, columns: FieldDefinition[]): string {
  if (s.label) return s.label
  const col = columns.find((c) => c.id === s.columnId)
  const base = col?.label ?? 'Value'
  return s.agg === 'count' ? `${base} (Count)` : `${base} (${AGG_LABELS[s.agg]})`
}
