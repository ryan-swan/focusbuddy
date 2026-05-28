import { randomUUID } from 'crypto'
import { getDb } from './database'
import type { WidgetLink } from '@shared/types'

interface WidgetLinkRow {
  id: string
  source_widget_id: string
  target_widget_id: string
  task_id: string
  created_at: number
}

function rowToLink(row: WidgetLinkRow): WidgetLink {
  return {
    id: row.id,
    sourceWidgetId: row.source_widget_id,
    targetWidgetId: row.target_widget_id,
    taskId: row.task_id,
    createdAt: row.created_at
  }
}

export function listLinksByTask(taskId: string): WidgetLink[] {
  const db = getDb()
  const rows = db
    .prepare('SELECT * FROM widget_links WHERE task_id = ? ORDER BY created_at ASC')
    .all(taskId) as WidgetLinkRow[]
  return rows.map(rowToLink)
}

// Create a directed link. Returns the new link, or the existing one if a
// link in the same direction already exists (UNIQUE constraint catches the
// dup). We deliberately do NOT prevent the reverse direction — users can
// create A→B and B→A independently to express asymmetric semantics
// (e.g. "depends on" vs "blocks"). v1 doesn't surface direction visually,
// but the schema is ready for it later.
export function createLink(
  sourceWidgetId: string,
  targetWidgetId: string,
  taskId: string
): WidgetLink | null {
  if (sourceWidgetId === targetWidgetId) return null // no self-loops
  const db = getDb()
  const existing = db
    .prepare(
      'SELECT * FROM widget_links WHERE source_widget_id = ? AND target_widget_id = ?'
    )
    .get(sourceWidgetId, targetWidgetId) as WidgetLinkRow | undefined
  if (existing) return rowToLink(existing)
  const id = randomUUID()
  const now = Date.now()
  db.prepare(
    `INSERT INTO widget_links (id, source_widget_id, target_widget_id, task_id, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, sourceWidgetId, targetWidgetId, taskId, now)
  return {
    id,
    sourceWidgetId,
    targetWidgetId,
    taskId,
    createdAt: now
  }
}

export function deleteLink(id: string): boolean {
  const db = getDb()
  const result = db.prepare('DELETE FROM widget_links WHERE id = ?').run(id)
  return result.changes > 0
}
