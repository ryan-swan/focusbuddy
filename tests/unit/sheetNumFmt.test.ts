import { describe, it, expect } from 'vitest'
import { mapNumFmt, toExcelNumFmt } from '../../src/shared/sheetNumFmt'
import type { SheetNumberFormat } from '../../src/shared/types'

// The number-format mapping is what makes a currency / percent / date column
// survive an .xlsx export into real Excel instead of arriving as a bare number.

describe('toExcelNumFmt: model -> Excel code', () => {
  it('encodes currency with the symbol and decimals', () => {
    expect(toExcelNumFmt({ kind: 'currency', decimals: 2, symbol: '$' })).toBe('"$"#,##0.00')
    expect(toExcelNumFmt({ kind: 'currency', decimals: 0, symbol: '£' })).toBe('"£"#,##0')
  })
  it('encodes percent and decimals', () => {
    expect(toExcelNumFmt({ kind: 'percent', decimals: 1 })).toBe('0.0%')
    expect(toExcelNumFmt({ kind: 'percent', decimals: 0 })).toBe('0%')
  })
  it('encodes number with optional thousands', () => {
    expect(toExcelNumFmt({ kind: 'number', decimals: 2, thousands: true })).toBe('#,##0.00')
    expect(toExcelNumFmt({ kind: 'number', decimals: 0 })).toBe('0')
  })
  it('encodes date and skips general/undefined', () => {
    expect(toExcelNumFmt({ kind: 'date', pattern: 'YYYY-MM-DD' })).toBe('yyyy-mm-dd')
    expect(toExcelNumFmt({ kind: 'general' })).toBeUndefined()
    expect(toExcelNumFmt(undefined)).toBeUndefined()
  })
})

describe('round-trip model -> code -> model preserves the kind', () => {
  const cases: SheetNumberFormat[] = [
    { kind: 'percent', decimals: 2 },
    { kind: 'currency', decimals: 2, symbol: '$' },
    { kind: 'date', pattern: 'YYYY-MM-DD' },
    { kind: 'number', decimals: 2, thousands: true }
  ]
  for (const fmt of cases) {
    it(`${fmt.kind} survives the round-trip`, () => {
      const code = toExcelNumFmt(fmt)
      expect(code).toBeTruthy()
      const back = mapNumFmt(code)
      expect(back?.kind).toBe(fmt.kind)
    })
  }
})
