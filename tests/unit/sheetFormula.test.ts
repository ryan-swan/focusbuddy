import { describe, it, expect } from 'vitest'
import { displayCell, buildSpillMap, makeNames, rewriteFormulaRefs, remapFormulaRefs, type Grid } from '@renderer/lib/sheetFormula'

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

describe('rewriteFormulaRefs — relative/absolute reference shifting (autofill)', () => {
  it('shifts a relative ref down by the row delta', () => {
    expect(rewriteFormulaRefs('=B1', 1, 0)).toBe('=B2')
    expect(rewriteFormulaRefs('=B1', 3, 0)).toBe('=B4')
  })
  it('shifts a relative ref right by the column delta', () => {
    expect(rewriteFormulaRefs('=A1', 0, 1)).toBe('=B1')
  })
  it('keeps absolute parts pinned', () => {
    expect(rewriteFormulaRefs('=B1*$F$1', 2, 0)).toBe('=B3*$F$1')
    expect(rewriteFormulaRefs('=$A1', 1, 1)).toBe('=$A2') // col pinned, row shifts
    expect(rewriteFormulaRefs('=A$1', 1, 1)).toBe('=B$1') // row pinned, col shifts
  })
  it('shifts both endpoints of a range', () => {
    expect(rewriteFormulaRefs('=SUM(A1:A3)', 1, 0)).toBe('=SUM(A2:A4)')
  })
  it('clamps at the top-left edge instead of going negative', () => {
    expect(rewriteFormulaRefs('=A1', -5, -5)).toBe('=A1')
  })
  it('round-trips a complex formula through parse/serialize', () => {
    const out = rewriteFormulaRefs('=IF(A1>B1, A1*2, (A1+B1)/2)', 1, 0)
    expect(out).toBe('=IF(A2>B2, A2*2, (A2+B2)/2)')
    // and it still evaluates
    const g = grid([['1', '2'], ['10', '4']])
    expect(evaluateFormula(g, out.slice(1))).toBe(20)
  })
  it('leaves an unparseable formula unchanged', () => {
    expect(rewriteFormulaRefs('=SUM(', 1, 0)).toBe('=SUM(')
  })
  it('preserves precedence without over-parenthesizing', () => {
    expect(rewriteFormulaRefs('=A1+B1*C1', 1, 0)).toBe('=A2+B2*C2')
  })
})

// ── Extended function library (Round 4 parity): lookups, multi-criteria, stats,
//    text, math, date. Pinned because a wrong lookup is worse than a visible #ERR.

describe('formula engine — lookup functions', () => {
  // A small table: name, dept, salary
  const g = grid([
    ['Alice', 'Eng', '100'],
    ['Bob', 'Sales', '90'],
    ['Cara', 'Eng', '120']
  ])
  it('VLOOKUP exact match returns the requested column', () => {
    expect(evaluateFormula(g, 'VLOOKUP("Bob", A1:C3, 3, FALSE)')).toBe(90)
    expect(evaluateFormula(g, 'VLOOKUP("Cara", A1:C3, 2, FALSE)')).toBe('Eng')
  })
  it('VLOOKUP not found is #ERR (never a fake value)', () => {
    expect(() => evaluateFormula(g, 'VLOOKUP("Zed", A1:C3, 2, FALSE)')).toThrow()
  })
  it('HLOOKUP looks across a row', () => {
    const h = grid([['Q1', 'Q2', 'Q3'], ['10', '20', '30']])
    expect(evaluateFormula(h, 'HLOOKUP("Q2", A1:C2, 2, FALSE)')).toBe(20)
  })
  it('INDEX + MATCH compose', () => {
    expect(evaluateFormula(g, 'MATCH("Cara", A1:A3, 0)')).toBe(3)
    expect(evaluateFormula(g, 'INDEX(C1:C3, 3)')).toBe(120)
    expect(evaluateFormula(g, 'INDEX(A1:C3, 2, 2)')).toBe('Sales')
  })
})

