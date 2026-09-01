import type { FbNode, RadarSuggestion, MailListItem, TimeBlock } from '@shared/types'

// The workspace radar: cheap, deterministic detectors (NO model call) over the
// user's REAL work in Plexii — tasks, inbound mail, and the calendar — surfaced as
// one-tap suggestions. Pure over (data, now) so each unit-tests exactly and
// re-runs freely. Nothing here is AI or fabricated — every suggestion points at a
// real item with a real reason.

const DAY = 86_400_000
const DUE_SOON_MS = 2 * DAY
const STALLED_MS = 5 * DAY
const MEETING_SOON_MS = 60 * 60 * 1000
const MAIL_RECENT_MS = 3 * DAY
const MAX_PER_SOURCE = 6

function relDaysAgo(now: number, ts: number): string {
  const d = Math.floor((now - ts) / DAY)
  if (d <= 0) return 'today'
  if (d === 1) return 'yesterday'
  return `${d} days ago`
}
function relDaysAhead(now: number, ts: number): string {
  const d = Math.ceil((ts - now) / DAY)
  if (d <= 0) return 'today'
  if (d === 1) return 'tomorrow'
  return `in ${d} days`
}
function relMinsAhead(now: number, ts: number): string {
  const m = Math.round((ts - now) / 60000)
  if (m <= 0) return 'now'
  if (m === 1) return 'in 1 minute'
  if (m < 60) return `in ${m} minutes`
  return 'within the hour'
}

// One suggestion per actionable task, most urgent reason wins (overdue >
// due-soon > stalled). Skips done/parked/archived and non-task nodes.
export function detectTaskRadar(tasks: FbNode[], now: number): RadarSuggestion[] {
  const out: RadarSuggestion[] = []
  for (const t of tasks) {
    if (t.kind !== 'task' || t.archived) continue
    if (t.status === 'done' || t.status === 'parked') continue
    const title = t.title?.trim() || 'Untitled task'
    const nav = { view: 'task' as const, taskId: t.id }
    if (typeof t.dueDate === 'number') {
      if (t.dueDate < now) {
        out.push({ id: `overdue:${t.id}`, kind: 'overdue', title: `"${title}" is overdue`, detail: `was due ${relDaysAgo(now, t.dueDate)}`, nav, severity: 'warn' })
        continue
      }
      if (t.dueDate < now + DUE_SOON_MS) {
        out.push({ id: `due_soon:${t.id}`, kind: 'due_soon', title: `"${title}" is due ${relDaysAhead(now, t.dueDate)}`, detail: 'coming up', nav, severity: 'info' })
        continue
      }
    }
    if (t.status === 'in_progress' && typeof t.startedAt === 'number' && now - t.startedAt > STALLED_MS) {
      out.push({ id: `stalled:${t.id}`, kind: 'stalled', title: `"${title}" has stalled`, detail: `in progress since ${relDaysAgo(now, t.startedAt)}, not finished`, nav, severity: 'info' })
    }
  }
  const rank: Record<string, number> = { overdue: 0, due_soon: 1, stalled: 2 }
  out.sort((a, b) => rank[a.kind] - rank[b.kind])
  return out.slice(0, MAX_PER_SOURCE)
}

// Unread mail from the last few days is a reply-needed candidate. Newest first.
export function detectMailRadar(messages: MailListItem[], now: number): RadarSuggestion[] {
  const out: RadarSuggestion[] = []
  for (const m of messages) {
    if (m.seen) continue
    if (now - m.date > MAIL_RECENT_MS) continue
    const from = m.fromName?.trim() || m.fromAddress || 'someone'
    const subject = m.subject?.trim() || '(no subject)'
    out.push({
      id: `reply_needed:${m.uid}`,
      kind: 'reply_needed',
      title: `Reply to ${from}`,
      detail: `"${subject.length > 80 ? subject.slice(0, 77) + '…' : subject}"`,
      nav: { view: 'mail', uid: m.uid },
      severity: 'info'
    })
  }
  out.sort((a, b) => b.id.localeCompare(a.id)) // higher uid ~ newer, first
  return out.slice(0, MAX_PER_SOURCE)
}

// Calendar blocks starting within the next hour (or just started). Soonest first.
export function detectCalendarRadar(blocks: TimeBlock[], now: number): RadarSuggestion[] {
  const out: RadarSuggestion[] = []
  for (const b of blocks) {
    const delta = b.startMs - now
    if (delta > MEETING_SOON_MS) continue
    // Skip ones already well over (started > 15 min ago).
    if (delta < -15 * 60000) continue
    const title = b.title?.trim() || 'Untitled'
    out.push({
      id: `meeting_soon:${b.id}`,
      kind: 'meeting_soon',
      title: `"${title}" starts ${relMinsAhead(now, b.startMs)}`,
      detail: 'on your calendar',
      nav: { view: 'calendar' },
      severity: 'warn'
    })
  }
  out.sort((a, b) => a.id.localeCompare(b.id))
  return out.slice(0, MAX_PER_SOURCE)
}
