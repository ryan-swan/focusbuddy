import type { SheetNumberFormat } from './types'

// Pure mapping between our spreadsheet number-format model and Excel's number-format
// codes (cell.z), in both directions. Kept dependency-free (no electron) so the
// office-IO layer can import it and it stays unit-testable.

// Excel code → our model, best-effort.
export function mapNumFmt(z: string | undefined): SheetNumberFormat | undefined {
  if (!z || z === 'General') return undefined
  const lc = z.toLowerCase()
  if (lc.includes('%')) return { kind: 'percent', decimals: z.split('.')[1]?.replace(/[^0]/g, '').length ?? 0 }
  if (lc.includes('$') || lc.includes('"$"') || lc.includes('usd')) {
    return { kind: 'currency', decimals: z.includes('.') ? z.split('.')[1].replace(/[^0]/g, '').length : 2, symbol: '$' }
  }
  if (/[ymd]/.test(lc) && !lc.includes('e')) return { kind: 'date', pattern: 'YYYY-MM-DD' }
  if (lc.includes('#,##0') || lc.includes('0.0') || /^0+$/.test(z)) {
    const decimals = z.includes('.') ? z.split('.')[1].replace(/[^0]/g, '').length : 0
    return { kind: 'number', decimals, thousands: z.includes(',') }
  }
  return undefined
}

// Our model → Excel code, so a currency/percent/date column survives export into
// real Excel rather than rendering as a bare number.
export function toExcelNumFmt(f: SheetNumberFormat | undefined): string | undefined {
  if (!f || f.kind === 'general') return undefined
  if (f.kind === 'percent') return f.decimals > 0 ? `0.${'0'.repeat(f.decimals)}%` : '0%'
  if (f.kind === 'currency') {
    const dec = f.decimals > 0 ? `.${'0'.repeat(f.decimals)}` : ''
    return `"${f.symbol}"#,##0${dec}`
  }
  if (f.kind === 'date') return 'yyyy-mm-dd'
  const dec = f.decimals > 0 ? `.${'0'.repeat(f.decimals)}` : ''
  return `${f.thousands ? '#,##0' : '0'}${dec}`
}
