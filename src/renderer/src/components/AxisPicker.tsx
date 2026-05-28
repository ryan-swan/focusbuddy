import type { AxisValue } from '@shared/types'

interface Props {
  label: string
  hint: string
  value: AxisValue
  onChange: (v: AxisValue) => void
}

export default function AxisPicker({ label, hint, value, onChange }: Props): JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-desk-800">{label}</span>
        <span className="text-xs text-desk-600">{hint}</span>
      </div>
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
    </div>
  )
}
