import type { SheetPivotSpec, SheetPivotAgg } from '@shared/types'
import { parseA1Range } from './sheetCond'

// Pure pivot computation. Reads displayed cell values (so it honours computed
// formulas) and aggregates them. No fabrication: a non-numeric value under a
// numeric aggregate is simply skipped; an empty result aggregates to 0/empty.

export interface PivotResult {
  rowFieldLabel: string
  colFieldLabel: string | null
  valueFieldLabel: string
  agg: SheetPivotAgg
  colKeys: string[] // column headers (empty [''] when no colField)
  rows: Array<{ key: string; cells: Array<number | null>; total: number | null }>
  grandTotal: number | null
  // Every distinct value of the row / column field (before slicer filtering), so
  // the UI can render slicer checkboxes covering the full domain.
  rowFieldValues: string[]
  colFieldValues: string[]
}

function aggregate(values: number[], agg: SheetPivotAgg): number | null {
  if (agg === 'count') return values.length
  if (values.length === 0) return agg === 'sum' ? 0 : null
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
      return null
  }
}

function asNumber(v: string): number | null {
  const c = (v ?? '').replace(/[\s,$%]/g, '')
  if (c === '' || c === '-' || c === '+') return null
  const n = Number(c)
  return Number.isFinite(n) ? n : null
}

// getCell(r, c) returns the displayed value at absolute sheet coordinates.
export function computePivot(
  getCell: (r: number, c: number) => string,
  spec: SheetPivotSpec
): PivotResult | null {
  const range = parseA1Range(spec.range)
  if (!range) return null
  const { r1, c1, r2 } = range
  const header = (rel: number): string => getCell(r1, c1 + rel) || `Col ${rel + 1}`
  const rowFieldLabel = header(spec.rowField)
  const colFieldLabel = spec.colField != null ? header(spec.colField) : null
  const valueFieldLabel = header(spec.valueField)

  // Slicer filters: field -> set of excluded values.
  const excludeByField = new Map<number, Set<string>>()
  for (const f of spec.filters ?? []) excludeByField.set(f.field, new Set(f.exclude))

  // Collect grouped values: rowKey -> colKey -> number[].
  const groups = new Map<string, Map<string, number[]>>()
  const colKeySet = new Set<string>()
  const rowOrder: string[] = []
  const countMode = spec.agg === 'count'
  // The full domain of the row/column fields (unfiltered) for slicer UIs.
  const rowFieldAll = new Set<string>()
  const colFieldAll = new Set<string>()

  for (let r = r1 + 1; r <= r2; r++) {
    const rowKey = getCell(r, c1 + spec.rowField)
    const colKey = spec.colField != null ? getCell(r, c1 + spec.colField) : ''
    rowFieldAll.add(rowKey)
    if (spec.colField != null) colFieldAll.add(colKey)
    // Apply slicers: skip a source row if any filtered field's value is excluded.
    let excluded = false
    for (const [field, set] of excludeByField) {
      if (set.size && set.has(getCell(r, c1 + field))) {
        excluded = true
        break
      }
    }
    if (excluded) continue
    const raw = getCell(r, c1 + spec.valueField)
    const num = asNumber(raw)
    // For non-count aggregates a non-numeric value contributes nothing.
    if (!countMode && num === null) continue
    if (!groups.has(rowKey)) {
      groups.set(rowKey, new Map())
      rowOrder.push(rowKey)
    }
    const byCol = groups.get(rowKey)!
    if (!byCol.has(colKey)) byCol.set(colKey, [])
    byCol.get(colKey)!.push(countMode ? num ?? 0 : (num as number))
    colKeySet.add(colKey)
  }

  const colKeys = [...colKeySet].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  const rows = rowOrder
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((key) => {
      const byCol = groups.get(key)!
      const cells = colKeys.map((ck) => aggregate(byCol.get(ck) ?? [], spec.agg))
      const allValues = [...byCol.values()].flat()
      return { key, cells, total: aggregate(allValues, spec.agg) }
    })

  const grandValues: number[] = []
  for (const byCol of groups.values()) for (const arr of byCol.values()) grandValues.push(...arr)

  const sortVals = (s: Set<string>): string[] => [...s].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

  return {
    rowFieldLabel,
    colFieldLabel,
    valueFieldLabel,
    agg: spec.agg,
    colKeys,
    rows,
    grandTotal: aggregate(grandValues, spec.agg),
    rowFieldValues: sortVals(rowFieldAll),
    colFieldValues: sortVals(colFieldAll)
  }
}
