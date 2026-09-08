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

// Run once per process. This used to re-run CREATE TABLE, a PRAGMA and two
// conditional ALTERs on every single call -- including from a 15s timer and
// every IPC -- which is both wasteful and, on a table another connection is
// touching, a good way to stall the main process. Schema setup happens when the
// module is first used and never again.
let ensured = false

function ensure(): void {
  if (ensured) return
  ensured = true
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
  // Why a desk is not publishing is as important as why a publish failed, and
  // for a long time it was invisible: a desk could sit unpublished for an hour
  // with last_error empty, because nothing had been attempted and nothing
  // attempted leaves no trace.
  const cols = new Set(
    (getDb().prepare('PRAGMA table_info(fb_live_desks)').all() as { name: string }[]).map((c) => c.name)
  )
  if (!cols.has('last_check_at')) {
    getDb().exec('ALTER TABLE fb_live_desks ADD COLUMN last_check_at INTEGER')
  }
  if (!cols.has('last_skip')) {
    getDb().exec('ALTER TABLE fb_live_desks ADD COLUMN last_skip TEXT')
  }
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

/**
 * Record that the publisher looked at this desk, and what it decided. `skip` is
 * null when it went on to publish. This is the difference between "publishing
 * is broken" and "publishing never ran", which took three rounds to tell apart
 * without it.
 */
export function recordCheck(deskId: string, skip: string | null): void {
  ensure()
  // '*' records against every published desk. The renderer needs to report
  // things it learns BEFORE it knows any desk id -- that it started at all,
  // and whether listing the desks even succeeded -- and without that the trace
  // was empty in exactly the case worth diagnosing.
  if (deskId === '*') {
    getDb().prepare('UPDATE fb_live_desks SET last_check_at = ?, last_skip = ?').run(Date.now(), skip)
    return
  }
  getDb()
    .prepare('UPDATE fb_live_desks SET last_check_at = ?, last_skip = ? WHERE desk_id = ?')
    .run(Date.now(), skip, deskId)
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
