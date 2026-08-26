import type { FbNode } from '@shared/types'

// Attention queue semantics (S6, SPEC-017/§2.3-F013). Pure and testable:
// grouping, ordering, and the per-class primary action. Everything derives
// from work_item_state / intent_class — NEVER from the legacy status
// projection (F013: 'open' is a compatibility value, not a "needs me" signal).

export const QUEUE_ORDER = [
  'action',
  'review',
  'scheduling',
  'acknowledgment',
  'discussion',
  'fyi',
  'loose_thought'
] as const

export const QUEUE_LABEL: Record<string, string> = {
  action: 'Tasks',
  review: 'Reviews',
  scheduling: 'Scheduling',
  acknowledgment: 'Acknowledgments',
  discussion: 'Discussions',
  fyi: 'FYI',
  loose_thought: 'Loose thoughts',
  direct: 'Messages'
}

export const QUEUE_ICON: Record<string, string> = {
  action: 'check_circle',
  review: 'rate_review',
  scheduling: 'event',
  acknowledgment: 'mark_email_read',
  discussion: 'forum',
  fyi: 'info',
  loose_thought: 'lightbulb',
  direct: 'chat'
}

const TERMINAL: ReadonlySet<string> = new Set([
  'acknowledged',
  'answered',
  'scheduled',
  'delivered',
  'reviewed',
  'completed',
  'discussed',
  'dismissed',
  'reclassified',
  'archived'
])

export function isTerminalState(state: string | null | undefined): boolean {
  return state != null && TERMINAL.has(state)
}

/** The class-appropriate closing verb: what "done" means per queue. */
export const PRIMARY_ACTION: Record<string, { state: string; label: string }> = {
  action: { state: 'completed', label: 'Done' },
  review: { state: 'reviewed', label: 'Reviewed' },
  scheduling: { state: 'scheduled', label: 'Scheduled' },
  acknowledgment: { state: 'acknowledged', label: 'Acknowledge' },
  discussion: { state: 'discussed', label: 'Discussed' },
  fyi: { state: 'acknowledged', label: 'Got it' },
  loose_thought: { state: 'dismissed', label: 'Let it go' },
  direct: { state: 'acknowledged', label: 'Acknowledge' }
}

/** Items needing the person, snooze-respecting, grouped by queue in the fixed
 *  order. Within a queue: overdue/soonest due first (nulls last), then newest. */
export function groupIntoQueues(
  items: FbNode[],
  nowMs: number
): Array<{ queue: string; label: string; items: FbNode[] }> {
  const active = items.filter(
    (i) =>
      !isTerminalState(i.workItemState) &&
      !(i.snoozeUntil != null && i.snoozeUntil > nowMs) &&
      i.detachedFromId == null
  )
  const byQueue = new Map<string, FbNode[]>()
  for (const i of active) {
    const q = i.intentClass ?? 'action'
    const list = byQueue.get(q) ?? []
    list.push(i)
    byQueue.set(q, list)
  }
  const out: Array<{ queue: string; label: string; items: FbNode[] }> = []
  const orderedKeys = [
    ...QUEUE_ORDER.filter((q) => byQueue.has(q)),
    ...[...byQueue.keys()].filter((q) => !(QUEUE_ORDER as readonly string[]).includes(q))
  ]
  for (const q of orderedKeys) {
    const list = byQueue.get(q)!
    list.sort((a, b) => rankScore(b, nowMs) - rankScore(a, nowMs) || b.createdAt - a.createdAt)
    out.push({ queue: q, label: QUEUE_LABEL[q] ?? q, items: list })
  }
  return out
}

/** The ranker v1 (SPEC-019, F006): item-level signals ONLY — deadline
 *  proximity dominates, item-inactivity staleness second (an untouched item
 *  needs the eye more than a fresh one), explicit-human-ask a light thumb.
 *  Scored against attentionPrecision() over time (workItems:precision). */
export function rankScore(i: FbNode, nowMs: number): number {
  let score = 0
  if (i.dueAt) {
    const ms = Date.parse(i.dueAt) - nowMs
    const days = ms / (24 * 60 * 60 * 1000)
    if (ms < 0) score += 100
    else if (days <= 1) score += 80
    else if (days <= 3) score += 60
    else if (days <= 7) score += 40
    else score += 10
  }
  const quietDays = (nowMs - i.updatedAt) / (24 * 60 * 60 * 1000)
  score += Math.min(20, Math.max(0, quietDays * 2))
  if (i.wiOrigin === 'human' && isActionableIntent(i.intentClass)) score += 5
  return score
}

function isActionableIntent(c: string | null | undefined): boolean {
  return c === 'action' || c === 'review' || c === 'scheduling'
}

