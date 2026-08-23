import { useEffect, useState } from 'react'
import type { FbNode, FocusSession } from '@shared/types'
import { isToday } from '../../lib/dashboardScope'
import { useFocusSessionStore } from '../../stores/focusSession'
import Icon from '../Icon'

interface Props {
  taskIds: Set<string>
  nodes: FbNode[]
}

function startOfDayMs(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function fmtMin(sec: number): string {
  const m = Math.round(sec / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r === 0 ? `${h}h` : `${h}h ${r}m`
}

// Today's focus stats — sessions completed, minutes focused, tasks done.
// Re-fetches whenever a focus session ends.
export default function StatsCard({ taskIds, nodes }: Props): JSX.Element {
  const activeSession = useFocusSessionStore((s) => s.active)
  const [sessions, setSessions] = useState<FocusSession[]>([])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const recent = await window.api.focus.recent(300, null)
      if (!cancelled) setSessions(recent)
    })()
    return () => {
      cancelled = true
    }
  }, [activeSession])

  const sessionsToday = sessions.filter(
    (s) =>
      s.completedAt != null &&
      s.completedAt >= startOfDayMs() &&
      (s.taskId == null || taskIds.has(s.taskId)) &&
      (s.outcome === 'done' || s.outcome === 'continued')
  )
  const sessionCount = sessionsToday.length
  const focusedSec = sessionsToday.reduce((sum, s) => sum + (s.actualSeconds ?? 0), 0)

  const tasksDoneToday = nodes.filter(
    (n) =>
      n.kind === 'task' &&
      n.status === 'done' &&
      n.completedAt != null &&
      isToday(n.completedAt) &&
      taskIds.has(n.id)
  ).length

  return (
    <div className="fb-card p-4">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-[var(--ink-50)] font-semibold mb-3">
        <Icon name="today" size={12} />
        <span>Today</span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Stat
          icon="bolt"
          label="sessions"
          value={String(sessionCount)}
          accent={sessionCount > 0}
        />
        <Stat
          icon="schedule"
          label="focused"
          value={focusedSec > 0 ? fmtMin(focusedSec) : '0m'}
          accent={focusedSec > 0}
        />
        <Stat
          icon="check_circle"
          label={tasksDoneToday === 1 ? 'done' : 'done'}
          value={String(tasksDoneToday)}
          accent={tasksDoneToday > 0}
        />
      </div>
    </div>
  )
}

function Stat({
  icon,
  label,
  value,
  accent
}: {
  icon: string
  label: string
  value: string
  accent: boolean
}): JSX.Element {
  return (
    <div className="flex flex-col items-center text-center">
      <Icon
        name={icon}
        size={16}
        className={`mb-1 ${accent ? 'text-accent' : 'text-[var(--ink-40)]'}`}
      />
      <div
        className={`text-xl font-semibold tabular-nums ${
          accent ? 'text-[var(--ink-100)]' : 'text-[var(--ink-40)]'
        }`}
      >
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-[var(--ink-50)] mt-0.5">
        {label}
      </div>
    </div>
  )
}
