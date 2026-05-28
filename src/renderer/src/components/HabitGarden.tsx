import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { FocusSession } from '@shared/types'
import {
  bloomIntensity,
  buildGarden,
  summarize,
  type DayBucket
} from '../lib/habitGarden'
import { useFocusSessionStore } from '../stores/focusSession'
import Icon from './Icon'

const STRIP_DAYS = 7
const POPOVER_DAYS = 30

function fmtMin(sec: number): string {
  const m = Math.round(sec / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`
}

// Inline 7-day strip used in the canvas title bar. Click → opens the 30-day popover.
export default function HabitGardenStrip(): JSX.Element {
  const activeSession = useFocusSessionStore((s) => s.active)
  const [sessions, setSessions] = useState<FocusSession[]>([])
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement | null>(null)

  // Load recent sessions on mount and whenever a session ends.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      // 30 days × an aggressive ceiling of 30 sessions per day = 900 plenty
      const recent = await window.api.focus.recent(900, null)
      if (!cancelled) setSessions(recent)
    })()
    return () => {
      cancelled = true
    }
  }, [activeSession])
  // ^ When activeSession transitions from non-null to null (session just ended),
  // we refetch so the garden updates in real time.

  const buckets = buildGarden(sessions, POPOVER_DAYS)
  const strip = buckets.slice(-STRIP_DAYS)
  const summary = summarize(buckets)

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors group"
        title="Your focus garden — last 7 days. Click for full view."
      >
        <Icon name="local_florist" size={14} className="text-emerald-600 dark:text-emerald-500" />
        <span className="text-[11px] font-mono text-stone-700 dark:text-stone-300 tabular-nums">
          {summary.todaySessions}
        </span>
        <div className="flex items-center gap-[2px]">
          {strip.map((b) => (
            <Dot key={b.dateKey} bucket={b} size="sm" />
          ))}
        </div>
      </button>
      {open &&
        createPortal(
          <HabitGardenPopover
            buckets={buckets}
            anchorEl={btnRef.current}
            onClose={() => setOpen(false)}
          />,
          document.body
        )}
    </>
  )
}

interface DotProps {
  bucket: DayBucket
  size?: 'sm' | 'md'
}

function Dot({ bucket, size = 'sm' }: DotProps): JSX.Element {
  const intensity = bloomIntensity(bucket.sessionCount)
  const dim = size === 'sm' ? 6 : 14
  const empty = intensity === 0
  const label = bucket.date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  })
  const tooltip = empty
    ? `${label} — no sessions`
    : `${label} — ${bucket.sessionCount} session${bucket.sessionCount === 1 ? '' : 's'}, ${fmtMin(bucket.totalSeconds)}`
  return (
    <span
      title={tooltip}
      style={{
        width: dim,
        height: dim,
        borderRadius: '50%',
        backgroundColor: empty
          ? 'rgb(229 229 228)' // neutral-200
          : `rgb(var(--accent) / ${0.35 + intensity * 0.55})`,
        outline: bucket.isToday ? '1.5px solid rgb(var(--accent))' : 'none',
        outlineOffset: '1px',
        display: 'inline-block'
      }}
    />
  )
}

interface PopoverProps {
  buckets: DayBucket[]
  anchorEl: HTMLElement | null
  onClose: () => void
}

function HabitGardenPopover({ buckets, anchorEl, onClose }: PopoverProps): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null)
  const summary = summarize(buckets)

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

  // Render as a calendar-ish 6×5 grid, oldest top-left → newest bottom-right.
  return (
    <div
      ref={ref}
      className="fixed z-[180] w-72 rounded-lg bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 shadow-2xl backdrop-blur"
      style={style}
    >
      <div className="px-3 py-2 border-b border-stone-200 dark:border-stone-700 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon name="local_florist" size={14} className="text-emerald-600 dark:text-emerald-500" />
          <span className="text-[12px] font-semibold text-stone-900 dark:text-stone-100">
            Focus garden
          </span>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-stone-500 dark:text-stone-400">
          30 days
        </span>
      </div>

      <div className="px-3 py-3">
        <div className="grid grid-cols-6 gap-2 mb-3">
          {buckets.map((b) => (
            <div key={b.dateKey} className="flex flex-col items-center gap-0.5">
              <Dot bucket={b} size="md" />
              <span className="text-[9px] font-mono text-stone-400 dark:text-stone-500">
                {b.date.getDate()}
              </span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-stone-200 dark:border-stone-700">
          <Stat label="Today" value={`${summary.todaySessions}`} sub={fmtMin(summary.todaySeconds)} />
          <Stat
            label="Days active"
            value={`${summary.daysWithActivity}/30`}
            sub={`${Math.round((summary.daysWithActivity / 30) * 100)}%`}
          />
          <Stat label="Total" value={`${summary.totalSessions}`} sub={fmtMin(summary.totalSeconds)} />
        </div>

        <p className="mt-3 text-[10px] text-stone-500 dark:text-stone-500 leading-relaxed text-center">
          No streak to break. Gaps are fine — the bloom stays.
        </p>
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  sub
}: {
  label: string
  value: string
  sub: string
}): JSX.Element {
  return (
    <div className="text-center">
      <div className="text-[10px] uppercase tracking-wider text-stone-500 dark:text-stone-400">
        {label}
      </div>
      <div className="text-base font-semibold text-stone-900 dark:text-stone-100 tabular-nums">
        {value}
      </div>
      <div className="text-[10px] text-stone-500 dark:text-stone-500 font-mono">{sub}</div>
    </div>
  )
}
