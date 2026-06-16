import { describe, it, expect } from 'vitest'
import { displayCell, type Grid } from '@renderer/lib/sheetFormula'

// The sheet's formula engine must compute real values, not plausible ones. A
// wrong total is worse than a visible #ERR, so these tests pin the arithmetic,
// the references, the ranges, the aggregate functions, and the failure modes.

function grid(rows: string[][], columns = rows[0]?.map((_, i) => String(i)) ?? []): Grid {
  return { columns, rows }
}

describe('displayCell — plain values', () => {
  it('returns raw text untouched when there is no formula', () => {
    const g = grid([['hello', '42', '']])
    expect(displayCell(g, 0, 0)).toBe('hello')
    expect(displayCell(g, 0, 1)).toBe('42')
    expect(displayCell(g, 0, 2)).toBe('')
  })
})

describe('displayCell — arithmetic and references', () => {
  it('evaluates a bare arithmetic formula', () => {
    const g = grid([['=2+3*4']])
    expect(displayCell(g, 0, 0)).toBe('14')
  })

  it('respects parentheses and unary minus', () => {
    const g = grid([['=-(2+3)*2']])
    expect(displayCell(g, 0, 0)).toBe('-10')
  })

  it('resolves a single cell reference', () => {
    // A1=10, B1==A1*2 -> 20
    const g = grid([['10', '=A1*2']])
    expect(displayCell(g, 0, 1)).toBe('20')
  })

  it('treats empty or text cells as 0 in arithmetic', () => {
    const g = grid([['', 'cat', '=A1+B1+5']])
    expect(displayCell(g, 0, 2)).toBe('5')
  })
})

describe('displayCell — ranges and functions', () => {
  const g = grid([
    ['10'],
    ['20'],
    ['30'],
    ['=SUM(A1:A3)'],
    ['=AVERAGE(A1:A3)'],
    ['=MAX(A1:A3)'],
    ['=MIN(A1:A3)'],
    ['=COUNT(A1:A3)']
  ])
  it('SUM over a range', () => expect(displayCell(g, 3, 0)).toBe('60'))
  it('AVERAGE over a range', () => expect(displayCell(g, 4, 0)).toBe('20'))
  it('MAX over a range', () => expect(displayCell(g, 5, 0)).toBe('30'))
  it('MIN over a range', () => expect(displayCell(g, 6, 0)).toBe('10'))
  it('COUNT counts only numeric cells', () => expect(displayCell(g, 7, 0)).toBe('3'))

  it('COUNT ignores text cells', () => {
    const g2 = grid([['1'], ['x'], ['3'], ['=COUNT(A1:A3)']])
    expect(displayCell(g2, 3, 0)).toBe('2')
  })

  it('nested formula references compute transitively', () => {
    // A1=5, A2==A1+5 (10), A3==SUM(A1:A2) (15)
    const g3 = grid([['5'], ['=A1+5'], ['=SUM(A1:A2)']])
    expect(displayCell(g3, 2, 0)).toBe('15')
  })
})

describe('displayCell — failure modes show #ERR, never a fake number', () => {
  it('flags a direct self-reference cycle', () => {
    const g = grid([['=A1+1']])
    expect(displayCell(g, 0, 0)).toBe('#ERR')
  })

  it('flags a mutual reference cycle', () => {
    // A1==B1, B1==A1
    const g = grid([['=B1', '=A1']])
    expect(displayCell(g, 0, 0)).toBe('#ERR')
  })

  it('flags an unknown function', () => {
    const g = grid([['=BOGUS(1,2)']])
    expect(displayCell(g, 0, 0)).toBe('#ERR')
  })

  it('flags a malformed formula', () => {
    const g = grid([['=2+']])
    expect(displayCell(g, 0, 0)).toBe('#ERR')
  })
})
