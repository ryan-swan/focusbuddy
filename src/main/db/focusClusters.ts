import { randomUUID } from 'crypto'
import { getDb } from './database'
import { getActiveOrgId } from './activeOrg'
import type { FocusCluster, FocusClusterDraft, Pane, SplitRatios, SplitShape } from '@shared/types'

// SQLite CRUD for Focus-Mode CLUSTERS (split "groups"). Mirrors focusSessions.ts:
// getDb(), prepared statements, org scoping via getActiveOrgId(), a rowTo* mapper.
// A cluster is a per-desk (task node) saved split layout. panes/ratios are stored
// JSON-encoded (PaneSources by reference) so a saved cluster resolves live content
// on load and degrades gracefully if a member widget is gone.

interface FocusClusterRow {
  id: string
  task_id: string
  org_id: string
  shape: string
  panes_json: string
  ratios_json: string
  active_pane_id: string
  created_at: number
  updated_at: number
}

// Parse the stored JSON columns defensively — a corrupt row must not crash the
// whole list read; it degrades to an empty group the caller can discard.
function safeParse<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T
  } catch {
    return fallback
  }
}

function rowToCluster(row: FocusClusterRow): FocusCluster {
  return {
    id: row.id,
    taskId: row.task_id,
    shape: row.shape as SplitShape,
    panes: safeParse<Pane[]>(row.panes_json, []),
    ratios: safeParse<SplitRatios>(row.ratios_json, {}),
    activePaneId: row.active_pane_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

// All clusters for a desk (task node), most-recently-updated first. Org-scoped so
// a cluster only surfaces on the desk + org that owns it.
export function listClustersForTask(taskId: string): FocusCluster[] {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT * FROM focus_clusters
       WHERE task_id = ? AND org_id = ?
       ORDER BY updated_at DESC`
    )
    .all(taskId, getActiveOrgId()) as FocusClusterRow[]
  return rows.map(rowToCluster)
}

// Create (no id) or update-in-place (id present) a cluster. Returns the saved row.
export function saveCluster(draft: FocusClusterDraft): FocusCluster {
  const db = getDb()
  const now = Date.now()
  const panesJson = JSON.stringify(draft.panes)
  const ratiosJson = JSON.stringify(draft.ratios)

  if (draft.id) {
    // Update in place — scoped by org so a cluster can't be edited cross-org.
    db.prepare(
      `UPDATE focus_clusters
       SET shape = @shape, panes_json = @panesJson, ratios_json = @ratiosJson,
           active_pane_id = @activePaneId, updated_at = @now
       WHERE id = @id AND org_id = @orgId`
    ).run({
      id: draft.id,
      shape: draft.shape,
      panesJson,
      ratiosJson,
      activePaneId: draft.activePaneId,
      now,
      orgId: getActiveOrgId()
    })
    const row = db.prepare('SELECT * FROM focus_clusters WHERE id = ?').get(draft.id) as
      | FocusClusterRow
      | undefined
    // If the id didn't exist (e.g. cleared elsewhere), fall through to an insert so
    // the caller still gets a persisted cluster rather than a silent no-op.
    if (row) return rowToCluster(row)
  }

  const id = draft.id ?? randomUUID()
  db.prepare(
    `INSERT INTO focus_clusters
       (id, task_id, org_id, shape, panes_json, ratios_json, active_pane_id, created_at, updated_at)
     VALUES (@id, @taskId, @orgId, @shape, @panesJson, @ratiosJson, @activePaneId, @now, @now)`
  ).run({
    id,
    taskId: draft.taskId,
    orgId: getActiveOrgId(),
    shape: draft.shape,
    panesJson,
    ratiosJson,
    activePaneId: draft.activePaneId,
    now
  })
  const row = db.prepare('SELECT * FROM focus_clusters WHERE id = ?').get(id) as
    | FocusClusterRow
    | undefined
  if (!row) throw new Error('focus cluster insert failed')
  return rowToCluster(row)
}

// Delete a cluster (e.g. it collapsed back to a single pane). Org-scoped.
export function deleteCluster(id: string): void {
  const db = getDb()
  db.prepare('DELETE FROM focus_clusters WHERE id = ? AND org_id = ?').run(id, getActiveOrgId())
}
