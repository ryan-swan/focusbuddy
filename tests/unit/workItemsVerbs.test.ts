// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  ensureWorkItemSchema,
  updateWorkItemFieldsCore,
  reclassifyWorkItemCore,
  snoozeWorkItemCore,
  markWorkItemReadCore,
  workItemCountsCore,
  setWorkItemStateCore
} from '../../src/main/db/workItems'
import type { LifecycleDb } from '../../src/main/db/nodeLifecycle'

// S3 (§4) — the workItems:* verb set over the S2 db module, plus the
// namespace-parity locks: every verb wired IPC→preload→store, work items
// never travel nodes:*, and state/status stay un-patchable outside setState.

type Db = LifecycleDb & { exec(sql: string): void }

function freshDb(): { raw: DatabaseSync; db: Db } {
  const raw = new DatabaseSync(':memory:')
  raw.exec(`
    CREATE TABLE nodes (
      id TEXT PRIMARY KEY,
      parent_id TEXT,
      kind TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open',
      trashed_at INTEGER,
      org_id TEXT NOT NULL DEFAULT 'personal',
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

const wi = (raw: DatabaseSync, id: string, state = 'open'): void => {
  raw
    .prepare(
      "INSERT INTO nodes (id, kind, title, work_item_state, status) VALUES (?, 'work_item', ?, ?, ?)"
    )
    .run(id, `Item ${id}`, state, 'open')
}

describe('updateFields / reclassify', () => {
  it('patches the patchable set, refuses non-work_items, and cannot touch state or status', () => {
    const { raw, db } = freshDb()
    wi(raw, 'a')
    raw.exec("INSERT INTO nodes (id, kind, title) VALUES ('desk', 'task', 'D')")
    expect(
      updateWorkItemFieldsCore(db, 'a', {
        title: 'Renamed',
        notes: 'details',
        dueAt: '2026-09-01T12:00:00Z',
        wiUrgency: 'high',
        // hostile keys — must be ignored, not written
        status: 'done',
        workItemState: 'completed',
        work_item_state: 'completed'
      })
    ).toBe(true)
    const row = raw
      .prepare('SELECT title, description, due_at, wi_urgency, status, work_item_state FROM nodes WHERE id = ?')
      .get('a') as Record<string, string>
    expect(row.title).toBe('Renamed')
    expect(row.description).toBe('details')
    expect(row.due_at).toBe('2026-09-01T12:00:00Z')
    expect(row.wi_urgency).toBe('high')
    expect(row.status).toBe('open') // untouched — derived only
    expect(row.work_item_state).toBe('open') // untouched — setState only
    expect(updateWorkItemFieldsCore(db, 'desk', { title: 'X' })).toBe(false)
  })

  it('reclassify re-bins intent and leaves the item active', () => {
    const { raw, db } = freshDb()
    wi(raw, 'a')
    expect(reclassifyWorkItemCore(db, 'a', 'review')).toBe(true)
    const row = raw.prepare('SELECT intent_class, work_item_state FROM nodes WHERE id = ?').get('a') as {
      intent_class: string
      work_item_state: string
    }
    expect(row).toEqual({ intent_class: 'review', work_item_state: 'open' })
  })
})

describe('snooze / markRead (wi_local, device-local)', () => {
  it('upserts satellite state without touching the node row', () => {
    const { raw, db } = freshDb()
    wi(raw, 'a')
    snoozeWorkItemCore(db, 'a', 12345)
    markWorkItemReadCore(db, 'a')
    snoozeWorkItemCore(db, 'a', null) // un-snooze keeps read_at
    const local = raw.prepare('SELECT snooze_until, read_at FROM wi_local WHERE item_id = ?').get('a') as {
      snooze_until: number | null
      read_at: number
    }
    expect(local.snooze_until).toBeNull()
    expect(local.read_at).toBeGreaterThan(0)
  })
})

describe('counts', () => {
  it('groups by work_item_state, excludes trashed, scopes by org', () => {
    const { raw, db } = freshDb()
    wi(raw, 'a', 'open')
    wi(raw, 'b', 'open')
    wi(raw, 'c', 'completed')
    setWorkItemStateCore(db, 'c', 'completed')
    wi(raw, 'trash', 'open')
    raw.exec("UPDATE nodes SET trashed_at = 1 WHERE id = 'trash'")
    raw.exec("INSERT INTO nodes (id, kind, title, work_item_state, org_id) VALUES ('org', 'work_item', 'O', 'open', 'some-org')")
    expect(workItemCountsCore(db, 'personal')).toEqual({ open: 2, completed: 1 })
  })
})

describe('namespace parity locks (§4)', () => {
  const ROOT = join(__dirname, '..', '..')
  const read = (p: string): string => readFileSync(join(ROOT, p), 'utf-8')
  const VERBS = ['list', 'get', 'create', 'updateFields', 'setState', 'reclassify', 'snooze', 'markRead', 'counts']

  it('every verb is wired IPC → preload', () => {
    const ipc = read('src/main/ipc/index.ts')
    const preload = read('src/preload/index.ts')
    for (const v of VERBS) {
      expect(ipc, `ipc workItems:${v}`).toContain(`'workItems:${v}'`)
      expect(preload, `preload workItems:${v}`).toContain(`'workItems:${v}'`)
    }
  })

  it('the store is the live-path producer and never touches nodes:*', () => {
    const store = read('src/renderer/src/stores/workItems.ts')
    expect(store).toContain('crdtEmitNodeCreate(item)')
    expect(store).toContain("crdtEmitNodeAttrs(id, { workItemState: state })")
    expect(store).not.toContain('api.nodes.')
    // status is never emitted — receivers derive their own projection.
    expect(store).not.toMatch(/crdtEmitNodeAttrs\([^)]*status:/)
  })

  it('the creation seam listens beside fb:command-new-task', () => {
    const sidebar = read('src/renderer/src/components/Sidebar.tsx')
    expect(sidebar).toContain("'fb:command-new-work-item'")
  })

  it('the sync loop refreshes the work-item store after pulls', () => {
    const sync = read('src/renderer/src/lib/workspaceSync.ts')
    expect(sync).toContain('useWorkItemStore.getState().refresh()')
  })
})
