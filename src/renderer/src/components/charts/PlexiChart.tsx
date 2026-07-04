// The one chart renderer for the whole suite. Given a ChartCore (the shared
// model), it draws a bar, line, area, pie or scatter chart via recharts. Both
// PlexiSheets and PlexiSlides render through this, so a chart looks identical
// wherever it lives. Presentational only — no data resolution, no persistence.

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  ScatterChart,
  Scatter,
  Cell,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts'
import type { ChartCore } from '@shared/chart'
import { CHART_PALETTE, toRechartsRows } from '@shared/chart'

interface Props {
  chart: ChartCore
  height?: number
  // Hide the legend/tooltip chrome for small embeds (e.g. a slide thumbnail).
  compact?: boolean
}

export default function PlexiChart({ chart, height = 220, compact = false }: Props): JSX.Element {
  const { rows, keys } = toRechartsRows(chart.data)
  const fontSize = compact ? 9 : 11
  const showChrome = !compact

  let inner: JSX.Element
  if (chart.type === 'pie') {
    inner = (
      <PieChart>
        <Pie data={rows} dataKey={keys[0]} nameKey="name" outerRadius={compact ? 60 : 80} label={showChrome}>
          {rows.map((_, i) => (
            <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
          ))}
        </Pie>
        {showChrome && <Tooltip />}
        {showChrome && <Legend />}
      </PieChart>
    )
  } else if (chart.type === 'line') {
    inner = (
      <LineChart data={rows}>
        <XAxis dataKey="name" tick={{ fontSize }} />
        <YAxis tick={{ fontSize }} />
        {showChrome && <Tooltip />}
        {showChrome && <Legend />}
        {keys.map((s, i) => (
          <Line key={s} type="monotone" dataKey={s} stroke={CHART_PALETTE[i % CHART_PALETTE.length]} />
        ))}
      </LineChart>
    )
  } else if (chart.type === 'area') {
    inner = (
      <AreaChart data={rows}>
        <XAxis dataKey="name" tick={{ fontSize }} />
        <YAxis tick={{ fontSize }} />
        {showChrome && <Tooltip />}
        {showChrome && <Legend />}
        {keys.map((s, i) => (
          <Area
            key={s}
            type="monotone"
            dataKey={s}
            stackId={chart.stacked ? 'stack' : undefined}
            stroke={CHART_PALETTE[i % CHART_PALETTE.length]}
            fill={CHART_PALETTE[i % CHART_PALETTE.length]}
            fillOpacity={0.35}
          />
        ))}
      </AreaChart>
    )
  } else if (chart.type === 'scatter') {
    // Scatter plots each series as points of (categoryIndex, value); the category
    // labels sit on the x-axis via a tick formatter.
    const cats = chart.data.categories
    inner = (
      <ScatterChart>
        <XAxis
          type="number"
          dataKey="x"
          tick={{ fontSize }}
          domain={[-0.5, Math.max(0, cats.length - 0.5)]}
          tickFormatter={(v: number) => cats[Math.round(v)] ?? ''}
        />
        <YAxis type="number" dataKey="y" tick={{ fontSize }} />
        <ZAxis range={[40, 40]} />
        {showChrome && <Tooltip />}
        {showChrome && <Legend />}
        {keys.map((s, i) => (
          <Scatter
            key={s}
            name={s}
            data={rows.map((r, ri) => ({ x: ri, y: r[s] as number }))}
            fill={CHART_PALETTE[i % CHART_PALETTE.length]}
          />
        ))}
      </ScatterChart>
    )
  } else {
    inner = (
      <BarChart data={rows}>
        <XAxis dataKey="name" tick={{ fontSize }} />
        <YAxis tick={{ fontSize }} />
        {showChrome && <Tooltip />}
        {showChrome && <Legend />}
        {keys.map((s, i) => (
          <Bar key={s} dataKey={s} stackId={chart.stacked ? 'stack' : undefined} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
        ))}
      </BarChart>
    )
  }

  return (
    <div style={{ width: '100%', height }} data-testid="plexi-chart">
      <ResponsiveContainer>{inner}</ResponsiveContainer>
    </div>
  )
}
