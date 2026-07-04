import { useState } from 'react'
import type { SheetValidation, SheetValidationRule } from '@shared/types'
import Icon from '../../Icon'

// Data-validation editor for the active sheet. Defines what a cell in a range may
// contain: a list (in-cell dropdown), a numeric constraint, or non-empty text.
// Invalid values are flagged in the grid; with "strict" on, an invalid entry is
// rejected on commit. The value is never silently changed.

type Kind = 'list' | 'number' | 'textNotEmpty'
type NumOp = 'gt' | 'lt' | 'ge' | 'le' | 'eq' | 'between'

const NUM_OPS: { op: NumOp; label: string; second?: boolean }[] = [
  { op: 'gt', label: 'Greater than' },
  { op: 'lt', label: 'Less than' },
  { op: 'ge', label: 'Greater or equal' },
  { op: 'le', label: 'Less or equal' },
  { op: 'eq', label: 'Equal to' },
  { op: 'between', label: 'Between', second: true }
]

interface Props {
  range: string
  validations: SheetValidation[]
  onAdd: (v: SheetValidation) => void
  onRemove: (id: string) => void
  onClose: () => void
}

let seq = 0

export default function ValidationDialog({
  range,
  validations,
  onAdd,
  onRemove,
  onClose
}: Props): JSX.Element {
  const [kind, setKind] = useState<Kind>('list')
  const [listText, setListText] = useState('')
  const [numOp, setNumOp] = useState<NumOp>('between')
  const [num1, setNum1] = useState('')
  const [num2, setNum2] = useState('')
  const [strict, setStrict] = useState(true)

  const numSpec = NUM_OPS.find((o) => o.op === numOp)!

  function add(): void {
    let rule: SheetValidationRule
    if (kind === 'list') {
      const values = listText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      if (values.length === 0) return
      rule = { kind: 'list', values }
    } else if (kind === 'number') {
      const value = Number(num1)
      if (!Number.isFinite(value)) return
      rule = {
        kind: 'number',
        op: numOp,
        value,
        ...(numSpec.second && num2 !== '' ? { value2: Number(num2) } : {})
      }
    } else {
      rule = { kind: 'textNotEmpty' }
    }
    seq += 1
    onAdd({ id: `dv-${Date.now().toString(36)}-${seq}`, range, rule, ...(strict ? { strict: true } : {}) })
    setListText('')
    setNum1('')
    setNum2('')
  }

  function describe(v: SheetValidation): string {
    if (v.rule.kind === 'list') return `List: ${v.rule.values.join(', ')}`
    if (v.rule.kind === 'textNotEmpty') return 'Must not be empty'
    const opLabel = NUM_OPS.find((o) => o.op === (v.rule as { op: NumOp }).op)?.label ?? v.rule.op
    return `Number ${opLabel} ${v.rule.value}${v.rule.value2 != null ? ` – ${v.rule.value2}` : ''}`
  }

  return (
    <div className="absolute inset-0 z-40 bg-black/30 flex items-center justify-center" onMouseDown={onClose}>
      <div
        data-testid="sheet-validation-dialog"
        className="w-[460px] max-w-[92%] rounded-lg bg-[var(--surface-raised)] border border-[var(--edge-soft)] shadow-xl p-4 space-y-3"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 text-[13px] font-semibold">
          <Icon name="rule" size={15} className="text-accent" />
          Data validation
          <button onClick={onClose} className="ml-auto icon-btn" aria-label="Close">
            <Icon name="close" size={14} />
          </button>
        </div>
        <p className="text-[11px] text-[var(--ink-50)]">
          Applies to <span className="font-mono text-[var(--ink-70)]">{range}</span>.
        </p>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as Kind)}
            data-testid="validation-kind"
            className="text-[12px] bg-[var(--surface-sunken)] border border-[var(--edge-firm)] rounded px-2 py-1.5"
          >
            <option value="list">List of items (dropdown)</option>
            <option value="number">Number</option>
            <option value="textNotEmpty">Text, not empty</option>
          </select>
        </div>

        {kind === 'list' && (
          <input
            value={listText}
            onChange={(e) => setListText(e.target.value)}
            placeholder="Comma-separated, e.g. Open, In progress, Done"
            data-testid="validation-list"
            className="w-full text-[12px] bg-[var(--surface-sunken)] border border-[var(--edge-firm)] rounded px-2 py-1.5"
          />
        )}
        {kind === 'number' && (
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={numOp}
              onChange={(e) => setNumOp(e.target.value as NumOp)}
              className="text-[12px] bg-[var(--surface-sunken)] border border-[var(--edge-firm)] rounded px-2 py-1.5"
            >
              {NUM_OPS.map((o) => (
                <option key={o.op} value={o.op}>
                  {o.label}
                </option>
              ))}
            </select>
            <input
              value={num1}
              onChange={(e) => setNum1(e.target.value)}
              placeholder="value"
              className="w-20 text-[12px] bg-[var(--surface-sunken)] border border-[var(--edge-firm)] rounded px-2 py-1.5"
            />
            {numSpec.second && (
              <input
                value={num2}
                onChange={(e) => setNum2(e.target.value)}
                placeholder="and"
                className="w-20 text-[12px] bg-[var(--surface-sunken)] border border-[var(--edge-firm)] rounded px-2 py-1.5"
              />
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-1 text-[11px] text-[var(--ink-70)]">
            <input type="checkbox" checked={strict} onChange={(e) => setStrict(e.target.checked)} />
            Reject invalid entries
          </label>
          <button onClick={add} data-testid="validation-add" className="btn-primary ml-auto text-[12px] px-3 py-1.5">
            Add rule
          </button>
        </div>

        {validations.length > 0 && (
          <div className="border-t border-[var(--edge-soft)] pt-2 space-y-1 max-h-40 overflow-auto">
            {validations.map((v) => (
              <div key={v.id} className="flex items-center gap-2 text-[12px]">
                <span className="font-mono text-[var(--ink-50)]">{v.range}</span>
                <span className="text-[var(--ink-70)]">{describe(v)}</span>
                {v.strict && <span className="text-[10px] text-[var(--ink-40)]">(strict)</span>}
                <button onClick={() => onRemove(v.id)} className="ml-auto icon-btn" title="Remove rule">
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
