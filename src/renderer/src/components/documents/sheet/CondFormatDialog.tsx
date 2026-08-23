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

type CondStyle = 'compare' | 'colorScale' | 'dataBar' | 'iconSet'
const STYLES: { id: CondStyle; label: string }[] = [
  { id: 'compare', label: 'Single colour' },
  { id: 'colorScale', label: 'Colour scale' },
  { id: 'dataBar', label: 'Data bar' },
  { id: 'iconSet', label: 'Icon set' }
]

export default function CondFormatDialog({ range, rules, onAdd, onRemove, onClose }: Props): JSX.Element {
  const [style, setStyle] = useState<CondStyle>('compare')
  const [op, setOp] = useState<SheetCondOp>('gt')
  const [value, setValue] = useState('')
  const [value2, setValue2] = useState('')
  const [bg, setBg] = useState(SWATCHES[0])
  const [bold, setBold] = useState(false)
  // Colour-scale colours (min / optional mid / max) and whether it is 3-colour.
  const [threeColor, setThreeColor] = useState(false)
  const [minColor, setMinColor] = useState('#f8696b')
  const [midColor, setMidColor] = useState('#ffeb84')
  const [maxColor, setMaxColor] = useState('#63be7b')
  const [barColor, setBarColor] = useState('#63be7b')
  const [iconSet, setIconSet] = useState<'arrows' | 'traffic' | 'triangles'>('arrows')

  const spec = OPS.find((o) => o.op === op)!

  function add(): void {
    seq += 1
    const id = `cf-${Date.now().toString(36)}-${seq}`
    let rule: SheetCondRule
    if (style === 'colorScale') {
      rule = { id, range, kind: 'colorScale', op: 'notEmpty', minColor, maxColor, ...(threeColor ? { midColor } : {}) }
    } else if (style === 'dataBar') {
      rule = { id, range, kind: 'dataBar', op: 'notEmpty', barColor }
    } else if (style === 'iconSet') {
      rule = { id, range, kind: 'iconSet', op: 'notEmpty', iconSet }
    } else {
      rule = {
        id,
        range,
        op,
        ...(spec.needsValue ? { value } : {}),
        ...(spec.needsSecond ? { value2 } : {}),
        bg,
        ...(bold ? { bold: true } : {})
      }
    }
    onAdd(rule)
    setValue('')
    setValue2('')
  }

  return (
    <div className="fb-scrim absolute inset-0 z-40 flex items-center justify-center" onMouseDown={onClose}>
      <div
        data-testid="sheet-condformat-dialog"
        className="fb-card w-[460px] max-w-[92%] p-4 space-y-3"
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

        {/* Format style: single colour (compare) vs the rich range-based styles. */}
        <div className="flex items-center gap-1" data-testid="condformat-style">
          {STYLES.map((s) => (
            <button
              key={s.id}
              onClick={() => setStyle(s.id)}
              data-testid={`condformat-style-${s.id}`}
              className={`text-[11px] px-2 py-1 rounded-md border transition-colors ${
                style === s.id
                  ? 'border-accent text-accent bg-accent/10'
                  : 'border-[var(--edge-soft)] text-[var(--ink-60)] hover:text-[var(--ink-90)]'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {style === 'compare' && (
          <>
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
            </div>
          </>
        )}

        {style === 'colorScale' && (
          <div className="flex items-center gap-3 flex-wrap text-[11px] text-[var(--ink-60)]">
            <label className="inline-flex items-center gap-1">
              Low <input type="color" value={minColor} onChange={(e) => setMinColor(e.target.value)} className="fb-field h-6 w-8" />
            </label>
            {threeColor && (
              <label className="inline-flex items-center gap-1">
                Mid <input type="color" value={midColor} onChange={(e) => setMidColor(e.target.value)} className="fb-field h-6 w-8" />
              </label>
            )}
            <label className="inline-flex items-center gap-1">
              High <input type="color" value={maxColor} onChange={(e) => setMaxColor(e.target.value)} className="fb-field h-6 w-8" />
            </label>
            <label className="inline-flex items-center gap-1 ml-1">
              <input type="checkbox" checked={threeColor} onChange={(e) => setThreeColor(e.target.checked)} /> 3-colour
            </label>
          </div>
        )}

        {style === 'dataBar' && (
          <label className="flex items-center gap-2 text-[11px] text-[var(--ink-60)]">
            Bar colour
            <input type="color" value={barColor} onChange={(e) => setBarColor(e.target.value)} className="fb-field h-6 w-8" />
          </label>
        )}

        {style === 'iconSet' && (
          <div className="flex items-center gap-2 text-[11px] text-[var(--ink-60)]">
            Icons
            {(['arrows', 'traffic', 'triangles'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setIconSet(s)}
                className={`px-2 py-1 rounded-md border ${iconSet === s ? 'border-accent text-accent bg-accent/10' : 'border-[var(--edge-soft)]'}`}
              >
                {s === 'arrows' ? '↑ → ↓' : s === 'traffic' ? '● ● ●' : '▲ ◆ ▼'}
              </button>
            ))}
          </div>
        )}

        <div className="flex">
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
                <span
                  className="h-3.5 w-3.5 rounded border border-black/10"
                  style={{
                    background:
                      r.kind === 'colorScale'
                        ? `linear-gradient(90deg, ${r.minColor ?? '#f8696b'}, ${r.maxColor ?? '#63be7b'})`
                        : r.kind === 'dataBar'
                          ? r.barColor
                          : r.bg
                  }}
                />
                <span className="font-mono text-[var(--ink-50)]">{r.range}</span>
                <span className="text-[var(--ink-70)]">
                  {r.kind === 'colorScale'
                    ? 'Colour scale'
                    : r.kind === 'dataBar'
                      ? 'Data bar'
                      : r.kind === 'iconSet'
                        ? `Icon set (${r.iconSet ?? 'arrows'})`
                        : `${OPS.find((o) => o.op === r.op)?.label}${r.value ? ` ${r.value}` : ''}${r.value2 ? ` – ${r.value2}` : ''}`}
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
