import type { FbNode, RadarSuggestion } from '@shared/types'

// The workspace radar: cheap, deterministic detectors (NO model call) that surface
// actionable situations as one-tap suggestions. Pure over (tasks, now) so it
// unit-tests exactly and re-runs freely on a timer or on demand. Nothing here is
// AI or fabricated — every suggestion points at a real task with a real reason.

const DAY = 86_400_000
const DUE_SOON_MS = 2 * DAY
const STALLED_MS = 5 * DAY
const MAX_SUGGESTIONS = 8

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

// One suggestion per actionable task, most urgent reason wins (overdue >
// due-soon > stalled). Skips done/parked/archived and non-task nodes. Sorted
// overdue-first and capped so the surface stays scannable.
export function detectTaskRadar(tasks: FbNode[], now: number): RadarSuggestion[] {
  const out: RadarSuggestion[] = []
  for (const t of tasks) {
    if (t.kind !== 'task' || t.archived) continue
    if (t.status === 'done' || t.status === 'parked') continue
    const title = t.title?.trim() || 'Untitled task'
    if (typeof t.dueDate === 'number') {
      if (t.dueDate < now) {
        out.push({ id: `overdue:${t.id}`, kind: 'overdue', title: `"${title}" is overdue`, detail: `was due ${relDaysAgo(now, t.dueDate)}`, taskId: t.id, severity: 'warn' })
        continue
      }
      if (t.dueDate < now + DUE_SOON_MS) {
        out.push({ id: `due_soon:${t.id}`, kind: 'due_soon', title: `"${title}" is due ${relDaysAhead(now, t.dueDate)}`, detail: 'coming up', taskId: t.id, severity: 'info' })
        continue
      }
    }
    if (t.status === 'in_progress' && typeof t.startedAt === 'number' && now - t.startedAt > STALLED_MS) {
      out.push({ id: `stalled:${t.id}`, kind: 'stalled', title: `"${title}" has stalled`, detail: `in progress since ${relDaysAgo(now, t.startedAt)}, no completion yet`, taskId: t.id, severity: 'info' })
    }
  }
  const rank: Record<RadarSuggestion['kind'], number> = { overdue: 0, due_soon: 1, stalled: 2 }
  out.sort((a, b) => rank[a.kind] - rank[b.kind])
  return out.slice(0, MAX_SUGGESTIONS)
}