describe('formula engine — multi-criteria + stats', () => {
  const g = grid([
    ['Eng', '100'],
    ['Sales', '90'],
    ['Eng', '120'],
    ['Sales', '80']
  ])
  it('SUMIFS / COUNTIFS / AVERAGEIFS', () => {
    expect(evaluateFormula(g, 'SUMIFS(B1:B4, A1:A4, "Eng")')).toBe(220)
    expect(evaluateFormula(g, 'COUNTIFS(A1:A4, "Sales")')).toBe(2)
    expect(evaluateFormula(g, 'AVERAGEIFS(B1:B4, A1:A4, "Sales")')).toBe(85)
  })
  it('SUMPRODUCT multiplies pairwise then sums', () => {
    const h = grid([['2', '3'], ['4', '5']])
    expect(evaluateFormula(h, 'SUMPRODUCT(A1:A2, B1:B2)')).toBe(2 * 3 + 4 * 5)
  })
  it('MEDIAN / STDEV / COUNTBLANK', () => {
    const h = grid([['1'], ['2'], ['3'], ['']])
    expect(evaluateFormula(h, 'MEDIAN(A1:A3)')).toBe(2)
    expect(evaluateFormula(h, 'COUNTBLANK(A1:A4)')).toBe(1)
    expect(Number(evaluateFormula(h, 'STDEV(A1:A3)')).toFixed(4)).toBe('1.0000')
  })
})

describe('formula engine — text + math + date', () => {
  it('text functions', () => {
    const g = grid([['hello world']])
    expect(evaluateFormula(g, 'FIND("world", A1)')).toBe(7)
    expect(evaluateFormula(g, 'SEARCH("WORLD", A1)')).toBe(7)
    expect(evaluateFormula(g, 'SUBSTITUTE(A1, "o", "0")')).toBe('hell0 w0rld')
    expect(evaluateFormula(g, 'SUBSTITUTE(A1, "o", "0", 2)')).toBe('hello w0rld')
    expect(evaluateFormula(g, 'REPLACE(A1, 1, 5, "HELLO")')).toBe('HELLO world')
    expect(evaluateFormula(g, 'PROPER(A1)')).toBe('Hello World')
    expect(evaluateFormula(g, 'TEXTJOIN("-", TRUE, "a", "", "b")')).toBe('a-b')
  })
  it('math extras', () => {
    const g = grid([['']])
    expect(evaluateFormula(g, 'INT(3.9)')).toBe(3)
    expect(evaluateFormula(g, 'TRUNC(3.567, 1)')).toBe(3.5)
    expect(evaluateFormula(g, 'CEILING(7, 5)')).toBe(10)
    expect(evaluateFormula(g, 'FLOOR(7, 5)')).toBe(5)
    expect(evaluateFormula(g, 'SIGN(-4)')).toBe(-1)
  })
  it('date functions parse an ISO date deterministically', () => {
    const g = grid([['2024-03-15']])
    expect(evaluateFormula(g, 'YEAR(A1)')).toBe(2024)
    expect(evaluateFormula(g, 'MONTH(A1)')).toBe(3)
    expect(evaluateFormula(g, 'DAY(A1)')).toBe(15)
  })
})

// ── Cross-sheet references (Sheet2!A1) ────────────────────────────────────────

import { makeWorkbook } from '@renderer/lib/sheetFormula'

