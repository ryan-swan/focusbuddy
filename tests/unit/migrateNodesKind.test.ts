// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import {
  migrateNodesKindCheckV2,
  nodesTableAcceptsWorkItems,
  type MigrationDb
} from '../../src/main/db/migrateNodesKind'

// ARCHITECTURE §2.1 — the three pinned fixtures, each asserting the full set:
// (a) data preservation + index recreation + idempotency; (b) trigger survival
// (pre-created, the legacy-upgrade path where it is meaningful) AND the trigger
// still FIRES; (c) PRAGMA foreign_key_check empty; (d) inbound REFERENCES still
// name `nodes`; (e) a live cascade probe. Plus the no-match skip-and-surface
// contract and the pinned guard predicate (immune to the work_item_state
// column name).

function wrap(d: DatabaseSync): MigrationDb {
  return {
    exec: (sql) => d.exec(sql),
    prepare: (sql) => {
      const s = d.prepare(sql)
      return {
        get: (...a: unknown[]) => s.get(...(a as never[])),
        all: (...a: unknown[]) => s.all(...(a as never[])) as unknown[]
      }
    }
  }
}

interface Fixture {
  raw: DatabaseSync
  db: MigrationDb
}

// A legacy-shaped DB: nodes with accreted columns + sync bookkeeping, a child
// table with ON DELETE CASCADE, indexes, and the nodes_mark_dirty trigger
// pre-created (real legacy DBs have it — trigger survival is the F-M1 pin).
function legacyFixture(opts: { check: string; quotedName?: boolean; extraCols?: string }): Fixture {
  const raw = new DatabaseSync(':memory:')
  raw.exec('PRAGMA foreign_keys=on')
  const tableName = opts.quotedName ? '"nodes"' : 'nodes'
  raw.exec(`
    CREATE TABLE ${tableName} (
      id TEXT PRIMARY KEY,
      parent_id TEXT REFERENCES nodes(id) ON DELETE CASCADE,
      kind TEXT NOT NULL ${opts.check},
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0,
      trashed_at INTEGER,
      org_id TEXT NOT NULL DEFAULT 'personal',
      needs_sync INTEGER NOT NULL DEFAULT 1,
      sync_rev INTEGER NOT NULL DEFAULT 0${opts.extraCols ?? ''}
    );
    CREATE TABLE widgets (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX idx_nodes_parent ON nodes(parent_id);
    CREATE INDEX idx_nodes_org ON nodes(org_id, trashed_at);
    CREATE TRIGGER nodes_mark_dirty AFTER UPDATE ON nodes
    WHEN NEW.needs_sync = OLD.needs_sync AND NEW.sync_rev = OLD.sync_rev AND OLD.needs_sync = 0
    BEGIN UPDATE nodes SET needs_sync = 1 WHERE id = NEW.id; END;
  `)
  raw.exec(`
    INSERT INTO nodes (id, kind, title, created_at, updated_at) VALUES ('d1', 'task', 'Desk one', 1, 1);
    INSERT INTO nodes (id, parent_id, kind, title, created_at, updated_at) VALUES ('c1', 'd1', 'task', 'Child desk', 2, 2);
    INSERT INTO widgets (id, task_id, title) VALUES ('w1', 'd1', 'Sticky');
  `)
  return { raw, db: wrap(raw) }
}

function assertFullSet(f: Fixture, expectedRows = 2): void {
  // (a) data preserved
  const nodeCount = f.raw.prepare('SELECT COUNT(*) AS n FROM nodes').get() as { n: number }
  expect(nodeCount.n).toBe(expectedRows)
  const d1 = f.raw.prepare('SELECT title, kind FROM nodes WHERE id = ?').get('d1') as {
    title: string
    kind: string
  }
  expect(d1).toEqual({ title: 'Desk one', kind: 'task' })
  // (a) indexes recreated
  const indexes = (
    f.raw
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='nodes' AND sql IS NOT NULL")
      .all() as Array<{ name: string }>
  ).map((r) => r.name)
  expect(indexes).toContain('idx_nodes_parent')
  expect(indexes).toContain('idx_nodes_org')
  // (b) trigger survived AND fires: content update of a clean row marks dirty
  const trig = f.raw
    .prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name='nodes_mark_dirty'")
    .get()
  expect(trig).toBeTruthy()
  f.raw.exec("UPDATE nodes SET needs_sync = 0, sync_rev = 5 WHERE id = 'd1'")
  f.raw.exec("UPDATE nodes SET title = 'Desk one renamed' WHERE id = 'd1'")
  const dirty = f.raw.prepare('SELECT needs_sync FROM nodes WHERE id = ?').get('d1') as {
    needs_sync: number
  }
  expect(dirty.needs_sync).toBe(1)
  // (c) FK integrity clean
  expect(f.raw.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  // (d) inbound REFERENCES still name nodes — never nodes_old / nodes_v2_new
  const referring = f.raw
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND sql LIKE '%REFERENCES%'"
    )
    .all() as Array<{ sql: string }>
  for (const r of referring) {
    expect(r.sql).not.toMatch(/nodes_old|nodes_v2_new/)
  }
  // (e) live cascade probe: new desk + widget, delete desk, widget cascades
  f.raw.exec(`
    INSERT INTO nodes (id, kind, title, created_at, updated_at) VALUES ('probe', 'task', 'Probe', 9, 9);
    INSERT INTO widgets (id, task_id, title) VALUES ('probe-w', 'probe', 'On probe');
    DELETE FROM nodes WHERE id = 'probe';
  `)
  expect(f.raw.prepare("SELECT 1 FROM widgets WHERE id = 'probe-w'").get()).toBeUndefined()
  // The widened CHECK admits work_item and still rejects garbage
  f.raw.exec(
    "INSERT INTO nodes (id, kind, title, created_at, updated_at) VALUES ('wi', 'work_item', 'Call Bob', 3, 3)"
  )
  expect(() =>
    f.raw.exec(
      "INSERT INTO nodes (id, kind, title, created_at, updated_at) VALUES ('bad', 'bogus', 'X', 4, 4)"
    )
  ).toThrow()
}

