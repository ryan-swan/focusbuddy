import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useWidgetStore } from '../stores/widgets'
import { chimeOut, chimeIn } from '../lib/audioBeep'
import Icon from './Icon'

// Cognitive Load = a weighted count of "things demanding attention" on the canvas.
// Tuned so a single browser feels heavier than a single sticky.
const KIND_WEIGHT: Record<string, number> = {
  webview: 1.5,
  pdf: 1.5,
  gdoc: 1.3,
  gsheet: 1.3,
  gslide: 1.3,
  email: 1.3,
  video: 1.2,
  markdown: 1.1,
  note: 1.0,
  sticky: 0.7,
  timer: 0.6,
  calculator: 0.5,
  color: 0.4,
  image: 0.6,
  section: 0.5
}

interface LoadTier {
  label: string
  color: string
  bg: string
  cap: number
}

const TIERS: LoadTier[] = [
  { label: 'Light', color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-500', cap: 5 },
  { label: 'Comfortable', color: 'text-sky-700 dark:text-sky-400', bg: 'bg-sky-500', cap: 9 },
  { label: 'Heavy', color: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-500', cap: 14 },
  { label: 'Overloaded', color: 'text-red-700 dark:text-red-400', bg: 'bg-red-500', cap: Infinity }
]

function tierForLoad(load: number): LoadTier {
  for (const t of TIERS) if (load <= t.cap) return t
  return TIERS[TIERS.length - 1]
}

export default function LoadMeter(): JSX.Element {
  const widgets = useWidgetStore((s) => s.widgets)
  const restore = useWidgetStore((s) => s.restore)
  const parkAll = useWidgetStore((s) => s.parkAll)
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement | null>(null)

  const visible = widgets.filter((w) => !w.archived)
  const archived = widgets.filter((w) => w.archived)
  const load = visible.reduce((sum, w) => sum + (KIND_WEIGHT[w.kind] ?? 1), 0)
  const tier = tierForLoad(load)
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
        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors ${
          overloaded ? 'animate-pulse' : ''
        }`}
        title={`Cognitive load: ${tier.label} (${load.toFixed(1)} weighted) — click to park widgets`}
      >
        <span className="relative inline-flex h-3 w-3 items-center justify-center">
          <span className={`absolute inset-0 rounded-full ${tier.bg} opacity-70`} />
          {overloaded && (
            <span className={`absolute inset-[-3px] rounded-full ${tier.bg} opacity-30 animate-ping`} />
          )}
        </span>
        <span className={`text-[11px] font-mono tabular-nums ${tier.color}`}>
          {Math.round(load)}
        </span>
        {archived.length > 0 && (
          <span className="text-[10px] text-stone-500 dark:text-stone-400">
            +{archived.length}
          </span>
        )}
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
  tier: LoadTier
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
    ? { top: rect.bottom + 6, right: window.innerWidth - rect.right }
    : { top: 60, right: 12 }

  // Visual gauge fill: load relative to "heavy" cap so users see the cliff coming
  const gaugePct = Math.min(100, Math.round((load / 14) * 100))

  return (
    <div
      ref={ref}
      className="fixed z-[180] w-80 rounded-lg bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 shadow-2xl backdrop-blur"
      style={style}
    >
      <div className="px-3 py-2 border-b border-stone-200 dark:border-stone-700 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon name="speed" size={14} className={tier.color} />
          <span className="text-[12px] font-semibold text-stone-900 dark:text-stone-100">
            Cognitive load
          </span>
        </div>
        <span className={`text-[11px] font-mono ${tier.color}`}>{tier.label}</span>
      </div>

      <div className="px-3 py-3">
        <div className="h-2 w-full rounded-full bg-stone-200 dark:bg-stone-800 overflow-hidden mb-2">
          <div
            className={`h-full ${tier.bg} transition-all duration-300`}
            style={{ width: `${gaugePct}%` }}
          />
        </div>
        <div className="flex items-baseline justify-between text-[11px] text-stone-600 dark:text-stone-400">
          <span>
            <span className="font-semibold text-stone-900 dark:text-stone-100 tabular-nums">
              {visibleCount}
            </span>{' '}
            widget{visibleCount === 1 ? '' : 's'} visible
          </span>
          <span className="font-mono tabular-nums">{load.toFixed(1)} weighted</span>
        </div>

        <button
          onClick={onPark}
          disabled={visibleCount <= 1}
          className="mt-3 w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-md btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Icon name="inventory_2" size={14} />
          <span>Park everything except the active widget</span>
        </button>
        <p className="mt-1.5 text-[10px] text-stone-500 dark:text-stone-500 text-center leading-snug">
          Hides widgets from the canvas — restore any of them below or later.
        </p>
      </div>

      {archived.length > 0 && (
        <div className="border-t border-stone-200 dark:border-stone-700 px-3 py-2 max-h-56 overflow-auto">
          <div className="text-[10px] uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1.5">
            Parked ({archived.length})
          </div>
          <div className="space-y-0.5">
            {archived.map((w) => (
              <button
                key={w.id}
                onClick={() => void onRestore(w.id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors group"
              >
                <Icon
                  name="unarchive"
                  size={13}
                  className="text-stone-400 dark:text-stone-500 group-hover:text-accent shrink-0"
                />
                <span className="truncate flex-1">
                  {w.title || <em className="text-stone-400 dark:text-stone-500">{w.kind}</em>}
                </span>
                <span className="text-[10px] text-stone-400 dark:text-stone-500 font-mono shrink-0">
                  {w.kind}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
