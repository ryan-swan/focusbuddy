import { useEffect, useState } from 'react'
import type { FocusSession } from '@shared/types'
import { buildGarden, summarize } from '../../lib/habitGarden'
import { useFocusSessionStore } from '../../stores/focusSession'
import Icon from '../Icon'

interface Props {
  taskIds: Set<string>
}

function fmtMin(sec: number): string {
  const m = Math.round(sec / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r === 0 ? `${h}h` : `${h}h ${r}m`
}

// Habit garden card — same 30-day grid as the inline strip, but rendered inline
// inside the dashboard. Respects scope: filters sessions to tasks in scope.
export default function HabitGardenCard({ taskIds }: Props): JSX.Element {
  const activeSession = useFocusSessionStore((s) => s.active)
  const [sessions, setSessions] = useState<FocusSession[]>([])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const recent = await window.api.focus.recent(900, null)
      if (!cancelled) setSessions(recent)
    })()
    return () => {
      cancelled = true
    }
  }, [activeSession])

  const scoped = sessions.filter(
    (s) => s.taskId == null || taskIds.has(s.taskId)
  )
  const buckets = buildGarden(scoped, 30)
  const summary = summarize(buckets)

  return (
    <div className="fb-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-[var(--ink-50)] font-semibold">
          <Icon name="local_florist" size={12} className="text-emerald-600 dark:text-emerald-500" />
          <span>30-day garden</span>
        </div>
        <span className="text-[10px] text-[var(--ink-50)] font-mono">
          {summary.daysWithActivity}/30 days
        </span>
      </div>
      <div className="grid grid-cols-10 gap-1.5 mb-3">
        {buckets.map((b) => {
          const empty = b.sessionCount === 0
          const intensity =
            b.sessionCount <= 0
              ? 0
              : b.sessionCount >= 4
                ? 1
                : 0.35 + (b.sessionCount - 1) * 0.22
          return (
            <span
              key={b.dateKey}
              title={`${b.date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} — ${
                empty ? 'no sessions' : `${b.sessionCount} session${b.sessionCount === 1 ? '' : 's'}, ${fmtMin(b.totalSeconds)}`
              }`}
              style={{
                aspectRatio: '1',
                borderRadius: '4px',
                backgroundColor: empty
                  ? 'rgb(229 229 228 / 0.5)'
                  : `rgb(var(--accent) / ${0.3 + intensity * 0.6})`,
                outline: b.isToday ? '1.5px solid rgb(var(--accent))' : 'none',
                outlineOffset: '1px'
              }}
            />
          )
        })}
      </div>
      <p className="text-[10px] text-[var(--ink-50)] leading-snug text-center">
        No streak to break. Gaps are fine — the bloom stays.
      </p>
    </div>
  )
}
