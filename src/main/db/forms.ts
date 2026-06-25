import { randomUUID } from 'crypto'
import { getDb } from './database'
import type { PlexiForm, PlexiFormDraft, PlexiFormPatch } from '@shared/forms'

// ── fb_forms (PlexiForms) ────────────────────────────────────────────────────
// A form is metadata pointing at a backing fb_tables table (its fields = the
// table's columns, its responses = the table's rows). The renderer creates the
// backing table first, then the form record referencing it.

interface FormRow {
  id: string
  title: string
  description: string
  table_id: string
  created_at: number
  updated_at: number
}

function rowToForm(row: FormRow): PlexiForm {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    tableId: row.table_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function listForms(): PlexiForm[] {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM fb_forms ORDER BY updated_at DESC').all() as FormRow[]
  return rows.map(rowToForm)
}

export function getForm(id: string): PlexiForm | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM fb_forms WHERE id = ?').get(id) as FormRow | undefined
  return row ? rowToForm(row) : null
}

export function createForm(draft: PlexiFormDraft): PlexiForm {
  const db = getDb()
  const id = randomUUID()
  const now = Date.now()
  db.prepare(
    `INSERT INTO fb_forms (id, title, description, table_id, created_at, updated_at)
     VALUES (@id, @title, @description, @tableId, @now, @now)`
  ).run({
    id,
    title: draft.title ?? 'Untitled form',
    description: draft.description ?? '',
    tableId: draft.tableId,
    now
  })
  return getForm(id) as PlexiForm
}

export function updateForm(id: string, patch: PlexiFormPatch): PlexiForm | null {
  const db = getDb()
  const existing = getForm(id)
  if (!existing) return null
  db.prepare(
    `UPDATE fb_forms SET title = @title, description = @description, updated_at = @updated_at WHERE id = @id`
  ).run({
    title: patch.title ?? existing.title,
    description: patch.description ?? existing.description,
    updated_at: Date.now(),
    id
  })
  return getForm(id)
}

export function deleteForm(id: string): boolean {
  const db = getDb()
  const r = db.prepare('DELETE FROM fb_forms WHERE id = ?').run(id)
  return r.changes > 0
}
