import { useEffect, useState } from 'react'
import Icon from '../../Icon'
import type { ActivityEvent } from '@shared/types'
import { activityIcon, summarizeActivity, relTimeShort } from '../../../lib/activityFormat'
import { useNodeStore } from '../../../stores/nodes'
import { useViewStore } from '../../../stores/view'

// Assistant → Activity tab (spec §5.3). The real workspace activity log
// (window.api.trail.recent), formatted via the shared activityFormat helper so it
// can't drift from the Home dashboard's activity card. Each row with a source desk
// opens it. Honest loading / empty states; nothing invented.

export default function AssistantActivityTab(): JSX.Element {
  const [events, setEvents] = useState<ActivityEvent[] | null>(null)
  const setActive = useNodeStore((s) => s.setActive)
  const goTask = useViewStore((s) => s.goTask)

  useEffect(() => {
    let alive = true
    window.api.trail
      .recent(null, Date.now() - 7 * 86_400_000, 60)
      .then((r) => alive && setEvents(r))
      .catch(() => alive && setEvents([]))
    return () => {
      alive = false
    }
  }, [])

  const now = Date.now()

  return (
    <div className="h-full overflow-y-auto px-3 py-3" data-testid="assistant-tab-activity">
      {events === null ? (
        <div className="py-10 text-center text-[12.5px] text-[var(--ink-40)]">Loading recent activity…</div>
      ) : events.length === 0 ? (
        <div className="py-10 text-center text-[12.5px] text-[var(--ink-50)]">
          No recent activity yet. As you work, it shows up here.
        </div>
      ) : (
        <ul className="space-y-0.5">
          {events.map((e) => {
            const clickable = !!e.taskId
            return (
              <li key={e.id}>
                <button
                  disabled={!clickable}
                  onClick={() => {
                    if (!e.taskId) return
                    setActive(e.taskId)
                    goTask(e.taskId)
                  }}
                  data-testid={`assistant-activity-${e.id}`}
                  className={`w-full flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left ${
                    clickable ? 'hover:bg-[var(--surface-sunken)]' : 'cursor-default'
                  }`}
                >
                  <Icon name={activityIcon(e.kind)} size={14} className="text-[var(--ink-40)] shrink-0" />
                  <span className="flex-1 truncate text-[12px] text-[var(--ink-90)]">{summarizeActivity(e)}</span>
                  <span className="shrink-0 text-[11px] text-[var(--ink-50)] fb-tabular">{relTimeShort(e.ts, now)}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
