import { getDb } from './database'
import { getActiveOrgId } from './activeOrg'
import type { SourceRef } from '@shared/indexReconcile'

// ── fb_chunks (plexi-brain P0 — the RAG floor) ───────────────────────────────
// A source's extracted text split into overlapping chunks, so a fact buried deep
// in a long document is findable by meaning. One row per chunk; the chunk's vector
// lives in fb_embeddings under item_type='chunk', item_id = the chunk row id.
//
// This module is the DATA layer only (CRUD + queries). Chunking itself lives in
// the pure ../brain/chunker.ts; embedding + retrieval live in ../brain/. Brain
// OFF never calls into here, so the table stays dormant + harmless (DEC-012).
//
// The reserved graph-ready columns (room_id / chunk_date / source_kind /
// sensitivity) are written best-effort in P0 as plain indexed columns; P1's
// object-graph spine layers a re-rank/gate over them (invariant I2). Keep them
// nullable — nothing base-app depends on them.

export interface ChunkRow {
  id: string
  source_type: string
  source_id: string
  chunk_index: number
  title: string
  text: string
  content_hash: string
  room_id: string | null
  chunk_date: number | null
  source_kind: string | null
  sensitivity: string | null
  org_id: string
  created_at: number
  updated_at: number
}

export interface ChunkDraft {
  id: string
  sourceType: string
  sourceId: string
  chunkIndex: number
  title: string
  text: string
  contentHash: string
  roomId?: string | null
  chunkDate?: number | null
  sourceKind?: string | null
  sensitivity?: string | null
}

// Replace all chunks for one source in a single transaction (idempotent re-index):
// delete the source's existing chunks + their embeddings, then insert the new set.
// The embedding delete keeps fb_embeddings from accumulating orphaned chunk vectors
// when a document is edited and re-chunked into a different number of pieces.
//
// Returns the number of PRE-EXISTING chunks it deleted — the write-side churn. This lets a
// caller keep an exact chunk-count ledger: with an EMPTY `drafts` (the I3 admission gate
// rejected everything) it is a pure removal, and with a re-chunk it is the old count that
// left as the new count arrived. buildIndex sums it into IndexResult.chunksReplaced so
// "after = before + written − replaced − reconciled" holds exactly (brainDeleteCorpusReconcile).
export function replaceChunksForSource(
  sourceType: string,
  sourceId: string,
  drafts: ChunkDraft[]
): number {
  const db = getDb()
  const org = getActiveOrgId()
  const now = Date.now()
  const delChunks = db.prepare('DELETE FROM fb_chunks WHERE source_type = ? AND source_id = ? AND org_id = ?')
  // Orphaned chunk vectors: gather the old chunk ids first, then clear their embeddings.
  const oldIds = db
    .prepare('SELECT id FROM fb_chunks WHERE source_type = ? AND source_id = ? AND org_id = ?')
    .all(sourceType, sourceId, org) as Array<{ id: string }>
  const delEmb = db.prepare("DELETE FROM fb_embeddings WHERE item_type = 'chunk' AND item_id = ?")
  const ins = db.prepare(
    `INSERT INTO fb_chunks
       (id, source_type, source_id, chunk_index, title, text, content_hash,
        room_id, chunk_date, source_kind, sensitivity, org_id, created_at, updated_at)
     VALUES
       (@id, @sourceType, @sourceId, @chunkIndex, @title, @text, @contentHash,
        @roomId, @chunkDate, @sourceKind, @sensitivity, @orgId, @now, @now)`
  )
  const tx = db.transaction(() => {
    for (const o of oldIds) delEmb.run(o.id)
    delChunks.run(sourceType, sourceId, org)
    for (const d of drafts) {
      ins.run({
        id: d.id,
        sourceType: d.sourceType,
        sourceId: d.sourceId,
        chunkIndex: d.chunkIndex,
        title: d.title,
        text: d.text,
        contentHash: d.contentHash,
        roomId: d.roomId ?? null,
        chunkDate: d.chunkDate ?? null,
        sourceKind: d.sourceKind ?? null,
        sensitivity: d.sensitivity ?? null,
        orgId: org,
        now
      })
    }
  })
  tx()
  return oldIds.length
}

// All chunks in the active org (used to load the candidate set for retrieval).
// P0 loads these in-memory + scores; the reserved room_id/date columns let a later
// phase push the aperture/recency filter into SQL. Ordered newest-source-first so
// a truncated scan still prefers recent content.
export function listChunks(): ChunkRow[] {
  return getDb()
    .prepare('SELECT * FROM fb_chunks WHERE org_id = ? ORDER BY chunk_date DESC')
    .all(getActiveOrgId()) as ChunkRow[]
}

// Chunk count for the active org — cheap health/telemetry check ("is the index built?").
export function countChunks(): number {
  const r = getDb()
    .prepare('SELECT COUNT(*) AS n FROM fb_chunks WHERE org_id = ?')
    .get(getActiveOrgId()) as { n: number }
  return r.n
}

// The content hashes already indexed for a source — lets the indexer skip
// re-chunking + re-embedding a source whose text hasn't changed.
/** The lineage a source's chunks currently carry. `null` when the source is not indexed. */
export interface ChunkLineage {
  roomId: string | null
  title: string
  sourceKind: string | null
}

