// Honest Context Health derivation (spec §20, §51) — pure over a SqlDb so it is
// testable without Electron. Context Health is per (user, Object) relative to that
// user's last review point (PLX-UX-020 / PLX-DOM-030): we count the Object's
// Events since that point, score the latest change deterministically, and derive
// the state. "Never reviewed" is honest — any change reads as material rather than
// being assumed `current`.

import type { SqlDb } from '../db/eventStore'
import { computeTransition, type DecisionAtRisk, type HealthState } from '../../shared/contextHealth'
import { scoreMateriality, type MaterialityInput, type MaterialityResult } from './materiality'

export function ensureReviewSchema(db: SqlDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS context_review_points (
      user_id TEXT NOT NULL,
      object_id TEXT NOT NULL,
      reviewed_seq INTEGER NOT NULL,
      reviewed_at TEXT NOT NULL,
      PRIMARY KEY (user_id, object_id)
    );
  `)
}

export interface HealthSnapshot {
  objectId: string
  state: HealthState
  materiality: MaterialityResult | null
  changedEventCount: number
  decisionsAtRisk: DecisionAtRisk[]
}

// The user's last-review cursor for an Object, or -1 if never reviewed. This is a
// GLOBAL event-store cursor (rowid), not the per-partition sequence: Context Health
// must compare changes across partitions (this Object AND its related Objects live
// in different partitions), and per-partition sequences are not globally
// comparable.
export function reviewPointSeq(db: SqlDb, userId: string, objectId: string): number {
  const rp = db
    .prepare('SELECT reviewed_seq FROM context_review_points WHERE user_id = ? AND object_id = ?')
    .get(userId, objectId) as { reviewed_seq: number } | undefined
  return rp?.reviewed_seq ?? -1
}

// Count an Object's Events beyond the review cursor. Optionally includes Events on
// confirmed-related Objects, so a change to a related desk raises this desk's
// health too — the "pricing changes, the proposal lights up" model (PLX-UX-022).
// Related counting is depth-1 here (the full bounded BFS lives in propagation.ts).
// Uses the global rowid cursor so cross-partition comparison is valid.
export function changedEventCount(db: SqlDb, objectId: string, sinceCursor: number, relatedIds: string[] = []): number {
  const ids = [objectId, ...relatedIds.filter((r) => r && r !== objectId)]
  const placeholders = ids.map(() => '?').join(',')
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM events WHERE object_id IN (${placeholders}) AND rowid > ?`)
    .get(...ids, sinceCursor) as { n: number } | undefined
  return row?.n ?? 0
}

export function deriveHealthSnapshot(
  db: SqlDb,
  userId: string,
  objectId: string,
  materialityInput: MaterialityInput,
  decisionsAtRisk: DecisionAtRisk[],
  relatedIds: string[] = []
): HealthSnapshot {
  const changed = changedEventCount(db, objectId, reviewPointSeq(db, userId, objectId), relatedIds)
  if (changed === 0) {
    return { objectId, state: 'current', materiality: null, changedEventCount: 0, decisionsAtRisk }
  }
  const materiality = scoreMateriality(materialityInput)
  const state = computeTransition({
    fromState: 'current',
    materialityBand: materiality.band,
    materialityScore: materiality.score,
    decisionsAtRisk
  })
  return { objectId, state, materiality, changedEventCount: changed, decisionsAtRisk }
}

// Record that a user reviewed an Object now — resets health to `current` from the
// GLOBAL event cursor forward (PLX-UX-020), so any later change to this Object OR a
// related one counts as "since your last visit".
export function recordReview(db: SqlDb, userId: string, objectId: string, at: string): void {
  const row = db.prepare('SELECT MAX(rowid) AS s FROM events').get() as { s: number | null }
  const seq = row?.s ?? 0
  db.prepare(
    `INSERT INTO context_review_points (user_id, object_id, reviewed_seq, reviewed_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, object_id) DO UPDATE SET reviewed_seq = excluded.reviewed_seq, reviewed_at = excluded.reviewed_at`
  ).run(userId, objectId, seq, at)
}