describe('migrateNodesKindCheckV2 — the three §2.1 fixtures', () => {
  it('fixture 1: factory-narrow legacy DB with accreted columns', () => {
    const f = legacyFixture({ check: "CHECK (kind IN ('folder', 'task'))" })
    expect(nodesTableAcceptsWorkItems(f.db)).toBe(false)
    const r1 = migrateNodesKindCheckV2(f.db)
    expect(r1).toMatchObject({ ran: true })
    expect(nodesTableAcceptsWorkItems(f.db)).toBe(true)
    assertFullSet(f)
    // idempotency
    expect(migrateNodesKindCheckV2(f.db)).toEqual({ ran: false, reason: 'already-wide' })
  })

  it('fixture 2: legacy-widened DB (task-item present, quoted-"nodes" DDL shape)', () => {
    const f = legacyFixture({
      check: "CHECK (kind IN ('folder','task','task-item'))",
      quotedName: true
    })
    f.raw.exec(
      "INSERT INTO nodes (id, kind, title, created_at, updated_at) VALUES ('legacy-ti', 'task-item', 'Residue', 5, 5)"
    )
    const r = migrateNodesKindCheckV2(f.db)
    expect(r).toMatchObject({ ran: true })
    // 4-kind target is load-bearing (GAP-014): the residue row survived the copy
    const residue = f.raw.prepare('SELECT kind FROM nodes WHERE id = ?').get('legacy-ti') as {
      kind: string
    }
    expect(residue.kind).toBe('task-item')
    assertFullSet(f, 3)
    expect(migrateNodesKindCheckV2(f.db)).toEqual({ ran: false, reason: 'already-wide' })
  })

  it('fixture 3: narrow CHECK but work_item_state column already present (F003 predicate pin)', () => {
    // The guard matches the quoted literal INSIDE the CHECK clause — the
    // column name work_item_state elsewhere in the DDL must not fool it.
    const f = legacyFixture({
      check: "CHECK (kind IN ('folder', 'task'))",
      extraCols: ',\n      work_item_state TEXT'
    })
    expect(nodesTableAcceptsWorkItems(f.db)).toBe(false)
    const r = migrateNodesKindCheckV2(f.db)
    expect(r).toMatchObject({ ran: true })
    const cols = (f.raw.prepare('PRAGMA table_info(nodes)').all() as Array<{ name: string }>).map(
      (c) => c.name
    )
    expect(cols).toContain('work_item_state')
    assertFullSet(f)
  })

  it('no-match semantics (A2): a DDL with no kind CHECK skips and surfaces, table untouched', () => {
    const raw = new DatabaseSync(':memory:')
    raw.exec(`
      CREATE TABLE nodes (id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL DEFAULT '');
      INSERT INTO nodes (id, kind) VALUES ('n1', 'task');
    `)
    const db = wrap(raw)
    const r = migrateNodesKindCheckV2(db)
    expect(r).toMatchObject({ ran: false, reason: 'no-check-clause' })
    // never fires vacuously: the table is untouched, no CHECK was added
    const ddl = raw
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='nodes'")
      .get() as { sql: string }
    expect(ddl.sql).not.toMatch(/CHECK/i)
    expect(raw.prepare('SELECT COUNT(*) AS n FROM nodes').get()).toEqual({ n: 1 })
  })

  it('missing nodes table reports no-nodes-table', () => {
    const raw = new DatabaseSync(':memory:')
    expect(migrateNodesKindCheckV2(wrap(raw))).toEqual({ ran: false, reason: 'no-nodes-table' })
  })
})
