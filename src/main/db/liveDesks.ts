import { getDb } from './database'

// Local record of which desks are published as public live web views.
//
// Signal is the authority on the projection itself; this table is the desktop's
// side of the arrangement: which desk maps to which public token, what revision
// we last successfully published, and whether the last attempt failed. The
// share manager reads it to show "last published" and any publish error, which
// the design calls for so an owner is never left believing a stale page is live.

export interface LiveDeskRecord {
  deskId: string
  token: string
  revision: number
  lastPublishedAt: number | null
  lastError: string | null
  paused: boolean
  createdAt: number
}

interface Raw {
  desk_id: string
  token: string
  revision: number
  last_published_at: number | null
  last_error: string | null
  paused: number
  created_at: number
}

function ensure(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS fb_live_desks (
      desk_id TEXT PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      revision INTEGER NOT NULL DEFAULT 0,
      last_published_at INTEGER,
      last_error TEXT,
      paused INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
  `)
}

function hydrate(r: Raw): LiveDeskRecord {
  return {
    deskId: r.desk_id,
    token: r.token,
    revision: r.revision,
    lastPublishedAt: r.last_published_at,
    lastError: r.last_error,
    paused: r.paused === 1,
    createdAt: r.created_at
  }
}

export function getLiveDesk(deskId: string): LiveDeskRecord | null {
  ensure()
  const r = getDb().prepare('SELECT * FROM fb_live_desks WHERE desk_id = ?').get(deskId) as
    | Raw
    | undefined
  return r ? hydrate(r) : null
}

export function getLiveDeskByToken(token: string): LiveDeskRecord | null {
  ensure()
  const r = getDb().prepare('SELECT * FROM fb_live_desks WHERE token = ?').get(token) as
    | Raw
    | undefined
  return r ? hydrate(r) : null
}

export function listLiveDesks(): LiveDeskRecord[] {
  ensure()
  return (getDb().prepare('SELECT * FROM fb_live_desks ORDER BY created_at DESC').all() as Raw[]).map(
    hydrate
  )
}

export function upsertLiveDesk(deskId: string, token: string): LiveDeskRecord {
  ensure()
  getDb()
    .prepare(
      `INSERT INTO fb_live_desks (desk_id, token, revision, created_at)
       VALUES (?, ?, 0, ?)
       ON CONFLICT(desk_id) DO UPDATE SET token = excluded.token`
    )
    .run(deskId, token, Date.now())
  return getLiveDesk(deskId)!
}

export function recordPublish(deskId: string, revision: number): void {
  ensure()
  getDb()
    .prepare(
      'UPDATE fb_live_desks SET revision = ?, last_published_at = ?, last_error = NULL WHERE desk_id = ?'
    )
    .run(revision, Date.now(), deskId)
}

export function recordPublishError(deskId: string, message: string): void {
  ensure()
  getDb().prepare('UPDATE fb_live_desks SET last_error = ? WHERE desk_id = ?').run(message, deskId)
}

export function setLiveDeskPaused(deskId: string, paused: boolean): void {
  ensure()
  getDb().prepare('UPDATE fb_live_desks SET paused = ? WHERE desk_id = ?').run(paused ? 1 : 0, deskId)
}

export function removeLiveDesk(deskId: string): void {
  ensure()
  getDb().prepare('DELETE FROM fb_live_desks WHERE desk_id = ?').run(deskId)
}
