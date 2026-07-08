import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useWidgetStore } from '../stores/widgets'
import { chimeOut, chimeIn } from '../lib/audioBeep'
import { useCognitiveLoad, tierForLoad } from '../lib/useCognitiveLoad'
import Icon from './Icon'

// LoadMeter — just the icon trigger. The pill itself shows the load tier via
// its outer ring color (handled in FloatingPill). Clicking this opens the
// detailed popover with the gauge, widget count, and park controls.
export default function LoadMeter(): JSX.Element {
  const { load, tier, archived } = useCognitiveLoad()
  const restore = useWidgetStore((s) => s.restore)
  const parkAll = useWidgetStore((s) => s.parkAll)
  const visible = useWidgetStore((s) => s.widgets).filter((w) => !w.archived)
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement | null>(null)
  const overloaded = tier.label === 'Overloaded'

  async function handlePark(): Promise<void> {
    const count = await parkAll(true)
    if (count > 0) chimeOut()
    setOpen(false)
  }

  async function handleRestore(id: string): Promise<void> {
    await restore(id)
    chimeIn()
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        title={`Cognitive load: ${tier.label} (${load.toFixed(1)} weighted) — click for details`}
        className={[
          'inline-flex items-center justify-center h-6 w-6 rounded-full transition-colors',
          'hover:bg-[var(--surface-sunken)]',
          overloaded ? 'animate-pulse' : ''
        ].join(' ')}
      >
        <Icon name="speed" size={14} className={tier.textClass} />
      </button>
      {open &&
        createPortal(
          <LoadMeterPopover
            load={load}
            tier={tier}
            visibleCount={visible.length}
            archived={archived.map((w) => ({ id: w.id, kind: w.kind, title: w.title }))}
            anchorEl={btnRef.current}
            onClose={() => setOpen(false)}
            onPark={handlePark}
            onRestore={handleRestore}
          />,
          document.body
        )}
    </>
  )
}

interface PopoverProps {
  load: number
  tier: ReturnType<typeof tierForLoad>
  visibleCount: number
  archived: Array<{ id: string; kind: string; title: string }>
  anchorEl: HTMLElement | null
  onClose: () => void
  onPark: () => Promise<void>
  onRestore: (id: string) => Promise<void>
}

function LoadMeterPopover({
  load,
  tier,
  visibleCount,
  archived,
  anchorEl,
  onClose,
  onPark,
  onRestore
}: PopoverProps): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null)

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
    ? { top: rect.bottom + 8, left: rect.left + rect.width / 2, transform: 'translateX(-50%)' }
    : { top: 60, right: 12 }

  const gaugePct = Math.min(100, Math.round((load / 14) * 100))

  return (
    <div
      ref={ref}
      className="fixed z-[180] w-72 rounded-xl bg-[var(--surface-raised)] border border-[var(--edge-soft)] shadow-2xl backdrop-blur-sm"
      style={style}
    >
      <div className="px-3 py-2.5 border-b border-[var(--edge-soft)] flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon name="speed" size={14} className={tier.textClass} />
          <span className="text-[12px] font-semibold text-[var(--ink-100)]">Cognitive load</span>
        </div>
        <span className={`text-[11px] font-semibold ${tier.textClass}`}>{tier.label}</span>
      </div>

      <div className="px-3 py-3">
        <div className="h-1.5 w-full rounded-full bg-[var(--surface-sunken)] overflow-hidden mb-3">
          <div
            className={`h-full ${tier.bgClass} rounded-full transition-all duration-500`}
            style={{ width: `${gaugePct}%` }}
          />
        </div>
        <div className="flex items-baseline justify-between text-[11px] text-[var(--ink-60)] mb-3">
          <span>
            <span className="font-semibold text-[var(--ink-100)] tabular-nums">{visibleCount}</span>
            {' '}widget{visibleCount === 1 ? '' : 's'}
          </span>
          <span className="font-mono tabular-nums">{load.toFixed(1)} weighted</span>
        </div>

        <button
          onClick={onPark}
          disabled={visibleCount <= 1}
          className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[12px] font-medium bg-[rgb(var(--accent))] text-white hover:bg-[rgb(var(--accent-hover))] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Icon name="inventory_2" size={13} />
          <span>Park all except active</span>
        </button>
        <p className="mt-1.5 text-[10px] text-[var(--ink-40)] text-center leading-snug">
          Hides widgets — restore from the list below.
        </p>
      </div>

      {archived.length > 0 && (
        <div className="border-t border-[var(--edge-soft)] px-3 py-2 max-h-48 overflow-auto">
          <div className="text-[10px] uppercase tracking-wider text-[var(--ink-40)] mb-1.5 font-semibold">
            Parked ({archived.length})
          </div>
          <div className="space-y-0.5">
            {archived.map((w) => (
              <button
                key={w.id}
                onClick={() => void onRestore(w.id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-[12px] text-[var(--ink-70)] hover:bg-[var(--surface-sunken)] transition-colors group"
              >
                <Icon name="unarchive" size={12} className="text-[var(--ink-40)] group-hover:text-accent shrink-0" />
                <span className="truncate flex-1">
                  {w.title || <em className="text-[var(--ink-40)]">{w.kind}</em>}
                </span>
                <span className="text-[10px] text-[var(--ink-40)] font-mono shrink-0">{w.kind}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
