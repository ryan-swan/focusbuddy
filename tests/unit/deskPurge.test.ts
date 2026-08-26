// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import {
  purgeDeskPermanently,
  assertNotSharedRoot,
  SharedDeskTrashRefusedError,
  WorkItemDeleteRefusedError,
  type LifecycleDb
} from '../../src/main/db/nodeLifecycle'
import { purgeMemoryForSubjects } from '../../src/main/db/memoryPurge'

// DEC-021 (L2) — the operator purge and its memory scope, adversarially:
// exactly the subject's rows die; everything else stays bit-identical; the
// preserve path (which never calls purge) leaves memory untouched by
// construction; work_items revive; shared roots and work_item roots refuse.

type Db = LifecycleDb & { exec(sql: string): void }

function freshDb(): { raw: DatabaseSync; db: Db } {
  const raw = new DatabaseSync(':memory:')
  raw.exec(`
    CREATE TABLE nodes (
      id TEXT PRIMARY KEY, parent_id TEXT, kind TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '', trashed_at INTEGER,
      shared_root_id TEXT, updated_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE widgets (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE
    );
    CREATE TABLE fb_memory (
      id TEXT PRIMARY KEY, text TEXT NOT NULL DEFAULT '',
      subject TEXT NOT NULL DEFAULT '', source_ref TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE fb_chunks (
      id TEXT PRIMARY KEY, source_type TEXT NOT NULL, source_id TEXT NOT NULL,
      room_id TEXT
    );
    CREATE TABLE fb_chunk_ledger (
      source_type TEXT NOT NULL, source_id TEXT NOT NULL, content_hash TEXT NOT NULL
    );
    CREATE TABLE context_review_points (
      user_id TEXT NOT NULL, object_id TEXT NOT NULL,
      PRIMARY KEY (user_id, object_id)
    );
  `)
  const db: Db = {
    exec: (sql) => raw.exec(sql),
    prepare: (sql) => {
      const s = raw.prepare(sql)
      return {
        run: (...a: unknown[]) => s.run(...(a as never[])),
        get: (...a: unknown[]) => s.get(...(a as never[])),
        all: (...a: unknown[]) => s.all(...(a as never[])) as unknown[]
      }
    }
  }
  return { raw, db }
}

function seed(raw: DatabaseSync): void {
  // Victim desk with a nested room, a work item, a widget, and memory.
  raw.exec(`
    INSERT INTO nodes (id, parent_id, kind, title) VALUES
      ('desk', NULL, 'task', 'Victim'),
      ('sub', 'desk', 'folder', 'Nested'),
      ('child', 'sub', 'task', 'Nested task'),
      ('wi', 'desk', 'work_item', 'Survivor'),
      ('other', NULL, 'task', 'Bystander');
    INSERT INTO widgets (id, task_id) VALUES ('w1', 'desk'), ('w2', 'child'), ('wOther', 'other');
    INSERT INTO fb_memory (id, subject, source_ref) VALUES
      ('m1', 'desk', ''), ('m2', '', 'chat:desk'), ('m3', '', 'chat:elsewhere'), ('m4', 'other', '');
    INSERT INTO fb_chunks (id, source_type, source_id, room_id) VALUES
      ('c1', 'widget', 'w1', NULL), ('c2', 'document', 'doc9', 'sub'),
      ('c3', 'document', 'doc9', 'otherroom'), ('c4', 'widget', 'wOther', NULL);
    INSERT INTO fb_chunk_ledger (source_type, source_id, content_hash) VALUES
      ('widget', 'w1', 'h1'), ('widget', 'wOther', 'h2');
    INSERT INTO context_review_points (user_id, object_id) VALUES ('u', 'desk'), ('u', 'other');
  `)
}

