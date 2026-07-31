import { randomUUID } from 'crypto'
import { getDb } from './database'
import { getActiveOrgId } from './activeOrg'
import { emitAutomationEvent } from './automationEvents'
import type { FbNode, NodeDraft, NodePatch } from '@shared/types'

interface NodeRow {
  id: string
  parent_id: string | null
  kind: FbNode['kind']
  title: string
  description: string
  status: FbNode['status']
  priority: number
  interest: number
  importance: number
  sort_order: number
  created_at: number
  updated_at: number
  started_at: number | null
  completed_at: number | null
  estimate_minutes: number | null
  extensions_minutes: number | null
  resume_markdown: string | null
  resume_updated_at: number | null
  due_date: number | null
  archived: number | null
  is_plan: number | null
  shared_from_handle: string | null
}

function rowToNode(row: NodeRow): FbNode {
  return {
    id: row.id,
    parentId: row.parent_id,
    kind: row.kind,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority as FbNode['priority'],
    interest: row.interest as FbNode['interest'],
    importance: row.importance as FbNode['importance'],
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    estimateMinutes: row.estimate_minutes,
    extensionsMinutes: row.extensions_minutes ?? 0,
    resumeMarkdown: row.resume_markdown,
    resumeUpdatedAt: row.resume_updated_at,
    dueDate: row.due_date,
    archived: row.archived === 1,
    isPlan: row.is_plan === 1,
    sharedFromHandle: row.shared_from_handle ?? null
  }
}

let purgedTrashThisSession = false

export function listNodes(): FbNode[] {
  const db = getDb()
  if (!purgedTrashThisSession) {
    purgedTrashThisSession = true
    try {
      purgeTrashedNodes()
    } catch {
      /* best-effort */
    }
  }
  const rows = db
    .prepare(
      'SELECT * FROM nodes WHERE trashed_at IS NULL AND org_id = ? ORDER BY sort_order ASC, created_at ASC'
    )
    .all(getActiveOrgId()) as NodeRow[]
  return rows.map(rowToNode)
}

export function getNode(id: string): FbNode | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM nodes WHERE id = ?').get(id) as NodeRow | undefined
  return row ? rowToNode(row) : null
}

function nextSortOrder(parentId: string | null): number {
  const db = getDb()
  const row = db
    .prepare(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM nodes WHERE parent_id IS ? AND org_id = ?'
    )
    .get(parentId, getActiveOrgId()) as { next: number }
  return row.next
}

export function createNode(draft: NodeDraft): FbNode {
  const db = getDb()
  const id = randomUUID()
  const now = Date.now()
  db.prepare(
    `INSERT INTO nodes (id, parent_id, kind, title, description, status, priority, interest, importance, sort_order, created_at, updated_at, estimate_minutes, extensions_minutes, due_date, is_plan, shared_from_handle, org_id)
     VALUES (@id, @parentId, @kind, @title, @description, 'open', @priority, @interest, @importance, @sortOrder, @now, @now, @estimateMinutes, 0, @dueDate, @isPlan, @sharedFromHandle, @orgId)`
  ).run({
    id,
    parentId: draft.parentId,
    kind: draft.kind,
    title: draft.title,
    description: draft.description ?? '',
    priority: draft.priority ?? 3,
    interest: draft.interest ?? 3,
    importance: draft.importance ?? 3,
    sortOrder: nextSortOrder(draft.parentId),
    estimateMinutes: draft.estimateMinutes ?? null,
    dueDate: draft.dueDate ?? null,
    isPlan: draft.isPlan ? 1 : 0,
    sharedFromHandle: draft.sharedFromHandle ?? null,
    orgId: getActiveOrgId(),
    now
  })
  const created = getNode(id)
  if (!created) throw new Error('Node creation failed post-insert')
  return created
}

export function updateNode(id: string, patch: NodePatch): FbNode | null {
  const db = getDb()
  const existing = getNode(id)
  if (!existing) return null
  const fields: string[] = []
  const params: Record<string, unknown> = { id, now: Date.now() }
  const cols: Array<[keyof NodePatch, string]> = [
    ['title', 'title'],
    ['description', 'description'],
    ['status', 'status'],
    ['priority', 'priority'],
    ['interest', 'interest'],
    ['importance', 'importance'],
    ['parentId', 'parent_id'],
    ['sortOrder', 'sort_order'],
    ['estimateMinutes', 'estimate_minutes'],
    ['extensionsMinutes', 'extensions_minutes'],
    ['resumeMarkdown', 'resume_markdown'],
    ['resumeUpdatedAt', 'resume_updated_at'],
    ['dueDate', 'due_date']
  ]
  for (const [key, col] of cols) {
    if (patch[key] !== undefined) {
      fields.push(`${col} = @${key}`)
      params[key] = patch[key]
    }
  }
  if (patch.archived !== undefined) {
    fields.push('archived = @archived')
    params.archived = patch.archived ? 1 : 0
  }
  if (patch.isPlan !== undefined) {
    fields.push('is_plan = @isPlan')
    params.isPlan = patch.isPlan ? 1 : 0
  }
  if (patch.status === 'in_progress' && existing.status !== 'in_progress') {
    fields.push('started_at = @now')
  }
  if (patch.status === 'done' && existing.status !== 'done') {
    fields.push('completed_at = @now')
  }
  if (fields.length === 0) return existing
  fields.push('updated_at = @now')
  db.prepare(`UPDATE nodes SET ${fields.join(', ')} WHERE id = @id`).run(params)
  // Let PlexiFlow react to a task being completed (suppressed during flow runs).
  if (patch.status === 'done' && existing.status !== 'done' && existing.kind === 'task') {
    emitAutomationEvent({ name: 'task-completed', nodeId: id })
  }
  return getNode(id)
}

