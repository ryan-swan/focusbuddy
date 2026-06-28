import type { ReactNode } from 'react'
import Icon from '../Icon'

// ── Plexi dashboard primitives ──────────────────────────────────────────────
// The shared component layer that makes every Plexi surface read as one suite:
// greeting headers, stat tiles with trend deltas, right-rail cards, and status
// pills — all built on the existing design tokens (tokens.css: ink/surface/edge
// ramps, --accent, fb-* utilities) so they adapt to light / dark / futuristic /
// atelier automatically. Products compose these instead of re-styling cards by
// hand, which is how the suite converges on the aspirational vision.
//
// Card idiom (matches the 2.0-era cards): rounded-xl, hairline border, glassy
// fill, soft inset highlight via fb-glass-soft.

export const PLEXI_CARD =
  'rounded-xl border border-stone-200/80 dark:border-white/10 bg-white/80 dark:bg-white/[0.03] backdrop-blur-sm fb-glass-soft'

export type Tone = 'accent' | 'emerald' | 'amber' | 'rose' | 'violet' | 'sky' | 'stone'

// Stroke/fill colour per tone for the inline SVG chart primitives. Accent follows
// the live theme via its CSS var; the rest are fixed Tailwind-500 values so they
// read correctly in light and dark without a class round-trip.
const TONE_STROKE: Record<Tone, string> = {
  accent: 'rgb(var(--accent))',
  emerald: 'rgb(16 185 129)',
  amber: 'rgb(245 158 11)',
  rose: 'rgb(244 63 94)',
  violet: 'rgb(139 92 246)',
  sky: 'rgb(14 165 233)',
  stone: 'rgb(120 113 108)'
}

const TONE_TEXT: Record<Tone, string> = {
  accent: 'text-accent',
  emerald: 'text-emerald-500',
  amber: 'text-amber-500',
  rose: 'text-rose-500',
  violet: 'text-violet-500',
  sky: 'text-sky-500',
  stone: 'text-stone-500'
}
const TONE_CHIP: Record<Tone, string> = {
  accent: 'bg-accent/10 text-accent',
  emerald: 'bg-emerald-500/10 text-emerald-500',
  amber: 'bg-amber-500/10 text-amber-500',
  rose: 'bg-rose-500/10 text-rose-500',
  violet: 'bg-violet-500/10 text-violet-500',
  sky: 'bg-sky-500/10 text-sky-500',
  stone: 'bg-stone-500/10 text-stone-500'
}

/** Page header with the "Good morning, Sarah 👋" greeting + an actions slot. */
export function DashboardHeader({
  title,
  greeting,
  subtitle,
  actions
}: {
  title: string
  greeting?: string
  subtitle?: string
  actions?: ReactNode
}): JSX.Element {
  return (
    <header className="flex items-start justify-between gap-4 flex-wrap mb-5">
      <div className="min-w-0">
        <h1 className="fb-display-hero text-[22px] leading-tight text-stone-900 dark:text-stone-50 flex items-center gap-2">
          {greeting ?? title}
          {greeting && <span className="text-[20px]">👋</span>}
        </h1>
        {(subtitle || greeting) && (
          <p className="mt-1 text-[13px] text-stone-500 dark:text-stone-400">{subtitle ?? title}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </header>
  )
}

/** A stat tile: icon chip, big tabular value, label, and an optional trend delta. */
export function StatTile({
  icon,
  label,
  value,
  tone = 'accent',
  delta,
  hint
}: {
  icon: string
  label: string
  value: string | number
  tone?: Tone
  delta?: { dir: 'up' | 'down' | 'flat'; text: string }
  hint?: string
}): JSX.Element {
  return (
    <div className={`${PLEXI_CARD} p-3.5 flex flex-col gap-2`}>
      <div className="flex items-center justify-between">
        <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${TONE_CHIP[tone]}`}>
          <Icon name={icon} size={17} />
        </span>
        {delta && (
          <span
            className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${
              delta.dir === 'up' ? 'text-emerald-500' : delta.dir === 'down' ? 'text-rose-500' : 'text-stone-400'
            }`}
          >
            {delta.dir !== 'flat' && (
              <Icon name={delta.dir === 'up' ? 'trending_up' : 'trending_down'} size={13} />
            )}
            {delta.text}
          </span>
        )}
      </div>
      <div>
        <div className="fb-display fb-tabular text-[24px] leading-none text-stone-900 dark:text-stone-50">{value}</div>
        <div className="mt-1 text-[12px] text-stone-500 dark:text-stone-400">{label}</div>
        {hint && <div className="text-[11px] text-stone-400 dark:text-stone-500">{hint}</div>}
      </div>
    </div>
  )
}