describe('formula engine — cross-sheet references', () => {
  const main = grid([['5']])
  const wb = makeWorkbook([
    { name: 'Data', columns: ['A', 'B'], rows: [['x', '10'], ['y', '20'], ['z', '30']] },
    { name: 'My Tab', columns: ['A'], rows: [['7']] }
  ])

  it('resolves a single cross-sheet cell ref', () => {
    expect(evaluateFormula(main, 'Data!B1', '__seed__', wb)).toBe(10)
  })
  it('aggregates a cross-sheet range', () => {
    expect(evaluateFormula(main, 'SUM(Data!B1:B3)', '__seed__', wb)).toBe(60)
  })
  it('mixes a local ref with a cross-sheet ref', () => {
    expect(evaluateFormula(main, 'A1 + Data!B1', '__seed__', wb)).toBe(15)
  })
  it('VLOOKUP against another sheet', () => {
    expect(evaluateFormula(main, 'VLOOKUP("y", Data!A1:B3, 2, FALSE)', '__seed__', wb)).toBe(20)
  })
  it('quoted sheet names with spaces', () => {
    expect(evaluateFormula(main, "'My Tab'!A1", '__seed__', wb)).toBe(7)
  })
  it('an unknown sheet evaluates as empty (0 in arithmetic), never a fake value', () => {
    // Unresolved sheet falls back to the current grid; out-of-range reads as ''.
    expect(evaluateFormula(main, 'Ghost!Z99 + 0', '__seed__', wb)).toBe(0)
  })
})

describe('rewriteFormulaRefs — cross-sheet round-trips', () => {
  it('shifts the cell but preserves the sheet qualifier', () => {
    expect(rewriteFormulaRefs('=Data!B1*2', 1, 0)).toBe('=Data!B2*2')
  })
  it('preserves a quoted sheet name', () => {
    expect(rewriteFormulaRefs("='My Tab'!A1", 2, 0)).toBe("='My Tab'!A3")
  })
  it('shifts a cross-sheet range', () => {
    expect(rewriteFormulaRefs('=SUM(Data!A1:A3)', 1, 0)).toBe('=SUM(Data!A2:A4)')
  })
})

