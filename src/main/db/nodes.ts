import { randomUUID } from 'crypto'
import { getDb } from './database'
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
    dueDate: row.due_date
  }
}

export function listNodes(): FbNode[] {
  const db = getDb()
  const rows = db
    .prepare('SELECT * FROM nodes ORDER BY sort_order ASC, created_at ASC')
    .all() as NodeRow[]
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
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM nodes WHERE parent_id IS ?'
    )
    .get(parentId) as { next: number }
  return row.next
}

export function createNode(draft: NodeDraft): FbNode {
  const db = getDb()
  const id = randomUUID()
  const now = Date.now()
  db.prepare(
    `INSERT INTO nodes (id, parent_id, kind, title, description, status, priority, interest, importance, sort_order, created_at, updated_at, estimate_minutes, extensions_minutes, due_date)
     VALUES (@id, @parentId, @kind, @title, @description, 'open', @priority, @interest, @importance, @sortOrder, @now, @now, @estimateMinutes, 0, @dueDate)`
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
  if (patch.status === 'in_progress' && existing.status !== 'in_progress') {
    fields.push('started_at = @now')
  }
  if (patch.status === 'done' && existing.status !== 'done') {
    fields.push('completed_at = @now')
  }
  if (fields.length === 0) return existing
  fields.push('updated_at = @now')
  db.prepare(`UPDATE nodes SET ${fields.join(', ')} WHERE id = @id`).run(params)
  return getNode(id)
}

export function deleteNode(id: string): boolean {
  const db = getDb()
  const result = db.prepare('DELETE FROM nodes WHERE id = ?').run(id)
  return result.changes > 0
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
