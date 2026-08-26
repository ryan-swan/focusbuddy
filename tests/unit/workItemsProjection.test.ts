// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import {
  WORK_ITEM_COLUMNS,
  WORK_ITEM_SCHEMA_EPOCH,
  WORK_ITEM_STATES,
  statusForWorkItemState
} from '../../src/shared/workItems'
import {
  ensureWorkItemSchema,
  normalizeAppliedWorkItem,
  setWorkItemStateCore,
  setDetachedFrom,
  workItemDetachHook
} from '../../src/main/db/workItems'
import { detachAndReviveWorkItemDescendants, type LifecycleDb } from '../../src/main/db/nodeLifecycle'

// ARCHITECTURE §2.2–§2.4 — the status projection pins (A-02), the apply-side
// recompute (F012), the leaf invariant on replicated rows (F-M3″), the
// schema_epoch receiver guard (F-M5″), the satellites + orphan reconciliation
// (R017), and the detach hook wiring into wi_local.detached_from_id (F-M6″).

type Db = LifecycleDb & { exec(sql: string): void }

function freshDb(): { raw: DatabaseSync; db: Db } {
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
  ensureWorkItemSchema(db)
  return { raw, db }
}

describe('the status projection (§2.3, A-02) — every state, table-driven', () => {
  const expected: Record<string, string> = {
    open: 'open',
    suggested: 'open',
    stale: 'open',
    waiting: 'open',
    blocked: 'open',
    in_progress: 'in_progress',
    delegated: 'in_progress',
    needs_review: 'in_progress',
    needs_approval: 'in_progress',
    acknowledged: 'done',
    answered: 'done',
    scheduled: 'done',
    delivered: 'done',
    reviewed: 'done',
    completed: 'done',
    discussed: 'done',
    decided: 'done',
    dismissed: 'parked',
    reclassified: 'parked',
    archived: 'parked'
  }

  it('covers exactly the declared state set', () => {
    expect(Object.keys(expected).sort()).toEqual([...WORK_ITEM_STATES].sort())
  })

  it.each(Object.entries(expected))('%s → %s', (state, status) => {
    expect(statusForWorkItemState(state)).toBe(status)
  })

  it('dismissed/reclassified/archived are NEVER done, and unknown future states coarsen to open', () => {
    expect(statusForWorkItemState('dismissed')).not.toBe('done')
    expect(statusForWorkItemState('reclassified')).not.toBe('done')
    expect(statusForWorkItemState('archived')).not.toBe('done')
    expect(statusForWorkItemState('some_future_state')).toBe('open')
  })
})

describe('setWorkItemStateCore — the one write path recomputes the projection', () => {
  it('writes state + derived status together; refuses non-work_items and bad states', () => {
    const { raw, db } = freshDb()
    raw.exec(
      "INSERT INTO nodes (id, kind, title, work_item_state) VALUES ('wi', 'work_item', 'Call Bob', 'open')"
    )
    raw.exec("INSERT INTO nodes (id, kind, title) VALUES ('desk', 'task', 'A desk')")
    expect(setWorkItemStateCore(db, 'wi', 'dismissed')).toBe(true)
    const row = raw.prepare('SELECT work_item_state, status FROM nodes WHERE id = ?').get('wi') as {
      work_item_state: string
      status: string
    }
    expect(row).toEqual({ work_item_state: 'dismissed', status: 'parked' })
    expect(setWorkItemStateCore(db, 'desk', 'completed')).toBe(false)
    expect(setWorkItemStateCore(db, 'wi', 'bogus' as never)).toBe(false)
  })
})

