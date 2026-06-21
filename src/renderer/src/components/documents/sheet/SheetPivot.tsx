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
      className="rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-3"
      data-testid="sheet-pivot"
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[12px] font-semibold text-stone-700 dark:text-stone-200">
          {spec.title || (result ? `${spec.agg} of ${result.valueFieldLabel}` : 'Pivot')}
        </span>
        <button onClick={onRemove} className="icon-btn" title="Remove pivot">
          <Icon name="close" size={13} />
        </button>
      </div>
      {!result ? (
        <div className="text-[12px] text-stone-400">Could not read the pivot's source range.</div>
      ) : (
        <div className="overflow-auto">
          <table className="text-[11px] border-collapse">
            <thead>
              <tr className="border-b border-stone-200 dark:border-stone-700">
                <th className="text-left px-2 py-1 text-stone-500 font-medium">{result.rowFieldLabel}</th>
                {result.colFieldLabel != null &&
                  result.colKeys.map((ck) => (
                    <th key={ck} className="text-right px-2 py-1 text-stone-500 font-medium">
                      {ck || '(blank)'}
                    </th>
                  ))}
                <th className="text-right px-2 py-1 text-stone-500 font-medium">
                  {result.agg === 'count' ? 'Count' : 'Total'}
                </th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => (
                <tr key={row.key} className="border-b border-stone-100 dark:border-stone-800">
                  <td className="px-2 py-1 text-stone-700 dark:text-stone-200">{row.key || '(blank)'}</td>
                  {result.colFieldLabel != null &&
                    row.cells.map((c, i) => (
                      <td key={i} className="px-2 py-1 text-right text-stone-700 dark:text-stone-200">
                        {fmt(c)}
                      </td>
                    ))}
                  <td className="px-2 py-1 text-right font-medium text-stone-800 dark:text-stone-100">
                    {fmt(row.total)}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-stone-300 dark:border-stone-600">
                <td className="px-2 py-1 font-semibold text-stone-700 dark:text-stone-200">Grand total</td>
                {result.colFieldLabel != null && result.colKeys.map((ck) => <td key={ck} />)}
                <td className="px-2 py-1 text-right font-semibold text-stone-800 dark:text-stone-100">
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
