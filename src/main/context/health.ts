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

// The user's last-reviewed sequence for an Object, or -1 if never reviewed.
export function reviewPointSeq(db: SqlDb, userId: string, objectId: string): number {
  const rp = db
    .prepare('SELECT reviewed_seq FROM context_review_points WHERE user_id = ? AND object_id = ?')
    .get(userId, objectId) as { reviewed_seq: number } | undefined
  return rp?.reviewed_seq ?? -1
}

// Count an Object's Events with sequence beyond the review point.
export function changedEventCount(db: SqlDb, objectId: string, sinceSeq: number): number {
  const row = db.prepare('SELECT COUNT(*) AS n FROM events WHERE object_id = ? AND sequence > ?').get(objectId, sinceSeq) as
    | { n: number }
    | undefined
  return row?.n ?? 0
}

export function deriveHealthSnapshot(
  db: SqlDb,
  userId: string,
  objectId: string,
  materialityInput: MaterialityInput,
  decisionsAtRisk: DecisionAtRisk[]
): HealthSnapshot {
  const changed = changedEventCount(db, objectId, reviewPointSeq(db, userId, objectId))
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

// Record that a user reviewed an Object now — resets health to `current`
// from the Object's current max sequence forward (PLX-UX-020).
export function recordReview(db: SqlDb, userId: string, objectId: string, at: string): void {
  const row = db.prepare('SELECT MAX(sequence) AS s FROM events WHERE object_id = ?').get(objectId) as { s: number | null }
  const seq = row?.s ?? 0
  db.prepare(
    `INSERT INTO context_review_points (user_id, object_id, reviewed_seq, reviewed_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, object_id) DO UPDATE SET reviewed_seq = excluded.reviewed_seq, reviewed_at = excluded.reviewed_at`
  ).run(userId, objectId, seq, at)
}
