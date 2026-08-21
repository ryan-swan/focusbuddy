import type { AxisValue } from '@shared/types'

interface Props {
  label: string
  hint: string
  value: AxisValue
  onChange: (v: AxisValue) => void
}

// Label above, dots in the middle, hint below — stacked so nothing collides at
// narrow widths, and painted with the token ramps (the old text-desk-* classes
// predated tokens.css and broke on dark surfaces).
export default function AxisPicker({ label, hint, value, onChange }: Props): JSX.Element {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="text-[11px] uppercase tracking-wider text-[var(--ink-50)] font-medium">
        {label}
      </span>
      <div className="flex items-center gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${label} level ${n}`}
            onClick={() => onChange(n as AxisValue)}
            className={`axis-dot ${n <= value ? 'axis-dot-filled' : 'axis-dot-empty'}`}
          />
        ))}
      </div>
      <span className="text-[10.5px] text-[var(--ink-40)] truncate">{hint}</span>
    </div>
  )
}
