import { randomUUID } from 'crypto'
import { getDb } from './database'
import { listWidgetsByTask } from './widgets'
import type { Template, TemplateDraft, TemplateWidget } from '@shared/types'

interface TemplateRow {
  id: string
  name: string
  description: string
  source_task_id: string | null
  widgets_json: string
  created_at: number
}

function rowToTemplate(row: TemplateRow): Template {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    sourceTaskId: row.source_task_id,
    widgets: JSON.parse(row.widgets_json) as TemplateWidget[],
    createdAt: row.created_at
  }
}

export function listTemplates(): Template[] {
  const db = getDb()
  const rows = db
    .prepare('SELECT * FROM templates ORDER BY created_at DESC')
    .all() as TemplateRow[]
  return rows.map(rowToTemplate)
}

export function createTemplate(draft: TemplateDraft): Template {
  const db = getDb()
  const id = randomUUID()
  const now = Date.now()
  db.prepare(
    `INSERT INTO templates (id, name, description, source_task_id, widgets_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    draft.name,
    draft.description ?? '',
    draft.sourceTaskId,
    JSON.stringify(draft.widgets),
    now
  )
  const row = db.prepare('SELECT * FROM templates WHERE id = ?').get(id) as TemplateRow
  return rowToTemplate(row)
}

export function createTemplateFromTask(taskId: string, name: string, description?: string): Template {
  const widgets = listWidgetsByTask(taskId).map((w) => ({
    kind: w.kind,
    title: w.title,
    content: w.content,
    x: w.x,
    y: w.y,
    width: w.width,
    height: w.height,
    color: w.color
  }))
  return createTemplate({
    name,
    description,
    sourceTaskId: taskId,
    widgets
  })
}

export function deleteTemplate(id: string): boolean {
  const db = getDb()
  const result = db.prepare('DELETE FROM templates WHERE id = ?').run(id)
  return result.changes > 0
}
