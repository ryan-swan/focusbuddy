import { useState } from 'react'
import type { SheetBody } from '@shared/types'
import { displayCell } from '../../lib/sheetFormula'
import Icon from '../Icon'

// Sheet editor — an editable grid with real formula evaluation. A cell that
// starts with "=" is computed live (SUM, AVERAGE, MIN, MAX, COUNT, PRODUCT,
// cell refs, ranges, arithmetic); everything else is plain text. The formula
// bar shows the focused cell's true contents, and a bad formula shows #ERR
// rather than a made-up number.

interface Props {
  body: SheetBody
  onChange: (body: SheetBody) => void
}

function colLabel(n: number): string {
  let s = ''
  n += 1
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

export default function SheetEditor({ body, onChange }: Props): JSX.Element {
  const [focused, setFocused] = useState<{ r: number; c: number } | null>(null)
  const grid = body

  function setCell(r: number, c: number, value: string): void {
    const rows = grid.rows.map((row, ri) =>
      ri === r ? row.map((cell, ci) => (ci === c ? value : cell)) : row
    )
    onChange({ ...grid, rows })
  }

  function setColumnName(c: number, name: string): void {
    const columns = grid.columns.map((col, ci) => (ci === c ? name : col))
    onChange({ ...grid, columns })
  }

  function addRow(): void {
    onChange({ ...grid, rows: [...grid.rows, new Array(grid.columns.length).fill('')] })
  }

  function addColumn(): void {
    const columns = [...grid.columns, colLabel(grid.columns.length)]
    const rows = grid.rows.map((row) => [...row, ''])
    onChange({ columns, rows })
  }

  function deleteRow(r: number): void {
    if (grid.rows.length <= 1) return
    onChange({ ...grid, rows: grid.rows.filter((_, ri) => ri !== r) })
  }

  function deleteColumn(c: number): void {
    if (grid.columns.length <= 1) return
    onChange({
      columns: grid.columns.filter((_, ci) => ci !== c),
      rows: grid.rows.map((row) => row.filter((_, ci) => ci !== c))
    })
  }

  const focusedRaw = focused ? grid.rows[focused.r]?.[focused.c] ?? '' : ''

  return (
    <div className="px-6 py-4">
      {/* Formula bar */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[11px] font-mono text-stone-400 w-10 text-center shrink-0">
          {focused ? `${colLabel(focused.c)}${focused.r + 1}` : '—'}
        </span>
        <input
          value={focusedRaw}
          onChange={(e) => focused && setCell(focused.r, focused.c, e.target.value)}
          placeholder="Select a cell. Start with = for a formula, e.g. =SUM(B2:B9)"
          className="flex-1 bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600 rounded-lg px-3 py-1.5 text-[13px] font-mono focus:outline-none focus:border-accent"
        />
      </div>

      <div className="overflow-auto border border-stone-200 dark:border-stone-700 rounded-lg">
        <table className="border-collapse text-[13px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-stone-100 dark:bg-stone-800 w-10 border-b border-r border-stone-200 dark:border-stone-700" />
              {grid.columns.map((col, c) => (
                <th
                  key={c}
                  className="group min-w-[120px] border-b border-r border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/60 px-1"
                >
                  <div className="flex items-center">
                    <input
                      value={col}
                      onChange={(e) => setColumnName(c, e.target.value)}
                      className="w-full bg-transparent px-1.5 py-1.5 text-[12px] font-semibold text-stone-700 dark:text-stone-200 focus:outline-none"
                    />
                    <button
                      onClick={() => deleteColumn(c)}
                      className="opacity-0 group-hover:opacity-100 text-stone-400 hover:text-red-500 px-0.5"
                      title="Delete column"
                    >
                      <Icon name="close" size={12} />
                    </button>
                  </div>
                </th>
              ))}
              <th className="border-b border-stone-200 dark:border-stone-700 px-1">
                <button onClick={addColumn} className="icon-btn" title="Add column">
                  <Icon name="add" size={14} />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {grid.rows.map((row, r) => (
              <tr key={r} className="group">
                <td className="sticky left-0 z-10 bg-stone-100 dark:bg-stone-800 text-center text-[11px] text-stone-400 border-b border-r border-stone-200 dark:border-stone-700 relative">
                  {r + 1}
                  <button
                    onClick={() => deleteRow(r)}
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 flex items-center justify-center bg-stone-100/90 dark:bg-stone-800/90 text-stone-400 hover:text-red-500"
                    title="Delete row"
                  >
                    <Icon name="close" size={12} />
                  </button>
                </td>
                {grid.columns.map((_, c) => {
                  const isFocused = focused?.r === r && focused?.c === c
                  const raw = row[c] ?? ''
                  const shown = isFocused ? raw : displayCell(grid, r, c)
                  const isFormula = raw.startsWith('=')
                  return (
                    <td key={c} className="border-b border-r border-stone-200 dark:border-stone-700 p-0">
                      <input
                        value={shown}
                        onFocus={() => setFocused({ r, c })}
                        onBlur={() => setFocused(null)}
                        onChange={(e) => setCell(r, c, e.target.value)}
                        className={`w-full px-2 py-1.5 bg-transparent focus:outline-none focus:bg-accent/[0.06] ${
                          isFormula && !isFocused ? 'text-emerald-700 dark:text-emerald-400' : 'text-stone-800 dark:text-stone-100'
                        } ${shown === '#ERR' ? 'text-red-500' : ''}`}
                      />
                    </td>
                  )
                })}
                <td className="border-b border-stone-200 dark:border-stone-700" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        onClick={addRow}
        className="mt-2 text-[12px] text-stone-500 dark:text-stone-400 hover:text-accent inline-flex items-center gap-1"
      >
        <Icon name="add" size={14} /> Add row
      </button>
    </div>
  )
}