/** The Detached shelf (F-M6/F-M7″): park-local items whose desk was purged or
 *  org-moved. Primary recovery is MOVE; they never mix into the queues. */
export function detachedItems(items: FbNode[]): FbNode[] {
  return items.filter((i) => i.detachedFromId != null && !isTerminalState(i.workItemState))
}

/** Alternate lenses over the same active set (SPEC-017 saved lenses, v1):
 *  by due day or by origin. Same visibility rules as the queue grouping. */
export function groupByDue(
  items: FbNode[],
  nowMs: number
): Array<{ queue: string; label: string; items: FbNode[] }> {
  const active = items.filter(
    (i) =>
      !isTerminalState(i.workItemState) &&
      !(i.snoozeUntil != null && i.snoozeUntil > nowMs) &&
      i.detachedFromId == null
  )
  const DAY = 24 * 60 * 60 * 1000
  const bucketOf = (i: FbNode): string => {
    if (!i.dueAt) return 'none'
    const days = (Date.parse(i.dueAt) - nowMs) / DAY
    if (days < 0) return 'overdue'
    if (days <= 1) return 'today'
    if (days <= 2) return 'tomorrow'
    if (days <= 7) return 'week'
    return 'later'
  }
  const LABELS: Record<string, string> = {
    overdue: 'Past due',
    today: 'Today',
    tomorrow: 'Tomorrow',
    week: 'This week',
    later: 'Later',
    none: 'No date'
  }
  const order = ['overdue', 'today', 'tomorrow', 'week', 'later', 'none']
  const byBucket = new Map<string, FbNode[]>()
  for (const i of active) {
    const b = bucketOf(i)
    byBucket.set(b, [...(byBucket.get(b) ?? []), i])
  }
  return order
    .filter((b) => byBucket.has(b))
    .map((b) => ({
      queue: b,
      label: LABELS[b],
      items: byBucket.get(b)!.sort((a, x) => rankScore(x, nowMs) - rankScore(a, nowMs))
    }))
}

export function groupByOrigin(
  items: FbNode[],
  nowMs: number
): Array<{ queue: string; label: string; items: FbNode[] }> {
  const active = items.filter(
    (i) =>
      !isTerminalState(i.workItemState) &&
      !(i.snoozeUntil != null && i.snoozeUntil > nowMs) &&
      i.detachedFromId == null
  )
  const LABELS: Record<string, string> = { human: 'You', ai: 'Plexii', system: 'System' }
  const order = ['human', 'ai', 'system']
  const byOrigin = new Map<string, FbNode[]>()
  for (const i of active) {
    const o = i.wiOrigin ?? 'human'
    byOrigin.set(o, [...(byOrigin.get(o) ?? []), i])
  }
  return order
    .filter((o) => byOrigin.has(o))
    .map((o) => ({
      queue: o,
      label: LABELS[o] ?? o,
      items: byOrigin.get(o)!.sort((a, x) => rankScore(x, nowMs) - rankScore(a, nowMs))
    }))
}

/** The closed shelf: loops finished in the window (dismissed/reclassified are
 *  not celebrations and stay out; the queues' own history covers them —
 *  archived is a shelf of its own, not a closure). */
export function recentlyClosed(items: FbNode[], nowMs: number, windowDays = 7): FbNode[] {
  const cutoff = nowMs - windowDays * 24 * 60 * 60 * 1000
  return items
    .filter(
      (i) =>
        isTerminalState(i.workItemState) &&
        i.workItemState !== 'dismissed' &&
        i.workItemState !== 'reclassified' &&
        i.workItemState !== 'archived' &&
        i.updatedAt > cutoff
    )
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

/** DEC-024 — the Archived shelf: kept, out of the way, no clock. Unarchive
 *  (state → open) is the recovery; nothing here ever nudges or decays. */
export function archivedItems(items: FbNode[]): FbNode[] {
  return items
    .filter((i) => i.workItemState === 'archived')
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

/** One plain-language reason per item (SPEC-018 v1): due proximity beats
 *  origin; reason_code (e.g. 'decayed') is honored when present. */
export function itemReason(i: FbNode, nowMs: number): string | null {
  if (i.reasonCode === 'decayed') return 'Faded out quietly'
  if (i.dueAt) {
    const ms = Date.parse(i.dueAt) - nowMs
    const days = Math.ceil(ms / (24 * 60 * 60 * 1000))
    if (ms < 0) return 'Past due'
    if (days <= 1) return 'Due today'
    if (days === 2) return 'Due tomorrow'
    if (days <= 7) return `Due in ${days} days`
    return null
  }
  if (i.wiOrigin === 'ai') return 'Suggested by Plexii'
  return null
}
