// AI summary cache (spec §52, PLX-RES-012) — expensive reasoning outputs MUST be
// cached and keyed by the STRUCTURED INPUT digest, so identical structured input
// never incurs repeated model cost. The digest is computed over the deterministic
// Resume structure (never over the AI prose it produced), so the same catch-up
// always resolves to the same cache key.

import { createHash } from 'node:crypto'
import type { SqlDb } from '../db/eventStore'
import type { StructuredResume } from '../resume/resume'

// A stable digest over the meaningful structured fields. Order-independent for the
// group/decision sets so cosmetic ordering never changes the key.
export function structuredDigest(resume: StructuredResume): string {
  const canonical = {
    deskId: resume.deskId,
    forUserId: resume.forUserId,
    groups: resume.groups
      .map((g) => ({
        objectId: g.objectId,
        changes: g.changes.map((c) => ({ kind: c.kind, count: c.count, eventIds: [...c.eventIds].sort() })).sort((a, b) => a.kind.localeCompare(b.kind))
      }))
      .sort((a, b) => a.objectId.localeCompare(b.objectId)),
    decisionIds: [...resume.decisionIds].sort(),
    sourceEventIds: [...resume.sourceEventIds].sort()
  }
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}

export interface SummaryCache {
  getOrCompute: (digest: string, compute: () => string) => { value: string; hit: boolean }
  get: (digest: string) => string | null
  db: SqlDb
}

export function ensureSummaryCacheSchema(db: SqlDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_summary_cache (
      digest TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `)
}

export function createSummaryCache(db: SqlDb): SummaryCache {
  ensureSummaryCacheSchema(db)

  const get: SummaryCache['get'] = (digest) => {
    const row = db.prepare('SELECT value FROM ai_summary_cache WHERE digest = ?').get(digest) as { value: string } | undefined
    return row?.value ?? null
  }

  const getOrCompute: SummaryCache['getOrCompute'] = (digest, compute) => {
    const existing = get(digest)
    if (existing !== null) return { value: existing, hit: true }
    const value = compute() // the only path that incurs model cost
    db.prepare('INSERT OR REPLACE INTO ai_summary_cache (digest, value, created_at) VALUES (?, ?, ?)').run(
      digest,
      value,
      new Date().toISOString()
    )
    return { value, hit: false }
  }

  return { getOrCompute, get, db }
}
