import { useEffect, useState } from 'react'
import type { ActivityEvent, ActivityKind } from '@shared/types'
import { useFocusSessionStore } from '../../stores/focusSession'
import Icon from '../Icon'

interface Props {
  taskIds: Set<string>
}

const KIND_ICON: Record<ActivityKind, string> = {
  task_switched: 'swap_horiz',
  widget_added: 'add_circle',
  widget_focused: 'visibility',
  widget_removed: 'remove_circle',
  browser_nav: 'public',
  note_edit: 'edit_note',
  chat_sent: 'forum',
  session_started: 'bolt',
  session_ended: 'check_circle',
  ai_setup_run: 'auto_awesome',
  resume_generated: 'description'
}

function relTime(ts: number): string {
  const ms = Date.now() - ts
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function summarize(e: ActivityEvent): string {
  const p = e.payload as Record<string, unknown>
  const truncate = (v: unknown, n: number): string => {
    const s = typeof v === 'string' ? v : v == null ? '' : JSON.stringify(v)
    return s.length > n ? s.slice(0, n) + '…' : s
  }
  switch (e.kind) {
    case 'task_switched':
      return `Opened "${truncate(p.toTitle, 40)}"`
    case 'widget_added':
      return `Added ${p.kind ?? 'widget'} ${p.title ? `"${truncate(p.title, 30)}"` : ''}`.trim()
    case 'browser_nav':
      return `Visited ${truncate(p.title || p.host || p.url, 50)}`
    case 'note_edit':
      return `Edited ${p.kind ?? 'note'}: "${truncate(p.preview, 40)}"`
    case 'chat_sent':
      return `Asked "${truncate(p.preview, 50)}"`
    case 'session_started':
      return `Started ${p.plannedSeconds ? Math.round((p.plannedSeconds as number) / 60) + '-min' : ''} session`
    case 'session_ended':
      return `${p.outcome ?? 'Ended'} session (${p.actualSeconds ? Math.round((p.actualSeconds as number) / 60) + 'm' : '0m'})`
    case 'widget_focused':
      return `Focused ${p.kind ?? 'widget'} "${truncate(p.title, 30)}"`
    case 'widget_removed':
      return `Removed ${p.kind ?? 'widget'}`
    case 'ai_setup_run':
      return `AI Setup ran (${p.count ?? '?'} suggestions)`
    case 'resume_generated':
      return 'Generated resume document'
    default:
      return e.kind
  }
}

const MAX_ROWS = 12

export default function RecentActivityCard({ taskIds }: Props): JSX.Element {
  const activeSession = useFocusSessionStore((s) => s.active)
  const [events, setEvents] = useState<ActivityEvent[]>([])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      // Last 24h, up to 150 events
      const since = Date.now() - 24 * 60 * 60 * 1000
      const recent = await window.api.trail.recent(null, since, 150)
      if (!cancelled) setEvents(recent)
    })()
    return () => {
      cancelled = true
    }
  }, [activeSession])

  // Filter to scope — keep events that have no task (e.g. session started without a task)
  // or whose taskId is in scope
  const scoped = events
    .filter((e) => e.taskId == null || taskIds.has(e.taskId))
    .slice(0, MAX_ROWS)

  return (
    <div className="fb-card">
      <div className="px-4 pt-4 pb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-[var(--ink-50)] font-semibold">
        <Icon name="history" size={12} />
        <span>Recent activity</span>
      </div>
      {scoped.length === 0 ? (
        <div className="px-4 pb-4 text-xs text-[var(--ink-50)] text-center italic">
          Nothing tracked yet. Activity shows up as you open tasks, browse, and run sessions.
        </div>
      ) : (
        <ul className="divide-y divide-[var(--edge-soft)]">
          {scoped.map((e) => (
            <li
              key={e.id}
              className="px-4 py-2 flex items-center gap-2 text-xs text-[var(--ink-70)]"
            >
              <Icon
                name={KIND_ICON[e.kind] ?? 'circle'}
                size={13}
                className="text-[var(--ink-40)] shrink-0"
              />
              <span className="flex-1 truncate">{summarize(e)}</span>
              <span className="text-[10px] text-[var(--ink-40)] font-mono shrink-0">
                {relTime(e.ts)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
