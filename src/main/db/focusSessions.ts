import { randomUUID } from 'crypto'
import { getDb } from './database'
import type {
  FocusSession,
  FocusSessionCompletePatch,
  FocusSessionStartDraft
} from '@shared/types'

interface FocusSessionRow {
  id: string
  task_id: string | null
  kind: string
  planned_seconds: number
  started_at: number
  completed_at: number | null
  actual_seconds: number | null
  outcome: string | null
}

function rowToSession(row: FocusSessionRow): FocusSession {
  return {
    id: row.id,
    taskId: row.task_id,
    kind: row.kind,
    plannedSeconds: row.planned_seconds,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    actualSeconds: row.actual_seconds,
    outcome:
      row.outcome === 'done' || row.outcome === 'continued' || row.outcome === 'abandoned'
        ? row.outcome
        : null
  }
}

export function startFocusSession(draft: FocusSessionStartDraft): FocusSession {
  const db = getDb()
  const id = randomUUID()
  const now = Date.now()
  db.prepare(
    `INSERT INTO focus_sessions (id, task_id, kind, planned_seconds, started_at)
     VALUES (@id, @taskId, @kind, @plannedSeconds, @now)`
  ).run({
    id,
    taskId: draft.taskId,
    kind: draft.kind ?? '5min',
    plannedSeconds: draft.plannedSeconds,
    now
  })
  const row = db.prepare('SELECT * FROM focus_sessions WHERE id = ?').get(id) as
    | FocusSessionRow
    | undefined
  if (!row) throw new Error('focus session insert failed')
  return rowToSession(row)
}

export function completeFocusSession(
  id: string,
  patch: FocusSessionCompletePatch
): FocusSession | null {
  const db = getDb()
  const now = Date.now()
  db.prepare(
    `UPDATE focus_sessions
     SET completed_at = @now, actual_seconds = @actualSeconds, outcome = @outcome
     WHERE id = @id`
  ).run({
    id,
    now,
    actualSeconds: patch.actualSeconds,
    outcome: patch.outcome
  })
  const row = db.prepare('SELECT * FROM focus_sessions WHERE id = ?').get(id) as
    | FocusSessionRow
    | undefined
  return row ? rowToSession(row) : null
}

export function listRecentSessions(limit = 30, taskId?: string | null): FocusSession[] {
  const db = getDb()
  const rows = taskId
    ? (db
        .prepare(
          `SELECT * FROM focus_sessions WHERE task_id = ? ORDER BY started_at DESC LIMIT ?`
        )
        .all(taskId, limit) as FocusSessionRow[])
    : (db
        .prepare(`SELECT * FROM focus_sessions ORDER BY started_at DESC LIMIT ?`)
        .all(limit) as FocusSessionRow[])
  return rows.map(rowToSession)
}
