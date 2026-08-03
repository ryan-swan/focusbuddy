import { randomUUID } from 'crypto'
import { getDb } from './database'
import { getActiveOrgId } from './activeOrg'
import type { ActivityEvent, ActivityRecordDraft } from '@shared/types'

interface ActivityRow {
  id: string
  task_id: string | null
  ts: number
  kind: string
  payload: string | null
}

function rowToEvent(row: ActivityRow): ActivityEvent {
  let payload: Record<string, unknown> = {}
  if (row.payload) {
    try {
      const parsed = JSON.parse(row.payload)
      if (parsed && typeof parsed === 'object') payload = parsed
    } catch {
      // ignore malformed payloads — better to return the event with empty payload than throw
    }
  }
  return {
    id: row.id,
    taskId: row.task_id,
    ts: row.ts,
    kind: row.kind as ActivityEvent['kind'],
    payload
  }
}

export function recordActivity(draft: ActivityRecordDraft): void {
  const db = getDb()
  const id = randomUUID()
  const now = Date.now()
  db.prepare(
    `INSERT INTO activity_log (id, task_id, ts, kind, payload, org_id) VALUES (@id, @taskId, @ts, @kind, @payload, @orgId)`
  ).run({
    id,
    taskId: draft.taskId,
    ts: now,
    kind: draft.kind,
    payload: draft.payload ? JSON.stringify(draft.payload) : null,
    orgId: getActiveOrgId()
  })
}

export function getRecentActivity(opts: {
  taskId?: string | null
  sinceMs?: number
  limit?: number
}): ActivityEvent[] {
  const db = getDb()
  const limit = opts.limit ?? 80
  const sinceMs = opts.sinceMs ?? 0
  let rows: ActivityRow[]
  if (opts.taskId) {
    rows = db
      .prepare(
        `SELECT * FROM activity_log WHERE task_id = ? AND ts >= ? ORDER BY ts DESC LIMIT ?`
      )
      .all(opts.taskId, sinceMs, limit) as ActivityRow[]
  } else {
    rows = db
      .prepare(`SELECT * FROM activity_log WHERE ts >= ? AND org_id = ? ORDER BY ts DESC LIMIT ?`)
      .all(sinceMs, getActiveOrgId(), limit) as ActivityRow[]
  }
  return rows.map(rowToEvent)
}

// Keep the log bounded — ~5000 most recent events. Runs lazily; not on every insert.
export function pruneActivity(keep = 5000): void {
  const db = getDb()
  db.prepare(
    `DELETE FROM activity_log WHERE id NOT IN (
       SELECT id FROM activity_log ORDER BY ts DESC LIMIT ?
     )`
  ).run(keep)
}