describe('displayCell — modern lookup, logical, regex, stats and dates', () => {
  const lk = grid([
    ['x', '1', '=XLOOKUP("y",A1:A3,B1:B3)'],
    ['y', '2', '=XLOOKUP("q",A1:A3,B1:B3,"none")'],
    ['z', '3', '=XMATCH("z",A1:A3)']
  ])
  it('XLOOKUP exact match', () => expect(displayCell(lk, 0, 2)).toBe('2'))
  it('XLOOKUP fallback when missing', () => expect(displayCell(lk, 1, 2)).toBe('none'))
  it('XMATCH returns a 1-based position', () => expect(displayCell(lk, 2, 2)).toBe('3'))

  it('XLOOKUP approximate (next smaller)', () => {
    const g = grid([['10', 'a'], ['20', 'b'], ['30', 'c'], ['=XLOOKUP(25,A1:A3,B1:B3,"x",-1)', '']])
    expect(displayCell(g, 3, 0)).toBe('b')
  })

  it('IFS picks the first true branch', () => {
    expect(displayCell(grid([['=IFS(1>2,"a",3>2,"b")']]), 0, 0)).toBe('b')
  })
  it('SWITCH matches a case and falls back to a default', () => {
    expect(displayCell(grid([['=SWITCH(2,1,"one",2,"two","def")']]), 0, 0)).toBe('two')
    expect(displayCell(grid([['=SWITCH(9,1,"one","def")']]), 0, 0)).toBe('def')
  })
  it('INDIRECT resolves a textual reference', () => {
    expect(displayCell(grid([['10', '=INDIRECT("A1")']]), 0, 1)).toBe('10')
  })

  it('REGEXMATCH / REGEXEXTRACT / REGEXREPLACE', () => {
    expect(displayCell(grid([['=REGEXMATCH("abc123","\\d+")']]), 0, 0)).toBe('TRUE')
    expect(displayCell(grid([['=REGEXEXTRACT("order-42","(\\d+)")']]), 0, 0)).toBe('42')
    expect(displayCell(grid([['=REGEXREPLACE("a1b2","\\d","#")']]), 0, 0)).toBe('a#b#')
  })

  it('LARGE / SMALL / COUNTUNIQUE / SUMSQ', () => {
    const g = grid([['10'], ['20'], ['30'], ['=LARGE(A1:A3,1)'], ['=SMALL(A1:A3,1)'], ['=LARGE(A1:A3,2)']])
    expect(displayCell(g, 3, 0)).toBe('30')
    expect(displayCell(g, 4, 0)).toBe('10')
    expect(displayCell(g, 5, 0)).toBe('20')
    const u = grid([['a'], ['a'], ['b'], ['=COUNTUNIQUE(A1:A3)'], ['=SUMSQ(1,2,3)']])
    expect(displayCell(u, 3, 0)).toBe('2')
    expect(displayCell(u, 4, 0)).toBe('14')
  })

  it('SIGN / EXP / LN / LOG / LOG10', () => {
    expect(displayCell(grid([['=SIGN(-5)']]), 0, 0)).toBe('-1')
    expect(displayCell(grid([['=EXP(0)']]), 0, 0)).toBe('1')
    expect(displayCell(grid([['=LN(1)']]), 0, 0)).toBe('0')
    expect(displayCell(grid([['=LOG(100)']]), 0, 0)).toBe('2')
    expect(displayCell(grid([['=LOG(8,2)']]), 0, 0)).toBe('3')
    expect(displayCell(grid([['=LOG10(1000)']]), 0, 0)).toBe('3')
  })

  it('CHAR / CODE / CLEAN', () => {
    expect(displayCell(grid([['=CHAR(65)']]), 0, 0)).toBe('A')
    expect(displayCell(grid([['=CODE("A")']]), 0, 0)).toBe('65')
    const g = grid([['a' + String.fromCharCode(7) + 'b', '=CLEAN(A1)']])
    expect(displayCell(g, 0, 1)).toBe('ab')
  })

  it('DATE / DAYS / EDATE / EOMONTH / DATEDIF', () => {
    expect(displayCell(grid([['=DATE(2026,6,21)']]), 0, 0)).toBe('2026-06-21')
    expect(displayCell(grid([['=DAYS("2026-06-21","2026-06-20")']]), 0, 0)).toBe('1')
    expect(displayCell(grid([['=EDATE("2026-01-15",2)']]), 0, 0)).toBe('2026-03-15')
    expect(displayCell(grid([['=EOMONTH("2026-02-10",0)']]), 0, 0)).toBe('2026-02-28')
    expect(displayCell(grid([['=DATEDIF("2026-01-01","2026-03-01","M")']]), 0, 0)).toBe('2')
    expect(displayCell(grid([['=DATEDIF("2026-01-01","2026-01-11","D")']]), 0, 0)).toBe('10')
  })
})

