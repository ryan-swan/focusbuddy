// The chunk index — passage-level retrieval over the workspace (A2, R10).
//
// fb_chunks holds every source split into ~paragraph-sized passages with an
// FTS5 mirror (fb_chunks_fts) kept in sync by triggers. Retrieval queries the
// passages with BM25, so a question matches the paragraph that answers it
// rather than a substring of a document's opening — the proper fix for
// defect #2 (long docs shipped their cover page). The substrate already
// existed in the field (1086 chunks written by an earlier build, surveyed
// 2026-08-22, adopted by measurement + Caleb's R10); this module makes the
// app its owner: same DDL, content_hash-cheap reindex on write, a
// reconciling sweep, and the search the document pool now rides on.
//
// Written against a minimal structural DB interface rather than the
// better-sqlite3 types so the unit suite can run REAL FTS5 queries through
// node:sqlite — the ranking behaviour is the point, and a mocked database
// cannot vouch for an FTS MATCH expression.

import { createHash } from 'node:crypto'
import { getDb } from './db/database'
import { getActiveOrgId } from './db/activeOrg'
import { listDocuments, getDocument } from './db/documents'
import { getDocMetadata } from './db/docMetadata'
import { extractDocText, selectPassages, type WorkspaceSource } from './workspaceRank'

// The subset of the database API this module touches. Both better-sqlite3
// (the app) and node:sqlite's DatabaseSync (the tests) satisfy it.
export interface ChunkDb {
  exec(sql: string): unknown
  prepare(sql: string): {
    run(...args: unknown[]): unknown
    get(...args: unknown[]): unknown
    all(...args: unknown[]): unknown[]
  }
}

// Bump when the chunking parameters change: every content_hash embeds it, so
// old chunks re-cut themselves on the next sweep instead of lingering at the
// old granularity forever.
const CHUNK_PARAMS_VERSION = 'v2'
// Passage size. The field data (the adopted index) runs ~1100-1500 chars per
// chunk; matching it keeps the old and new populations comparable.
const CHUNK_TARGET_CHARS = 1200
const CHUNK_MIN_CHARS = 200

// ── Schema ─────────────────────────────────────────────────────────────────

