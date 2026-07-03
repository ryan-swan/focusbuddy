import { randomUUID } from 'crypto'
import { notifyRowsChanged } from '../tableEvents'
import { getDb } from './database'
import { getActiveOrgId } from './activeOrg'
import { emitAutomationEvent } from './automationEvents'
import type {
  FbRow,
  FbRowDraft,
  FbRowPatch,
  FbTable,
  FbTableDraft,
  FbTablePatch,
  TableSchema
} from '@shared/fields'

// ── fb_tables ───────────────────────────────────────────────────────────────

interface TableRow {
  id: string
  task_id: string | null
  title: string
  schema_json: string
  created_at: number
  updated_at: number
}

function parseSchema(raw: string): TableSchema {
  try {
    const parsed = JSON.parse(raw)
    if (parsed && Array.isArray(parsed.columns)) return parsed as TableSchema
  } catch {
    // fall through
  }
  return { columns: [] }
}

function rowToTable(row: TableRow): FbTable {
  return {
    id: row.id,
    taskId: row.task_id,
    title: row.title,
    schema: parseSchema(row.schema_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function createTable(draft: FbTableDraft): FbTable {
  const db = getDb()
  const id = randomUUID()
  const now = Date.now()
  const schema: TableSchema = draft.schema ?? { columns: [] }
  db.prepare(
    `INSERT INTO fb_tables (id, task_id, title, schema_json, created_at, updated_at, org_id)
     VALUES (@id, @taskId, @title, @schema, @now, @now, @orgId)`
  ).run({
    id,
    taskId: draft.taskId,
    title: draft.title ?? 'Untitled',
    schema: JSON.stringify(schema),
    orgId: getActiveOrgId(),
    now
  })
  const row = db.prepare('SELECT * FROM fb_tables WHERE id = ?').get(id) as TableRow
  return rowToTable(row)
}

export function getTable(id: string): FbTable | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM fb_tables WHERE id = ?').get(id) as
    | TableRow
    | undefined
  return row ? rowToTable(row) : null
}

export function listTables(): FbTable[] {
  const db = getDb()
  const rows = db
    .prepare('SELECT * FROM fb_tables WHERE org_id = ? ORDER BY updated_at DESC')
    .all(getActiveOrgId()) as TableRow[]
  return rows.map(rowToTable)
}

export function updateTable(id: string, patch: FbTablePatch): FbTable | null {
  const db = getDb()
  const fields: string[] = []
  const params: Record<string, unknown> = { id, now: Date.now() }
  if (patch.title !== undefined) {
    fields.push('title = @title')
    params.title = patch.title
  }
  if (patch.schema !== undefined) {
    fields.push('schema_json = @schema')
    params.schema = JSON.stringify(patch.schema)
  }
  if (fields.length === 0) return getTable(id)
  fields.push('updated_at = @now')
  db.prepare(`UPDATE fb_tables SET ${fields.join(', ')} WHERE id = @id`).run(params)
  return getTable(id)
}

export function deleteTable(id: string): boolean {
  const db = getDb()
  const r = db.prepare('DELETE FROM fb_tables WHERE id = ?').run(id)
  return r.changes > 0
}

// ── fb_rows ─────────────────────────────────────────────────────────────────

interface RowRow {
  id: string
  table_id: string
  cells_json: string
  sort_order: number
  created_at: number
  updated_at: number
}

function parseCells(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // fall through
  }
  return {}
}

function rowToFbRow(row: RowRow): FbRow {
  return {
    id: row.id,
    tableId: row.table_id,
    cells: parseCells(row.cells_json),
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function nextRowOrder(tableId: string): number {
  const db = getDb()
  const row = db
    .prepare(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM fb_rows WHERE table_id = ?'
    )
    .get(tableId) as { next: number }
  return row.next
}

export function listRows(tableId: string): FbRow[] {
  const db = getDb()
  const rows = db
    .prepare(
      'SELECT * FROM fb_rows WHERE table_id = ? ORDER BY sort_order ASC, created_at ASC'
    )
    .all(tableId) as RowRow[]
  return rows.map(rowToFbRow)
}

export function createRow(draft: FbRowDraft): FbRow {
  const db = getDb()
  const id = randomUUID()
  const now = Date.now()
  db.prepare(
    `INSERT INTO fb_rows (id, table_id, cells_json, sort_order, created_at, updated_at)
     VALUES (@id, @tableId, @cells, @sortOrder, @now, @now)`
  ).run({
    id,
    tableId: draft.tableId,
    cells: JSON.stringify(draft.cells ?? {}),
    sortOrder: nextRowOrder(draft.tableId),
    now
  })
  const row = db.prepare('SELECT * FROM fb_rows WHERE id = ?').get(id) as RowRow
  // Let PlexiFlow react to a new row (suppressed automatically during flow runs).
  emitAutomationEvent({ name: 'row-added', tableId: draft.tableId })
  // And let the renderer invalidate its cached rows for this table.
  notifyRowsChanged(draft.tableId)
  return rowToFbRow(row)
}

export function updateRow(id: string, patch: FbRowPatch): FbRow | null {
  const db = getDb()
  const fields: string[] = []
  const params: Record<string, unknown> = { id, now: Date.now() }
  if (patch.cells !== undefined) {
    fields.push('cells_json = @cells')
    params.cells = JSON.stringify(patch.cells)
  }
  if (patch.sortOrder !== undefined) {
    fields.push('sort_order = @sortOrder')
    params.sortOrder = patch.sortOrder
  }
  if (fields.length === 0) {
    const row = db.prepare('SELECT * FROM fb_rows WHERE id = ?').get(id) as
      | RowRow
      | undefined
    return row ? rowToFbRow(row) : null
  }
  fields.push('updated_at = @now')
  db.prepare(`UPDATE fb_rows SET ${fields.join(', ')} WHERE id = @id`).run(params)
  const row = db.prepare('SELECT * FROM fb_rows WHERE id = ?').get(id) as
    | RowRow
    | undefined
  if (row) notifyRowsChanged(row.table_id)
  return row ? rowToFbRow(row) : null
}

export function deleteRow(id: string): boolean {
  const db = getDb()
  const row = db.prepare('SELECT table_id FROM fb_rows WHERE id = ?').get(id) as
    | { table_id: string }
    | undefined
  const r = db.prepare('DELETE FROM fb_rows WHERE id = ?').run(id)
  if (r.changes > 0 && row) notifyRowsChanged(row.table_id)
  return r.changes > 0
}

export function reorderRows(tableId: string, orderedIds: string[]): void {
  const db = getDb()
  const tx = db.transaction(() => {
    const stmt = db.prepare(
      'UPDATE fb_rows SET sort_order = @order, updated_at = @now WHERE id = @id AND table_id = @tableId'
    )
    const now = Date.now()
    orderedIds.forEach((id, i) => stmt.run({ order: i, now, id, tableId }))
  })
  tx()
}