describe('array formulas — spill map', () => {
  it('SEQUENCE spills a column of numbers from the anchor', () => {
    const g = grid([['=SEQUENCE(3,1)']])
    const m = buildSpillMap(g)
    expect(m.get('0,0')).toBe('1')
    expect(m.get('1,0')).toBe('2')
    expect(m.get('2,0')).toBe('3')
  })

  it('UNIQUE spills distinct rows', () => {
    const g = grid([
      ['a', '', '=UNIQUE(A1:A3)'],
      ['a', '', ''],
      ['b', '', '']
    ])
    const m = buildSpillMap(g)
    expect(m.get('0,2')).toBe('a')
    expect(m.get('1,2')).toBe('b')
    expect(m.has('2,2')).toBe(false)
  })

  it('SORT orders the values', () => {
    const g = grid([
      ['3', '', '=SORT(A1:A3)'],
      ['1', '', ''],
      ['2', '', '']
    ])
    const m = buildSpillMap(g)
    expect(m.get('0,2')).toBe('1')
    expect(m.get('1,2')).toBe('2')
    expect(m.get('2,2')).toBe('3')
  })

  it('FILTER keeps rows where the condition column is truthy', () => {
    const g = grid([
      ['x', '1', '=FILTER(A1:A3,B1:B3)'],
      ['y', '0', ''],
      ['z', '1', '']
    ])
    const m = buildSpillMap(g)
    expect(m.get('0,2')).toBe('x')
    expect(m.get('1,2')).toBe('z')
    expect(m.has('2,2')).toBe(false)
  })

  it('TRANSPOSE flips a row into a column', () => {
    const g = grid([
      ['p', 'q', '=TRANSPOSE(A1:B1)'],
      ['', '', '']
    ])
    const m = buildSpillMap(g)
    expect(m.get('0,2')).toBe('p')
    expect(m.get('1,2')).toBe('q')
  })

  it('a blocked spill reports #SPILL! and writes no targets', () => {
    const g = grid([['=SEQUENCE(3,1)'], ['blocker'], ['']])
    const m = buildSpillMap(g)
    expect(m.get('0,0')).toBe('#SPILL!')
    expect(m.has('1,0')).toBe(false)
  })

  it('displayCell renders spilled values from the map', () => {
    const g = grid([['=SEQUENCE(3,1)']])
    const m = buildSpillMap(g)
    expect(displayCell(g, 0, 0, undefined, m)).toBe('1')
    expect(displayCell(g, 1, 0, undefined, m)).toBe('2')
    expect(displayCell(g, 2, 0, undefined, m)).toBe('3')
  })
})

describe('named ranges', () => {
  const names = makeNames([
    { name: 'Tax', ref: 'A1' },
    { name: 'Data', ref: 'A1:A3' }
  ])
  const g = grid([['10'], ['20'], ['30']])

  it('resolves a single-cell name in a scalar formula', () => {
    expect(evaluateFormula(g, 'Tax*2', '__seed__', undefined, names)).toBe(20)
  })
  it('resolves a range name as a function argument', () => {
    expect(evaluateFormula(g, 'SUM(Data)', '__seed__', undefined, names)).toBe(60)
  })
  it('matches names case-insensitively', () => {
    expect(evaluateFormula(g, 'tax+5', '__seed__', undefined, names)).toBe(15)
  })
  it('a cell reference is never shadowed by a name', () => {
    const shadow = makeNames([{ name: 'A1', ref: 'A3' }])
    expect(evaluateFormula(g, 'A1', '__seed__', undefined, shadow)).toBe(10)
  })
  it('an undefined name (no names map) is an error', () => {
    expect(() => evaluateFormula(g, 'Tax*2')).toThrow()
  })
})

import { sparklineForCell } from '@renderer/lib/sheetFormula'

describe('SPARKLINE — in-cell mini chart', () => {
  it('reads the real referenced values for a line by default', () => {
    const g = grid([['1', '5', '3', '8', '2', '=SPARKLINE(A1:E1)']])
    const sp = sparklineForCell(g, 0, 5)
    expect(sp).not.toBeNull()
    expect(sp?.type).toBe('line')
    expect(sp?.values).toEqual([1, 5, 3, 8, 2])
  })

  it('honours the bar variant option', () => {
    const g = grid([['4', '9', '=SPARKLINE(A1:B1,"bar")']])
    const sp = sparklineForCell(g, 0, 2)
    expect(sp?.type).toBe('bar')
    expect(sp?.values).toEqual([4, 9])
  })

  it('skips non-numeric cells rather than inventing values', () => {
    const g = grid([['10', 'oops', '20', '=SPARKLINE(A1:C1)']])
    const sp = sparklineForCell(g, 0, 3)
    expect(sp?.values).toEqual([10, 20])
  })

  it('an empty range yields no values (faint placeholder, never fake data)', () => {
    const g = grid([['', '', '=SPARKLINE(A1:B1)']])
    const sp = sparklineForCell(g, 0, 2)
    expect(sp?.values).toEqual([])
  })

  it('a non-SPARKLINE cell is not treated as a sparkline', () => {
    const g = grid([['1', '2', '=SUM(A1:B1)']])
    expect(sparklineForCell(g, 0, 2)).toBeNull()
    expect(sparklineForCell(g, 0, 0)).toBeNull()
  })

  it('displayCell renders a SPARKLINE cell as its joined values, not #ERR', () => {
    const g = grid([['3', '6', '9', '=SPARKLINE(A1:C1)']])
    expect(displayCell(g, 0, 3)).toBe('3 6 9')
  })
})

