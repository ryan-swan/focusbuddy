import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { EnergyLevel } from '@shared/types'
import { ENERGY_META, useEnergyStore } from '../stores/energy'
import { chimeIn } from '../lib/audioBeep'
import Icon from './Icon'

// App-header chip showing current energy level. Click → popover with three buttons.
// Auto-fades when no recent log to prompt the user to record their first entry.
export default function EnergyChip(): JSX.Element {
  const current = useEnergyStore((s) => s.current)
  const loaded = useEnergyStore((s) => s.loaded)
  const refresh = useEnergyStore((s) => s.refresh)
  const log = useEnergyStore((s) => s.log)
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!loaded) void refresh()
  }, [loaded, refresh])

  async function setLevel(level: EnergyLevel): Promise<void> {
    chimeIn()
    await log(level)
    setOpen(false)
  }

  const meta = current ? ENERGY_META[current.level] : null
  const ageMin = current ? Math.floor((Date.now() - current.ts) / 60_000) : null

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        className="icon-btn relative"
        title={
          meta
            ? `Energy: ${meta.label} · logged ${ageMin}m ago — click to update`
            : "Log your energy — helps the system suggest the right work for your state"
        }
        aria-label="Energy"
      >
        {meta ? (
          <span className="text-sm leading-none">{meta.emoji}</span>
        ) : (
          <Icon name="bolt" size={14} className="text-stone-400 dark:text-stone-500" />
        )}
        {meta && (
          <span
            className="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: meta.color }}
          />
        )}
      </button>
      {open &&
        createPortal(
          <EnergyPopover
            anchorEl={btnRef.current}
            onPick={(l) => void setLevel(l)}
            onClose={() => setOpen(false)}
          />,
          document.body
        )}
    </>
  )
}

interface PopoverProps {
  anchorEl: HTMLElement | null
  onPick: (l: EnergyLevel) => void
  onClose: () => void
}

function EnergyPopover({ anchorEl, onPick, onClose }: PopoverProps): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null)
  const current = useEnergyStore((s) => s.current)

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    function onClick(e: MouseEvent): void {
      const t = e.target as Node
      if (ref.current && !ref.current.contains(t) && anchorEl !== t) onClose()
    }
    window.addEventListener('keydown', onKey)
    const armId = window.setTimeout(() => window.addEventListener('mousedown', onClick), 50)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onClick)
      window.clearTimeout(armId)
    }
  }, [onClose, anchorEl])

  const rect = anchorEl?.getBoundingClientRect()
  const style: React.CSSProperties = rect
    ? { top: rect.bottom + 6, right: window.innerWidth - rect.right }
    : { top: 60, right: 12 }

  return (
    <div
      ref={ref}
      className="fixed z-[180] w-64 rounded-lg bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 shadow-2xl backdrop-blur"
      style={style}
    >
      <div className="px-3 py-2 border-b border-stone-200 dark:border-stone-700">
        <div className="text-[11px] uppercase tracking-[0.12em] text-stone-500 dark:text-stone-400 font-semibold">
          Energy right now
        </div>
        <div className="text-[10px] text-stone-500 dark:text-stone-500 mt-0.5">
          Used to suggest tasks that match your state, not punish your interest.
        </div>
      </div>
      <div className="p-2 space-y-1">
        {(['high', 'medium', 'low'] as EnergyLevel[]).map((level) => {
          const m = ENERGY_META[level]
          const active = current?.level === level
          return (
            <button
              key={level}
              onClick={() => onPick(level)}
              className={`w-full flex items-start gap-3 p-2 rounded-md text-left transition-colors ${
                active
                  ? 'bg-accent/10 border border-accent/40'
                  : 'border border-transparent hover:bg-stone-100 dark:hover:bg-stone-800'
              }`}
            >
              <span className="text-xl leading-none mt-0.5">{m.emoji}</span>
              <div className="flex-1 min-w-0">
                <div
                  className="text-sm font-medium"
                  style={{ color: m.color }}
                >
                  {m.label}
                </div>
                <div className="text-[10px] text-stone-500 dark:text-stone-400 leading-snug">
                  {m.description}
                </div>
              </div>
              {active && (
                <Icon name="check_circle" size={14} filled className="text-accent shrink-0 mt-1" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
