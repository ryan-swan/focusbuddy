// migrateNodesKindCheckV2 — widen the nodes kind CHECK to admit 'work_item'
// (Attention layer S1; ARCHITECTURE §2.1).
//
// Schema-derived rebuild in the migrateShareKindChecks house style: read the
// LIVE DDL, swap only the CHECK clause, rebuild the table, put back every
// index and trigger harvested BEFORE the rename. Two verified starting states
// exist in the wild (GAP-014): factory-narrow ('folder','task') and
// legacy-widened ('folder','task','task-item') — the 4-kind target covers
// both, and 'task-item' stays tolerated at the DB layer because live rows
// exist (the TS union does not carry it; CR-05(a)).
//
// Electron-free on purpose: production hands it a better-sqlite3 Database,
// unit tests hand it node:sqlite — both satisfy MigrationDb structurally.

export interface MigrationDb {
  exec(sql: string): void
  prepare(sql: string): {
    get(...args: unknown[]): unknown
    all(...args: unknown[]): unknown[]
  }
}

export type NodesKindMigrationResult =
  | { ran: false; reason: 'no-nodes-table' | 'already-wide' }
  // The DDL carried no extractable CHECK (kind IN (…)) clause. The migration
  // MUST NOT fire vacuously (re-adding a CHECK that unknown data could violate
  // into a boot loop) — it skips, and the caller surfaces this loudly (§2.1 A2).
  | { ran: false; reason: 'no-check-clause'; ddl: string }
  | { ran: true; artifactsRecreated: number }

const TARGET_CHECK = "CHECK (kind IN ('folder', 'task', 'task-item', 'work_item'))"

// The CHECK clause, extracted — never a whole-DDL substring test: once S2 adds
// the work_item_state column, the column NAME would poison a naive substring
// probe for 'work_item' (§2.1 guard-predicate pin).
const CHECK_RE = /CHECK\s*\(\s*"?kind"?\s+IN\s*\(([^)]*)\)\s*\)/i

/** Same-device guard (R006): may THIS database hold a work_item row? Reads the
 *  live DDL's CHECK clause — zero network, and independent of any flag — so an
 *  un-migrated device (or one whose migration skipped) can never author one. */
export function nodesTableAcceptsWorkItems(d: MigrationDb): boolean {
  const row = d
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='nodes'")
    .get() as { sql?: string } | undefined
  if (!row?.sql) return false
  const match = CHECK_RE.exec(row.sql)
  return !!match && /'work_item'/.test(match[1])
}

export function migrateNodesKindCheckV2(d: MigrationDb): NodesKindMigrationResult {
  const row = d
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='nodes'")
    .get() as { sql?: string } | undefined
  if (!row?.sql) return { ran: false, reason: 'no-nodes-table' }

  const match = CHECK_RE.exec(row.sql)
  if (!match) return { ran: false, reason: 'no-check-clause', ddl: row.sql }
  // Match the quoted literal inside the extracted clause only.
  if (/'work_item'/.test(match[1])) return { ran: false, reason: 'already-wide' }

  // ── Harvest, strictly BEFORE any rename (§2.1 F-M1): a SQLite-rewritten
  // artifact body must never be what gets recreated. sql IS NULL rows are
  // auto-indexes (PK/UNIQUE) that the new table recreates on its own.
  const columns = (d.prepare('PRAGMA table_info(nodes)').all() as Array<{ name: string }>).map(
    (c) => c.name
  )
  const artifacts = d
    .prepare(
      "SELECT type, name, sql FROM sqlite_master WHERE tbl_name='nodes' AND type IN ('index','trigger') AND sql IS NOT NULL"
    )
    .all() as Array<{ type: string; name: string; sql: string }>

  // New DDL = live DDL with only the CHECK clause swapped and the table name
  // retargeted. Handles both `CREATE TABLE nodes` and the quoted
  // `CREATE TABLE "nodes"` shape the legacy rename-migration left behind.
  const newDdl = row.sql
    .replace(match[0], TARGET_CHECK)
    .replace(/CREATE TABLE\s+(IF NOT EXISTS\s+)?("nodes"|nodes)/i, 'CREATE TABLE nodes_v2_new')
  if (!newDdl.includes('nodes_v2_new')) {
    // The name-retarget failed on an unanticipated DDL shape — same skip-and-
    // surface contract as a missing CHECK clause.
    return { ran: false, reason: 'no-check-clause', ddl: row.sql }
  }

  const colList = columns.map((c) => `"${c}"`).join(', ')

  // PRAGMA foreign_keys is a silent no-op inside a transaction — it MUST sit
  // outside (§2.1; empirically the rename direction rewrites child FKs to the
  // old table name if this is wrong). House pattern: migrateShareKindChecks.
  d.exec('PRAGMA foreign_keys=off')
  try {
    d.exec('BEGIN')
    d.exec(newDdl)
    d.exec(`INSERT INTO nodes_v2_new (${colList}) SELECT ${colList} FROM nodes`)
    // ci-delete-allowlist: migrateNodesKindCheckV2 table rebuild (§2.5.3 lock)
    d.exec('DROP TABLE nodes')
    d.exec('ALTER TABLE nodes_v2_new RENAME TO nodes')
    for (const a of artifacts) d.exec(a.sql)
    d.exec('COMMIT')
  } catch (err) {
    try {
      d.exec('ROLLBACK')
    } catch {
      /* no open txn */
    }
    d.exec('PRAGMA foreign_keys=on')
    throw err
  }
  d.exec('PRAGMA foreign_keys=on')
  return { ran: true, artifactsRecreated: artifacts.length }
}
