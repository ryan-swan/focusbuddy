// Per-subject key registry (spec §44.1, PLX-SEC-030; ADR-0003). Each data subject
// has one symmetric key. Erasure is executed by DESTROYING that key, which is
// irreversible: once gone, everything sealed under it is permanently undecryptable,
// while every Event record that referenced it remains untouched (INV-05, DOM-015).
//
// In production the key store is the OS keychain via Electron safeStorage. Here the
// store is an injected SqlDb so the mechanism is testable; a key never leaves this
// module in clear except to the crypto seal/open functions.

import { randomBytes } from 'node:crypto'
import type { SqlDb } from '../db/eventStore'

export interface SubjectKeyRegistry {
  ensureKey: (subjectId: string) => Buffer // create if absent, return the live key
  getKey: (subjectId: string) => Buffer | null // null once destroyed
  hasKey: (subjectId: string) => boolean
  destroyKey: (subjectId: string) => boolean // irreversible; true if a key was destroyed
  db: SqlDb
}

export function ensureSubjectKeySchema(db: SqlDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS subject_keys (
      subject_id TEXT PRIMARY KEY,
      key_b64 TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `)
}

export function createSubjectKeyRegistry(db: SqlDb): SubjectKeyRegistry {
  ensureSubjectKeySchema(db)

  const getKey: SubjectKeyRegistry['getKey'] = (subjectId) => {
    const row = db.prepare('SELECT key_b64 FROM subject_keys WHERE subject_id = ?').get(subjectId) as { key_b64: string } | undefined
    return row ? Buffer.from(row.key_b64, 'base64') : null
  }

  const hasKey: SubjectKeyRegistry['hasKey'] = (subjectId) =>
    !!(db.prepare('SELECT 1 AS n FROM subject_keys WHERE subject_id = ?').get(subjectId) as { n: number } | undefined)

  const ensureKey: SubjectKeyRegistry['ensureKey'] = (subjectId) => {
    const existing = getKey(subjectId)
    if (existing) return existing
    const key = randomBytes(32) // AES-256
    db.prepare('INSERT INTO subject_keys (subject_id, key_b64, created_at) VALUES (?, ?, ?)').run(
      subjectId,
      key.toString('base64'),
      new Date().toISOString()
    )
    return key
  }

  // Irreversible. There is deliberately no "restore" — that is the whole point of
  // cryptographic erasure (PLX-SEC-030).
  const destroyKey: SubjectKeyRegistry['destroyKey'] = (subjectId) => {
    const had = hasKey(subjectId)
    db.prepare('DELETE FROM subject_keys WHERE subject_id = ?').run(subjectId)
    return had
  }

  return { ensureKey, getKey, hasKey, destroyKey, db }
}
