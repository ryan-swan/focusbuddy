/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Export/import is only worth anything if it ROUND-TRIPS. These drive the real
// module against real SQLite (node:sqlite, the house convention for db tests),
// exporting from one database and importing into an empty one.

const dir = mkdtempSync(join(tmpdir(), 'wsx-'))
let source: DatabaseSync
let target: DatabaseSync
let active: DatabaseSync

const SCHEMA = `
  PRAGMA foreign_keys = ON;
  CREATE TABLE nodes (id TEXT PRIMARY KEY, parent_id TEXT REFERENCES nodes(id), kind TEXT, title TEXT, org_id TEXT);
  CREATE TABLE widgets (id TEXT PRIMARY KEY, task_id TEXT, kind TEXT, content TEXT);
  CREATE TABLE documents (id TEXT PRIMARY KEY, doc_type TEXT, title TEXT, body TEXT);
  CREATE TABLE fb_files (id TEXT PRIMARY KEY, name TEXT, size_bytes INTEGER);
  CREATE TABLE vault_entries (id TEXT PRIMARY KEY, secret TEXT);
`

vi.mock('electron', () => ({
  app: {
    getName: () => 'PlexiDesk',
    getVersion: () => '4.2.2',
    getPath: () => dir
  }
}))
vi.mock('../../src/main/db/database', () => ({
  getDb: () => active,
  databaseFilePath: () => join(dir, 'focusbuddy.db')
}))
vi.mock('../../src/main/db/activeOrg', () => ({ getActiveOrgId: () => 'personal' }))

const { exportWorkspaceJson, importWorkspaceJson } = await import('../../src/main/db/workspaceExport')

beforeEach(() => {
  source = new DatabaseSync(':memory:')
  source.exec(SCHEMA)
  source.exec(`
    INSERT INTO nodes VALUES ('n2',NULL,'folder','Archive','personal'), ('n1','n2','task','Renewals','personal');
    INSERT INTO widgets VALUES ('w1','n1','sticky','remember the Contoso call');
    INSERT INTO documents VALUES ('d1','doc','Brief','{"type":"doc"}');
    INSERT INTO fb_files VALUES ('f1','contract.pdf',5000);
    INSERT INTO vault_entries VALUES ('v1','SUPER-SECRET-TOKEN');
  `)
  target = new DatabaseSync(':memory:')
  target.exec(SCHEMA)
})

describe('workspace export', () => {
  it('writes a version-stamped file with the authored content', () => {
    active = source
    const out = join(dir, 'export-1.json')
    const r = exportWorkspaceJson(out)
    expect(existsSync(out)).toBe(true)
    expect(r.counts.nodes).toBe(2)
    expect(r.counts.widgets).toBe(1)

    const payload = JSON.parse(readFileSync(out, 'utf8'))
    expect(payload.format).toBe('plexii.workspace')
    expect(payload.formatVersion).toBe(1)
    expect(payload.app.version).toBe('4.2.2')
    expect(payload.tables.widgets[0].content).toBe('remember the Contoso call')
  })

  it('NEVER exports the vault, and says so', () => {
    // Encrypted or not, credentials do not belong in a file the user will email
    // to themselves.
    active = source
    const out = join(dir, 'export-2.json')
    exportWorkspaceJson(out)
    const raw = readFileSync(out, 'utf8')
    expect(raw).not.toContain('SUPER-SECRET-TOKEN')
    const payload = JSON.parse(raw)
    expect(payload.tables.vault_entries).toBeUndefined()
    expect(payload.omitted.some((o: { table: string }) => o.table.includes('vault'))).toBe(true)
  })

  it('states that file bytes are referenced, not embedded', () => {
    active = source
    const out = join(dir, 'export-3.json')
    exportWorkspaceJson(out)
    const payload = JSON.parse(readFileSync(out, 'utf8'))
    expect(payload.files.count).toBe(1)
    expect(payload.files.note).toMatch(/bytes are not/i)
    expect(payload.files.storedAt).toBeTruthy()
  })
})

