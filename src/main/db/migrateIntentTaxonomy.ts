// migrateIntentTaxonomyV2 — rewrite stored intent_class values to the eight
// aligned primaries (taxonomy alignment stage; DEC-029a sequencing,
// analysis/22 §3 "the rename migration is a real stage").
//
// Value UPDATEs only — no table rebuild, no DDL. Every renamed row's pre-image
// is recorded FIRST in wi_intent_taxonomy_backup (id → old value), so the
// rename is fully reversible even across the acknowledgment/direct →
// to_respond merge, which the forward map alone could not undo. The backup
// insert uses OR IGNORE: re-running never overwrites a recorded pre-image
// with an already-migrated value.
//
// Sync: the nodes_mark_dirty trigger fires on these UPDATEs, so renamed rows
// push to the server on the next cycle with no updated_at churn (staleness
// ranking and the to_remember decay clock are untouched). An un-updated peer
// receiving the new values stores them verbatim (S2 store-verbatim) and shows
// raw keys until it updates — accepted solo, stated for the fleet.
//
// Idempotent by construction (the WHERE finds nothing on a second run) and
// re-run at every startup, which also converges any legacy value a not-yet-
// updated peer pushed between runs. wi_notifications.queue values remap too,
// keeping the substrate's per-queue hourly caps grouping one vocabulary.
//
// Electron-free, same as migrateNodesKind: production hands it better-sqlite3,
// unit tests hand it node:sqlite.

import { LEGACY_INTENT_CLASS_MAP } from '@shared/workItems'

export interface TaxonomyMigrationDb {
  exec(sql: string): void
  prepare(sql: string): {
    get(...args: unknown[]): unknown
    all(...args: unknown[]): unknown[]
    run(...args: unknown[]): unknown
  }
}

export interface IntentTaxonomyMigrationResult {
  ran: boolean
  /** Rows renamed this run, keyed by legacy value (empty on a no-op re-run). */
  renamed: Record<string, number>
  /** wi_notifications rows whose queue value was remapped this run. */
  notificationsRemapped: number
}

function tableHasColumn(d: TaxonomyMigrationDb, table: string, column: string): boolean {
  try {
    const cols = d.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
    return cols.some((c) => c.name === column)
  } catch {
    return false
  }
}

export function migrateIntentTaxonomyV2(d: TaxonomyMigrationDb): IntentTaxonomyMigrationResult {
  // Pre-S2 database (no work_item columns yet): nothing to rename, and
  // ensureWorkItemSchema has not run — skip rather than guess.
  if (!tableHasColumn(d, 'nodes', 'intent_class')) {
    return { ran: false, renamed: {}, notificationsRemapped: 0 }
  }

  d.exec(`
    CREATE TABLE IF NOT EXISTS wi_intent_taxonomy_backup (
      item_id TEXT PRIMARY KEY,
      old_class TEXT NOT NULL,
      migrated_at INTEGER NOT NULL
    )
  `)

  const renamed: Record<string, number> = {}
  const now = Date.now()
  for (const [legacy, canonical] of Object.entries(LEGACY_INTENT_CLASS_MAP)) {
    const hits = d
      .prepare(`SELECT id FROM nodes WHERE kind = 'work_item' AND intent_class = ?`)
      .all(legacy) as Array<{ id: string }>
    if (!hits.length) continue
    for (const row of hits) {
      d.prepare(
        `INSERT OR IGNORE INTO wi_intent_taxonomy_backup (item_id, old_class, migrated_at) VALUES (?, ?, ?)`
      ).run(row.id, legacy, now)
    }
    d.prepare(`UPDATE nodes SET intent_class = ? WHERE kind = 'work_item' AND intent_class = ?`).run(
      canonical,
      legacy
    )
    renamed[legacy] = hits.length
  }

  // The notification substrate's per-queue grouping follows the same rename.
  // Device-local rows, no sync interaction; skipped cleanly pre-S4.
  let notificationsRemapped = 0
  if (tableHasColumn(d, 'wi_notifications', 'queue')) {
    for (const [legacy, canonical] of Object.entries(LEGACY_INTENT_CLASS_MAP)) {
      const res = d
        .prepare(`UPDATE wi_notifications SET queue = ? WHERE queue = ?`)
        .run(canonical, legacy) as { changes?: number } | undefined
      notificationsRemapped += Number(res?.changes ?? 0)
    }
  }

  return { ran: true, renamed, notificationsRemapped }
}
