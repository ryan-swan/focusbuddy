import { randomUUID } from 'crypto'
import { getDb } from './database'
import type { WidgetLink, WireType } from '@shared/types'

interface WidgetLinkRow {
  id: string
  source_widget_id: string
  target_widget_id: string
  task_id: string
  created_at: number
  type: string | null
  verb: string | null
  enabled: number | null
}

function rowToLink(row: WidgetLinkRow): WidgetLink {
  const type = (row.type ?? 'context') as WireType
  return {
    id: row.id,
    sourceWidgetId: row.source_widget_id,
    targetWidgetId: row.target_widget_id,
    taskId: row.task_id,
    createdAt: row.created_at,
    type: type === 'transform' || type === 'mirror' ? type : 'context',
    verb: row.verb ?? '',
    // SQLite has no booleans; legacy rows with NULL default to enabled.
    enabled: row.enabled === null ? true : row.enabled !== 0
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
// create A→B and B→A independently to express asymmetric semantics.
//
// New wires default to the passive 'context' type so creation never triggers
// any autonomous behavior; the user upgrades a wire to transform/mirror after
// the fact via the wire editor.
export function createLink(
  sourceWidgetId: string,
  targetWidgetId: string,
  taskId: string,
  type: WireType = 'context'
): WidgetLink | null {
  if (sourceWidgetId === targetWidgetId) return null // no self-loops
  const db = getDb()
  const existing = db
    .prepare('SELECT * FROM widget_links WHERE source_widget_id = ? AND target_widget_id = ?')
    .get(sourceWidgetId, targetWidgetId) as WidgetLinkRow | undefined
  if (existing) return rowToLink(existing)
  const id = randomUUID()
  const now = Date.now()
  db.prepare(
    `INSERT INTO widget_links (id, source_widget_id, target_widget_id, task_id, created_at, type, verb, enabled)
     VALUES (?, ?, ?, ?, ?, ?, '', 1)`
  ).run(id, sourceWidgetId, targetWidgetId, taskId, now, type)
  return {
    id,
    sourceWidgetId,
    targetWidgetId,
    taskId,
    createdAt: now,
    type,
    verb: '',
    enabled: true
  }
}

export interface WireUpdate {
  type?: WireType
  verb?: string
  enabled?: boolean
}

// Update a wire's live-wire fields. Returns the updated link or null if the id
// is unknown. Only the three live-wire fields are mutable; endpoints are fixed.
export function updateLink(id: string, patch: WireUpdate): WidgetLink | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM widget_links WHERE id = ?').get(id) as
    | WidgetLinkRow
    | undefined
  if (!row) return null
  const next = rowToLink(row)
  const type = patch.type ?? next.type
  const verb = patch.verb ?? next.verb
  const enabled = patch.enabled ?? next.enabled
  db.prepare('UPDATE widget_links SET type = ?, verb = ?, enabled = ? WHERE id = ?').run(
    type,
    verb,
    enabled ? 1 : 0,
    id
  )
  return { ...next, type, verb, enabled }
}

export function deleteLink(id: string): boolean {
  const db = getDb()
  const result = db.prepare('DELETE FROM widget_links WHERE id = ?').run(id)
  return result.changes > 0
}
