import type { SheetPivotSpec, SheetTab } from '@shared/types'
import { displayCell } from '../../../lib/sheetFormula'
import { computePivot } from '../../../lib/sheetPivot'
import Icon from '../../Icon'

// Renders a pivot summary from a spec, resolving its source range against the
// live tab. Values come from displayCell so computed formulas are summarised
// honestly (a number that can't be computed shows #ERR upstream and is skipped).

interface Props {
  spec: SheetPivotSpec
  tab: SheetTab
  onRemove: () => void
}

function fmt(n: number | null): string {
  if (n === null) return ''
  return Number.isInteger(n) ? String(n) : (Math.round(n * 100) / 100).toString()
}

export default function SheetPivot({ spec, tab, onRemove }: Props): JSX.Element {
  const grid = { columns: tab.columns, rows: tab.rows }
  const result = computePivot((r, c) => displayCell(grid, r, c), spec)

  return (
    <div
      className="rounded-lg border border-[var(--edge-soft)] bg-[var(--surface-raised)] p-3"
      data-testid="sheet-pivot"
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[12px] font-semibold text-[var(--ink-70)]">
          {spec.title || (result ? `${spec.agg} of ${result.valueFieldLabel}` : 'Pivot')}
        </span>
        <button onClick={onRemove} className="icon-btn" title="Remove pivot">
          <Icon name="close" size={13} />
        </button>
      </div>
      {!result ? (
        <div className="text-[12px] text-[var(--ink-40)]">Could not read the pivot's source range.</div>
      ) : (
        <div className="overflow-auto">
          <table className="text-[11px] border-collapse">
            <thead>
              <tr className="border-b border-[var(--edge-soft)]">
                <th className="text-left px-2 py-1 text-[var(--ink-50)] font-medium">{result.rowFieldLabel}</th>
                {result.colFieldLabel != null &&
                  result.colKeys.map((ck) => (
                    <th key={ck} className="text-right px-2 py-1 text-[var(--ink-50)] font-medium">
                      {ck || '(blank)'}
                    </th>
                  ))}
                <th className="text-right px-2 py-1 text-[var(--ink-50)] font-medium">
                  {result.agg === 'count' ? 'Count' : 'Total'}
                </th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => (
                <tr key={row.key} className="border-b border-[var(--edge-soft)]">
                  <td className="px-2 py-1 text-[var(--ink-70)]">{row.key || '(blank)'}</td>
                  {result.colFieldLabel != null &&
                    row.cells.map((c, i) => (
                      <td key={i} className="px-2 py-1 text-right text-[var(--ink-70)]">
                        {fmt(c)}
                      </td>
                    ))}
                  <td className="px-2 py-1 text-right font-medium text-[var(--ink-90)]">
                    {fmt(row.total)}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-[var(--edge-firm)]">
                <td className="px-2 py-1 font-semibold text-[var(--ink-70)]">Grand total</td>
                {result.colFieldLabel != null && result.colKeys.map((ck) => <td key={ck} />)}
                <td className="px-2 py-1 text-right font-semibold text-[var(--ink-90)]">
                  {fmt(result.grandTotal)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
