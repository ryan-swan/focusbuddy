import type { FbNode, TimeBlock } from '@shared/types'
import { rankScore, isTerminalState } from './attentionQueues'

// DEC-052 (Track B) — the planner. Pure functions over (items, blocks,
// settings, now): every placement decision is unit-tested, and the UI stays a
// thin previewer. Nothing in this module writes — the CALLER creates blocks,
// and only after the person confirms the preview (DEC-052 #5: both AI modes
// are preview-first; the human is always in the loop).
//
// The conventions this encodes, from Analysis 24 §5c/§5d:
// - waiting/blocked items are NEVER scheduled (a plan containing work you
//   cannot do is a fiction — the over-optimism retention killer).
// - a daily planned-minutes ceiling, on by default (Sunsama's ~5.5h is the
//   only shipped calibration in the category).
// - slack between blocks and a max session length, on by default.
// - replan NEVER moves anything: a missed block stays as the honest record
//   (status 'missed'), and the ITEM gets a fresh proposal. Locked, manual,
//   done and meeting blocks are untouchable by construction.
// - a one-hour grace period before a passed block counts as missed
//   (finishing at 5:04 is not a failure).

export interface PlannerSettings {
  /** Working window, minutes from midnight. */
  dayStartMin: number
  dayEndMin: number
  /** Default proposal length. */
  defaultBlockMin: number
  /** Never propose a single sitting longer than this. */
  maxSessionMin: number
  /** Breathing room enforced after each proposed block. */
  gapMin: number
  /** Ceiling on TOTAL planned minutes in a day (existing blocks count). */
  maxDailyPlannedMin: number
}

export const DEFAULT_PLANNER_SETTINGS: PlannerSettings = {
  dayStartMin: 9 * 60,
  dayEndMin: 17 * 60,
  defaultBlockMin: 30,
  maxSessionMin: 90,
  gapMin: 10,
  maxDailyPlannedMin: 330
}

const SETTINGS_KEY = 'planner.settings'

export function loadPlannerSettings(): PlannerSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return { ...DEFAULT_PLANNER_SETTINGS }
    const parsed = JSON.parse(raw) as Partial<PlannerSettings>
    return { ...DEFAULT_PLANNER_SETTINGS, ...parsed }
  } catch {
    return { ...DEFAULT_PLANNER_SETTINGS }
  }
}

export function savePlannerSettings(s: PlannerSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
}

const MIN = 60_000
const DAY = 24 * 60 * MIN
/** Grace before a passed planned block counts as missed. */
export const MISSED_GRACE_MS = 60 * MIN
/** Don't bother proposing into a sliver shorter than this. */
const MIN_USEFUL_MIN = 15

export interface PlannedProposal {
  itemId: string
  title: string
  startMs: number
  durationMin: number
  reason: string
}

export interface FreeSlot {
  startMs: number
  endMs: number
}

/** Blocks that OCCUPY time for planning purposes: anything real on the day
 *  that has not been written off. Missed/skipped slots are history, not
 *  commitments — their time is reusable. */
const occupies = (b: TimeBlock): boolean => b.status === 'planned' || b.status === 'done'

/**
 * The open stretches of a working day, after existing commitments and the
 * clock. `nowMs` floors the first slot — the planner never proposes into the
 * past.
 */
export function freeSlots(
  blocks: TimeBlock[],
  dayMs: number,
  settings: PlannerSettings,
  nowMs: number
): FreeSlot[] {
  const windowStart = Math.max(dayMs + settings.dayStartMin * MIN, nowMs)
  const windowEnd = dayMs + settings.dayEndMin * MIN
  if (windowStart >= windowEnd) return []
  const busy = blocks
    .filter(occupies)
    .map((b) => ({ start: b.startMs, end: b.startMs + b.durationMin * MIN }))
    .filter((b) => b.start < windowEnd && b.end > windowStart)
    .sort((a, b) => a.start - b.start)
  const slots: FreeSlot[] = []
  let cursor = windowStart
  for (const b of busy) {
    if (b.start > cursor) slots.push({ startMs: cursor, endMs: Math.min(b.start, windowEnd) })
    cursor = Math.max(cursor, b.end)
    if (cursor >= windowEnd) break
  }
  if (cursor < windowEnd) slots.push({ startMs: cursor, endMs: windowEnd })
  return slots.filter((s) => s.endMs - s.startMs >= MIN_USEFUL_MIN * MIN)
}

/** Items the planner may honestly place: active, present, and DOABLE.
 *  waiting/blocked/suggested are excluded by principle, not preference. */
