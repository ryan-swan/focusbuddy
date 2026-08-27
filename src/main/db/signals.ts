import { randomUUID } from 'crypto'
import { getDb } from './database'

/** The slice of a database handle this module needs — satisfied by the live
 *  better-sqlite3 handle AND by node:sqlite's DatabaseSync in tests. */
export interface SignalDb {
  exec(sql: string): unknown
  prepare(sql: string): {
    run(...args: unknown[]): unknown
    get(...args: unknown[]): unknown
    all(...args: unknown[]): unknown[]
  }
}

// DEC-052 (Track D, tier 1) — the typed action ledger the completion loop
// stands on. Analysis 24 §5.2 named the gap precisely: nothing in the app
// could answer "what did the user just do, to what object, when" —
// actionHistory is undo closures in renderer memory, not a record.
//
// This ledger is DEVICE-LOCAL by design (observations, not shared truth —
// same doctrine as wi_local): it never rides sync, and it holds two tables:
// what happened (wi_signal), and what we did about it (wi_signal_match) —
// the second is what makes "never nag" a database guarantee rather than a
// promise: one row per (signal, item) pairing, and a pairing that has an
// outcome is never prompted again.

export interface WiSignal {
  id: string
  kind: string // block_completed | focus_finished | chat_message_sent | desk_closed
  targetKind: string | null // work_item | desk | conversation
  targetRef: string | null // the id the action touched
  occurredAt: number
  payload: string | null // small JSON for the offer's wording
}

interface SignalRow {
  id: string
  kind: string
  target_kind: string | null
  target_ref: string | null
  occurred_at: number
  payload: string | null
}

export function ensureSignalSchema(d?: SignalDb): void {
  const db = d ?? getDb()
  db.exec(`
    CREATE TABLE IF NOT EXISTS wi_signal (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      target_kind TEXT,
      target_ref TEXT,
      occurred_at INTEGER NOT NULL,
      payload TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_wi_signal_at ON wi_signal (occurred_at DESC);
    CREATE TABLE IF NOT EXISTS wi_signal_match (
      signal_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      confidence REAL NOT NULL,
      prompted_at INTEGER,
      outcome TEXT, -- completed | dismissed | ignored
      PRIMARY KEY (signal_id, item_id)
    );
  `)
  // Observations age out: 30 days is plenty for prompts and weekly analytics.
  db.prepare('DELETE FROM wi_signal WHERE occurred_at < ?').run(Date.now() - 30 * 86_400_000)
  db.prepare('DELETE FROM wi_signal_match WHERE signal_id NOT IN (SELECT id FROM wi_signal)').run()
}

const rowToSignal = (r: SignalRow): WiSignal => ({
  id: r.id,
  kind: r.kind,
  targetKind: r.target_kind,
  targetRef: r.target_ref,
  occurredAt: r.occurred_at,
  payload: r.payload
})

export function recordSignal(
  input: {
    kind: string
    targetKind?: string | null
    targetRef?: string | null
    payload?: string | null
  },
  d?: SignalDb
): WiSignal {
  const db = d ?? getDb()
  const row: SignalRow = {
    id: randomUUID(),
    kind: String(input.kind),
    target_kind: input.targetKind ?? null,
    target_ref: input.targetRef ?? null,
    occurred_at: Date.now(),
    payload: input.payload ?? null
  }
  db.prepare(
    `INSERT INTO wi_signal (id, kind, target_kind, target_ref, occurred_at, payload)
     VALUES (@id, @kind, @target_kind, @target_ref, @occurred_at, @payload)`
  ).run(row)
  return rowToSignal(row)
}

export function listSignals(sinceMs: number, d?: SignalDb): WiSignal[] {
  const db = d ?? getDb()
  const rows = db
    .prepare('SELECT * FROM wi_signal WHERE occurred_at >= ? ORDER BY occurred_at DESC LIMIT 500')
    .all(sinceMs) as SignalRow[]
  return rows.map(rowToSignal)
}

/** Has this (signal, item) pairing already been prompted or resolved?
 *  The once-ever guard the offer surface checks before showing anything. */
export function matchState(
  signalId: string,
  itemId: string,
  d?: SignalDb
): { promptedAt: number | null; outcome: string | null } | null {
  const db = d ?? getDb()
  const row = db
    .prepare('SELECT prompted_at, outcome FROM wi_signal_match WHERE signal_id = ? AND item_id = ?')
    .get(signalId, itemId) as { prompted_at: number | null; outcome: string | null } | undefined
  return row ? { promptedAt: row.prompted_at, outcome: row.outcome } : null
}

export function markPrompted(signalId: string, itemId: string, confidence: number, d?: SignalDb): void {
  const db = d ?? getDb()
  db.prepare(
    `INSERT INTO wi_signal_match (signal_id, item_id, confidence, prompted_at, outcome)
     VALUES (?, ?, ?, ?, NULL)
     ON CONFLICT(signal_id, item_id) DO UPDATE SET prompted_at = excluded.prompted_at`
  ).run(signalId, itemId, confidence, Date.now())
}

export function recordOutcome(signalId: string, itemId: string, outcome: string, d?: SignalDb): void {
  const db = d ?? getDb()
  db.prepare(
    `INSERT INTO wi_signal_match (signal_id, item_id, confidence, prompted_at, outcome)
     VALUES (?, ?, 0, ?, ?)
     ON CONFLICT(signal_id, item_id) DO UPDATE SET outcome = excluded.outcome`
  ).run(signalId, itemId, Date.now(), outcome)
}
