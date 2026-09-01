// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import {
  INTENT_CLASSES,
  LEGACY_INTENT_CLASS_MAP,
  canonicalIntentClass,
  normalizeIntentClass
} from '../../src/shared/workItems'
import { ensureWorkItemSchema } from '../../src/main/db/workItems'
import {
  migrateIntentTaxonomyV2,
  type TaxonomyMigrationDb
} from '../../src/main/db/migrateIntentTaxonomy'

// Taxonomy alignment stage — the value migration (analysis/22 §3: "the rename
// migration is a real stage") and the canonical mapping every boundary uses.

function freshDb(): { raw: DatabaseSync; db: TaxonomyMigrationDb & { exec(sql: string): void } } {
  const raw = new DatabaseSync(':memory:')
  raw.exec(`
    CREATE TABLE nodes (
      id TEXT PRIMARY KEY,
      parent_id TEXT REFERENCES nodes(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('folder', 'task', 'task-item', 'work_item')),
      title TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open',
      trashed_at INTEGER,
      updated_at INTEGER NOT NULL DEFAULT 0
    );
  `)
  const db = {
    exec: (sql: string) => raw.exec(sql),
    prepare: (sql: string) => {
      const s = raw.prepare(sql)
      return {
        run: (...a: unknown[]) => s.run(...(a as never[])),
        get: (...a: unknown[]) => s.get(...(a as never[])),
        all: (...a: unknown[]) => s.all(...(a as never[])) as unknown[]
      }
    }
  }
  ensureWorkItemSchema(db as never)
  return { raw, db }
}

const insertItem = (raw: DatabaseSync, id: string, cls: string | null): void => {
  raw
    .prepare(
      `INSERT INTO nodes (id, kind, title, work_item_state, intent_class) VALUES (?, 'work_item', ?, 'open', ?)`
    )
    .run(id, id, cls)
}

describe('canonicalIntentClass / normalizeIntentClass', () => {
  it('current classes pass through; every legacy class maps forward; garbage drops', () => {
    for (const c of INTENT_CLASSES) expect(canonicalIntentClass(c)).toBe(c)
    for (const [legacy, canonical] of Object.entries(LEGACY_INTENT_CLASS_MAP)) {
      expect(canonicalIntentClass(legacy)).toBe(canonical)
      expect((INTENT_CLASSES as readonly string[]).includes(canonical)).toBe(true)
    }
    expect(canonicalIntentClass('nonsense')).toBeUndefined()
    expect(canonicalIntentClass(undefined)).toBeUndefined()
    expect(normalizeIntentClass('acknowledgment')).toBe('to_respond')
    expect(normalizeIntentClass('direct')).toBe('to_respond')
  })
})

