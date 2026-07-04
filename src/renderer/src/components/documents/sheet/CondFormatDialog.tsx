import { useState } from 'react'
import type { SheetCondOp, SheetCondRule } from '@shared/types'
import Icon from '../../Icon'

// Conditional-formatting editor for the active sheet. Lists existing rules and
// adds a new one for the current selection range. Rules paint cells whose
// computed value matches; the underlying value is never changed.

const OPS: { op: SheetCondOp; label: string; needsValue: boolean; needsSecond?: boolean }[] = [
  { op: 'gt', label: 'Greater than', needsValue: true },
  { op: 'lt', label: 'Less than', needsValue: true },
  { op: 'ge', label: 'Greater or equal', needsValue: true },
  { op: 'le', label: 'Less or equal', needsValue: true },
  { op: 'eq', label: 'Equal to', needsValue: true },
  { op: 'ne', label: 'Not equal to', needsValue: true },
  { op: 'between', label: 'Between', needsValue: true, needsSecond: true },
  { op: 'contains', label: 'Text contains', needsValue: true },
  { op: 'notEmpty', label: 'Is not empty', needsValue: false },
  { op: 'empty', label: 'Is empty', needsValue: false }
]

const SWATCHES = ['#fee2e2', '#dcfce7', '#fef9c3', '#dbeafe', '#f3e8ff', '#ffedd5']

interface Props {
  range: string
  rules: SheetCondRule[]
  onAdd: (rule: SheetCondRule) => void
  onRemove: (id: string) => void
  onClose: () => void
}

let seq = 0

export default function CondFormatDialog({ range, rules, onAdd, onRemove, onClose }: Props): JSX.Element {
  const [op, setOp] = useState<SheetCondOp>('gt')
  const [value, setValue] = useState('')
  const [value2, setValue2] = useState('')
  const [bg, setBg] = useState(SWATCHES[0])
  const [bold, setBold] = useState(false)

  const spec = OPS.find((o) => o.op === op)!

  function add(): void {
    seq += 1
    const rule: SheetCondRule = {
      id: `cf-${Date.now().toString(36)}-${seq}`,
      range,
      op,
      ...(spec.needsValue ? { value } : {}),
      ...(spec.needsSecond ? { value2 } : {}),
      bg,
      ...(bold ? { bold: true } : {})
    }
    onAdd(rule)
    setValue('')
    setValue2('')
  }

  return (
    <div className="absolute inset-0 z-40 bg-black/30 flex items-center justify-center" onMouseDown={onClose}>
      <div
        data-testid="sheet-condformat-dialog"
        className="w-[460px] max-w-[92%] rounded-lg bg-[var(--surface-raised)] border border-[var(--edge-soft)] shadow-xl p-4 space-y-3"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 text-[13px] font-semibold">
          <Icon name="palette" size={15} className="text-accent" />
          Conditional formatting
          <button onClick={onClose} className="ml-auto icon-btn" aria-label="Close">
            <Icon name="close" size={14} />
          </button>
        </div>

        <p className="text-[11px] text-[var(--ink-50)]">
          Applies to <span className="font-mono text-[var(--ink-70)]">{range}</span>. Cells whose
          value matches the rule are painted.
        </p>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={op}
            onChange={(e) => setOp(e.target.value as SheetCondOp)}
            data-testid="condformat-op"
            className="text-[12px] bg-[var(--surface-sunken)] border border-[var(--edge-firm)] rounded px-2 py-1.5"
          >
            {OPS.map((o) => (
              <option key={o.op} value={o.op}>
                {o.label}
              </option>
            ))}
          </select>
          {spec.needsValue && (
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="value"
              data-testid="condformat-value"
              className="w-24 text-[12px] bg-[var(--surface-sunken)] border border-[var(--edge-firm)] rounded px-2 py-1.5"
            />
          )}
          {spec.needsSecond && (
            <input
              value={value2}
              onChange={(e) => setValue2(e.target.value)}
              placeholder="and"
              className="w-24 text-[12px] bg-[var(--surface-sunken)] border border-[var(--edge-firm)] rounded px-2 py-1.5"
            />
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[var(--ink-50)]">Fill</span>
          {SWATCHES.map((s) => (
            <button
              key={s}
              onClick={() => setBg(s)}
              className={`h-5 w-5 rounded border ${bg === s ? 'ring-2 ring-offset-1 ring-accent' : 'border-black/10'}`}
              style={{ backgroundColor: s }}
              aria-label={`Fill ${s}`}
            />
          ))}
          <label className="ml-2 inline-flex items-center gap-1 text-[11px] text-[var(--ink-70)]">
            <input type="checkbox" checked={bold} onChange={(e) => setBold(e.target.checked)} />
            Bold
          </label>
          <button
            onClick={add}
            data-testid="condformat-add"
            className="btn-primary ml-auto text-[12px] px-3 py-1.5"
          >
            Add rule
          </button>
        </div>

        {rules.length > 0 && (
          <div className="border-t border-[var(--edge-soft)] pt-2 space-y-1 max-h-40 overflow-auto">
            {rules.map((r) => (
              <div key={r.id} className="flex items-center gap-2 text-[12px]">
                <span className="h-3.5 w-3.5 rounded border border-black/10" style={{ backgroundColor: r.bg }} />
                <span className="font-mono text-[var(--ink-50)]">{r.range}</span>
                <span className="text-[var(--ink-70)]">
                  {OPS.find((o) => o.op === r.op)?.label}
                  {r.value ? ` ${r.value}` : ''}
                  {r.value2 ? ` – ${r.value2}` : ''}
                </span>
                <button onClick={() => onRemove(r.id)} className="ml-auto icon-btn" title="Remove rule">
                  <Icon name="delete" size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
