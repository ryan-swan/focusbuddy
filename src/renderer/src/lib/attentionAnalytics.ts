import type { FbNode } from '@shared/types'
import {
  QUEUE_ORDER,
  QUEUE_LABEL,
  isTerminalState,
  queueOf,
  rankScore,
  itemReason
} from './attentionQueues'

// DEC-048 — the command-center's numbers, computed from the attention layer
// itself (work_item_state + timestamps), never from the legacy desk-task
// data the old home widgets read. Pure functions over the item list so every
// figure is unit-tested and every surface (page, home, desk widget) shows
// the SAME math.
//
// Honesty rule for trends: we hold current rows, not an event history — so
// every claim here is derivable from createdAt/updatedAt/state alone, and
// anything that would need a real event log (e.g. "cleared your overdue 5
// days running") is NOT claimed.

const DAY = 24 * 60 * 60 * 1000

const active = (i: FbNode): boolean =>
  !isTerminalState(i.workItemState) && i.detachedFromId == null

const closedMeaningfully = (i: FbNode): boolean =>
  isTerminalState(i.workItemState) &&
  i.workItemState !== 'dismissed' &&
  i.workItemState !== 'reclassified' &&
  i.workItemState !== 'archived'

const dayKey = (ms: number): string => new Date(ms).toDateString()

// ── Pulse ───────────────────────────────────────────────────────────────────

export interface PulseCounts {
  open: number
  dueToday: number
  overdue: number
  closed7d: number
  /** Closed-per-day for the last `days` days, oldest → newest (sparkline). */
  closedByDay: number[]
}

export function pulseCounts(items: FbNode[], nowMs: number, days = 14): PulseCounts {
  const act = items.filter(active)
  const endOfToday = new Date(nowMs)
  endOfToday.setHours(23, 59, 59, 999)
  const closed = items.filter(closedMeaningfully)
  const byDay = new Array(days).fill(0) as number[]
  for (const i of closed) {
    const age = Math.floor((nowMs - i.updatedAt) / DAY)
    if (age >= 0 && age < days) byDay[days - 1 - age]++
  }
  return {
    open: act.length,
    dueToday: act.filter((i) => i.dueAt && Date.parse(i.dueAt) <= endOfToday.getTime() && Date.parse(i.dueAt) >= nowMs).length,
    overdue: act.filter((i) => i.dueAt && Date.parse(i.dueAt) < nowMs).length,
    closed7d: closed.filter((i) => nowMs - i.updatedAt < 7 * DAY).length,
    closedByDay: byDay
  }
}

// ── Overdue radar ───────────────────────────────────────────────────────────

export function overdueRadar(
  items: FbNode[],
  nowMs: number
): { overdue: FbNode[]; dueSoon: FbNode[] } {
  const act = items.filter(active)
  const overdue = act
    .filter((i) => i.dueAt && Date.parse(i.dueAt) < nowMs)
    .sort((a, b) => Date.parse(a.dueAt!) - Date.parse(b.dueAt!))
  const dueSoon = act
    .filter((i) => {
      if (!i.dueAt) return false
      const t = Date.parse(i.dueAt)
      return t >= nowMs && t < nowMs + 2 * DAY
    })
    .sort((a, b) => Date.parse(a.dueAt!) - Date.parse(b.dueAt!))
  return { overdue, dueSoon }
}

// ── Today's agenda ──────────────────────────────────────────────────────────

/** Dated work due through tomorrow, plus active Meet items — the day's shape. */
export function agendaItems(items: FbNode[], nowMs: number): FbNode[] {
  const endTomorrow = new Date(nowMs)
  endTomorrow.setHours(23, 59, 59, 999)
  const horizon = endTomorrow.getTime() + DAY
  return items
    .filter(active)
    .filter((i) => (i.dueAt && Date.parse(i.dueAt) <= horizon) || queueOf(i) === 'to_meet')
    .sort((a, b) => {
      const ta = a.dueAt ? Date.parse(a.dueAt) : Number.POSITIVE_INFINITY
      const tb = b.dueAt ? Date.parse(b.dueAt) : Number.POSITIVE_INFINITY
      return ta - tb
    })
}

// ── Recent activity ─────────────────────────────────────────────────────────

export interface ActivityEntry {
  item: FbNode
  kind: 'closed' | 'created'
  atMs: number
}

export function activityFeed(items: FbNode[], nowMs: number, limit = 12): ActivityEntry[] {
  const out: ActivityEntry[] = []
  for (const i of items) {
    if (closedMeaningfully(i) && nowMs - i.updatedAt < 7 * DAY)
      out.push({ item: i, kind: 'closed', atMs: i.updatedAt })
    if (nowMs - i.createdAt < 7 * DAY) out.push({ item: i, kind: 'created', atMs: i.createdAt })
  }
  return out.sort((a, b) => b.atMs - a.atMs).slice(0, limit)
}

// ── Status breakdown (the analytics widget, part 1) ─────────────────────────

export interface ClassBreakdown {
  queue: string
  label: string
  notStarted: number
  inProgress: number
  waiting: number
  done7d: number
  total: number
}

