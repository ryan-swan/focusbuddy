import { randomUUID } from 'crypto'
import { getDb } from './database'
import type { EnergyLevel, EnergyLogEntry } from '@shared/types'

interface EnergyRow {
  id: string
  ts: number
  level: EnergyLevel
}

function rowToEntry(row: EnergyRow): EnergyLogEntry {
  return { id: row.id, ts: row.ts, level: row.level }
}

export function logEnergy(level: EnergyLevel): EnergyLogEntry {
  const db = getDb()
  const id = randomUUID()
  const ts = Date.now()
  db.prepare('INSERT INTO energy_log (id, ts, level) VALUES (?, ?, ?)').run(id, ts, level)
  return { id, ts, level }
}

// Return entries from the last N hours (default 24h), newest first
export function recentEnergy(hours = 24): EnergyLogEntry[] {
  const db = getDb()
  const since = Date.now() - hours * 3_600_000
  const rows = db
    .prepare('SELECT * FROM energy_log WHERE ts >= ? ORDER BY ts DESC')
    .all(since) as EnergyRow[]
  return rows.map(rowToEntry)
}

// Most recent entry within the last 6 hours — null if user hasn't logged recently
export function currentEnergy(maxAgeHours = 6): EnergyLogEntry | null {
  const db = getDb()
  const since = Date.now() - maxAgeHours * 3_600_000
  const row = db
    .prepare('SELECT * FROM energy_log WHERE ts >= ? ORDER BY ts DESC LIMIT 1')
    .get(since) as EnergyRow | undefined
  return row ? rowToEntry(row) : null
}
