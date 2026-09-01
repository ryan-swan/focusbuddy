import type { TimeBlock } from '@shared/types'
import { freeSlots, type PlannerSettings } from './attentionPlanner'

// DEC-075 — the missed-items queue. At the next launch after a day ends, any
// calendar block that was never completed rolls into a triage prompt instead
// of silently vanishing behind the grid's back-scroll. Pure functions here;
// the prompt component owns the writes.
//
// "Untriaged" is derivable, not stored: a block still status 'planned' whose
// whole span lies before today was never touched — not done, not skipped, not
// already marked missed by an intra-day replan (DEC-052 B4 handles same-day
// slips; this handles the day boundary). Every triage action moves the block
// OFF 'planned' ('done', or 'missed' + a fresh block per the replan-never-
// moves doctrine), so a triaged block can never re-prompt. "Later" leaves
// them planned on purpose — the prompt returns next launch.

const DAY_MS = 86_400_000

/** How far back the prompt looks. Bounded so the FIRST run after this ships
 *  cannot resurface months of pre-feature blocks as one giant wall. */
export const MISSED_LOOKBACK_DAYS = 14

export function untriagedMissed(
  blocks: TimeBlock[],
  todayStartMs: number,
  lookbackDays: number = MISSED_LOOKBACK_DAYS
): TimeBlock[] {
  const floor = todayStartMs - lookbackDays * DAY_MS
  return blocks
    .filter(
      (b) =>
        b.status === 'planned' &&
        b.startMs >= floor &&
        b.startMs + b.durationMin * 60_000 <= todayStartMs
    )
    .sort((a, b) => a.startMs - b.startMs)
}

/** The local-midnight of the day a given moment falls in. */
export function dayStartOf(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export interface Placement {
  startMs: number
  durationMin: number
}

/**
 * First honest opening for `durationMin` on `dayMs`, respecting the working
 * window, existing commitments AND placements already made in this triage
 * pass (`taken`). Returns null when the day genuinely has no room — the
 * caller decides the fallback (same clock time, visibly overlapping, rather
 * than silently dropping the item).
 */
export function firstSlotOnDay(
  blocks: TimeBlock[],
  taken: Placement[],
  dayMs: number,
  durationMin: number,
  settings: PlannerSettings,
  nowMs: number
): Placement | null {
  const synthetic: TimeBlock[] = taken.map((t, k) => ({
    id: `triage-synth-${k}`,
    taskId: null,
    title: '',
    startMs: t.startMs,
    durationMin: t.durationMin,
    status: 'planned',
    origin: 'manual',
    locked: false,
    pushPolicy: 'local',
    createdAt: 0,
    updatedAt: 0
  }))
  const slots = freeSlots([...blocks, ...synthetic], dayMs, settings, nowMs)
  for (const s of slots) {
    const roomMin = Math.floor((s.endMs - s.startMs) / 60_000)
    if (roomMin >= Math.min(durationMin, 15)) {
      return { startMs: s.startMs, durationMin: Math.min(durationMin, roomMin) }
    }
  }
  return null
}

/**
 * Bulk "add all back": walk the missed blocks in their original order and
 * place each into the first opening from `fromDayMs` forward, scanning up to
 * `days` days. Earlier placements in the SAME pass occupy their slot for
 * later ones. An item that fits nowhere in the window falls back to its
 * original clock time on the first day — visible overlap over silent drop.
 */
export function planReplacements(
  blocks: TimeBlock[],
  missed: TimeBlock[],
  settings: PlannerSettings,
  fromDayMs: number,
  nowMs: number,
  days = 7
): Map<string, Placement> {
  const out = new Map<string, Placement>()
  const taken: Placement[] = []
  for (const m of missed) {
    let placed: Placement | null = null
    for (let d = 0; d < days && !placed; d++) {
      placed = firstSlotOnDay(blocks, taken, fromDayMs + d * DAY_MS, m.durationMin, settings, nowMs)
    }
    if (!placed) {
      const clockOffset = m.startMs - dayStartOf(m.startMs)
      placed = { startMs: fromDayMs + clockOffset, durationMin: m.durationMin }
    }
    taken.push(placed)
    out.set(m.id, placed)
  }
  return out
}