describe('normalizeAppliedWorkItem — the apply-site recompute (F012)', () => {
  it('a hostile wire status is overwritten by the local projection', () => {
    const { raw, db } = freshDb()
    raw.exec(
      "INSERT INTO nodes (id, kind, title, work_item_state, status, schema_epoch) VALUES ('wi', 'work_item', 'X', 'dismissed', 'done', 1)"
    )
    expect(normalizeAppliedWorkItem(db, 'wi')).toBe('applied')
    const row = raw.prepare('SELECT status FROM nodes WHERE id = ?').get('wi') as { status: string }
    expect(row.status).toBe('parked') // never-done survived the wire
  })

  it('a replicated child-under-work_item is detached (leaf invariant, F-M3″)', () => {
    const { raw, db } = freshDb()
    raw.exec("INSERT INTO nodes (id, kind, title, work_item_state, schema_epoch) VALUES ('parent-wi', 'work_item', 'P', 'open', 1)")
    raw.exec(
      "INSERT INTO nodes (id, parent_id, kind, title, work_item_state, schema_epoch) VALUES ('child-wi', 'parent-wi', 'work_item', 'C', 'open', 1)"
    )
    expect(normalizeAppliedWorkItem(db, 'child-wi')).toBe('applied')
    const row = raw.prepare('SELECT parent_id FROM nodes WHERE id = ?').get('child-wi') as {
      parent_id: string | null
    }
    expect(row.parent_id).toBeNull()
  })

  it('a row from a NEWER schema epoch parks (F-M5″) and is left as-delivered', () => {
    const { raw, db } = freshDb()
    raw.exec(
      `INSERT INTO nodes (id, kind, title, work_item_state, status, schema_epoch) VALUES ('wi', 'work_item', 'X', 'open', 'done', ${WORK_ITEM_SCHEMA_EPOCH + 1})`
    )
    expect(normalizeAppliedWorkItem(db, 'wi')).toBe('parked-epoch')
    const row = raw.prepare('SELECT status FROM nodes WHERE id = ?').get('wi') as { status: string }
    expect(row.status).toBe('done') // untouched — the caller surfaces the park
  })

  it('non-work_items are untouched', () => {
    const { raw, db } = freshDb()
    raw.exec("INSERT INTO nodes (id, kind, title, status) VALUES ('desk', 'task', 'D', 'in_progress')")
    expect(normalizeAppliedWorkItem(db, 'desk')).toBe('not-work-item')
    const row = raw.prepare('SELECT status FROM nodes WHERE id = ?').get('desk') as { status: string }
    expect(row.status).toBe('in_progress')
  })

  it('a LEGACY intent_class canonicalizes on apply (taxonomy alignment convergence)', () => {
    // The revert mechanism this guards: a 409 conflict-apply (or an
    // un-updated peer's push) delivers a stale legacy copy — the apply-site
    // normalization must map it forward so the rename cannot regress.
    const { raw, db } = freshDb()
    raw.exec(
      "INSERT INTO nodes (id, kind, title, work_item_state, intent_class, schema_epoch) VALUES ('wi', 'work_item', 'X', 'open', 'acknowledgment', 1)"
    )
    expect(normalizeAppliedWorkItem(db, 'wi')).toBe('applied')
    const row = raw.prepare('SELECT intent_class FROM nodes WHERE id = ?').get('wi') as {
      intent_class: string
    }
    expect(row.intent_class).toBe('to_respond')
    // Current values pass through untouched; unknown values store verbatim.
    raw.exec(
      "INSERT INTO nodes (id, kind, title, work_item_state, intent_class, schema_epoch) VALUES ('wi2', 'work_item', 'Y', 'open', 'to_decide', 1)"
    )
    normalizeAppliedWorkItem(db, 'wi2')
    expect(
      (raw.prepare('SELECT intent_class FROM nodes WHERE id = ?').get('wi2') as { intent_class: string })
        .intent_class
    ).toBe('to_decide')
    raw.exec(
      "INSERT INTO nodes (id, kind, title, work_item_state, intent_class, schema_epoch) VALUES ('wi3', 'work_item', 'Z', 'open', 'future_class', 1)"
    )
    normalizeAppliedWorkItem(db, 'wi3')
    expect(
      (raw.prepare('SELECT intent_class FROM nodes WHERE id = ?').get('wi3') as { intent_class: string })
        .intent_class
    ).toBe('future_class')
  })
})

describe('satellites (§2.4) + orphan reconciliation (R017) + the detach hook', () => {
  it('ensureWorkItemSchema adds every manifest column and is idempotent', () => {
    const { raw, db } = freshDb()
    ensureWorkItemSchema(db) // second run — must not throw
    const cols = new Set(
      (raw.prepare('PRAGMA table_info(nodes)').all() as Array<{ name: string }>).map((c) => c.name)
    )
    for (const def of WORK_ITEM_COLUMNS) expect(cols.has(def.column), def.column).toBe(true)
  })

  it('the startup sweep removes satellite rows whose item is gone', () => {
    const { raw, db } = freshDb()
    raw.exec("INSERT INTO nodes (id, kind, title) VALUES ('alive', 'work_item', 'A')")
    setDetachedFrom(db, 'alive', 'old-desk')
    raw.exec("INSERT INTO wi_local (item_id, detached_from_id) VALUES ('ghost', 'x')")
    ensureWorkItemSchema(db) // runs the sweep
    const rows = raw.prepare('SELECT item_id FROM wi_local ORDER BY item_id').all() as Array<{
      item_id: string
    }>
    expect(rows).toEqual([{ item_id: 'alive' }])
  })

  it('a lifecycle detach records detached_from_id via the hook (F-M6″)', () => {
    const { raw, db } = freshDb()
    raw.exec("INSERT INTO nodes (id, kind, title) VALUES ('desk', 'task', 'D')")
    raw.exec("INSERT INTO nodes (id, parent_id, kind, title) VALUES ('wi', 'desk', 'work_item', 'W')")
    detachAndReviveWorkItemDescendants(db, ['desk'], workItemDetachHook(db))
    const local = raw.prepare('SELECT detached_from_id FROM wi_local WHERE item_id = ?').get('wi') as {
      detached_from_id: string
    }
    expect(local.detached_from_id).toBe('desk')
  })
})