describe('workspace import', () => {
  it('round-trips into an empty database', () => {
    active = source
    const out = join(dir, 'rt.json')
    exportWorkspaceJson(out)

    active = target
    const r = importWorkspaceJson(out)
    expect(r.ok).toBe(true)
    expect(r.byTable.nodes.imported).toBe(2)
    expect(r.byTable.widgets.imported).toBe(1)
    expect(r.byTable.documents.imported).toBe(1)

    // The content itself survived, not just the row count.
    const w = target.prepare("SELECT content FROM widgets WHERE id='w1'").get() as { content: string }
    expect(w.content).toBe('remember the Contoso call')
    const n = target.prepare('SELECT count(*) c FROM nodes').get() as { c: number }
    expect(n.c).toBe(2)
  })

  it('is additive: an existing id is skipped, never overwritten', () => {
    active = source
    const out = join(dir, 'add.json')
    exportWorkspaceJson(out)

    target.exec("INSERT INTO widgets VALUES ('w1','n1','sticky','MY OWN EDIT')")
    active = target
    const r = importWorkspaceJson(out)
    expect(r.byTable.widgets.skipped).toBe(1)
    expect(r.byTable.widgets.imported).toBe(0)
    const w = target.prepare("SELECT content FROM widgets WHERE id='w1'").get() as { content: string }
    expect(w.content).toBe('MY OWN EDIT') // import cannot destroy local work
  })

  it('imports only the columns the target schema has', () => {
    active = source
    const out = join(dir, 'drift.json')
    exportWorkspaceJson(out)
    // Target is an OLDER schema missing a column the export carries.
    const older = new DatabaseSync(':memory:')
    older.exec('CREATE TABLE nodes (id TEXT PRIMARY KEY, kind TEXT, title TEXT);')
    active = older
    const r = importWorkspaceJson(out)
    expect(r.ok).toBe(true)
    expect(r.byTable.nodes.imported).toBe(2)
  })

  it('refuses a file that is not an export, without touching anything', () => {
    const bad = join(dir, 'bad.json')
    require('node:fs').writeFileSync(bad, JSON.stringify({ hello: 'world' }))
    active = target
    const r = importWorkspaceJson(bad)
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/not a Plexii workspace export/)
    expect((target.prepare('SELECT count(*) c FROM nodes').get() as { c: number }).c).toBe(0)
  })

  it('refuses a future format version rather than guessing', () => {
    const future = join(dir, 'future.json')
    require('node:fs').writeFileSync(future, JSON.stringify({ format: 'plexii.workspace', formatVersion: 99, tables: {} }))
    active = target
    const r = importWorkspaceJson(future)
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/unsupported export version 99/)
  })
})

describe('foreign keys must not silently drop rows', () => {
  it('imports a child whose parent comes later in the file', () => {
    // nodes.parent_id references nodes, so a child written before its parent
    // fails the constraint — and INSERT OR IGNORE reports that as "skipped",
    // which reads like a duplicate rather than a loss. Measured against the real
    // workspace, ordering alone dropped 51 rows (4 nodes, 44 widgets, 3 links).
    // Deferring enforcement to COMMIT fixes it without weakening the check.
    active = source
    // Force the child to be exported BEFORE its parent. Export order follows
    // rowid, so the child has to be INSERTED first — which the constraint itself
    // forbids, hence seeding with enforcement off. This is the fixture creating
    // the adverse ordering on purpose; the import under test still runs with
    // foreign keys ON.
    source.exec('PRAGMA foreign_keys = OFF')
    source.exec("DELETE FROM nodes")
    source.exec("INSERT INTO nodes VALUES ('child','parent','task','Child','personal')")
    source.exec("INSERT INTO nodes VALUES ('parent',NULL,'folder','Parent','personal')")
    source.exec('PRAGMA foreign_keys = ON')

    const out = join(dir, 'fk.json')
    const r = exportWorkspaceJson(out)
    expect(r.counts.nodes).toBe(2)
    // The child really does come first in the file — otherwise this proves nothing.
    const rows = JSON.parse(readFileSync(out, 'utf8')).tables.nodes as Array<{ id: string }>
    expect(rows[0].id).toBe('child')

    active = target
    target.exec('PRAGMA foreign_keys = ON')
    const imp = importWorkspaceJson(out)
    expect(imp.ok).toBe(true)
    expect(imp.byTable.nodes.imported).toBe(2)
    expect(imp.byTable.nodes.skipped).toBe(0)
  })
})