export function schedulableItems(items: FbNode[], nowMs: number): FbNode[] {
  return items.filter(
    (i) =>
      !isTerminalState(i.workItemState) &&
      i.detachedFromId == null &&
      !(i.snoozeUntil != null && i.snoozeUntil > nowMs) &&
      !['waiting', 'blocked', 'suggested'].includes(i.workItemState ?? '')
  )
}

/** DEC-052 momentum: closures per DESK over the trailing 3 days — "riding a
 *  streak beats context-switching to something equally urgent" (operator).
 *  Derived from updatedAt on terminal items; no event log pretended. */
export function momentumByDesk(items: FbNode[], nowMs: number): Map<string, number> {
  const m = new Map<string, number>()
  for (const i of items) {
    if (!i.parentId || !isTerminalState(i.workItemState)) continue
    if (i.workItemState === 'dismissed' || i.workItemState === 'archived') continue
    if (nowMs - i.updatedAt > 3 * DAY) continue
    m.set(i.parentId, (m.get(i.parentId) ?? 0) + 1)
  }
  return m
}

export interface PlanDayOptions {
  /** Restrict + prioritise: when set (the intent-driven mode), only these
   *  items are considered, in this order, ahead of the ranker. */
  onlyItemIds?: string[]
  /** Item ids that already have a future block — skipped (drag placed them). */
  placedIds?: Set<string>
  /** Desk titles for human-readable momentum reasons. */
  deskTitles?: Map<string, string>
  /** Why this run exists — colours the reason FALLBACK only (an item's own
   *  facts still outrank it): 'intent' = the person described the day and
   *  planSelect picked the pool; 'replan' = missed blocks being re-proposed.
   *  Both callers pass onlyItemIds, so the mode cannot be inferred from it. */
  source?: 'intent' | 'replan'
}

/**
 * Propose blocks for one day. Deterministic, ordered by the SAME ranker the
 * queues use (one ranker — Analysis 24 §4) plus the momentum boost, packed
 * into the day's free slots with gaps, capped by the daily ceiling.
 */
export function planDay(
  items: FbNode[],
  blocks: TimeBlock[],
  settings: PlannerSettings,
  dayMs: number,
  nowMs: number,
  opts: PlanDayOptions = {}
): PlannedProposal[] {
  const placed = opts.placedIds ?? new Set()
  let pool = schedulableItems(items, nowMs).filter((i) => !placed.has(i.id))
  if (opts.onlyItemIds) {
    const order = new Map(opts.onlyItemIds.map((id, k) => [id, k]))
    pool = pool.filter((i) => order.has(i.id))
    pool.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
  } else {
    const momentum = momentumByDesk(items, nowMs)
    pool = [...pool].sort(
      (a, b) =>
        rankScore(b, nowMs) +
        (momentum.get(b.parentId ?? '') ?? 0) * 1.5 -
        (rankScore(a, nowMs) + (momentum.get(a.parentId ?? '') ?? 0) * 1.5)
    )
  }

  // The ceiling counts what the day ALREADY holds.
  const dayEnd = dayMs + DAY
  const existingMin = blocks
    .filter(occupies)
    .filter((b) => b.startMs < dayEnd && b.startMs + b.durationMin * MIN > dayMs)
    .reduce((n, b) => n + b.durationMin, 0)
  let budgetMin = Math.max(0, settings.maxDailyPlannedMin - existingMin)

  const momentum = momentumByDesk(items, nowMs)
  const slots = freeSlots(blocks, dayMs, settings, nowMs)
  const out: PlannedProposal[] = []
  let slotIdx = 0
  let cursor = slots.length ? slots[0].startMs : 0

  // Reason context (DEC-072): who else has a claim on this day. Computed over
  // ALL schedulable items (not just the pool) so drag-placed due items still
  // count as "handled" rather than vanishing from the sentence.
  const dueByDayEnd = new Set(
    schedulableItems(items, nowMs)
      .filter((i) => i.dueAt != null && Date.parse(i.dueAt) < dayMs + DAY)
      .map((i) => i.id)
  )
  const dayWord = wordForDay(dayMs, nowMs)
  const proposedIds = new Set<string>()

  for (const item of pool) {
    if (budgetMin < MIN_USEFUL_MIN) break
    // Find room for at least a useful sitting.
    let durMin = Math.min(settings.defaultBlockMin, settings.maxSessionMin, budgetMin)
    while (slotIdx < slots.length) {
      const slot = slots[slotIdx]
      const start = Math.max(cursor, slot.startMs)
      const roomMin = Math.floor((slot.endMs - start) / MIN)
      if (roomMin >= MIN_USEFUL_MIN) {
        durMin = Math.min(durMin, roomMin)
        const othersDue = [...dueByDayEnd].filter((id) => id !== item.id)
        out.push({
          itemId: item.id,
          title: item.title,
          startMs: start,
          durationMin: durMin,
          reason: reasonFor(item, nowMs, momentum, opts.deskTitles, {
            source: opts.source,
            dayWord,
            anyOthersDue: othersDue.length > 0,
            othersDueHandled: othersDue.every((id) => placed.has(id) || proposedIds.has(id))
          })
        })
        proposedIds.add(item.id)
        budgetMin -= durMin
        cursor = start + (durMin + settings.gapMin) * MIN
        break
      }
      slotIdx++
      cursor = slotIdx < slots.length ? slots[slotIdx].startMs : 0
    }
    if (slotIdx >= slots.length) break
  }
  return out
}