/** A titled panel for the main column or the right rail, with an optional action. */
export function RailCard({
  title,
  icon,
  tone = 'accent',
  action,
  children,
  className = ''
}: {
  title?: string
  icon?: string
  tone?: Tone
  action?: { label: string; onClick: () => void }
  children: ReactNode
  className?: string
}): JSX.Element {
  return (
    <section className={`${PLEXI_CARD} ${className}`}>
      {title && (
        <div className="flex items-center justify-between gap-2 px-4 pt-3.5 pb-2">
          <h3 className="text-[13px] font-semibold text-stone-800 dark:text-stone-100 flex items-center gap-1.5">
            {icon && <Icon name={icon} size={15} className={TONE_TEXT[tone]} />}
            {title}
          </h3>
          {action && (
            <button onClick={action.onClick} className="text-[11.5px] font-medium text-accent hover:underline">
              {action.label}
            </button>
          )}
        </div>
      )}
      <div className={title ? 'px-4 pb-3.5' : 'p-4'}>{children}</div>
    </section>
  )
}

type PillTone = Tone | 'online' | 'away' | 'focus' | 'busy' | 'offline' | 'success' | 'warn' | 'error'

const PILL: Record<PillTone, { dot: string; text: string; bg: string }> = {
  online: { dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10' },
  success: { dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10' },
  emerald: { dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10' },
  away: { dot: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10' },
  warn: { dot: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10' },
  amber: { dot: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10' },
  focus: { dot: 'bg-violet-500', text: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-500/10' },
  violet: { dot: 'bg-violet-500', text: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-500/10' },
  busy: { dot: 'bg-rose-500', text: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-500/10' },
  error: { dot: 'bg-rose-500', text: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-500/10' },
  rose: { dot: 'bg-rose-500', text: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-500/10' },
  sky: { dot: 'bg-sky-500', text: 'text-sky-600 dark:text-sky-400', bg: 'bg-sky-500/10' },
  accent: { dot: 'bg-accent', text: 'text-accent', bg: 'bg-accent/10' },
  offline: { dot: 'bg-stone-400', text: 'text-stone-500', bg: 'bg-stone-500/10' },
  stone: { dot: 'bg-stone-400', text: 'text-stone-500', bg: 'bg-stone-500/10' }
}

/** A small status pill: a colored dot + label on a tinted ground. */
export function StatusPill({ tone, label, dot = true }: { tone: PillTone; label: string; dot?: boolean }): JSX.Element {
  const p = PILL[tone]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${p.bg} ${p.text}`}>
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${p.dot}`} />}
      {label}
    </span>
  )
}

// ── Inline chart primitives ─────────────────────────────────────────────────
// Tiny, dependency-free SVG charts for use inside tiles, headers and rail cards.
// They render real values only; with no data they return null (Sparkline/MiniBars)
// or an honest zero (Ring), never a placeholder that could read as real data. For
// full-size panel charts use recharts inside a RailCard instead.

/** A small line over a numeric series in time order. Null below two points. */
export function Sparkline({
  points,
  width = 84,
  height = 28,
  tone = 'accent'
}: {
  points: number[]
  width?: number
  height?: number
  tone?: Tone
}): JSX.Element | null {
  if (points.length < 2) return null
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1
  const d = points
    .map((v, i) => {
      const x = (i / (points.length - 1)) * width
      const y = height - ((v - min) / range) * (height - 4) - 2
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none" aria-hidden="true">
      <path d={d} stroke={TONE_STROKE[tone]} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** A small bar histogram. Empty bars render as a faint track; null with no data. */
export function MiniBars({
  points,
  width = 84,
  height = 28,
  tone = 'accent',
  gap = 2
}: {
  points: number[]
  width?: number
  height?: number
  tone?: Tone
  gap?: number
}): JSX.Element | null {
  if (points.length === 0) return null
  const max = Math.max(...points, 1)
  const barW = (width - gap * (points.length - 1)) / points.length
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {points.map((v, i) => {
        const barH = Math.max(2, (v / max) * (height - 2))
        return (
          <rect
            key={i}
            x={(barW + gap) * i}
            y={height - barH}
            width={Math.max(1, barW)}
            height={barH}
            rx={1.5}
            fill={v === 0 ? 'var(--edge-soft)' : TONE_STROKE[tone]}
            opacity={v === 0 ? 0.5 : 0.85}
          />
        )
      })}
    </svg>
  )
}

/** A progress ring. At 0% it shows a full track and an empty arc, an honest zero. */
export function Ring({
  pct,
  size = 56,
  stroke = 6,
  tone = 'accent',
  label
}: {
  pct: number
  size?: number
  stroke?: number
  tone?: Tone
  label?: string
}): JSX.Element {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const dash = Math.max(0, Math.min(1, pct / 100)) * c
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <g style={{ transform: 'rotate(-90deg)', transformOrigin: `${size / 2}px ${size / 2}px` }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--edge-soft)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={TONE_STROKE[tone]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - dash}
          style={{ transition: 'stroke-dashoffset 420ms ease' }}
        />
      </g>
      {label && (
        <text
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="central"
          style={{ fontSize: size * 0.24, fill: 'var(--ink-90)', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}
        >
          {label}
        </text>
      )}
    </svg>
  )
}