export function statusBreakdown(items: FbNode[], nowMs: number): ClassBreakdown[] {
  const rows: ClassBreakdown[] = []
  for (const q of QUEUE_ORDER) {
    const mine = items.filter((i) => queueOf(i) === q && i.detachedFromId == null)
    const act = mine.filter((i) => !isTerminalState(i.workItemState))
    const b: ClassBreakdown = {
      queue: q,
      label: QUEUE_LABEL[q],
      notStarted: act.filter((i) => !['in_progress', 'waiting', 'blocked', 'delegated', 'needs_review', 'needs_approval'].includes(i.workItemState ?? '')).length,
      inProgress: act.filter((i) => ['in_progress', 'delegated', 'needs_review', 'needs_approval'].includes(i.workItemState ?? '')).length,
      waiting: act.filter((i) => ['waiting', 'blocked'].includes(i.workItemState ?? '')).length,
      done7d: mine.filter((i) => closedMeaningfully(i) && nowMs - i.updatedAt < 7 * DAY).length,
      total: mine.length
    }
    if (b.total > 0) rows.push(b)
  }
  return rows.sort((a, b) => b.notStarted + b.inProgress + b.waiting - (a.notStarted + a.inProgress + a.waiting))
}

// ── Trends & streaks (part 2) — plain language, honestly derivable ──────────

export function trendLines(items: FbNode[], nowMs: number): string[] {
  const lines: string[] = []

  // Closing streak: consecutive days (ending today or yesterday) with ≥1
  // meaningful closure.
  const closedDays = new Set(items.filter(closedMeaningfully).map((i) => dayKey(i.updatedAt)))
  let streak = 0
  for (let d = 0; d < 60; d++) {
    if (closedDays.has(dayKey(nowMs - d * DAY))) streak++
    else if (d === 0) continue // today can still be in progress
    else break
  }
  if (streak >= 2) lines.push(`You've closed something ${streak} days in a row.`)

  // Week-over-week arrivals, overall and the biggest class mover.
  const wk = (i: { createdAt: number }): 0 | 1 | -1 =>
    nowMs - i.createdAt < 7 * DAY ? 0 : nowMs - i.createdAt < 14 * DAY ? 1 : -1
  const thisWk = items.filter((i) => wk(i) === 0)
  const lastWk = items.filter((i) => wk(i) === 1)
  if (lastWk.length >= 3 && thisWk.length >= 1) {
    const delta = Math.round(((thisWk.length - lastWk.length) / lastWk.length) * 100)
    if (Math.abs(delta) >= 25)
      lines.push(`New items are ${delta > 0 ? 'up' : 'down'} ${Math.abs(delta)}% this week.`)
    let best: { label: string; delta: number } | null = null
    for (const q of QUEUE_ORDER) {
      const a = thisWk.filter((i) => queueOf(i) === q).length
      const b = lastWk.filter((i) => queueOf(i) === q).length
      if (b >= 2 && a + b >= 4) {
        const d = Math.round(((a - b) / b) * 100)
        if (Math.abs(d) >= 30 && (!best || Math.abs(d) > Math.abs(best.delta)))
          best = { label: QUEUE_LABEL[q], delta: d }
      }
    }
    if (best)
      lines.push(
        `${best.label} items are ${best.delta > 0 ? 'up' : 'down'} ${Math.abs(best.delta)}% this week.`
      )
  }

  // Closure balance this week.
  const closedThisWk = items.filter((i) => closedMeaningfully(i) && nowMs - i.updatedAt < 7 * DAY).length
  if (closedThisWk > 0 && thisWk.length > 0) {
    if (closedThisWk > thisWk.length)
      lines.push(`Closing faster than new work arrives — ${closedThisWk} closed vs ${thisWk.length} new this week.`)
    else if (thisWk.length > closedThisWk * 2 && thisWk.length >= 4)
      lines.push(`Arrivals are outpacing closures ${thisWk.length} to ${closedThisWk} this week.`)
  }

  // The oldest untouched active item, when it is genuinely old.
  const act = items.filter(active)
  const oldest = [...act].sort((a, b) => a.updatedAt - b.updatedAt)[0]
  if (oldest && nowMs - oldest.updatedAt > 7 * DAY) {
    const days = Math.floor((nowMs - oldest.updatedAt) / DAY)
    lines.push(`“${(oldest.title || '').slice(0, 40)}” has waited ${days} days for a touch.`)
  }

  return lines.slice(0, 4)
}

// ── Where to start (the recommendation strip) ───────────────────────────────

export interface StartRecommendation {
  item: FbNode
  reason: string
}

export function startRecommendations(
  items: FbNode[],
  nowMs: number,
  n = 3
): StartRecommendation[] {
  return items
    .filter(active)
    .filter((i) => i.workItemState !== 'suggested')
    .map((i) => ({ i, score: rankScore(i, nowMs) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map(({ i }) => ({
      item: i,
      reason: itemReason(i, nowMs) ?? (i.updatedAt < nowMs - 3 * DAY ? 'Waiting the longest' : 'Top of the queue')
    }))
}