describe('purgeDeskPermanently — DEC-021 site 4/4', () => {
  it('kills the subtree + memory exactly; work item revives; bystanders bit-identical', () => {
    const { raw, db } = freshDb()
    seed(raw)
    const before = raw.prepare("SELECT * FROM fb_memory WHERE id IN ('m3','m4') ORDER BY id").all()

    const detached: string[] = []
    const purge = purgeDeskPermanently(db, 'desk', { onDetached: (id) => detached.push(id) })
    const memory = purgeMemoryForSubjects(db, { nodeIds: purge.nodeIds, widgetIds: purge.widgetIds })

    // The subtree died — desk, sub, child — the work item did NOT.
    expect(purge.purgedNodes).toBe(3)
    expect(purge.revived).toBe(1)
    expect(detached).toEqual(['wi'])
    const left = raw.prepare('SELECT id, parent_id FROM nodes ORDER BY id').all() as Array<{
      id: string
      parent_id: string | null
    }>
    expect(left.map((r) => r.id)).toEqual(['other', 'wi'])
    expect(left.find((r) => r.id === 'wi')?.parent_id).toBeNull()
    // Widgets of the subtree are gone; the bystander's stays.
    expect(raw.prepare('SELECT id FROM widgets ORDER BY id').all().map((r) => (r as { id: string }).id)).toEqual(['wOther'])

    // Memory scope: subject/desk-ref rows and subtree chunks died…
    expect(memory.memoryRows).toBe(2) // m1 (subject) + m2 (chat:desk)
    expect(memory.chunkRows).toBe(2) // c1 (widget w1) + c2 (room sub)
    expect(memory.ledgerRows).toBe(1) // widget w1
    expect(memory.reviewPoints).toBe(1) // object desk
    // …and NOTHING else moved a byte.
    const after = raw.prepare("SELECT * FROM fb_memory WHERE id IN ('m3','m4') ORDER BY id").all()
    expect(after).toEqual(before)
    expect(raw.prepare('SELECT id FROM fb_chunks ORDER BY id').all().map((r) => (r as { id: string }).id)).toEqual(['c3', 'c4'])
    expect(raw.prepare('SELECT object_id FROM context_review_points').all().map((r) => (r as { object_id: string }).object_id)).toEqual(['other'])
  })

  it('takes trashed descendants too (a half-trashed desk leaks no orphans)', () => {
    const { raw, db } = freshDb()
    raw.exec(`
      INSERT INTO nodes (id, parent_id, kind, trashed_at) VALUES
        ('desk', NULL, 'task', NULL), ('gone', 'desk', 'task', 123);
    `)
    const purge = purgeDeskPermanently(db, 'desk')
    expect(purge.purgedNodes).toBe(2)
    expect(raw.prepare('SELECT COUNT(*) AS n FROM nodes').get()).toEqual({ n: 0 })
  })

  it('refuses work_item roots (C2) and shared roots (D1); missing root is a no-op', () => {
    const { raw, db } = freshDb()
    raw.exec(`
      INSERT INTO nodes (id, kind, shared_root_id) VALUES
        ('wi', 'work_item', NULL), ('shared', 'task', 'shared');
    `)
    expect(() => purgeDeskPermanently(db, 'wi')).toThrow(WorkItemDeleteRefusedError)
    expect(() => purgeDeskPermanently(db, 'shared')).toThrow(SharedDeskTrashRefusedError)
    expect(() => assertNotSharedRoot(db, 'shared')).toThrow('shared — leave the share or archive')
    expect(purgeDeskPermanently(db, 'nope').purgedNodes).toBe(0)
    expect(raw.prepare('SELECT COUNT(*) AS n FROM nodes').get()).toEqual({ n: 2 })
  })

  it('purge is table-guarded: a db without memory tables purges nodes and reports zeros', () => {
    const raw = new DatabaseSync(':memory:')
    raw.exec(`CREATE TABLE nodes (id TEXT PRIMARY KEY, parent_id TEXT, kind TEXT NOT NULL, trashed_at INTEGER, shared_root_id TEXT, updated_at INTEGER DEFAULT 0);
      CREATE TABLE widgets (id TEXT PRIMARY KEY, task_id TEXT NOT NULL);
      INSERT INTO nodes (id, kind) VALUES ('desk', 'task');`)
    const db: Db = {
      exec: (sql) => raw.exec(sql),
      prepare: (sql) => {
        const s = raw.prepare(sql)
        return {
          run: (...a: unknown[]) => s.run(...(a as never[])),
          get: (...a: unknown[]) => s.get(...(a as never[])),
          all: (...a: unknown[]) => s.all(...(a as never[])) as unknown[]
        }
      }
    }
    const purge = purgeDeskPermanently(db, 'desk')
    const memory = purgeMemoryForSubjects(db, { nodeIds: purge.nodeIds, widgetIds: purge.widgetIds })
    expect(purge.purgedNodes).toBe(1)
    expect(memory).toEqual({ memoryRows: 0, chunkRows: 0, ledgerRows: 0, reviewPoints: 0 })
  })
})
