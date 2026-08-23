import { useEffect, useMemo, useState } from 'react'
import type { FbNode, FocusSession } from '@shared/types'
import { useFocusSessionStore } from '../../stores/focusSession'
import Icon from '../Icon'

interface Props {
  taskIds: Set<string>
  nodes: FbNode[]
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

function startOfWeekAgoMs(weeksBack: number): number {
  const now = new Date()
  // Roll to start of today first so the bucket boundary is stable across the day.
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return day - weeksBack * WEEK_MS
}

function fmtHrs(sec: number): string {
  const m = Math.round(sec / 60)
  if (m < 60) return `${m}m`
  const h = m / 60
  return h >= 10 ? `${Math.round(h)}h` : `${h.toFixed(1)}h`
}

// Workspace Progress — the "are we moving forward?" card.
//
// Shows the share of active tasks completed THIS WEEK, with delta vs last
// week and a focus-time headline. Pure local computation — no AI, no
// server, no extra IPC beyond the focus.recent call we'd already do for
// StatsCard. Renders an SVG progress ring (no canvas, no dependency).
export default function WorkspaceProgressCard({
  taskIds,
  nodes
}: Props): JSX.Element {
  const activeSession = useFocusSessionStore((s) => s.active)
  const [sessions, setSessions] = useState<FocusSession[]>([])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      // 1500 sessions over the last fortnight covers any plausible focus
      // workload — well above the volume where this card would even be
      // useful. Limit caps the IPC payload.
      const recent = await window.api.focus.recent(1500, null)
      if (!cancelled) setSessions(recent)
    })()
    return () => {
      cancelled = true
    }
  }, [activeSession])

  const stats = useMemo(() => {
    const thisWeekStart = startOfWeekAgoMs(0) // start of THIS week's bucket = 7 days ago floor
    // We treat "week" as a rolling 7-day window so the chart feels alive
    // every day, not just on Mondays. Last week = 14d..7d ago.
    const thisWeekFloor = Date.now() - WEEK_MS
    const lastWeekFloor = Date.now() - 2 * WEEK_MS
    void thisWeekStart

    let activeInScope = 0
    let doneThisWeek = 0
    let doneLastWeek = 0
    for (const n of nodes) {
      if (n.kind !== 'task') continue
      if (!taskIds.has(n.id)) continue
      if (n.archived) continue
      if (n.status !== 'done') {
        activeInScope++
        continue
      }
      const c = n.completedAt
      if (c == null) continue
      if (c >= thisWeekFloor) doneThisWeek++
      else if (c >= lastWeekFloor) doneLastWeek++
    }
    const denominator = activeInScope + doneThisWeek // share of work that's CURRENTLY moving
    const pct = denominator === 0 ? 0 : Math.round((doneThisWeek / denominator) * 100)
    const delta = doneThisWeek - doneLastWeek

    let focusedSec = 0
    for (const s of sessions) {
      if (s.completedAt == null || s.completedAt < thisWeekFloor) continue
      if (s.taskId != null && !taskIds.has(s.taskId)) continue
      if (s.outcome !== 'done' && s.outcome !== 'continued') continue
      focusedSec += s.actualSeconds ?? 0
    }
    return { activeInScope, doneThisWeek, doneLastWeek, pct, delta, focusedSec }
  }, [nodes, taskIds, sessions])

  // Ring geometry — 64 radius, 8 stroke, 144 viewBox keeps the center
  // glyph readable while the ring stays chunky enough for small dashboards.
  const RADIUS = 64
  const STROKE = 8
  const C = 2 * Math.PI * RADIUS
  const dash = (stats.pct / 100) * C

  return (
    <div className="fb-card p-4 fb-glass-soft">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-[var(--ink-50)] font-semibold mb-3">
        <Icon name="trending_up" size={12} />
        <span>This week</span>
      </div>
      <div className="flex items-center gap-5">
        <div className="relative shrink-0">
          <svg width={144} height={144} viewBox="0 0 144 144" className="-rotate-90">
            <circle
              cx={72}
              cy={72}
              r={RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth={STROKE}
              className="text-[var(--ink-30)]"
            />
            <circle
              cx={72}
              cy={72}
              r={RADIUS}
              fill="none"
              stroke="rgb(var(--accent))"
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={C}
              className="fb-ring-grow"
              style={
                {
                  transition: 'stroke-dashoffset 420ms ease-out',
                  strokeDashoffset: C - dash,
                  '--ring-circumference': C
                } as React.CSSProperties
              }
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-2xl font-semibold text-[var(--ink-100)] tabular-nums leading-none">
              {stats.pct}%
            </div>
            <div className="text-[9px] uppercase tracking-wider text-[var(--ink-50)] mt-1">
              complete
            </div>
          </div>
        </div>
        <div className="flex-1 grid grid-cols-2 gap-3 min-w-0">
          <Stat
            icon="task_alt"
            label="closed this week"
            value={String(stats.doneThisWeek)}
            sub={
              stats.delta === 0
                ? 'flat vs last week'
                : stats.delta > 0
                  ? `+${stats.delta} vs last week`
                  : `${stats.delta} vs last week`
            }
            tone={stats.delta >= 0 ? 'positive' : 'neutral'}
          />
          <Stat
            icon="pending_actions"
            label="still open"
            value={String(stats.activeInScope)}
            sub={
              stats.activeInScope === 0
                ? 'all caught up'
                : stats.activeInScope > 12
                  ? 'consider parking a few'
                  : 'manageable'
            }
            tone={stats.activeInScope > 20 ? 'warn' : 'neutral'}
          />
          <Stat
            icon="schedule"
            label="focused"
            value={fmtHrs(stats.focusedSec)}
            sub={stats.focusedSec > 0 ? 'this week' : 'no sessions yet'}
            tone={stats.focusedSec > 3600 ? 'positive' : 'neutral'}
          />
          <Stat
            icon="bolt"
            label="momentum"
            value={
              stats.doneThisWeek === 0
                ? '–'
                : stats.delta >= 0
                  ? 'rising'
                  : 'cooling'
            }
            sub={
              stats.doneThisWeek === 0
                ? 'pick one and ship it'
                : stats.delta >= 0
                  ? 'keep going'
                  : 'shorter sessions help'
            }
            tone={
              stats.doneThisWeek === 0
                ? 'neutral'
                : stats.delta >= 0
                  ? 'positive'
                  : 'warn'
            }
          />
        </div>
      </div>
    </div>
  )
}

function Stat({
  icon,
  label,
  value,
  sub,
  tone
}: {
  icon: string
  label: string
  value: string
  sub: string
  tone: 'positive' | 'neutral' | 'warn'
}): JSX.Element {
  const valueCls =
    tone === 'positive'
      ? 'text-[var(--ink-100)]'
      : tone === 'warn'
        ? 'text-amber-700 dark:text-amber-400'
        : 'text-[var(--ink-70)]'
  const iconCls =
    tone === 'positive'
      ? 'text-accent'
      : tone === 'warn'
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-[var(--ink-40)]'
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-[var(--ink-50)]">
        <Icon name={icon} size={11} className={iconCls} />
        <span className="truncate">{label}</span>
      </div>
      <div className={`text-lg font-semibold tabular-nums leading-tight mt-0.5 ${valueCls}`}>
        {value}
      </div>
      <div className="text-[10px] text-[var(--ink-50)] truncate">{sub}</div>
    </div>
  )
}
