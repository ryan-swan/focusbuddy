import type { EnergyLevel } from '@shared/types'
import { ENERGY_META, useEnergyStore } from '../../stores/energy'
import { chimeIn } from '../../lib/audioBeep'
import Icon from '../Icon'

// Dashboard card — current energy + quick log + last few entries.
// Available as an opt-in card via Phase 6 "Customize".
export default function EnergyCard(): JSX.Element {
  const current = useEnergyStore((s) => s.current)
  const history = useEnergyStore((s) => s.history)
  const log = useEnergyStore((s) => s.log)

  async function setLevel(level: EnergyLevel): Promise<void> {
    chimeIn()
    await log(level)
  }

  const recent = history.slice(0, 6)

  return (
    <div className="rounded-xl border border-[var(--edge-soft)] bg-[var(--surface-raised)]/85 backdrop-blur p-4">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-[var(--ink-50)] font-semibold mb-3">
        <Icon name="bolt" size={12} />
        <span>Energy</span>
      </div>

      <div className="flex items-stretch gap-2 mb-3">
        {(['low', 'medium', 'high'] as EnergyLevel[]).map((level) => {
          const m = ENERGY_META[level]
          const active = current?.level === level
          return (
            <button
              key={level}
              onClick={() => void setLevel(level)}
              className={`flex-1 flex flex-col items-center gap-1 py-3 rounded-lg border-2 transition-colors ${
                active
                  ? 'border-accent bg-accent/5'
                  : 'border-[var(--edge-soft)] hover:border-[var(--edge-firm)]'
              }`}
              title={m.description}
            >
              <span className="text-2xl leading-none">{m.emoji}</span>
              <span
                className="text-[11px] font-medium"
                style={{ color: m.color }}
              >
                {m.label}
              </span>
            </button>
          )
        })}
      </div>

      {!current ? (
        <p className="text-[11px] text-[var(--ink-50)] text-center leading-snug">
          Tap your energy. Used to suggest tasks that match your state — not to punish you for picking the easier one.
        </p>
      ) : (
        <>
          <p className="text-[11px] text-[var(--ink-70)] mb-2 leading-snug">
            <span className="font-medium">{ENERGY_META[current.level].description}</span>
          </p>
          {recent.length > 1 && (
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[9px] uppercase tracking-wider text-[var(--ink-50)] mr-1">
                last 72h
              </span>
              {recent.map((e) => (
                <span
                  key={e.id}
                  title={`${ENERGY_META[e.level].label} · ${new Date(e.ts).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`}
                  className="text-sm leading-none"
                >
                  {ENERGY_META[e.level].emoji}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
