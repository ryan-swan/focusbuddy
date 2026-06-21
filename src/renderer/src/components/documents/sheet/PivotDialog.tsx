import { useState } from 'react'
import type { SheetPivotSpec, SheetPivotAgg } from '@shared/types'
import Icon from '../../Icon'

// Configure a pivot over the selected range: which column groups the rows, an
// optional column to spread across, the value column, and the aggregate. Field
// indices are relative to the range's first column.

const AGGS: SheetPivotAgg[] = ['sum', 'count', 'avg', 'min', 'max']

let seq = 0

export default function PivotDialog({
  range,
  columns,
  onCreate,
  onClose
}: {
  range: string
  columns: Array<{ rel: number; label: string }>
  onCreate: (spec: SheetPivotSpec) => void
  onClose: () => void
}): JSX.Element {
  const [rowField, setRowField] = useState(columns[0]?.rel ?? 0)
  const [colField, setColField] = useState<number | -1>(-1)
  const [valueField, setValueField] = useState(columns[columns.length - 1]?.rel ?? 0)
  const [agg, setAgg] = useState<SheetPivotAgg>('sum')

  function create(): void {
    seq += 1
    onCreate({
      id: `pv-${Date.now().toString(36)}-${seq}`,
      range,
      rowField,
      ...(colField >= 0 ? { colField } : {}),
      valueField,
      agg
    })
    onClose()
  }

  const Picker = ({
    label,
    value,
    onChange,
    allowNone
  }: {
    label: string
    value: number
    onChange: (v: number) => void
    allowNone?: boolean
  }): JSX.Element => (
    <label className="flex items-center gap-2 text-[12px]">
      <span className="w-20 text-stone-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 bg-stone-50 dark:bg-stone-900 border border-stone-300 dark:border-stone-600 rounded px-2 py-1.5"
      >
        {allowNone && <option value={-1}>(none)</option>}
        {columns.map((c) => (
          <option key={c.rel} value={c.rel}>
            {c.label}
          </option>
        ))}
      </select>
    </label>
  )

  return (
    <div className="absolute inset-0 z-40 bg-black/30 flex items-center justify-center" onMouseDown={onClose}>
      <div
        data-testid="sheet-pivot-dialog"
        className="w-[420px] max-w-[92%] rounded-lg bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 shadow-xl p-4 space-y-2.5"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 text-[13px] font-semibold">
          <Icon name="pivot_table_chart" size={15} className="text-accent" />
          Pivot table
          <button onClick={onClose} className="ml-auto icon-btn" aria-label="Close">
            <Icon name="close" size={14} />
          </button>
        </div>
        <p className="text-[11px] text-stone-500">
          Summarising <span className="font-mono text-stone-700 dark:text-stone-300">{range}</span> (first row is headers).
        </p>
        <Picker label="Rows" value={rowField} onChange={setRowField} />
        <Picker label="Columns" value={colField} onChange={setColField} allowNone />
        <Picker label="Values" value={valueField} onChange={setValueField} />
        <label className="flex items-center gap-2 text-[12px]">
          <span className="w-20 text-stone-500">Summarise</span>
          <select
            value={agg}
            onChange={(e) => setAgg(e.target.value as SheetPivotAgg)}
            data-testid="pivot-agg"
            className="flex-1 bg-stone-50 dark:bg-stone-900 border border-stone-300 dark:border-stone-600 rounded px-2 py-1.5"
          >
            {AGGS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <button onClick={create} data-testid="pivot-create" className="btn-primary w-full text-[12px] py-1.5">
          Create pivot
        </button>
      </div>
    </div>
  )
}