describe('remapFormulaRefs — structural edits (insert / delete / move)', () => {
  // Insert a row at index `at`: every ref at or below `at` shifts down one.
  const insRow = (at: number) => (f: string) =>
    remapFormulaRefs(f, (r) => (r >= at ? r + 1 : r), (c) => c)
  // Delete a row at index `at`: the deleted line -> #REF!, lines below shift up.
  const delRow = (at: number) => (f: string) =>
    remapFormulaRefs(f, (r) => (r === at ? null : r > at ? r - 1 : r), (c) => c)
  const insCol = (at: number) => (f: string) =>
    remapFormulaRefs(f, (r) => r, (c) => (c >= at ? c + 1 : c))
  const delCol = (at: number) => (f: string) =>
    remapFormulaRefs(f, (r) => r, (c) => (c === at ? null : c > at ? c - 1 : c))

  it('insert row above a reference shifts it down', () => {
    expect(insRow(0)('=A3')).toBe('=A4') // A3 is row index 2 -> 3
    expect(insRow(2)('=A2')).toBe('=A2') // ref above the insert is untouched
  })
  it('insert row rewrites both ends of a range that straddles it', () => {
    expect(insRow(1)('=SUM(A1:A3)')).toBe('=SUM(A1:A4)')
  })
  it('insert column shifts columns at/after the index', () => {
    expect(insCol(0)('=B1')).toBe('=C1')
    expect(insCol(2)('=A1')).toBe('=A1')
  })
  it('absolute references also move on a structural edit', () => {
    expect(insRow(0)('=$A$3')).toBe('=$A$4')
    expect(insCol(0)('=$B$1')).toBe('=$C$1')
  })
  it('delete row shifts later refs up and untouched refs stay', () => {
    expect(delRow(0)('=A3')).toBe('=A2')
    expect(delRow(3)('=A2')).toBe('=A2')
  })
  it('deleting a referenced cell yields #REF!, never a silent repoint', () => {
    expect(delRow(2)('=A3')).toBe('=#REF!') // A3 is the deleted row
    expect(delCol(1)('=B1')).toBe('=#REF!') // column B deleted
  })
  it('deleting one edge of a range shrinks it rather than breaking the whole range', () => {
    // Delete row index 0 (A1); the A1:A3 range collapses toward the survivor.
    expect(delRow(0)('=SUM(A1:A3)')).toBe('=SUM(A1:A2)')
  })
  it('leaves cross-sheet references untouched (they point at another tab)', () => {
    expect(insRow(0)('=Data!A1+A1')).toBe('=Data!A1+A2')
  })
  it('a move permutation repoints a reference to its new home', () => {
    // Move row 0 to position 2 (0-based final): old->new = {0:2, 1:0, 2:1}
    const order = [1, 2, 0] // order[newPos] = oldIndex
    const oldToNew: number[] = []
    order.forEach((oldIdx, newPos) => (oldToNew[oldIdx] = newPos))
    const moved = (f: string) => remapFormulaRefs(f, (r) => oldToNew[r] ?? r, (c) => c)
    expect(moved('=A1')).toBe('=A3') // row 0 -> row 2
    expect(moved('=A2')).toBe('=A1') // row 1 -> row 0
  })
  it('returns unparseable input unchanged', () => {
    expect(insRow(0)('=SUM(')).toBe('=SUM(')
    expect(insRow(0)('plain text')).toBe('plain text')
  })
})
