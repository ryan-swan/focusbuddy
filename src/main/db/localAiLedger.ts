import { createHash } from 'node:crypto'
import { getDb } from './database'
import { getActiveOrgId } from './activeOrg'

// Which documents each LOCAL-AI pass has already processed, keyed by a hash of
// the content it processed.
//
// Enrichment and memory extraction are model calls. They are free and private
// (they run on the local model), but they are not instant, so a background sweep
// that re-ran them over the whole workspace on every tick would be a pointless
// load. The hash is what makes the sweep safe to repeat: an unchanged document
// is skipped forever, an edited one is reprocessed exactly once.
//
// This mirrors fb_chunk_ledger, which does the same job for the file sweep.

export type LocalAiPass = 'enrich' | 'memory'

let ensured = false
function ensure(): void {
  if (ensured) return
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS fb_local_ai_ledger (
      pass TEXT NOT NULL,
      source_id TEXT NOT NULL,
      org_id TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (pass, source_id, org_id)
    );
  `)
  ensured = true
}

export function localAiContentHash(title: string, text: string): string {
  return createHash('sha1').update(`${title} ${text}`).digest('hex')
}

/** True when this pass has not yet processed this exact content. */
export function needsLocalAiPass(pass: LocalAiPass, sourceId: string, hash: string): boolean {
  ensure()
  const row = getDb()
    .prepare('SELECT content_hash FROM fb_local_ai_ledger WHERE pass = ? AND source_id = ? AND org_id = ?')
    .get(pass, sourceId, getActiveOrgId()) as { content_hash?: string } | undefined
  return row?.content_hash !== hash
}

export function markLocalAiPass(pass: LocalAiPass, sourceId: string, hash: string): void {
  ensure()
  getDb()
    .prepare(
      `INSERT INTO fb_local_ai_ledger (pass, source_id, org_id, content_hash, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(pass, source_id, org_id)
       DO UPDATE SET content_hash = excluded.content_hash, updated_at = excluded.updated_at`
    )
    .run(pass, sourceId, getActiveOrgId(), hash, Date.now())
}

export function localAiPassCount(pass: LocalAiPass): number {
  ensure()
  const row = getDb()
    .prepare('SELECT count(*) AS c FROM fb_local_ai_ledger WHERE pass = ? AND org_id = ?')
    .get(pass, getActiveOrgId()) as { c: number }
  return row.c
}
