import type { ActivityEvent, ActivityKind } from '@shared/types'

// Shared, honest formatting for the workspace activity log so the Home dashboard
// and the assistant's Activity tab can't drift when ActivityKind changes. Reads
// only the real recorded payload — never asserts a person or action that isn't
// logged.

export const ACTIVITY_ICON: Record<ActivityKind, string> = {
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

export function activityIcon(kind: ActivityKind): string {
  return ACTIVITY_ICON[kind] ?? 'circle'
}

export function summarizeActivity(e: ActivityEvent): string {
  const p = e.payload as Record<string, unknown>
  const truncate = (v: unknown, n: number): string => {
    const s = typeof v === 'string' ? v : v == null ? '' : JSON.stringify(v)
    return s.length > n ? s.slice(0, n) + '…' : s
  }
  switch (e.kind) {
    case 'task_switched':
      return `Opened ${truncate(p.toTitle, 40) || 'a desk'}`
    case 'widget_added':
      return `Added ${truncate(p.kind, 20) || 'a tool'}${p.title ? ` "${truncate(p.title, 28)}"` : ''}`
    case 'widget_focused':
      return `Focused ${truncate(p.kind, 20) || 'a tool'}`
    case 'widget_removed':
      return `Removed ${truncate(p.kind, 20) || 'a tool'}`
    case 'browser_nav':
      return `Visited ${truncate(p.title || p.host || p.url, 46) || 'a page'}`
    case 'note_edit':
      return 'Edited a note'
    case 'chat_sent':
      return 'Asked the assistant a question'
    case 'session_started':
      return 'Started a focus session'
    case 'session_ended':
      return `${truncate(p.outcome, 16) || 'Ended'} a focus session`
    case 'ai_setup_run':
      return 'Ran AI setup'
    case 'resume_generated':
      return 'Generated a recap'
    default:
      return 'Activity'
  }
}

export function relTimeShort(ms: number, nowMs: number): string {
  const diff = nowMs - ms
  const m = Math.round(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const hrs = Math.round(m / 60)
  if (hrs < 24) return `${hrs}h ago`
  const d = Math.round(hrs / 24)
  if (d < 7) return `${d}d ago`
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
