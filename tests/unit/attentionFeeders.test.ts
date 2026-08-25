// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import type { FbNode } from '../../src/shared/types'
import {
  deskDueSignals,
  deskStaleSignals,
  feederSignals,
  mutedCountOfKind
} from '../../src/renderer/src/lib/attentionFeeders'
import {
  ensureWorkItemSchema,
  postDeadlineNudgesCore,
  sourceTypeSuppressedCore,
  SOURCE_SUPPRESS_THRESHOLD
} from '../../src/main/db/workItems'
import { ensureNotificationSchema, sweepDeliveries } from '../../src/main/notifications/substrate'
import type { LifecycleDb } from '../../src/main/db/nodeLifecycle'

// S7 — the feeders (one-directional desk→attention signals), the single
// proactive nudge trigger (deadline proximity, once per item per due-day),
// and Δ10's source-type suppression.

const NOW = Date.parse('2026-08-25T10:00:00Z')
const DAY = 24 * 60 * 60 * 1000

function desk(over: Partial<FbNode>): FbNode {
  return {
    id: Math.random().toString(36).slice(2),
    parentId: null,
    kind: 'task',
    title: 'Desk',
    description: '',
    status: 'open',
    priority: 3,
    interest: 3,
    importance: 3,
    sortOrder: 0,
    createdAt: NOW,
    updatedAt: NOW,
    startedAt: null,
    completedAt: null,
    estimateMinutes: null,
    extensionsMinutes: 0,
    resumeMarkdown: null,
    resumeUpdatedAt: null,
    dueDate: null,
    archived: false,
    isPlan: false,
    sharedFromHandle: null,
    sharedRootId: null,
    ...over
  } as FbNode
}

describe('feeders — desks surface AS attention, computed and one-directional', () => {
  it('due signals: open desks due within 7 days, urgency-ordered; done/archived/far excluded', () => {
    const nodes = [
      desk({ id: 'overdue', dueDate: NOW - DAY }),
      desk({ id: 'soon', dueDate: NOW + DAY }),
      desk({ id: 'far', dueDate: NOW + 20 * DAY }),
      desk({ id: 'done', dueDate: NOW + DAY, status: 'done' }),
      desk({ id: 'archived', dueDate: NOW + DAY, archived: true }),
      desk({ id: 'undated' })
    ]
    const s = deskDueSignals(nodes, NOW)
    expect(s.map((x) => x.id)).toEqual(['overdue', 'soon'])
    expect(s[0].line).toBe('Past due')
    expect(s[1].line).toBe('Due tomorrow')
  })

  it('mutes silence one signal or a whole kind; counts drive the Δ10 offer', () => {
    const nodes = [desk({ id: 'a', dueDate: NOW + DAY }), desk({ id: 'b', dueDate: NOW + 2 * DAY })]
    const stale = [{ id: 's1', title: 'Quiet', daysQuiet: 9 }]
    const none = feederSignals(nodes, stale, NOW, new Set())
    expect(none).toHaveLength(3)
    const oneMuted = feederSignals(nodes, stale, NOW, new Set(['desk-due:a']))
    expect(oneMuted.map((x) => x.id).sort()).toEqual(['b', 's1'])
    const kindMuted = feederSignals(nodes, stale, NOW, new Set(['kind:desk-due']))
    expect(kindMuted.map((x) => x.id)).toEqual(['s1'])
    expect(mutedCountOfKind(new Set(['desk-due:a', 'desk-due:b', 'desk-stale:x']), 'desk-due')).toBe(2)
    expect(deskStaleSignals(stale)[0].line).toBe('Quiet for 9 days')
  })
})

type Db = LifecycleDb & { exec(sql: string): void }
function freshDb(): { raw: DatabaseSync; db: Db } {
  const raw = new DatabaseSync(':memory:')
  raw.exec(`
    CREATE TABLE nodes (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open', trashed_at INTEGER,
      org_id TEXT NOT NULL DEFAULT 'personal', updated_at INTEGER NOT NULL DEFAULT 0
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
  ensureNotificationSchema(db)
  return { raw, db }
}

describe('the deadline nudge — once per item per due-day, capped substrate', () => {
  it('posts for actionable items due within 24h; dedupes on re-sweep; skips terminal/far/fyi', () => {
    const { raw, db } = freshDb()
    const dueSoon = new Date(NOW + 6 * 60 * 60 * 1000).toISOString()
    const ins = raw.prepare(
      "INSERT INTO nodes (id, kind, title, work_item_state, intent_class, due_at) VALUES (?, 'work_item', ?, ?, ?, ?)"
    )
    ins.run('a', 'Call Bob', 'open', 'action', dueSoon)
    ins.run('fyi', 'Note', 'open', 'fyi', dueSoon)
    ins.run('done', 'Done one', 'completed', 'action', dueSoon)
    ins.run('far', 'Later', 'open', 'action', new Date(NOW + 5 * DAY).toISOString())
    expect(postDeadlineNudgesCore(db, NOW)).toBe(1)
    expect(postDeadlineNudgesCore(db, NOW + 60_000)).toBe(0) // once EVER per due-day
    const out = sweepDeliveries(db, NOW + 120_000)
    expect(out.filter((d) => d.queue === 'action')).toHaveLength(1)
  })
})

describe('Δ10 — source-type suppression (main half)', () => {
  it('suppresses only after the last N AI-suggested items of a source were ALL dismissed', () => {
    const { raw, db } = freshDb()
    const ins = raw.prepare(
      "INSERT INTO nodes (id, kind, title, work_item_state, source_type, wi_origin, approval_state, updated_at) VALUES (?, 'work_item', 'x', ?, ?, 'ai', 'suggested', ?)"
    )
    // Two dismissals — below threshold.
    ins.run('m1', 'dismissed', 'mail', 1)
    ins.run('m2', 'dismissed', 'mail', 2)
    expect(sourceTypeSuppressedCore(db, 'mail', 'personal')).toBe(false)
    // Third dismissal → suppressed.
    ins.run('m3', 'dismissed', 'mail', 3)
    expect(sourceTypeSuppressedCore(db, 'mail', 'personal')).toBe(true)
    // An acceptance among the recent set breaks the streak.
    ins.run('m4', 'completed', 'mail', 4)
    expect(sourceTypeSuppressedCore(db, 'mail', 'personal')).toBe(false)
    // Other sources unaffected.
    expect(sourceTypeSuppressedCore(db, 'browser', 'personal')).toBe(false)
  })
})
