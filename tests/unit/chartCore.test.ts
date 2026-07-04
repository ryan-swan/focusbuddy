import { describe, it, expect } from 'vitest'
import { toRechartsRows, chartToSvg, type ChartData, type ChartCore } from '../../src/shared/chart'
import { buildChartData, parseRange } from '../../src/renderer/src/lib/chartData'
import type { SheetTab } from '../../src/shared/types'

describe('toRechartsRows', () => {
  it('flattens categories + series into row objects keyed by series name', () => {
    const data: ChartData = {
      categories: ['Q1', 'Q2'],
      series: [
        { name: 'EU', values: [10, 20] },
        { name: 'US', values: [5, 15] }
      ]
    }
    const { rows, keys } = toRechartsRows(data)
    expect(keys).toEqual(['EU', 'US'])
    expect(rows).toEqual([
      { name: 'Q1', EU: 10, US: 5 },
      { name: 'Q2', EU: 20, US: 15 }
    ])
  })

  it('substitutes 0 for missing/non-finite values (never fabricates)', () => {
    const { rows } = toRechartsRows({ categories: ['a', 'b'], series: [{ name: 'x', values: [NaN] }] })
    expect(rows[0].x).toBe(0)
    expect(rows[1].x).toBe(0) // no value at index 1
  })

  it('de-duplicates repeated series names so keys stay unique', () => {
    const { keys } = toRechartsRows({
      categories: ['a'],
      series: [
        { name: 'S', values: [1] },
        { name: 'S', values: [2] }
      ]
    })
    expect(keys).toEqual(['S', 'S (2)'])
  })

  it('names an empty series positionally', () => {
    const { keys } = toRechartsRows({ categories: ['a'], series: [{ name: '', values: [1] }] })
    expect(keys).toEqual(['Series 1'])
  })
})

describe('parseRange', () => {
  it('parses an A1:C10 range to zero-based bounds', () => {
    expect(parseRange('A1:C10')).toEqual({ r0: 0, c0: 0, r1: 9, c1: 2 })
  })
  it('normalises reversed ranges', () => {
    expect(parseRange('C10:A1')).toEqual({ r0: 0, c0: 0, r1: 9, c1: 2 })
  })
  it('returns null for garbage', () => {
    expect(parseRange('nope')).toBeNull()
  })
})

describe('chartToSvg (static export renderer)', () => {
  const data: ChartData = {
    categories: ['Q1', 'Q2', 'Q3'],
    series: [
      { name: 'EU', values: [10, 20, 15] },
      { name: 'US', values: [5, 8, 12] }
    ]
  }
  const base = (type: ChartCore['type'], extra: Partial<ChartCore> = {}): ChartCore => ({ type, data, ...extra })

  it('emits a sized SVG with a white background', () => {
    const svg = chartToSvg(base('bar'), 400, 300)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('width="400"')
    expect(svg).toContain('height="300"')
    expect(svg).toContain('fill="#ffffff"')
  })

  it('bar chart draws rects and category + legend labels', () => {
    const svg = chartToSvg(base('bar'), 400, 300)
    expect(svg).toContain('<rect')
    expect(svg).toContain('>Q1<')
    expect(svg).toContain('>EU<')
  })

  it('line chart draws a polyline per series', () => {
    const svg = chartToSvg(base('line'), 400, 300)
    expect((svg.match(/<polyline/g) || []).length).toBe(2)
  })

  it('area chart draws filled polygons', () => {
    const svg = chartToSvg(base('area'), 400, 300)
    expect(svg).toContain('<polygon')
  })

  it('pie chart draws arc paths and renders the title', () => {
    const svg = chartToSvg(base('pie', { title: 'Revenue' }), 400, 300)
    expect(svg).toContain('<path')
    expect(svg).toContain('>Revenue<')
  })

  it('scatter chart draws points', () => {
    const svg = chartToSvg(base('scatter'), 400, 300)
    expect(svg).toContain('<circle')
  })

  it('escapes labels and handles an empty chart without crashing', () => {
    const svg = chartToSvg({ type: 'bar', data: { categories: ['<x>'], series: [] } }, 200, 150)
    expect(svg).toContain('&lt;x&gt;')
    expect(svg.startsWith('<svg')).toBe(true)
  })
})

describe('buildChartData', () => {
  const tab: SheetTab = {
    id: 't',
    name: 'S',
    columns: ['A', 'B', 'C'],
    rows: [
      ['Quarter', 'EU', 'US'],
      ['Q1', '10', '5'],
      ['Q2', '20', '=5*3']
    ]
  }

  it('reads header row as series names and header col as categories, computing formulas', () => {
    const data = buildChartData({ range: 'A1:C3', headerRow: true, headerCol: true }, tab)
    expect(data.series.map((s) => s.name)).toEqual(['EU', 'US'])
    expect(data.categories).toEqual(['Q1', 'Q2'])
    expect(data.series[0].values).toEqual([10, 20])
    expect(data.series[1].values).toEqual([5, 15]) // =5*3 charts its result, not the text
  })

  it('falls back to positional labels with no headers', () => {
    const data = buildChartData({ range: 'B2:B3' }, tab)
    expect(data.series[0].name).toBe('Series 1')
    expect(data.categories).toEqual(['Row 1', 'Row 2'])
    expect(data.series[0].values).toEqual([10, 20])
  })

  it('returns empty data for an unparseable range', () => {
    expect(buildChartData({ range: 'bad' }, tab)).toEqual({ categories: [], series: [] })
  })
})
