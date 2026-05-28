import { randomUUID } from 'crypto'
import { getDb } from './database'
import type { Widget, WidgetDraft, WidgetPatch } from '@shared/types'

interface WidgetRow {
  id: string
  task_id: string
  kind: Widget['kind']
  title: string
  content: string
  x: number
  y: number
  width: number
  height: number
  z_index: number
  color: string | null
  pinned: number | null
  pinned_screen_x: number | null
  pinned_screen_y: number | null
  parent_section_id: string | null
  layout: string | null
  source_app_id: string | null
  mode: string | null
  pinned_zone: string | null
  living_query: string | null
  living_generated_at: number | null
  living_paused: number | null
  created_at: number
  updated_at: number
  archived: number | null
}

function rowToWidget(row: WidgetRow): Widget {
  return {
    id: row.id,
    taskId: row.task_id,
    kind: row.kind,
    title: row.title,
    content: row.content,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    zIndex: row.z_index,
    color: row.color,
    pinned: row.pinned === 1,
    pinnedScreenX: row.pinned_screen_x,
    pinnedScreenY: row.pinned_screen_y,
    parentSectionId: row.parent_section_id,
    layout: (row.layout as Widget['layout']) ?? null,
    sourceAppId: row.source_app_id,
    mode: (row.mode as Widget['mode']) ?? null,
    pinnedZone: (row.pinned_zone as Widget['pinnedZone']) ?? null,
    livingQuery: row.living_query ?? null,
    livingGeneratedAt: row.living_generated_at ?? null,
    livingPaused: row.living_paused === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archived: row.archived === 1
  }
}

export function getWidget(id: string): Widget | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM widgets WHERE id = ?').get(id) as
    | WidgetRow
    | undefined
  return row ? rowToWidget(row) : null
}

export function listWidgetsByTask(taskId: string): Widget[] {
  const db = getDb()
  const rows = db
    .prepare('SELECT * FROM widgets WHERE task_id = ? ORDER BY z_index ASC, created_at ASC')
    .all(taskId) as WidgetRow[]
  return rows.map(rowToWidget)
}

function nextZ(taskId: string): number {
  const db = getDb()
  const row = db
    .prepare('SELECT COALESCE(MAX(z_index), 0) + 1 AS next FROM widgets WHERE task_id = ?')
    .get(taskId) as { next: number }
  return row.next
}

export function createWidget(draft: WidgetDraft): Widget {
  const db = getDb()
  const id = randomUUID()
  const now = Date.now()
  db.prepare(
    `INSERT INTO widgets (id, task_id, kind, title, content, x, y, width, height, z_index, color, pinned, pinned_screen_x, pinned_screen_y, parent_section_id, source_app_id, mode, created_at, updated_at)
     VALUES (@id, @taskId, @kind, @title, @content, @x, @y, @width, @height, @zIndex, @color, 0, NULL, NULL, NULL, @sourceAppId, @mode, @now, @now)`
  ).run({
    id,
    taskId: draft.taskId,
    kind: draft.kind,
    title: draft.title ?? '',
    content: draft.content,
    x: draft.x ?? 60,
    y: draft.y ?? 60,
    width: draft.width ?? (draft.kind === 'webview' ? 520 : 260),
    height: draft.height ?? (draft.kind === 'webview' ? 360 : 200),
    zIndex: nextZ(draft.taskId),
    color: draft.color ?? null,
    sourceAppId: draft.sourceAppId ?? null,
    mode: draft.mode ?? null,
    now
  })
  const row = db.prepare('SELECT * FROM widgets WHERE id = ?').get(id) as WidgetRow
  return rowToWidget(row)
}

export function updateWidget(id: string, patch: WidgetPatch): Widget | null {
  const db = getDb()
  const fields: string[] = []
  const params: Record<string, unknown> = { id, now: Date.now() }
  const cols: Array<[keyof WidgetPatch, string]> = [
    ['title', 'title'],
    ['content', 'content'],
    ['x', 'x'],
    ['y', 'y'],
    ['width', 'width'],
    ['height', 'height'],
    ['zIndex', 'z_index'],
    ['color', 'color'],
    ['pinnedScreenX', 'pinned_screen_x'],
    ['pinnedScreenY', 'pinned_screen_y'],
    ['parentSectionId', 'parent_section_id'],
    ['layout', 'layout'],
    ['sourceAppId', 'source_app_id'],
    ['mode', 'mode'],
    ['pinnedZone', 'pinned_zone'],
    ['livingQuery', 'living_query'],
    ['livingGeneratedAt', 'living_generated_at']
  ]
  for (const [key, col] of cols) {
    if (patch[key] !== undefined) {
      fields.push(`${col} = @${key}`)
      params[key] = patch[key]
    }
  }
  if (patch.pinned !== undefined) {
    fields.push('pinned = @pinned')
    params.pinned = patch.pinned ? 1 : 0
  }
  if (patch.archived !== undefined) {
    fields.push('archived = @archived')
    params.archived = patch.archived ? 1 : 0
  }
  if (patch.livingPaused !== undefined) {
    fields.push('living_paused = @livingPaused')
    params.livingPaused = patch.livingPaused ? 1 : 0
  }
  if (fields.length === 0) {
    const row = db.prepare('SELECT * FROM widgets WHERE id = ?').get(id) as WidgetRow | undefined
    return row ? rowToWidget(row) : null
  }
  fields.push('updated_at = @now')
  db.prepare(`UPDATE widgets SET ${fields.join(', ')} WHERE id = @id`).run(params)
  const row = db.prepare('SELECT * FROM widgets WHERE id = ?').get(id) as WidgetRow | undefined
  return row ? rowToWidget(row) : null
}

export function deleteWidget(id: string): boolean {
  const db = getDb()
  const result = db.prepare('DELETE FROM widgets WHERE id = ?').run(id)
  return result.changes > 0
}

export function bringToFront(id: string): Widget | null {
  const db = getDb()
  const row = db.prepare('SELECT task_id FROM widgets WHERE id = ?').get(id) as
    | { task_id: string }
    | undefined
  if (!row) return null
  return updateWidget(id, { zIndex: nextZ(row.task_id) })
}
