import { getDb } from './database'
import type { BrowsingHistoryEntry } from '@shared/types'

interface HistoryRow {
  url: string
  title: string
  host: string
  task_id: string | null
  first_visited_at: number
  last_visited_at: number
  visit_count: number
}

function rowToEntry(row: HistoryRow): BrowsingHistoryEntry {
  return {
    url: row.url,
    title: row.title,
    host: row.host,
    taskId: row.task_id,
    firstVisitedAt: row.first_visited_at,
    lastVisitedAt: row.last_visited_at,
    visitCount: row.visit_count
  }
}

function safeHostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

// Skip non-http(s) and obvious junk so the history stays useful.
function isRecordableUrl(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false
  if (/^chrome-error:|^about:|^data:/i.test(url)) return false
  return true
}

export function recordVisit(url: string, title: string, taskId: string | null): void {
  if (!isRecordableUrl(url)) return
  const db = getDb()
  const now = Date.now()
  const host = safeHostOf(url)
  const cleanTitle = (title || '').trim()
  db.prepare(
    `INSERT INTO browsing_history (url, title, host, task_id, first_visited_at, last_visited_at, visit_count)
     VALUES (@url, @title, @host, @taskId, @now, @now, 1)
     ON CONFLICT(url) DO UPDATE SET
       title = CASE WHEN excluded.title != '' THEN excluded.title ELSE browsing_history.title END,
       last_visited_at = excluded.last_visited_at,
       visit_count = browsing_history.visit_count + 1,
       task_id = COALESCE(excluded.task_id, browsing_history.task_id)`
  ).run({ url, title: cleanTitle, host, taskId, now })
}

export function getRecentHistory(limit = 12, taskId?: string | null): BrowsingHistoryEntry[] {
  const db = getDb()
  // If a taskId is supplied, prioritize that task's history first, then fill from global.
  if (taskId) {
    const taskRows = db
      .prepare(
        `SELECT * FROM browsing_history WHERE task_id = ?
         ORDER BY last_visited_at DESC LIMIT ?`
      )
      .all(taskId, limit) as HistoryRow[]
    const taskUrls = new Set(taskRows.map((r) => r.url))
    const remaining = limit - taskRows.length
    let globalRows: HistoryRow[] = []
    if (remaining > 0) {
      globalRows = db
        .prepare(
          `SELECT * FROM browsing_history WHERE task_id IS NULL OR task_id != ?
           ORDER BY visit_count DESC, last_visited_at DESC LIMIT ?`
        )
        .all(taskId, remaining * 2) as HistoryRow[]
      globalRows = globalRows.filter((r) => !taskUrls.has(r.url)).slice(0, remaining)
    }
    return [...taskRows, ...globalRows].map(rowToEntry)
  }
  const rows = db
    .prepare(
      `SELECT * FROM browsing_history
       ORDER BY visit_count DESC, last_visited_at DESC LIMIT ?`
    )
    .all(limit) as HistoryRow[]
  return rows.map(rowToEntry)
}

// Lightweight purge: keep most recent 500 entries to bound the table.
export function pruneHistory(keep = 500): void {
  const db = getDb()
  db.prepare(
    `DELETE FROM browsing_history WHERE url NOT IN (
       SELECT url FROM browsing_history ORDER BY last_visited_at DESC LIMIT ?
     )`
  ).run(keep)
}
