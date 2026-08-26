// Desk staleness (lifecycle track L3; SPEC-042 half of "stale"). COMPUTED,
// never stored: a desk is stale when neither it, its widgets, nor its
// activity log have moved inside the threshold, and it is still live work
// (not done, not archived, not trashed). Only the Stale Desks widget consumes
// this (F006) — the Attention ranker's staleness signal is ITEM-level and
// separate by design.

import { getDb } from './database'
import { getActiveOrgId } from './activeOrg'

export interface StaleDesk {
  id: string
  title: string
  /** Epoch ms of the newest sign of life found anywhere on the desk. */
  lastActivityMs: number
  daysQuiet: number
}

export const STALE_DESK_THRESHOLD_DAYS = 7

export function staleDesks(thresholdDays = STALE_DESK_THRESHOLD_DAYS): StaleDesk[] {
  const db = getDb()
  const cutoff = Date.now() - thresholdDays * 24 * 60 * 60 * 1000
  // Newest sign of life per desk across the three activity sources. LEFT
  // JOINs keep desks with no widgets/log rows (their own updated_at decides).
  const rows = db
    .prepare(
      `SELECT n.id, n.title,
              MAX(n.updated_at,
                  COALESCE((SELECT MAX(w.updated_at) FROM widgets w WHERE w.task_id = n.id), 0),
                  COALESCE((SELECT MAX(a.ts) FROM activity_log a WHERE a.task_id = n.id), 0)
              ) AS last_activity
       FROM nodes n
       WHERE n.kind = 'task' AND n.trashed_at IS NULL AND n.org_id = ?
         AND (n.archived IS NULL OR n.archived = 0)
         AND n.status NOT IN ('done', 'parked')
       ORDER BY last_activity ASC`
    )
    .all(getActiveOrgId()) as Array<{ id: string; title: string; last_activity: number }>
  const now = Date.now()
  return rows
    .filter((r) => r.last_activity < cutoff)
    .map((r) => ({
      id: r.id,
      title: r.title || 'Untitled desk',
      lastActivityMs: r.last_activity,
      daysQuiet: Math.floor((now - r.last_activity) / (24 * 60 * 60 * 1000))
    }))
}