/** 'today' / 'tomorrow' / the weekday name, for reasons about the planned day. */
function wordForDay(dayMs: number, nowMs: number): string {
  const d = new Date(dayMs)
  if (d.toDateString() === new Date(nowMs).toDateString()) return 'today'
  if (d.toDateString() === new Date(nowMs + DAY).toDateString()) return 'tomorrow'
  return d.toLocaleDateString(undefined, { weekday: 'long' })
}

interface ReasonContext {
  source?: 'intent' | 'replan'
  dayWord: string
  /** Another schedulable item is due by the end of the planned day. */
  anyOthersDue: boolean
  /** …and every one of them already has a block (dragged or proposed). */
  othersDueHandled: boolean
}

// DEC-072 — the reason a block exists, stated as the item's strongest
// CHECKABLE fact, strongest first: deadline → the person's own urgency call →
// desk momentum → already-started → time waited → why-this-plan-exists. Every
// string is derivable from the inputs; nothing here speculates. The generic
// tail is reachable only when an item has none of those facts AND the day's
// due landscape is mixed — by construction, rare.
function reasonFor(
  i: FbNode,
  nowMs: number,
  momentum: Map<string, number>,
  deskTitles: Map<string, string> | undefined,
  ctx: ReasonContext
): string {
  // 1 — deadlines. The ranker's biggest weight, so also the likeliest truth.
  if (i.dueAt) {
    const t = Date.parse(i.dueAt)
    if (!Number.isNaN(t)) {
      if (t < nowMs) {
        const daysLate = Math.floor((nowMs - t) / DAY)
        if (daysLate < 1) return 'Was due earlier today'
        return daysLate === 1 ? 'Overdue by a day' : `Overdue by ${daysLate} days`
      }
      if (t < nowMs + DAY) return 'Due today'
      if (t < nowMs + 2 * DAY) return 'Due tomorrow'
      if (t < nowMs + 7 * DAY)
        return `Due ${new Date(t).toLocaleDateString(undefined, { weekday: 'long' })}`
      // A far-off due date is not why it is on TODAY's plan — fall through.
    }
  }
  // 2 — the person's own urgency call (DEC-037: chosen, so it outranks derived).
  if (i.wiUrgency === 'urgent') return 'You marked it urgent'
  if (i.wiUrgency === 'high') return 'You marked it high priority'
  // 3 — momentum (strings pinned since DEC-052; deliberately unchanged).
  const closures = momentum.get(i.parentId ?? '') ?? 0
  if (closures >= 2) {
    const desk = deskTitles?.get(i.parentId ?? '')
    return desk
      ? `Riding your momentum on ${desk} (${closures} closed lately)`
      : `Riding your momentum (${closures} closed on this desk lately)`
  }
  // 4 — already started: an open loop beats a fresh start.
  if (i.workItemState === 'in_progress') return 'Already started — finish it'
  // 5 — time waited (mirrors the queue's 3-day threshold).
  const quietDays = Math.floor((nowMs - i.updatedAt) / DAY)
  if (quietDays >= 3) return `Waiting ${quietDays} days`
  // 6 — no item-level fact: say why the PLAN chose it.
  if (ctx.source === 'replan') return 'Slipped earlier — proposing a fresh slot'
  if (ctx.source === 'intent') return 'Matches your intent'
  if (!ctx.anyOthersDue) return `Nothing else needs ${ctx.dayWord}`
  if (ctx.othersDueHandled) return 'Everything due already has a slot'
  return 'Next by rank'
}

/**
 * Replan-undone, step 1: which planned blocks are honestly MISSED — fully
 * past (plus the grace period) and never marked done. The caller marks them
 * 'missed' (the record stays; nothing moves) and re-proposes their ITEMS via
 * planDay with onlyItemIds. Locked/manual/meeting/done blocks are untouchable
 * here by construction: only status flips, only on passed 'planned' rows.
 */
export function sweepMissed(blocks: TimeBlock[], nowMs: number): TimeBlock[] {
  return blocks.filter(
    (b) => b.status === 'planned' && b.startMs + b.durationMin * MIN + MISSED_GRACE_MS < nowMs
  )
}
