import { getDb } from './database'
import type { DashboardCardKind, DashboardLayout } from '@shared/types'

interface LayoutRow {
  dashboard_key: string
  card_ids: string
  updated_at: number
}

const VALID_KINDS: DashboardCardKind[] = [
  'quick-start',
  'stats',
  'garden',
  'today-tasks',
  'recent-activity'
]

function parseCardIds(json: string): DashboardCardKind[] {
  try {
    const parsed = JSON.parse(json) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (v): v is DashboardCardKind =>
        typeof v === 'string' && (VALID_KINDS as string[]).includes(v)
    )
  } catch {
    return []
  }
}

function rowToLayout(row: LayoutRow): DashboardLayout {
  return {
    dashboardKey: row.dashboard_key,
    cardIds: parseCardIds(row.card_ids),
    updatedAt: row.updated_at
  }
}

export function getDashboardLayout(key: string): DashboardLayout | null {
  const db = getDb()
  const row = db
    .prepare('SELECT * FROM dashboard_layouts WHERE dashboard_key = ?')
    .get(key) as LayoutRow | undefined
  return row ? rowToLayout(row) : null
}

export function setDashboardLayout(
  key: string,
  cardIds: DashboardCardKind[]
): DashboardLayout {
  const db = getDb()
  const now = Date.now()
  const json = JSON.stringify(cardIds)
  db.prepare(
    `INSERT INTO dashboard_layouts (dashboard_key, card_ids, updated_at)
     VALUES (@key, @json, @now)
     ON CONFLICT(dashboard_key) DO UPDATE SET card_ids = @json, updated_at = @now`
  ).run({ key, json, now })
  return { dashboardKey: key, cardIds, updatedAt: now }
}

export function deleteDashboardLayout(key: string): boolean {
  const db = getDb()
  const r = db.prepare('DELETE FROM dashboard_layouts WHERE dashboard_key = ?').run(key)
  return r.changes > 0
}