export function ensureChunkTables(db: ChunkDb): void {
  db.exec(`CREATE TABLE IF NOT EXISTS fb_chunks (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  room_id TEXT,
  chunk_date INTEGER,
  source_kind TEXT,
  sensitivity TEXT,
  org_id TEXT NOT NULL DEFAULT 'personal',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_fb_chunks_source ON fb_chunks(source_type, source_id)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_fb_chunks_org ON fb_chunks(org_id)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_fb_chunks_room ON fb_chunks(room_id)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_fb_chunks_date ON fb_chunks(chunk_date DESC)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_fb_chunks_kind ON fb_chunks(source_kind)`)
  db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS fb_chunks_fts USING fts5(
      chunk_id UNINDEXED, org_id UNINDEXED, title, text
    )`)
  db.exec(`CREATE TRIGGER IF NOT EXISTS fb_chunks_fts_ai AFTER INSERT ON fb_chunks BEGIN
      INSERT INTO fb_chunks_fts(chunk_id, org_id, title, text)
        VALUES (new.id, new.org_id, new.title, new.text);
    END`)
  db.exec(`CREATE TRIGGER IF NOT EXISTS fb_chunks_fts_ad AFTER DELETE ON fb_chunks BEGIN
      DELETE FROM fb_chunks_fts WHERE chunk_id = old.id;
    END`)
  db.exec(`CREATE TRIGGER IF NOT EXISTS fb_chunks_fts_au AFTER UPDATE ON fb_chunks BEGIN
      DELETE FROM fb_chunks_fts WHERE chunk_id = old.id;
      INSERT INTO fb_chunks_fts(chunk_id, org_id, title, text)
        VALUES (new.id, new.org_id, new.title, new.text);
    END`)
}

// ── Chunking ───────────────────────────────────────────────────────────────

// Split extracted plain text into passages: paragraphs packed up to the
// target size, a paragraph longer than the target split at sentence bounds.
// Pure, so the granularity is unit-pinned.
export function chunkText(text: string): string[] {
  const clean = text.trim()
  if (!clean) return []
  const paras = clean.split(/\n{2,}/)
  const units: string[] = []
  for (const p of paras) {
    const t = p.trim()
    if (!t) continue
    if (t.length <= CHUNK_TARGET_CHARS) {
      units.push(t)
      continue
    }
    // An oversized paragraph splits at sentence ends, packing greedily.
    let buf = ''
    for (const sentence of t.split(/(?<=[.!?])\s+/)) {
      if (buf && buf.length + sentence.length + 1 > CHUNK_TARGET_CHARS) {
        units.push(buf)
        buf = sentence
      } else {
        buf = buf ? `${buf} ${sentence}` : sentence
      }
    }
    if (buf) units.push(buf)
  }
  // Pack small paragraphs together so a doc of one-liners doesn't become a
  // hundred slivers; a chunk below the minimum rides with its neighbour.
  const chunks: string[] = []
  let buf = ''
  for (const u of units) {
    if (buf && buf.length + u.length + 2 > CHUNK_TARGET_CHARS && buf.length >= CHUNK_MIN_CHARS) {
      chunks.push(buf)
      buf = u
    } else {
      buf = buf ? `${buf}\n\n${u}` : u
    }
  }
  if (buf) chunks.push(buf)
  return chunks
}

function contentHash(title: string, text: string): string {
  return createHash('sha1')
    .update(CHUNK_PARAMS_VERSION)
    .update('\0')
    .update(title)
    .update('\0')
    .update(text)
    .digest('hex')
}

// ── Indexing ───────────────────────────────────────────────────────────────

export interface ChunkSourceInput {
  sourceType: string
  sourceId: string
  title: string
  text: string
  sourceKind?: string | null
  roomId?: string | null
  orgId: string
  updatedAt?: number
}

// (Re)index one source. Content-hash cheap: unchanged text is a single
// SELECT. Returns how many chunks now stand for the source.
export function reindexSourceChunks(db: ChunkDb, input: ChunkSourceInput): number {
  ensureChunkTables(db)
  const hash = contentHash(input.title, input.text)
  const existing = db
    .prepare(
      `SELECT count(*) AS n, min(content_hash) AS h FROM fb_chunks WHERE source_type = ? AND source_id = ?`
    )
    .get(input.sourceType, input.sourceId) as { n: number; h: string | null }
  if (existing.n > 0 && existing.h === hash) return Number(existing.n)
  const chunks = chunkText(input.text)
  const now = Date.now()
  db.exec('BEGIN')
  try {
    db.prepare(`DELETE FROM fb_chunks WHERE source_type = ? AND source_id = ?`).run(
      input.sourceType,
      input.sourceId
    )
    const ins = db.prepare(
      `INSERT INTO fb_chunks (id, source_type, source_id, chunk_index, title, text, content_hash,
         room_id, chunk_date, source_kind, sensitivity, org_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`
    )
    chunks.forEach((text, i) => {
      ins.run(
        `${input.sourceType}:${input.sourceId}:${i}`,
        input.sourceType,
        input.sourceId,
        i,
        input.title,
        text,
        hash,
        input.roomId ?? null,
        input.updatedAt ?? now,
        input.sourceKind ?? null,
        input.orgId,
        now,
        now
      )
    })
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
  return chunks.length
}

export function removeSourceChunks(db: ChunkDb, sourceType: string, sourceId: string): void {
  ensureChunkTables(db)
  db.prepare(`DELETE FROM fb_chunks WHERE source_type = ? AND source_id = ?`).run(sourceType, sourceId)
}

// ── Search ─────────────────────────────────────────────────────────────────

export interface ChunkHit {
  sourceId: string
  title: string
  sourceKind: string | null
  // Best (lowest) BM25 rank among the source's matched chunks.
  rank: number
  // The matched passages, best first, capped.
  passages: string[]
}

// Build a safe FTS5 MATCH expression from free text: bare terms, quoted, OR'd.
// OR rather than AND because BM25 already rewards multi-term hits and the
// relevance gate downstream culls single-term coincidences (AI-26); an AND
// query would return nothing for a question with one off-vocabulary word.
export function ftsQuery(query: string): string | null {
  const terms = (query.toLowerCase().match(/[a-z0-9]{2,}/g) ?? []).slice(0, 12)
  if (terms.length === 0) return null
  return terms.map((t) => `"${t}"`).join(' OR ')
}

// Passage-level search, grouped back to sources. Org-scoped; `sourceType`
// bounds which population is searched (the document pool passes 'document';
// widget kinds join in a later A2 phase).
export function searchChunks(
  db: ChunkDb,
  query: string,
  opts: { orgId: string; sourceType?: string; limit?: number; passagesPerSource?: number }
): ChunkHit[] {
  ensureChunkTables(db)
  const match = ftsQuery(query)
  if (!match) return []
  const limit = opts.limit ?? 6
  const perSource = opts.passagesPerSource ?? 3
  const rows = db
    .prepare(
      `SELECT c.source_id AS sourceId, c.title AS title, c.source_kind AS sourceKind,
              c.text AS text, bm25(fb_chunks_fts, 0, 0, 5.0, 1.0) AS rank
       FROM fb_chunks_fts f JOIN fb_chunks c ON c.id = f.chunk_id
       WHERE fb_chunks_fts MATCH ? AND f.org_id = ?${opts.sourceType ? ' AND c.source_type = ?' : ''}
       ORDER BY rank LIMIT 80`
    )
    .all(
      ...(opts.sourceType ? [match, opts.orgId, opts.sourceType] : [match, opts.orgId])
    ) as Array<{ sourceId: string; title: string; sourceKind: string | null; text: string; rank: number }>
  const bySource = new Map<string, ChunkHit>()
  for (const r of rows) {
    let hit = bySource.get(r.sourceId)
    if (!hit) {
      hit = { sourceId: r.sourceId, title: r.title, sourceKind: r.sourceKind, rank: r.rank, passages: [] }
      bySource.set(r.sourceId, hit)
    }
    if (hit.passages.length < perSource) hit.passages.push(r.text)
  }
  return [...bySource.values()].sort((a, b) => a.rank - b.rank).slice(0, limit)
}

// ── The app-facing wrappers (real getDb) ───────────────────────────────────

function appDb(): ChunkDb {
  return getDb() as unknown as ChunkDb
}

// True when the index holds anything for this org — the signal that the
// chunk-backed document pool is live. A fresh profile before its first sweep
// answers false and retrieval uses the legacy whole-document path.
export function chunkIndexActive(): boolean {
  try {
    const db = appDb()
    ensureChunkTables(db)
    const r = db
      .prepare(`SELECT count(*) AS n FROM fb_chunks WHERE source_type = 'document' AND org_id = ?`)
      .get(getActiveOrgId()) as { n: number }
    return Number(r.n) > 0
  } catch {
    return false
  }
}

// Reindex one document (the save chokepoint calls this, best-effort).
export function reindexDocumentChunks(docId: string): void {
  try {
    const meta = listDocuments().find((m) => m.id === docId)
    const full = getDocument(docId)
    if (!meta || !full) {
      removeSourceChunks(appDb(), 'document', docId)
      return
    }
    const text = extractDocText(meta.docType, full.body)
    if (!text.trim()) {
      removeSourceChunks(appDb(), 'document', docId)
      return
    }
    reindexSourceChunks(appDb(), {
      sourceType: 'document',
      sourceId: docId,
      title: meta.title,
      text,
      sourceKind: meta.docType,
      orgId: getActiveOrgId(),
      updatedAt: meta.updatedAt
    })
  } catch {
    // Indexing must never break a save; the sweep reconciles later.
  }
}

// Reconcile the whole document population: index what's missing or changed
// (content-hash cheap), delete chunks whose document is gone. Called once at
// startup, deferred off the critical path.
export function sweepDocumentChunks(): { indexed: number; removed: number } {
  const db = appDb()
  ensureChunkTables(db)
  const docs = listDocuments()
  const live = new Set(docs.map((d) => d.id))
  let indexed = 0
  for (const m of docs) {
    const full = getDocument(m.id)
    if (!full) continue
    const text = extractDocText(m.docType, full.body)
    if (!text.trim()) continue
    const before = db
      .prepare(`SELECT min(content_hash) AS h FROM fb_chunks WHERE source_type = 'document' AND source_id = ?`)
      .get(m.id) as { h: string | null }
    if (before.h !== contentHash(m.title, text)) {
      reindexSourceChunks(db, {
        sourceType: 'document',
        sourceId: m.id,
        title: m.title,
        text,
        sourceKind: m.docType,
        orgId: getActiveOrgId(),
        updatedAt: m.updatedAt
      })
      indexed++
    }
  }
  const stale = db
    .prepare(`SELECT DISTINCT source_id AS id FROM fb_chunks WHERE source_type = 'document'`)
    .all() as Array<{ id: string }>
  let removed = 0
  for (const s of stale) {
    if (!live.has(s.id)) {
      removeSourceChunks(db, 'document', s.id)
      removed++
    }
  }
  return { indexed, removed }
}

// The chunk-backed document pool, shaped as WorkspaceSource for retrieval.
// Text is the matched passages themselves — the paragraph that answers, not
// the document's head — passed through selectPassages only to enforce the
// prompt budget shape it expects.
export function chunkSearchDocuments(query: string, limit = 6): WorkspaceSource[] {
  const hits = searchChunks(appDb(), query, {
    orgId: getActiveOrgId(),
    sourceType: 'document',
    limit
  })
  return hits.map((h, i) => {
    const joined = h.passages.join('\n…\n')
    const meta = getDocMetadata(h.sourceId)
    return {
      docId: h.sourceId,
      title: h.title || 'Untitled',
      docType: h.sourceKind ?? 'doc',
      snippet: joined.replace(/\s+/g, ' ').trim().slice(0, 200),
      text: selectPassages(query, joined),
      score: 1 - i * 0.01,
      summary: meta?.summary || undefined,
      category: meta?.category || undefined,
      dates: meta?.dates,
      entities: meta?.entities
    }
  })
}
