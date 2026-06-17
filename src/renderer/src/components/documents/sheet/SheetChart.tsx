// Renders a chart from a ChartSpec by resolving its range against the live tab
// through the formula engine, so the chart plots the REAL computed values (a
// formula cell charts its result, not its text). Bar, line and pie are
// supported via recharts.

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts'
import type { SheetChartSpec, SheetTab } from '@shared/types'
import { displayCell, type Grid } from '../../../lib/sheetFormula'
import Icon from '../../Icon'

const PALETTE = ['#3b82f6', '#22c55e', '#f97316', '#a855f7', '#ec4899', '#06b6d4', '#eab308', '#ef4444']

function colToIndex(letters: string): number {
  let n = 0
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

function parseRange(ref: string): { r0: number; c0: number; r1: number; c1: number } | null {
  const m = ref.toUpperCase().match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/)
  if (!m) return null
  const r0 = Math.min(+m[2], +m[4]) - 1
  const r1 = Math.max(+m[2], +m[4]) - 1
  const c0 = Math.min(colToIndex(m[1]), colToIndex(m[3]))
  const c1 = Math.max(colToIndex(m[1]), colToIndex(m[3]))
  return { r0, c0, r1, c1 }
}

// Build recharts data rows + the list of numeric series keys from the spec.
function buildData(spec: SheetChartSpec, tab: SheetTab): { data: Array<Record<string, string | number>>; series: string[] } {
  const grid: Grid = { columns: tab.columns, rows: tab.rows }
  const range = parseRange(spec.range)
  if (!range) return { data: [], series: [] }
  const { r0, c0, r1, c1 } = range
  const dataR0 = spec.headerRow ? r0 + 1 : r0
  const dataC0 = spec.headerCol ? c0 + 1 : c0

  const seriesNames: string[] = []
  for (let c = dataC0; c <= c1; c++) {
    seriesNames.push(spec.headerRow ? displayCell(grid, r0, c) || `Series ${c - dataC0 + 1}` : `Series ${c - dataC0 + 1}`)
  }

  const data: Array<Record<string, string | number>> = []
  for (let r = dataR0; r <= r1; r++) {
    const row: Record<string, string | number> = {
      name: spec.headerCol ? displayCell(grid, r, c0) : `Row ${r - dataR0 + 1}`
    }
    for (let c = dataC0; c <= c1; c++) {
      const key = seriesNames[c - dataC0]
      const n = Number(displayCell(grid, r, c))
      row[key] = Number.isFinite(n) ? n : 0
    }
    data.push(row)
  }
  return { data, series: seriesNames }
}

interface Props {
  spec: SheetChartSpec
  tab: SheetTab
  onRemove: () => void
}

export default function SheetChart({ spec, tab, onRemove }: Props): JSX.Element {
  const { data, series } = buildData(spec, tab)

  return (
    <div className="rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-3" data-testid="sheet-chart">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[12px] font-semibold text-stone-700 dark:text-stone-200">
          {spec.title || `${spec.type[0].toUpperCase()}${spec.type.slice(1)} chart`}
        </span>
        <button onClick={onRemove} className="icon-btn" title="Remove chart">
          <Icon name="close" size={13} />
        </button>
      </div>
      <div style={{ width: '100%', height: 220 }}>
        <ResponsiveContainer>
          {spec.type === 'pie' ? (
            <PieChart>
              <Pie data={data} dataKey={series[0]} nameKey="name" outerRadius={80} label>
                {data.map((_, i) => (
                  <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          ) : spec.type === 'line' ? (
            <LineChart data={data}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              {series.map((s, i) => (
                <Line key={s} type="monotone" dataKey={s} stroke={PALETTE[i % PALETTE.length]} />
              ))}
            </LineChart>
          ) : (
            <BarChart data={data}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              {series.map((s, i) => (
                <Bar key={s} dataKey={s} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  )
}
