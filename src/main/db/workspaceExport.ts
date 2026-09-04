import { writeFileSync, readFileSync, statSync } from 'node:fs'
import { getDb, databaseFilePath } from './database'
import { getActiveOrgId } from './activeOrg'
import { app } from 'electron'
import { join } from 'node:path'

// Portable workspace export/import.
//
// A .fbbackup (see backup.ts) is a SQLite copy: the right tool for "restore
// yesterday's workspace", and the wrong one for "let me leave". It needs this
// app's schema and this app's binary to read. For a product whose headline claim
// is that the work stays yours, that is not an exit — it is a hostage note with
// good intentions.
//
// This writes ONE json file of user-authored records, in a documented and
// version-stamped shape, that a person can read and another tool can parse.
//
// Design notes worth keeping:
//
//   - Rows are exported verbatim (SELECT *) against a declared table allowlist,
//     not hand-mapped per table. Hand-mapping is how an export silently loses a
//     column that was added later, and this repo has already been bitten by two
//     hand-written copies of one column list.
//   - Import writes only columns that exist in the TARGET schema, so an export
//     from a newer build imports into an older one without throwing.
//   - Import is additive and never overwrites: a row whose id already exists is
//     counted as skipped. An import must not be able to destroy the workspace it
//     is being read into.

/** What travels, and why everything else does not. */
const EXPORTED_TABLES = [
  'nodes',            // desks, folders, work items — the spine
  'widgets',          // canvas contents
  'widget_links',     // the wires between them
  'documents',        // docs, sheets, slides, maps, designs
  'fb_tables',
  'fb_rows',
  'fb_knowledge',
  'fb_memory',
  'time_blocks',
  'decisions',
  'fb_meetings',
  'templates',
  'fb_smart_folders',
  'fb_brand_kit',
  'fb_files',         // file METADATA only — see filesNote() for the bytes
  'doc_comments',
  'fb_node_relations',
  'desk_layouts',
  'dashboard_layouts'
] as const

// Deliberately NOT exported, each for a stated reason. Listed in the manifest so
// the export never implies it is something it is not.
const OMITTED: Array<{ table: string; why: string }> = [
  { table: 'events', why: 'the append-only event log — large, and replayable history rather than authored content' },
  { table: 'event_outbox / event_blobs / event_consumer_offsets', why: 'delivery bookkeeping for the event log' },
  { table: 'fb_chunks / fb_chunks_fts / fb_embeddings', why: 'derived search indexes; rebuilt automatically from the content above' },
  { table: 'fb_document_metadata', why: 'derived AI enrichment; regenerated locally and free' },
  { table: 'activity_log / browsing_history / focus_sessions / energy_log', why: 'personal telemetry, not authored work' },
  { table: 'vault_entries / vault_meta', why: 'SECURITY: encrypted credentials are never written to a portable file. Export them from the vault deliberately, or not at all' },
  { table: 'sessions / sync_meta / connected_apps', why: 'device-local auth and sync state; meaningless on another machine' },
  { table: 'crash_events / usage_counters', why: 'diagnostics' }
]

export interface WorkspaceExport {
  format: 'plexii.workspace'
  formatVersion: 1
  exportedAt: string
  app: { name: string; version: string; schemaUserVersion: number }
  orgId: string
  counts: Record<string, number>
  omitted: Array<{ table: string; why: string }>
  files: { count: number; totalBytes: number; storedAt: string; note: string }
  tables: Record<string, Array<Record<string, unknown>>>
}

function schemaVersion(db: { prepare: (sql: string) => { get: () => unknown } }): number {
  try {
    const row = db.prepare('PRAGMA user_version').get() as Record<string, unknown> | undefined
    const v = row ? Object.values(row)[0] : 0
    return Number(v) || 0
  } catch {
    return 0
  }
}

function columnsOf(table: string): string[] {
  try {
    return (getDb().prepare(`PRAGMA table_info("${table.replace(/"/g, '""')}")`).all() as Array<{ name: string }>)
      .map((c) => c.name)
  } catch {
    return []
  }
}

function filesNote(): WorkspaceExport['files'] {
  let count = 0
  let totalBytes = 0
  try {
    const r = getDb().prepare('SELECT count(*) AS c, coalesce(sum(size_bytes), 0) AS b FROM fb_files').get() as {
      c: number
      b: number
    }
    count = r.c
    totalBytes = r.b
  } catch {
    /* table absent in this schema */
  }
  return {
    count,
    totalBytes,
    // Mirrors filesDir() in db/files.ts, which is module-private there.
    storedAt: join(app.getPath('userData'), 'files'),
    note:
      'File RECORDS are included above; the bytes are not. They live as ordinary files in the directory named here — ' +
      'copy that folder alongside this export to take everything. They are excluded because embedding them would ' +
      'inflate this file enormously (this workspace holds ' +
      `${(totalBytes / 1e9).toFixed(1)} GB across ${count} files) and would make the export unreadable.`
  }
}

