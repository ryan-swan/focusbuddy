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

// A pure, dependency-free static SVG of a chart, used by the export pipelines
// (slides PDF/PPTX, design HTML) where recharts (a React lib) can't run. The
// on-screen editor still renders through recharts; this keeps exports faithful
// instead of a placeholder. No fabrication: an empty chart yields an empty plot.
function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function chartToSvg(chart: ChartCore, width: number, height: number): string {
  const { data, type, stacked } = chart
  const titleH = chart.title ? 22 : 0
  const padL = 40
  const padR = 12
  const padT = 8 + titleH
  const padB = 46 // room for category labels + legend
  const plotW = Math.max(1, width - padL - padR)
  const plotH = Math.max(1, height - padT - padB)
  const x0 = padL
  const y0 = padT
  const cats = data.categories
  const series = data.series
  const color = (i: number): string => CHART_PALETTE[i % CHART_PALETTE.length]

  // Value scale. For stacked bar/area sum each category; otherwise take the max
  // single value. Always include 0 so bars sit on a real baseline.
  let maxV = 0
  if (stacked && (type === 'bar' || type === 'area')) {
    cats.forEach((_, ci) => {
      let sum = 0
      series.forEach((s) => (sum += Math.max(0, s.values[ci] || 0)))
      maxV = Math.max(maxV, sum)
    })
  } else {
    series.forEach((s) => s.values.forEach((v) => (maxV = Math.max(maxV, v || 0))))
  }
  if (maxV <= 0) maxV = 1
  const yFor = (v: number): number => y0 + plotH - (v / maxV) * plotH
  const parts: string[] = []

  // Title.
  if (chart.title) {
    parts.push(
      `<text x="${width / 2}" y="16" font-family="Inter, system-ui, sans-serif" font-size="14" font-weight="600" fill="#1c1917" text-anchor="middle">${escXml(chart.title)}</text>`
    )
  }

  if (type === 'pie') {
    const vals = (series[0]?.values ?? []).map((v) => Math.max(0, v || 0))
    const total = vals.reduce((a, b) => a + b, 0) || 1
    const cx = x0 + plotW / 2
    const cy = y0 + plotH / 2
    const r = Math.max(4, Math.min(plotW, plotH) / 2 - 4)
    let ang = -Math.PI / 2
    vals.forEach((v, i) => {
      const frac = v / total
      const next = ang + frac * Math.PI * 2
      const x1 = cx + r * Math.cos(ang)
      const y1 = cy + r * Math.sin(ang)
      const x2 = cx + r * Math.cos(next)
      const y2 = cy + r * Math.sin(next)
      const large = frac > 0.5 ? 1 : 0
      parts.push(`<path d="M ${cx} ${cy} L ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z" fill="${color(i)}" />`)
      ang = next
    })
  } else {
    // Axes.
    parts.push(`<line x1="${x0}" y1="${y0}" x2="${x0}" y2="${y0 + plotH}" stroke="#d6d3d1" stroke-width="1" />`)
    parts.push(`<line x1="${x0}" y1="${y0 + plotH}" x2="${x0 + plotW}" y2="${y0 + plotH}" stroke="#d6d3d1" stroke-width="1" />`)
    const slot = plotW / Math.max(1, cats.length)

    if (type === 'bar') {
      const groupW = slot * 0.7
      cats.forEach((_, ci) => {
        const gx = x0 + ci * slot + (slot - groupW) / 2
        if (stacked) {
          let accTop = y0 + plotH
          series.forEach((s, si) => {
            const v = Math.max(0, s.values[ci] || 0)
            const h = (v / maxV) * plotH
            parts.push(`<rect x="${gx.toFixed(1)}" y="${(accTop - h).toFixed(1)}" width="${groupW.toFixed(1)}" height="${h.toFixed(1)}" fill="${color(si)}" />`)
            accTop -= h
          })
        } else {
          const bw = groupW / Math.max(1, series.length)
          series.forEach((s, si) => {
            const v = Math.max(0, s.values[ci] || 0)
            const h = (v / maxV) * plotH
            parts.push(`<rect x="${(gx + si * bw).toFixed(1)}" y="${yFor(v).toFixed(1)}" width="${(bw * 0.9).toFixed(1)}" height="${h.toFixed(1)}" fill="${color(si)}" />`)
          })
        }
      })
    } else if (type === 'line' || type === 'area') {
      const px = (ci: number): number => x0 + ci * slot + slot / 2
      series.forEach((s, si) => {
        const pts = cats.map((_, ci) => `${px(ci).toFixed(1)},${yFor(s.values[ci] || 0).toFixed(1)}`)
        if (type === 'area' && pts.length) {
          const area = `${px(0).toFixed(1)},${(y0 + plotH).toFixed(1)} ${pts.join(' ')} ${px(cats.length - 1).toFixed(1)},${(y0 + plotH).toFixed(1)}`
          parts.push(`<polygon points="${area}" fill="${color(si)}" fill-opacity="0.3" />`)
        }
        parts.push(`<polyline points="${pts.join(' ')}" fill="none" stroke="${color(si)}" stroke-width="2" />`)
      })
    } else {
      // scatter
      const px = (ci: number): number => x0 + ci * slot + slot / 2
      series.forEach((s, si) => {
        cats.forEach((_, ci) => {
          parts.push(`<circle cx="${px(ci).toFixed(1)}" cy="${yFor(s.values[ci] || 0).toFixed(1)}" r="3.5" fill="${color(si)}" />`)
        })
      })
    }

    // Category labels.
    cats.forEach((c, ci) => {
      const cxp = x0 + ci * slot + slot / 2
      parts.push(
        `<text x="${cxp.toFixed(1)}" y="${y0 + plotH + 14}" font-family="Inter, system-ui, sans-serif" font-size="10" fill="#78716c" text-anchor="middle">${escXml(String(c).slice(0, 12))}</text>`
      )
    })
  }

  // Legend (series names, or category names for pie).
  const legend = type === 'pie' ? cats : series.map((s, i) => s.name || `Series ${i + 1}`)
  let lx = x0
  const ly = height - 12
  legend.slice(0, 6).forEach((name, i) => {
    parts.push(`<rect x="${lx}" y="${ly - 8}" width="9" height="9" fill="${color(i)}" />`)
    const label = escXml(String(name).slice(0, 14))
    parts.push(`<text x="${lx + 12}" y="${ly}" font-family="Inter, system-ui, sans-serif" font-size="10" fill="#57534e">${label}</text>`)
    lx += 20 + label.length * 6
  })

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#ffffff"/>${parts.join('')}</svg>`
}
