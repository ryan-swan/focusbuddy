// Autofill series engine tests. These pin the Excel/Sheets behaviours the fill
// handle, double-click fill, and Ctrl+D/R rely on.

import { describe, it, expect } from 'vitest'
import { extendSeries, canToggleSeries, numericFill } from '@renderer/lib/sheetFill'
import { rewriteFormulaRefs } from '@renderer/lib/sheetFormula'

// Default rewriter for a vertical (down) fill: step shifts the row.
const downRewrite = (v: string, step: number): string => rewriteFormulaRefs(v, step, 0)

describe('extendSeries — numbers', () => {
  it('extrapolates a linear trend from two values', () => {
    expect(extendSeries(['1', '2'], 3, downRewrite)).toEqual(['3', '4', '5'])
  })
  it('handles a non-unit step', () => {
    expect(extendSeries(['2', '4'], 3, downRewrite)).toEqual(['6', '8', '10'])
  })
  it('fits a trend across 3+ values', () => {
    expect(extendSeries(['10', '20', '30'], 2, downRewrite)).toEqual(['40', '50'])
  })
  it('copies a single number (series needs the toggle)', () => {
    expect(extendSeries(['5'], 3, downRewrite)).toEqual(['5', '5', '5'])
  })
})

describe('extendSeries — names and dates', () => {
  it('continues abbreviated months from two seeds', () => {
    expect(extendSeries(['Jan', 'Feb'], 2, downRewrite)).toEqual(['Mar', 'Apr'])
  })
  it('extends a single weekday', () => {
    expect(extendSeries(['Monday'], 2, downRewrite)).toEqual(['Tuesday', 'Wednesday'])
  })
  it('wraps month names around the year', () => {
    expect(extendSeries(['Nov', 'Dec'], 2, downRewrite)).toEqual(['Jan', 'Feb'])
  })
  it('steps ISO dates by the detected interval', () => {
    expect(extendSeries(['2026-01-01', '2026-01-02'], 2, downRewrite)).toEqual(['2026-01-03', '2026-01-04'])
  })
  it('extends a single date by one day', () => {
    expect(extendSeries(['2026-01-31'], 1, downRewrite)).toEqual(['2026-02-01'])
  })
})

describe('extendSeries — text with trailing number', () => {
  it('increments from a single seed', () => {
    expect(extendSeries(['Item 1'], 2, downRewrite)).toEqual(['Item 2', 'Item 3'])
  })
  it('preserves zero padding', () => {
    expect(extendSeries(['Q01'], 2, downRewrite)).toEqual(['Q02', 'Q03'])
  })
})

describe('extendSeries — formulas shift relative references', () => {
  it('drags a formula down, shifting its row', () => {
    expect(extendSeries(['=B1'], 3, downRewrite)).toEqual(['=B2', '=B3', '=B4'])
  })
  it('continues a 2-cell formula pattern', () => {
    expect(extendSeries(['=A1', '=A2'], 2, downRewrite)).toEqual(['=A3', '=A4'])
  })
  it('keeps absolute references pinned', () => {
    expect(extendSeries(['=B1*$F$1'], 2, downRewrite)).toEqual(['=B2*$F$1', '=B3*$F$1'])
  })
})

describe('extendSeries — fallback copy/cycle', () => {
  it('repeats plain text', () => {
    expect(extendSeries(['hello'], 2, downRewrite)).toEqual(['hello', 'hello'])
  })
  it('cycles a non-series block of mixed text', () => {
    expect(extendSeries(['red', 'blue'], 3, downRewrite)).toEqual(['red', 'blue', 'red'])
  })
})

describe('canToggleSeries / numericFill', () => {
  it('offers the toggle for numeric sources', () => {
    expect(canToggleSeries(['5'])).toBe(true)
    expect(canToggleSeries(['a'])).toBe(false)
  })
  it('forces a copy or a series', () => {
    expect(numericFill(['5'], 3, 'copy')).toEqual(['5', '5', '5'])
    expect(numericFill(['5'], 3, 'series')).toEqual(['6', '7', '8'])
  })
})