// Soft-delete a node and its whole subtree (children would otherwise be
// hard-cascaded along with all their widgets). Returns the trashed ids so the
// caller can offer a lossless undo. The rows and widgets are untouched on disk,
// just hidden, until purgeTrashedNodes removes them.
export function deleteNode(id: string): string[] {
  const db = getDb()
  const exists = db.prepare('SELECT id FROM nodes WHERE id = ? AND trashed_at IS NULL').get(id)
  if (!exists) return []
  const ids: string[] = []
  const collect = (nid: string): void => {
    ids.push(nid)
    const kids = db.prepare('SELECT id FROM nodes WHERE parent_id = ? AND trashed_at IS NULL').all(nid) as Array<{
      id: string
    }>
    for (const k of kids) collect(k.id)
  }
  collect(id)
  const now = Date.now()
  const stmt = db.prepare('UPDATE nodes SET trashed_at = ? WHERE id = ?')
  db.transaction(() => {
    for (const i of ids) stmt.run(now, i)
  })()
  return ids
}

// Restore trashed nodes (undo of a delete, or redo of a create-undo).
export function restoreNodes(ids: string[]): boolean {
  if (!ids.length) return false
  const db = getDb()
  const stmt = db.prepare('UPDATE nodes SET trashed_at = NULL WHERE id = ?')
  db.transaction(() => {
    for (const i of ids) stmt.run(i)
  })()
  return true
}

// Permanently remove nodes trashed longer than maxAgeMs (default 7 days). The
// hard DELETE cascades their descendants + widgets. Runs once per session.
export function purgeTrashedNodes(maxAgeMs = 7 * 24 * 60 * 60 * 1000): void {
  const db = getDb()
  const cutoff = Date.now() - maxAgeMs
  const rows = db.prepare('SELECT id FROM nodes WHERE trashed_at IS NOT NULL AND trashed_at < ?').all(cutoff) as Array<{
    id: string
  }>
  if (!rows.length) return
  const del = db.prepare('DELETE FROM nodes WHERE id = ?')
  db.transaction(() => {
    for (const r of rows) del.run(r.id)
  })()
}

// Returns true if `candidateId` is a descendant of `ancestorId` (or equal). Used to prevent
// drag-and-drop from creating a cycle (dropping a parent into its own child).
function isDescendantOrSelf(ancestorId: string, candidateId: string): boolean {
  if (ancestorId === candidateId) return true
  const db = getDb()
  let cur: string | null = candidateId
  // Walk up parent chain; if we hit ancestorId, it's a descendant.
  for (let i = 0; i < 1000; i++) {
    const row = db
      .prepare('SELECT parent_id FROM nodes WHERE id = ?')
      .get(cur) as { parent_id: string | null } | undefined
    if (!row || row.parent_id === null) return false
    if (row.parent_id === ancestorId) return true
    cur = row.parent_id
  }
  return false
}

/**
 * Atomic move: reparent + reorder in one operation.
 *
 *   id           the node being moved
 *   newParentId  destination parent (null = top level)
 *   beforeId     sibling under newParentId to insert before; null = append to end
 *
 * Renumbers all siblings under newParentId sequentially after the move.
 * Returns the updated node, or null if the move was rejected (cycle, missing).
 */
export function moveNode(
  id: string,
  newParentId: string | null,
  beforeId: string | null
): FbNode | null {
  if (id === newParentId) return null
  if (newParentId !== null && isDescendantOrSelf(id, newParentId)) return null

  const db = getDb()
  const existing = getNode(id)
  if (!existing) return null

  // Same-parent move: skip the cross-parent dance, just renumber siblings
  const tx = db.transaction(() => {
    // Get siblings under destination parent, excluding the moving node
    const siblings = (
      db
        .prepare(
          'SELECT id, sort_order FROM nodes WHERE parent_id IS ? AND id != ? ORDER BY sort_order ASC, created_at ASC'
        )
        .all(newParentId, id) as Array<{ id: string; sort_order: number }>
    ).map((r) => r.id)

    // Figure out the insert position
    let insertIdx: number
    if (beforeId === null) {
      insertIdx = siblings.length // append
    } else {
      const idx = siblings.indexOf(beforeId)
      insertIdx = idx >= 0 ? idx : siblings.length
    }
    const ordered = [...siblings.slice(0, insertIdx), id, ...siblings.slice(insertIdx)]

    // Write parent_id on the moving node first
    db.prepare('UPDATE nodes SET parent_id = @p, updated_at = @now WHERE id = @id').run({
      p: newParentId,
      now: Date.now(),
      id
    })

    // Renumber every sibling under the destination parent (cheap; usually < 50 siblings)
    const renumber = db.prepare(
      'UPDATE nodes SET sort_order = @order WHERE id = @id'
    )
    ordered.forEach((nid, i) => {
      renumber.run({ order: i, id: nid })
    })
  })
  tx()

  return getNode(id)
}

// ONE node, under EXACTLY the liveness filter listNodes() applies (trashed + org).
// plexi-brain I2b: the live-ingest fast path resolves a single source by id, and it must
// agree with the whole-corpus scan or the two paths would index different corpora. getNode()
// cannot serve this — FbNode carries neither trashed_at nor org_id, so a caller holding one
// cannot tell a live node from a trashed or foreign-org one. Deliberately does NOT run the
// session trash purge listNodes() does: a read on the ingest path must not mutate.
export function getLiveNode(id: string): FbNode | null {
  const db = getDb()
  const row = db
    .prepare('SELECT * FROM nodes WHERE id = ? AND trashed_at IS NULL AND org_id = ?')
    .get(id, getActiveOrgId()) as NodeRow | undefined
  return row ? rowToNode(row) : null
}
