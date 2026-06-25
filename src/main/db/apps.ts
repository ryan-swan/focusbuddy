import { randomUUID } from 'crypto'
import { getDb } from './database'
import type { PlexiApp, PlexiAppDraft, PlexiAppPatch, AppComponent } from '@shared/apps'

// ── fb_apps (PlexiBuild) ─────────────────────────────────────────────────────
// CRUD over no-code apps. components_json is the serialised component stack.

interface AppRow {
  id: string
  name: string
  icon: string
  components_json: string
  created_at: number
  updated_at: number
}

function parseComponents(raw: string): AppComponent[] {
  try {
    const a = JSON.parse(raw)
    return Array.isArray(a) ? (a as AppComponent[]) : []
  } catch {
    return []
  }
}

function rowToApp(row: AppRow): PlexiApp {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    components: parseComponents(row.components_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function listApps(): PlexiApp[] {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM fb_apps ORDER BY updated_at DESC').all() as AppRow[]
  return rows.map(rowToApp)
}

export function getApp(id: string): PlexiApp | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM fb_apps WHERE id = ?').get(id) as AppRow | undefined
  return row ? rowToApp(row) : null
}

export function createApp(draft: PlexiAppDraft): PlexiApp {
  const db = getDb()
  const id = randomUUID()
  const now = Date.now()
  db.prepare(
    `INSERT INTO fb_apps (id, name, icon, components_json, created_at, updated_at)
     VALUES (@id, @name, @icon, @components, @now, @now)`
  ).run({
    id,
    name: draft.name ?? 'Untitled app',
    icon: draft.icon ?? 'widgets',
    components: JSON.stringify(draft.components ?? []),
    now
  })
  return getApp(id) as PlexiApp
}

export function updateApp(id: string, patch: PlexiAppPatch): PlexiApp | null {
  const db = getDb()
  const existing = getApp(id)
  if (!existing) return null
  const next = {
    name: patch.name ?? existing.name,
    icon: patch.icon ?? existing.icon,
    components: JSON.stringify(patch.components ?? existing.components),
    updated_at: Date.now(),
    id
  }
  db.prepare(
    `UPDATE fb_apps SET name = @name, icon = @icon, components_json = @components,
       updated_at = @updated_at WHERE id = @id`
  ).run(next)
  return getApp(id)
}

export function deleteApp(id: string): boolean {
  const db = getDb()
  const r = db.prepare('DELETE FROM fb_apps WHERE id = ?').run(id)
  return r.changes > 0
}