// I2b — READ the lineage stamped on a source's chunks, so the indexer can tell a
// LINEAGE-ONLY change (a desk moved to another room, a widget renamed) apart from a
// content change. The content hash covers only the chunk TEXT, so without this the two are
// indistinguishable and a move silently keeps the old room stamp. See applyChunkLineage.
export function chunkLineageForSource(sourceType: string, sourceId: string): ChunkLineage | null {
  const db = getDb()
  const row = db
    .prepare(
      `SELECT room_id, title, source_kind FROM fb_chunks
       WHERE source_type = ? AND source_id = ? AND org_id = ? ORDER BY chunk_index LIMIT 1`
    )
    .get(sourceType, sourceId, getActiveOrgId()) as
    | { room_id: string | null; title: string; source_kind: string | null }
    | undefined
  return row ? { roomId: row.room_id, title: row.title, sourceKind: row.source_kind } : null
}

/**
 * I2b — RE-STAMP a source's chunks in place when only its lineage changed.
 *
 * Why not just call replaceChunksForSource? Because the text is identical, and that
 * function deletes the chunks AND their embeddings, forcing a re-embed of unchanged text —
 * the expensive half of indexing, paid for a metadata edit. This is one UPDATE, and the
 * fb_chunks_fts AFTER UPDATE trigger keeps the lexical index in step for free (which
 * matters: `title` is an indexed FTS column since I1, so a rename must reach it).
 *
 * `chunk_date` is deliberately NOT re-stamped here. It is the recency signal — "when did
 * this CONTENT last change" — and dragging a widget across a canvas is not a content
 * change. Re-stamping it would let pure geometry traffic quietly promote stale text in the
 * recency tie-breaker.
 */
export function applyChunkLineage(sourceType: string, sourceId: string, next: ChunkLineage): number {
  const db = getDb()
  const info = db
    .prepare(
      `UPDATE fb_chunks SET room_id = ?, title = ?, source_kind = ?, updated_at = ?
       WHERE source_type = ? AND source_id = ? AND org_id = ?`
    )
    .run(next.roomId, next.title, next.sourceKind, Date.now(), sourceType, sourceId, getActiveOrgId())
  return info.changes
}

// I2b (LOCK 9): the DISTINCT room stamps currently carried by one source's chunks. A
// re-parented desk must re-stamp its widgets' lineage, and the honest place to assert that
// is the column itself rather than a retrieval side effect.
export function chunkRoomsForSource(sourceType: string, sourceId: string): Array<string | null> {
  const db = getDb()
  const rows = db
    .prepare(
      'SELECT DISTINCT room_id FROM fb_chunks WHERE source_type = ? AND source_id = ? AND org_id = ? ORDER BY room_id'
    )
    .all(sourceType, sourceId, getActiveOrgId()) as Array<{ room_id: string | null }>
  return rows.map((r) => r.room_id)
}

export function existingHashesForSource(sourceType: string, sourceId: string): Set<string> {
  const rows = getDb()
    .prepare('SELECT content_hash FROM fb_chunks WHERE source_type = ? AND source_id = ? AND org_id = ?')
    .all(sourceType, sourceId, getActiveOrgId()) as Array<{ content_hash: string }>
  return new Set(rows.map((r) => r.content_hash))
}

// Every DISTINCT source currently represented in the index, for the active org — the
// "what does the index think exists" half of I0b's reconcile diff. Cheap: one indexed
// scan of (source_type, source_id), not the chunk bodies.
export function listIndexedSourceRefs(): SourceRef[] {
  return getDb()
    .prepare(
      'SELECT DISTINCT source_type AS sourceType, source_id AS sourceId FROM fb_chunks WHERE org_id = ?'
    )
    .all(getActiveOrgId()) as SourceRef[]
}

// How many chunks a source currently holds — lets the removal path report exactly what
// it deleted instead of asserting that it did (a tombstone with no count is a claim).
export function countChunksForSource(sourceType: string, sourceId: string): number {
  const r = getDb()
    .prepare('SELECT COUNT(*) AS n FROM fb_chunks WHERE source_type = ? AND source_id = ? AND org_id = ?')
    .get(sourceType, sourceId, getActiveOrgId()) as { n: number }
  return r.n
}

// Remove all chunks for a source (e.g. when the source is deleted).
export function deleteChunksForSource(sourceType: string, sourceId: string): void {
  const db = getDb()
  const org = getActiveOrgId()
  const oldIds = db
    .prepare('SELECT id FROM fb_chunks WHERE source_type = ? AND source_id = ? AND org_id = ?')
    .all(sourceType, sourceId, org) as Array<{ id: string }>
  const delEmb = db.prepare("DELETE FROM fb_embeddings WHERE item_type = 'chunk' AND item_id = ?")
  const tx = db.transaction(() => {
    for (const o of oldIds) delEmb.run(o.id)
    db.prepare('DELETE FROM fb_chunks WHERE source_type = ? AND source_id = ? AND org_id = ?').run(sourceType, sourceId, org)
  })
  tx()
}
