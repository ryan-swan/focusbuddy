// Context Object store (spec §38, PLX-CTX-001). Context Objects are versioned and
// retained: superseding one keeps the prior version retrievable for audit, never
// overwriting it in place.

import type { SqlDb } from '../db/eventStore'
import { plexiId } from '../../shared/plexiId'

export interface ContextObjectRecord {
  id: string
  subjectId: string // the object/desk this context is about
  organisationId: string
  version: number
  supersededById: string | null
  body: string // serialised Context Object payload
  createdAt: string
}

export function ensureContextObjectSchema(db: SqlDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS context_objects (
      id TEXT PRIMARY KEY,
      subject_id TEXT NOT NULL,
      organisation_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      superseded_by_id TEXT,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ctxobj_subject ON context_objects(subject_id, version);
  `)
}

export interface ContextObjectStore {
  put: (subjectId: string, organisationId: string, body: string, at: string) => ContextObjectRecord
  current: (subjectId: string) => ContextObjectRecord | null
  history: (subjectId: string) => ContextObjectRecord[]
  get: (id: string) => ContextObjectRecord | null
}

export function createContextObjectStore(db: SqlDb): ContextObjectStore {
  ensureContextObjectSchema(db)

  const rowTo = (r: Record<string, unknown>): ContextObjectRecord => ({
    id: r.id as string,
    subjectId: r.subject_id as string,
    organisationId: r.organisation_id as string,
    version: r.version as number,
    supersededById: (r.superseded_by_id as string) ?? null,
    body: r.body as string,
    createdAt: r.created_at as string
  })

  const history: ContextObjectStore['history'] = (subjectId) =>
    (db.prepare('SELECT * FROM context_objects WHERE subject_id = ? ORDER BY version ASC').all(subjectId) as Record<string, unknown>[]).map(rowTo)

  const current: ContextObjectStore['current'] = (subjectId) => {
    const row = db.prepare('SELECT * FROM context_objects WHERE subject_id = ? AND superseded_by_id IS NULL ORDER BY version DESC LIMIT 1').get(subjectId) as
      | Record<string, unknown>
      | undefined
    return row ? rowTo(row) : null
  }

  const get: ContextObjectStore['get'] = (id) => {
    const row = db.prepare('SELECT * FROM context_objects WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return row ? rowTo(row) : null
  }

  // Write a new version. The prior current version is marked superseded but RETAINED
  // and still retrievable for audit — never overwritten (CTX-001).
  const put: ContextObjectStore['put'] = (subjectId, organisationId, body, at) => {
    const prev = current(subjectId)
    const version = (prev?.version ?? 0) + 1
    const rec: ContextObjectRecord = { id: plexiId(), subjectId, organisationId, version, supersededById: null, body, createdAt: at }
    db.prepare(
      'INSERT INTO context_objects (id, subject_id, organisation_id, version, superseded_by_id, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(rec.id, rec.subjectId, rec.organisationId, rec.version, null, rec.body, rec.createdAt)
    if (prev) db.prepare('UPDATE context_objects SET superseded_by_id = ? WHERE id = ?').run(rec.id, prev.id)
    return rec
  }

  return { put, current, history, get }
}
