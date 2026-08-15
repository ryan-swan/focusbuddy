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
  last_run_at: number | null
  last_error: string | null
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
    enabled: row.enabled === null ? true : row.enabled !== 0,
    lastRunAt: row.last_run_at ?? null,
    lastError: row.last_error ?? null
  }
}

export function listLinksByTask(taskId: string): WidgetLink[] {
  const db = getDb()
  const rows = db
    .prepare('SELECT * FROM widget_links WHERE task_id = ? ORDER BY created_at ASC')
    .all(taskId) as WidgetLinkRow[]
  return rows.map(rowToLink)
}

// A single link by id. Needed on delete so the caller can read the endpoints
// before the row is gone (e.g. to remove the mirrored graph relationship).
export function getLink(id: string): WidgetLink | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM widget_links WHERE id = ?').get(id) as WidgetLinkRow | undefined
  return row ? rowToLink(row) : null
}

// Every link across all tasks. Used to backfill the relationship graph from links
// that already existed before links began mirroring into it.
export function listAllLinks(): WidgetLink[] {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM widget_links').all() as WidgetLinkRow[]
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
  type: WireType = 'context',
  // Optional explicit id. The WS01 sync substrate replays a link's `create` event
  // on another device and must materialise the SAME link id, so it passes the id
  // through here as create-if-missing (an already-present id returns unchanged, so
  // a replayed/echoed create never duplicates or throws).
  id?: string
): WidgetLink | null {
  if (sourceWidgetId === targetWidgetId) return null // no self-loops
  const db = getDb()
  if (id) {
    const byId = db.prepare('SELECT * FROM widget_links WHERE id = ?').get(id) as WidgetLinkRow | undefined
    if (byId) return rowToLink(byId)
  }
  const existing = db
    .prepare('SELECT * FROM widget_links WHERE source_widget_id = ? AND target_widget_id = ?')
    .get(sourceWidgetId, targetWidgetId) as WidgetLinkRow | undefined
  if (existing) return rowToLink(existing)
  const linkId = id ?? randomUUID()
  const now = Date.now()
  db.prepare(
    `INSERT INTO widget_links (id, source_widget_id, target_widget_id, task_id, created_at, type, verb, enabled)
     VALUES (?, ?, ?, ?, ?, ?, '', 1)`
  ).run(linkId, sourceWidgetId, targetWidgetId, taskId, now, type)
  return {
    id: linkId,
    sourceWidgetId,
    targetWidgetId,
    taskId,
    createdAt: now,
    type,
    verb: '',
    enabled: true,
    lastRunAt: null,
    lastError: null
  }
}

export interface WireUpdate {
  type?: WireType
  verb?: string
  enabled?: boolean
  // Durable run state, written by the wire engine after each run. `lastError`
  // accepts null/'' to clear a prior error on a successful run.
  lastRunAt?: number | null
  lastError?: string | null
}

// Update a wire's mutable fields (the three live-wire fields plus durable run
// state). Returns the updated link or null if the id is unknown. Endpoints are
// fixed. Only the fields present in `patch` change; the rest are preserved.
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
  const lastRunAt = 'lastRunAt' in patch ? patch.lastRunAt ?? null : next.lastRunAt ?? null
  // Empty string clears the error; undefined leaves it untouched.
  const lastError = 'lastError' in patch ? (patch.lastError ? patch.lastError : null) : next.lastError ?? null
  db.prepare(
    'UPDATE widget_links SET type = ?, verb = ?, enabled = ?, last_run_at = ?, last_error = ? WHERE id = ?'
  ).run(type, verb, enabled ? 1 : 0, lastRunAt, lastError, id)
  return { ...next, type, verb, enabled, lastRunAt, lastError }
}

export function deleteLink(id: string): boolean {
  const db = getDb()
  const result = db.prepare('DELETE FROM widget_links WHERE id = ?').run(id)
  return result.changes > 0
}
