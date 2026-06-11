// Local usage telemetry. Reads aggregate counts from this machine's database
// (widgets by kind, tasks, folders, focus minutes) plus a cumulative AI-call
// counter, and shapes them into a snapshot the renderer reports to the signal
// server. Aggregate numbers only, never titles or content.

import { app } from 'electron'
import { getDb } from './database'

export interface TelemetrySnapshot {
  appVersion: string
  platform: string
  widgetTotal: number
  widgetsByKind: Record<string, number>
  taskCount: number
  folderCount: number
  focusSessions: number
  focusMinutes: number
  aiCalls: number
}

// Increment the cumulative AI-call counter. Called whenever the app makes a
// model request, so usage reflects real activity rather than an estimate.
export function recordAiCall(n = 1): void {
  try {
    getDb()
      .prepare(
        `INSERT INTO usage_counters (key, value) VALUES ('ai_calls', ?)
         ON CONFLICT(key) DO UPDATE SET value = value + ?`
      )
      .run(n, n)
  } catch {
    // Telemetry must never break a real feature; swallow.
  }
}

function counter(key: string): number {
  try {
    const row = getDb().prepare('SELECT value FROM usage_counters WHERE key = ?').get(key) as
      | { value: number }
      | undefined
    return row?.value ?? 0
  } catch {
    return 0
  }
}

export function collectTelemetry(): TelemetrySnapshot {
  const db = getDb()
  const widgetsByKind: Record<string, number> = {}
  let widgetTotal = 0
  let taskCount = 0
  let folderCount = 0
  let focusSessions = 0
  let focusMinutes = 0
  try {
    const rows = db.prepare('SELECT kind, COUNT(*) AS c FROM widgets GROUP BY kind').all() as Array<{
      kind: string
      c: number
    }>
    for (const r of rows) {
      widgetsByKind[r.kind] = r.c
      widgetTotal += r.c
    }
    const nodeRows = db.prepare('SELECT kind, COUNT(*) AS c FROM nodes GROUP BY kind').all() as Array<{
      kind: string
      c: number
    }>
    for (const r of nodeRows) {
      if (r.kind === 'task') taskCount = r.c
      else if (r.kind === 'folder') folderCount = r.c
    }
    const focus = db
      .prepare(
        `SELECT COUNT(*) AS sessions,
                COALESCE(SUM(actual_seconds), 0) AS seconds
         FROM focus_sessions WHERE completed_at IS NOT NULL`
      )
      .get() as { sessions: number; seconds: number }
    focusSessions = focus.sessions
    focusMinutes = Math.round(focus.seconds / 60)
  } catch {
    // partial DB; report whatever we could read
  }

  return {
    appVersion: app.getVersion(),
    platform: process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'windows' : process.platform,
    widgetTotal,
    widgetsByKind,
    taskCount,
    folderCount,
    focusSessions,
    focusMinutes,
    aiCalls: counter('ai_calls')
  }
}
