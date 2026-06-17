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

import { evaluateFormula } from '@renderer/lib/sheetFormula'

describe('formula engine — operators', () => {
  const g = grid([['5', '10', 'cat']])
  it('comparison operators return TRUE/FALSE', () => {
    expect(displayCell(grid([['=1<2']]), 0, 0)).toBe('TRUE')
    expect(displayCell(grid([['=2<=2']]), 0, 0)).toBe('TRUE')
    expect(displayCell(grid([['=3<>3']]), 0, 0)).toBe('FALSE')
    expect(displayCell(grid([['=5>10']]), 0, 0)).toBe('FALSE')
  })
  it('string concatenation with &', () => {
    expect(displayCell(grid([['=\"a\"&\"b\"&\"c\"']]), 0, 0)).toBe('abc')
  })
  it('power operator', () => {
    expect(displayCell(grid([['=2^10']]), 0, 0)).toBe('1024')
  })
  it('references and string concat together', () => {
    expect(evaluateFormula(g, 'A1&B1')).toBe('510')
  })
})

describe('formula engine — logical functions', () => {
  it('IF chooses branch', () => {
    expect(displayCell(grid([['10', '=IF(A1>5,\"big\",\"small\")']]), 0, 1)).toBe('big')
    expect(displayCell(grid([['2', '=IF(A1>5,\"big\",\"small\")']]), 0, 1)).toBe('small')
  })
  it('AND / OR / NOT', () => {
    expect(evaluateFormula(grid([['']]), 'AND(1=1,2=2)')).toBe(true)
    expect(evaluateFormula(grid([['']]), 'OR(1=2,2=2)')).toBe(true)
    expect(evaluateFormula(grid([['']]), 'NOT(1=1)')).toBe(false)
  })
  it('IFERROR catches a failing expression', () => {
    expect(displayCell(grid([['=IFERROR(SQRT(-1),\"n/a\")']]), 0, 0)).toBe('n/a')
    expect(displayCell(grid([['=IFERROR(2+2,\"n/a\")']]), 0, 0)).toBe('4')
  })
})

describe('formula engine — math functions', () => {
  it('ROUND family', () => {
    expect(displayCell(grid([['=ROUND(3.14159,2)']]), 0, 0)).toBe('3.14')
    expect(displayCell(grid([['=ROUNDUP(3.1,0)']]), 0, 0)).toBe('4')
    expect(displayCell(grid([['=ROUNDDOWN(3.9,0)']]), 0, 0)).toBe('3')
  })
  it('ABS, SQRT, POWER, MOD', () => {
    expect(displayCell(grid([['=ABS(-7)']]), 0, 0)).toBe('7')
    expect(displayCell(grid([['=SQRT(81)']]), 0, 0)).toBe('9')
    expect(displayCell(grid([['=POWER(3,3)']]), 0, 0)).toBe('27')
    expect(displayCell(grid([['=MOD(10,3)']]), 0, 0)).toBe('1')
  })
  it('SQRT of a negative shows #ERR (never a fake number)', () => {
    expect(displayCell(grid([['=SQRT(-4)']]), 0, 0)).toBe('#ERR')
  })
})

describe('formula engine — conditional aggregates', () => {
  const g = grid([
    ['apple', '10'],
    ['banana', '20'],
    ['apple', '30'],
    ['=COUNTIF(A1:A3,\"apple\")', '=SUMIF(A1:A3,\"apple\",B1:B3)'],
    ['=SUMIF(B1:B3,\">15\")', '=AVERAGEIF(A1:A3,\"apple\",B1:B3)']
  ])
  it('COUNTIF matches a value', () => expect(displayCell(g, 3, 0)).toBe('2'))
  it('SUMIF sums a parallel range on match', () => expect(displayCell(g, 3, 1)).toBe('40'))
  it('SUMIF with a numeric criterion', () => expect(displayCell(g, 4, 0)).toBe('50'))
  it('AVERAGEIF averages matches', () => expect(displayCell(g, 4, 1)).toBe('20'))
})

describe('formula engine — text functions', () => {
  it('LEN, LEFT, RIGHT, MID', () => {
    expect(displayCell(grid([['=LEN(\"hello\")']]), 0, 0)).toBe('5')
    expect(displayCell(grid([['=LEFT(\"hello\",2)']]), 0, 0)).toBe('he')
    expect(displayCell(grid([['=RIGHT(\"hello\",2)']]), 0, 0)).toBe('lo')
    expect(displayCell(grid([['=MID(\"hello\",2,3)']]), 0, 0)).toBe('ell')
  })
  it('UPPER, LOWER, TRIM, CONCAT', () => {
    expect(displayCell(grid([['=UPPER(\"abc\")']]), 0, 0)).toBe('ABC')
    expect(displayCell(grid([['=LOWER(\"ABC\")']]), 0, 0)).toBe('abc')
    expect(displayCell(grid([['=TRIM(\"  hi  \")']]), 0, 0)).toBe('hi')
    expect(displayCell(grid([['=CONCAT(\"a\",\"-\",\"b\")']]), 0, 0)).toBe('a-b')
  })
})
