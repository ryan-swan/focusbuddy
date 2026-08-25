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
  'reclassified'
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
    list.sort((a, b) => {
      const da = a.dueAt ? Date.parse(a.dueAt) : Number.POSITIVE_INFINITY
      const db = b.dueAt ? Date.parse(b.dueAt) : Number.POSITIVE_INFINITY
      if (da !== db) return da - db
      return b.createdAt - a.createdAt
    })
    out.push({ queue: q, label: QUEUE_LABEL[q] ?? q, items: list })
  }
  return out
}

/** The Detached shelf (F-M6/F-M7″): park-local items whose desk was purged or
 *  org-moved. Primary recovery is MOVE; they never mix into the queues. */
export function detachedItems(items: FbNode[]): FbNode[] {
  return items.filter((i) => i.detachedFromId != null && !isTerminalState(i.workItemState))
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