/** Write the whole workspace to one portable JSON file. */
export function exportWorkspaceJson(destPath: string): {
  path: string
  bytes: number
  counts: Record<string, number>
} {
  const db = getDb()
  const counts: Record<string, number> = {}
  const tables: Record<string, Array<Record<string, unknown>>> = {}

  for (const table of EXPORTED_TABLES) {
    const cols = columnsOf(table)
    if (cols.length === 0) continue // not in this schema version
    let rows: Array<Record<string, unknown>> = []
    try {
      rows = db.prepare(`SELECT * FROM "${table}"`).all() as Array<Record<string, unknown>>
    } catch {
      continue
    }
    tables[table] = rows
    counts[table] = rows.length
  }

  const payload: WorkspaceExport = {
    format: 'plexii.workspace',
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    app: {
      name: app.getName(),
      version: app.getVersion(),
      // Read as a statement, not db.pragma(): pragma() is a better-sqlite3 API and
      // the unit suite runs this module against node:sqlite (the house
      // convention). prepare() exists in both, so the module stays testable.
      schemaUserVersion: schemaVersion(db)
    },
    orgId: getActiveOrgId(),
    counts,
    omitted: OMITTED,
    files: filesNote(),
    tables
  }

  writeFileSync(destPath, JSON.stringify(payload, null, 2), 'utf8')
  return { path: destPath, bytes: statSync(destPath).size, counts }
}

export interface ImportResult {
  ok: boolean
  imported: number
  skipped: number
  byTable: Record<string, { imported: number; skipped: number }>
  reason?: string
  exportedAt?: string
  fromVersion?: string
}

/**
 * Read an export back in. Additive by construction: an id that already exists is
 * skipped, never overwritten, so importing into a populated workspace can add but
 * cannot destroy.
 */
export function importWorkspaceJson(srcPath: string): ImportResult {
  const empty = { ok: false, imported: 0, skipped: 0, byTable: {} }
  let payload: WorkspaceExport
  try {
    payload = JSON.parse(readFileSync(srcPath, 'utf8')) as WorkspaceExport
  } catch (e) {
    return { ...empty, reason: `could not read the file: ${(e as Error).message}` }
  }
  if (payload?.format !== 'plexii.workspace') {
    return { ...empty, reason: 'not a Plexii workspace export' }
  }
  if (payload.formatVersion !== 1) {
    return { ...empty, reason: `unsupported export version ${payload.formatVersion}; this build reads version 1` }
  }

  const db = getDb()
  const byTable: Record<string, { imported: number; skipped: number }> = {}
  let imported = 0
  let skipped = 0

  // Explicit BEGIN/COMMIT rather than db.transaction(): transaction() is a
  // better-sqlite3 API and this module is unit-tested against node:sqlite. The
  // guarantee is the same — a failure part-way rolls the whole import back, so a
  // half-imported workspace is not a state anyone can reach.
  const run = (): void => {
    for (const [table, rows] of Object.entries(payload.tables ?? {})) {
      if (!(EXPORTED_TABLES as readonly string[]).includes(table)) continue
      const target = new Set(columnsOf(table))
      if (target.size === 0) continue // table does not exist here
      const stat = { imported: 0, skipped: 0 }
      for (const row of rows) {
        // Only columns this build actually has — an export from a newer schema
        // imports cleanly instead of throwing on an unknown column.
        const cols = Object.keys(row).filter((c) => target.has(c))
        if (cols.length === 0) continue
        const sql =
          `INSERT OR IGNORE INTO "${table}" (${cols.map((c) => `"${c}"`).join(', ')}) ` +
          `VALUES (${cols.map(() => '?').join(', ')})`
        const values = cols.map((c) => row[c] as never)
        try {
          const info = db.prepare(sql).run(...values)
          if (info.changes > 0) stat.imported++
          else stat.skipped++
        } catch {
          // A single unimportable row must not abandon the rest of the file.
          stat.skipped++
        }
      }
      byTable[table] = stat
      imported += stat.imported
      skipped += stat.skipped
    }
  }

  try {
    db.exec('BEGIN')
    // Defer foreign-key enforcement to COMMIT.
    //
    // Rows are inserted table by table, and `nodes.parent_id` references nodes:
    // a child written before its parent fails the constraint immediately, and
    // every widget and wire hanging off that node then fails too. Measured on a
    // real workspace, ordering alone silently dropped 51 rows — 4 nodes, 44
    // widgets, 3 links — and INSERT OR IGNORE reported them as "skipped", which
    // reads like a duplicate rather than a loss.
    //
    // Deferring is the right fix rather than disabling: integrity is still
    // checked, just once at COMMIT, when every row is present. A genuinely
    // broken export still fails and still rolls back.
    db.exec('PRAGMA defer_foreign_keys = ON')
    run()
    db.exec('COMMIT')
  } catch (e) {
    try {
      db.exec('ROLLBACK')
    } catch {
      // Already rolled back, or never opened — nothing further to undo.
    }
    return { ...empty, reason: `import failed and was rolled back: ${(e as Error).message}` }
  }

  return {
    ok: true,
    imported,
    skipped,
    byTable,
    exportedAt: payload.exportedAt,
    fromVersion: payload.app?.version
  }
}

/** Where a fresh export should be written by default. */
export function defaultWorkspaceExportName(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return `plexii-workspace-${ts}.json`
}

/** The live database path, for the UI to state plainly what is being exported. */
export function exportSourcePath(): string {
  return databaseFilePath()
}
