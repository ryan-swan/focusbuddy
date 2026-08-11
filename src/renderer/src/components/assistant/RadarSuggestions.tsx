import { useEffect } from 'react'
import Icon from '../Icon'
import { useRadar } from '../../stores/radar'
import { useViewStore } from '../../stores/view'
import { goToTarget } from '../../lib/goToTarget'
import type { RadarKind } from '@shared/types'

const ICON: Record<RadarKind, string> = {
  overdue: 'schedule',
  due_soon: 'upcoming',
  stalled: 'hourglass_empty',
  reply_needed: 'mail',
  meeting_soon: 'event'
}

// The proactive surface: one-tap suggestions the workspace radar found (overdue /
// due-soon / stalled tasks). Deterministic and honest — each points at a real
// task. Acting on one navigates to it and records the accept (learned-autonomy
// signal); dismiss clears it for the session. Renders nothing when all clear.

export default function RadarSuggestions(): JSX.Element | null {
  const suggestions = useRadar((s) => s.suggestions)
  const refresh = useRadar((s) => s.refresh)
  const dismiss = useRadar((s) => s.dismiss)
  const accept = useRadar((s) => s.accept)

  useEffect(() => {
    refresh()
    // Cheap + deterministic, so a light poll keeps it current without cost.
    const t = window.setInterval(refresh, 120_000)
    return () => window.clearInterval(t)
  }, [refresh])

  if (suggestions.length === 0) return null

  return (
    <div className="flex flex-col gap-1.5" data-testid="radar-suggestions">
      <div className="text-[11px] uppercase tracking-wider text-[var(--ink-50)]">Worth a look</div>
      {suggestions.map((s) => (
        <div
          key={s.id}
          className="flex items-start gap-2 rounded-md border border-[var(--edge-soft)] bg-[var(--surface-raised)] px-2.5 py-1.5"
          data-testid={`radar-${s.id}`}
        >
          <Icon
            name={ICON[s.kind]}
            size={14}
            className={`mt-0.5 shrink-0 ${s.severity === 'warn' ? 'text-amber-600 dark:text-amber-400' : 'text-[var(--ink-50)]'}`}
          />
          <div className="min-w-0 flex-1">
            <div className="text-[12px] text-[var(--ink-90)] leading-snug truncate">{s.title}</div>
            <div className="text-[10px] text-[var(--ink-50)]">{s.detail}</div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => {
                accept(s)
                if (s.nav.view === 'task') void goToTarget({ kind: 'task', id: s.nav.taskId, label: '' })
                else if (s.nav.view === 'mail') useViewStore.getState().goMail()
                else useViewStore.getState().goCalendar()
              }}
              className="text-[11px] px-2 py-0.5 rounded-md text-accent hover:bg-[var(--surface-sunken)]"
              data-testid={`radar-open-${s.id}`}
            >
              Open
            </button>
            <button
              onClick={() => dismiss(s.id)}
              title="Dismiss"
              className="text-[var(--ink-40)] hover:text-[var(--ink-70)]"
            >
              <Icon name="close" size={12} />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