describe('migrateIntentTaxonomyV2', () => {
  it('renames every legacy value on work_item rows, records pre-images, leaves new values alone', () => {
    const { raw, db } = freshDb()
    const legacies = Object.keys(LEGACY_INTENT_CLASS_MAP)
    legacies.forEach((cls, i) => insertItem(raw, `l${i}`, cls))
    insertItem(raw, 'already', 'to_do')
    insertItem(raw, 'nullcls', null)
    // A non-work_item row with a legacy-looking value must NOT be touched.
    raw
      .prepare(`INSERT INTO nodes (id, kind, title, intent_class) VALUES ('desk', 'task', 'Desk', 'action')`)
      .run()

    const res = migrateIntentTaxonomyV2(db)
    expect(res.ran).toBe(true)
    expect(res.renamed).toEqual(Object.fromEntries(legacies.map((l) => [l, 1])))

    const rows = raw
      .prepare(`SELECT id, intent_class AS cls FROM nodes WHERE kind = 'work_item'`)
      .all() as Array<{ id: string; cls: string | null }>
    for (const r of rows) {
      if (r.id === 'nullcls') expect(r.cls).toBeNull()
      else expect((INTENT_CLASSES as readonly string[]).includes(r.cls!)).toBe(true)
    }
    // The merge is observable: both merge sources became to_respond.
    const respond = rows.filter((r) => r.cls === 'to_respond')
    expect(respond).toHaveLength(2)
    // The desk row kept its (unrelated) value.
    const desk = raw.prepare(`SELECT intent_class AS cls FROM nodes WHERE id = 'desk'`).get() as {
      cls: string
    }
    expect(desk.cls).toBe('action')
    // Every renamed row has its pre-image in the backup table.
    const backup = raw
      .prepare(`SELECT item_id, old_class FROM wi_intent_taxonomy_backup ORDER BY item_id`)
      .all() as Array<{ item_id: string; old_class: string }>
    expect(backup).toHaveLength(legacies.length)
    for (const b of backup) expect(legacies).toContain(b.old_class)
  })

  it('is idempotent: a re-run renames nothing and never overwrites a pre-image', () => {
    const { raw, db } = freshDb()
    insertItem(raw, 'x', 'acknowledgment')
    expect(migrateIntentTaxonomyV2(db).renamed).toEqual({ acknowledgment: 1 })
    const before = raw
      .prepare(`SELECT old_class FROM wi_intent_taxonomy_backup WHERE item_id = 'x'`)
      .get() as { old_class: string }
    expect(before.old_class).toBe('acknowledgment')

    const second = migrateIntentTaxonomyV2(db)
    expect(second.ran).toBe(true)
    expect(second.renamed).toEqual({})
    const after = raw
      .prepare(`SELECT old_class FROM wi_intent_taxonomy_backup WHERE item_id = 'x'`)
      .get() as { old_class: string }
    expect(after.old_class).toBe('acknowledgment') // OR IGNORE held
  })

  it('converges a legacy value an un-updated peer pushed AFTER the first run', () => {
    const { raw, db } = freshDb()
    migrateIntentTaxonomyV2(db)
    insertItem(raw, 'straggler', 'loose_thought') // peer push between runs
    const res = migrateIntentTaxonomyV2(db)
    expect(res.renamed).toEqual({ loose_thought: 1 })
    const row = raw.prepare(`SELECT intent_class AS cls FROM nodes WHERE id = 'straggler'`).get() as {
      cls: string
    }
    expect(row.cls).toBe('to_remember')
  })

  it('remaps wi_notifications queue values when the substrate table exists', () => {
    const { raw, db } = freshDb()
    raw.exec(`CREATE TABLE wi_notifications (id TEXT PRIMARY KEY, queue TEXT NOT NULL)`)
    raw.prepare(`INSERT INTO wi_notifications (id, queue) VALUES ('n1', 'action')`).run()
    raw.prepare(`INSERT INTO wi_notifications (id, queue) VALUES ('n2', 'fyi')`).run()
    raw.prepare(`INSERT INTO wi_notifications (id, queue) VALUES ('n3', 'to_do')`).run()
    const res = migrateIntentTaxonomyV2(db)
    expect(res.notificationsRemapped).toBe(2)
    const queues = (
      raw.prepare(`SELECT queue FROM wi_notifications ORDER BY id`).all() as Array<{ queue: string }>
    ).map((r) => r.queue)
    expect(queues).toEqual(['to_do', 'to_know', 'to_do'])
  })

  it('skips cleanly on a pre-S2 database with no intent_class column', () => {
    const raw = new DatabaseSync(':memory:')
    raw.exec(`CREATE TABLE nodes (id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL DEFAULT '')`)
    const db = {
      exec: (sql: string) => raw.exec(sql),
      prepare: (sql: string) => {
        const s = raw.prepare(sql)
        return {
          run: (...a: unknown[]) => s.run(...(a as never[])),
          get: (...a: unknown[]) => s.get(...(a as never[])),
          all: (...a: unknown[]) => s.all(...(a as never[])) as unknown[]
        }
      }
    }
    expect(migrateIntentTaxonomyV2(db)).toEqual({ ran: false, renamed: {}, notificationsRemapped: 0 })
  })
})
