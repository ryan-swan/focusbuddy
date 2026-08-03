// Context freshness (spec §20, §80.3) — "how current is your understanding of this
// desk". Freshness is per (user, Desk) and decays with elapsed MEANINGFUL CHANGE,
// not with elapsed time (PLX-CTX-030): a desk you reviewed a month ago that has
// not changed is perfectly fresh; one you reviewed an hour ago that has churned is
// not. Time is deliberately not an input.
//
// PLX-CTX-031 is a MUST NOT: freshness must never be surfaced as a comparative
// measure between users, nor exported in a form that supports individual
// performance ranking. This module therefore exposes only per-(user, Desk)
// computation and deliberately provides NO cross-user, aggregate, or ranking API.
// The absence is the enforcement; the detection test asserts it stays absent.

import type { SqlDb } from '../db/eventStore'

export const FRESHNESS_FN_VERSION = 'ctx-freshness-1.0.0'

// Event types that do not represent a meaningful change to catch up on. Kept in
// step with the Resume noise filter.
const NON_MEANINGFUL_EVENT_TYPES = new Set(['ContextHealthChanged', 'MaterialityScored', 'PresenceChanged'])

export interface FreshnessResult {
  userId: string
  deskId: string
  freshness: number // 1.0 = fully current, decays toward 0 as meaningful change accrues
  meaningfulChanges: number
  basis: 'meaningful-change'
  functionVersion: string
}

// Pure decay. freshness = 1 / (1 + meaningfulChanges): full when nothing has
// changed since review, halving at one change, and so on. Deterministic and
// independent of elapsed time (PLX-CTX-030).
export function freshnessFor(meaningfulChanges: number): number {
  const n = Math.max(0, Math.floor(meaningfulChanges))
  return 1 / (1 + n)
}

// Count meaningful Events on the desk's object set since the review cursor,
// excluding non-meaningful (noise) event types. Global rowid cursor so
// cross-partition changes count (matches the Context Health read layer).
export function meaningfulChangesSince(db: SqlDb, objectIds: string[], sinceCursor: number): number {
  const ids = objectIds.filter(Boolean)
  if (ids.length === 0) return 0
  const placeholders = ids.map(() => '?').join(',')
  const noise = [...NON_MEANINGFUL_EVENT_TYPES]
  const noisePlaceholders = noise.map(() => '?').join(',')
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM events
       WHERE object_id IN (${placeholders}) AND rowid > ? AND event_type NOT IN (${noisePlaceholders})`
    )
    .get(...ids, sinceCursor, ...noise) as { n: number } | undefined
  return row?.n ?? 0
}

// Per-(user, Desk) freshness. The result is intentionally scoped to a single user
// and a single desk — there is no batch or comparative form (PLX-CTX-031).
export function computeFreshness(userId: string, deskId: string, meaningfulChanges: number): FreshnessResult {
  return {
    userId,
    deskId,
    freshness: freshnessFor(meaningfulChanges),
    meaningfulChanges: Math.max(0, Math.floor(meaningfulChanges)),
    basis: 'meaningful-change',
    functionVersion: FRESHNESS_FN_VERSION
  }
}
