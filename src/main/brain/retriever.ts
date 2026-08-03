// The plexi-brain retriever. I1 replaced P0's weighted-sum "formula floor" with
// MULTI-LEG RRF FUSION (DEC-020): the semantic leg (chunk_vector) and the lexical leg
// (chunk_fts, BM25) each produce an independent ranked list, and we fuse them by
// Reciprocal Rank Fusion — never comparing scores across legs, only ranks. That kills
// four defects at once: no rarity weighting (D3 — BM25's IDF now separates signal from
// filler), substring instead of tokens (D4 — real tokenised FTS), and the weighted-sum's
// hand-normalised keyword band (D5 — RRF needs no normalisation). The lexical leg is what
// finds exact tokens the 384-dim embedding blurs — IDs, error strings, "Kessel Run".
//
//   RRF:  score(d) = Σ_over_legs  weight_L / (60 + rank_L(d))     (src/shared/rrf.ts)
//
// Two ranking invariants are unchanged from P0:
//   • I1 — AI is never on the retrieve path. The legs are a local vector scan + a local
//     FTS index read + one local query embed (~2-5ms). Zero LLM, zero network.
//   • I2 — the async re-rank seam (reorderAsync) still ships behaviourally as a no-op;
//     P1+'s bounded LLM re-ranker drops into it without touching this file's shape.
//
// The pure fusion + admission gate + dedup logic lives in src/shared/rrf.ts (unit-locked);
// this file is the impure orchestration (load chunks, compute the two legs, fuse, then run
// the P1/P3 spine gate/re-rank LAYER over the fused order exactly as before).
//
// DEC-012: no key / no local model ⇒ embedQuery returns null ⇒ the vector leg is empty and
// fusion degrades to the LEXICAL leg alone (still tokenised + IDF-ranked, strictly better
// than P0's substring keyword floor). Never fabricates. Brain OFF never calls this file.
//
// Recency is deliberately NOT a fused leg (review finding F-6): as an equal RRF voter a
// recency-ordered list hands the newest thing in the corpus a free rank-1 vote on every
// query, re-importing filler-beats-signal. It survives only as a fusion tie-breaker.

import { cosineSim } from '@shared/semantic'
import { listChunks, type ChunkRow } from '../db/chunks'
import { ftsSearchChunkIds } from '../db/chunksFts'
import { listEmbeddings } from '../db/embeddings'
import { getNode } from '../db/nodes'
import type { WorkspaceSource } from '../workspaceRank'
import { embedQuery } from './embedder'
import { resolveSpine } from './spine'
import { applySpineRerank, type SpineCandidate, type SpineContext } from '@shared/spineRerank'
import { fuseCandidates, DEFAULT_RRF_K, type FusionCandidate } from '@shared/rrf'

// How many chunk ids the lexical leg contributes to the fusion pool. Generous: the vector
// leg ranks the whole corpus, so this only bounds the FTS side. Well above top-K so a
// rare-token hit deep in the lexical list still gets its RRF vote.
const FTS_CANDIDATE_LIMIT = 100

// Recency half-life (ms) — the tie-breaker decay (F-6: recency is a tie-break, not a leg).
// A chunk loses half its recency weight every ~90 days; type-agnostic in I1 (Call C's
// type-aware decay is the spine's job).
const RECENCY_HALF_LIFE_MS = 90 * 24 * 60 * 60 * 1000

// The fused item threaded through the spine layer: the chunk plus the tie-break signals
// (recency, importance) fusion used. recallScore (the RRF score) is carried separately by
// SpineCandidate.recallScore, the same seam P0 used.
interface FusedChunk {
  chunk: ChunkRow
  rrf: number
}

function recencyDecay(tsMs: number | null, now: number): number {
  if (!tsMs) return 0.5 // unknown date → neutral, never penalised to zero
  const age = Math.max(0, now - tsMs)
  return Math.pow(0.5, age / RECENCY_HALF_LIFE_MS)
}

// A source's importance signal in [0,1] — the last fusion tie-breaker. Reads a task node's
// importance (1-5) where the source is a task; other sources are neutral (0.5). (The graph's
// DERIVED importance is applied later, as a bounded spine factor — see spineRerank.ts.)
function importanceSignal(chunk: ChunkRow): number {
  if (chunk.source_type === 'task') {
    const n = getNode(chunk.source_id)
    if (n && typeof n.importance === 'number') return Math.min(1, Math.max(0, (n.importance - 1) / 4))
  }
  return 0.5
}

// Resolve a chunk to the WorkspaceSource shape callers expect. The chunk carries the passage
// text (ground on the passage that answered, not the doc head); title/docType come from its
// denormalised fields.
function chunkToSource(chunk: ChunkRow, query: string): WorkspaceSource {
  const docType =
    chunk.source_type === 'knowledge' ? 'knowledge' : chunk.source_kind || chunk.source_type
  const snippet = makeSnippet(chunk.text, query)
  return {
    docId: chunk.source_id,
    title: chunk.title || 'Untitled',
    docType,
    snippet,
    text: chunk.text,
    score: 0 // set by the caller from rank position (keeps the existing convention)
  }
}

function makeSnippet(text: string, query: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  const q = query.trim().toLowerCase()
  const first = q.split(/\s+/)[0]
  const i = first ? clean.toLowerCase().indexOf(first) : -1
  if (i < 0) return clean.slice(0, 200).trim()
  const start = Math.max(0, i - 60)
  return (start > 0 ? '… ' : '') + clean.slice(start, start + 200).trim() + (clean.length > start + 200 ? ' …' : '')
}

// The async re-rank seam (I2), shipped behaviourally as a no-op. The render/answer path
// calls retrieve() and paints the fused order immediately; a caller that wants reordering
// calls reorderAsync() on the shortlist — a pass-through in I1 (zero blocking LLM hops).
// The bounded LLM re-ranker (DEC-011 Call B) drops into this body without changing the seam.
export async function reorderAsync(sources: WorkspaceSource[], _query: string): Promise<WorkspaceSource[]> {
  return sources
}

/**
 * Retrieve the top `limit` sources for a query via RRF fusion of the semantic + lexical
 * legs (I1), THEN the P1/P3 spine gate/re-rank LAYER over the graph.
 *
 * Fusion (recall) decides FINDABILITY; the spine decides QUALITY — it GATES wrong answers
 * (superseded/current-truth, room aperture, sensitivity) and bounded-RE-RANKS survivors by
 * derived importance + confidence + freshness (DEC-011 Call A/B). Recall is never overridden
 * wholesale: a null-spine candidate keeps its fused rank (store-anyway floor, I3). The spine
 * layer is a NO-OP when the graph is empty → fused ordering is returned unchanged. Local +
 * AI-free: one local query embed + one local FTS read are the only compute (I1); no-key still
 * returns current-truth via the lexical leg (DEC-012).
 *
 * U1a — the PERMISSION FLOOR (PLX-SCH-001/002 · U-4) is stage 0, inside fuseCandidates, ahead of
 * every rank, score and count. It has to live there rather than here: RRF scores by RANK, so an
 * unpermitted candidate that takes a rank slot changes the scores of everything below it, and no
 * amount of filtering afterwards can undo that. See shared/rrf.ts responsibility 0.
 *
 * ⚠ SCOPE — U1a shipped the POSITION of the filter and the injected seam. It did NOT ship
 * multi-user permission. There is no production membership model to answer `canRead` yet, so when
 * `opts.canRead` is omitted the floor permits everything and behaviour is byte-identical to
 * pre-U1a. Wiring it to the real room/desk/widget sharing model is U1b, held pending that model.
 * Do not read "the brain has a permission filter" as "the brain enforces permissions".
 *
 * @param opts.roomId  active room aperture (null = org-wide, no room gate)
 * @param opts.allowRestricted  permit restricted-sensitivity items (default false)
 * @param opts.canRead  permission floor predicate over chunk ids; omitted = permit all (U1b)
 */
export async function retrieveViaBrain(
  query: string,
  limit = 6,
  opts: { roomId?: string | null; allowRestricted?: boolean; canRead?: (id: string) => boolean } = {}
): Promise<WorkspaceSource[]> {
  const q = query.trim()
  if (!q) return []

  const chunks = listChunks()
  if (chunks.length === 0) return [] // index not built yet → caller falls back

  const now = Date.now()
  const byId = new Map(chunks.map((c) => [c.id, c]))

  // Source-level duplicate signature: the ordered join of a source's chunk content-hashes.
  // Every chunk of a source shares its source's signature, so two byte-identical sources
  // (twin rooms) collapse to one in fusion regardless of which chunk represents each — the
  // failure a per-chunk hash had, measured on the real corpus (D02's twins surfaced twice
  // because their best-matching chunks were different indices with different hashes).
  // Folded ONCE PER SOURCE (not per candidate): one pass to group, one to sort+join.
  const sigParts = new Map<string, string[]>()
  for (const c of chunks) {
    const key = `${c.source_type}:${c.source_id}`
    const arr = sigParts.get(key)
    if (arr) arr.push(`${c.chunk_index}:${c.content_hash}`)
    else sigParts.set(key, [`${c.chunk_index}:${c.content_hash}`])
  }
  const sigBySource = new Map<string, string>()
  for (const [key, parts] of sigParts) sigBySource.set(key, parts.sort().join('|'))

  // ── Leg 1 — SEMANTIC (chunk_vector). One local query embed (~2-5ms). null ⇒ the leg is
  // empty and fusion runs lexical-only (DEC-012 no-key floor). Rank every chunk with a
  // positive cosine, best first — the whole-corpus semantic ordering. ──────────────────
  const qEmbed = await embedQuery(q)
  const vectors = qEmbed ? listEmbeddings('chunk') : new Map<string, number[]>()
  const vectorRanked: string[] = qEmbed
    ? chunks
        .map((c) => {
          const vec = vectors.get(c.id)
          return { id: c.id, sim: vec ? Math.max(0, cosineSim(qEmbed.vec, vec)) : 0 }
        })
        .filter((x) => x.sim > 0)
        .sort((a, b) => b.sim - a.sim)
        .map((x) => x.id)
    : []

  // ── Leg 2 — LEXICAL (chunk_fts, BM25). Tokenised, IDF-ranked; finds exact tokens the
  // embedding blurs. Kept in lockstep with the chunk store by triggers (I0b delete path
  // reaches it for free), so it never surfaces a deleted chunk. ─────────────────────────
  const ftsRanked = ftsSearchChunkIds(q, FTS_CANDIDATE_LIMIT)

  // ── FUSE — RRF over the two legs, with the admission gate + per-source & content-hash
  // dedup applied inside the pure fuser. Candidates = the union of both legs (a chunk in
  // neither leg has no evidence and is not a candidate). ───────────────────────────────
  const candidateIds = new Set<string>([...vectorRanked, ...ftsRanked])
  const fusionCandidates: FusionCandidate[] = []
  for (const id of candidateIds) {
    const c = byId.get(id)
    if (!c) continue
    const sourceKey = `${c.source_type}:${c.source_id}`
    fusionCandidates.push({
      id,
      sourceKey,
      dupKey: sigBySource.get(sourceKey) ?? sourceKey,
      text: c.text,
      recency: recencyDecay(c.chunk_date, now),
      importance: importanceSignal(c)
    })
  }
  const fused = fuseCandidates(fusionCandidates, { vector: vectorRanked, fts: ftsRanked }, {
    k: DEFAULT_RRF_K,
    // Stage 0 — the permission floor, applied before any rank/score/count is derived (U-4).
    // Threaded straight through: this file is the impure orchestration, so it carries the
    // predicate but never decides it (SEC-020 — the enforcement point is not the membership model).
    canRead: opts.canRead
  })
  if (fused.length === 0) return [] // nothing eligible (e.g. no embed + no lexical tokens)

  // The fused, gated, de-duplicated candidate list (best-first). Carries each survivor's
  // RRF score as the recall signal the spine tunes.
  const candidates: FusedChunk[] = fused.map((f) => ({ chunk: byId.get(f.id)!, rrf: f.rrf }))

  // ── P1/P3 SPINE LAYER — resolve each candidate's spine node + apply the pure gate/
  // re-rank over the WHOLE fused list BEFORE the limit slice (so a gated superseded item
  // doesn't waste a slot and a promoted item can enter the top). resolveSpine returns null
  // for un-typed candidates (store-anyway floor); a null-spine candidate keeps its fused
  // rank. No-op when every spine is null AND no gate fires → fused order unchanged. ──────
  const ctx: SpineContext = { roomId: opts.roomId ?? null, allowRestricted: opts.allowRestricted === true }
  const spineCandidates: Array<SpineCandidate<FusedChunk>> = candidates.map((s) => ({
    item: s,
    recallScore: s.rrf,
    // P3: pass the active room so resolveSpine can compute cross-room same-as linkage
    // (a same-as-linked entity survives the aperture gate — "one Caleb across every room").
    spine: resolveSpine(s.chunk.source_type, s.chunk.source_id, opts.roomId ?? null)
  }))
  // P3: remember each candidate's spine so surviving results can carry the `disagrees` flag
  // (applySpineRerank returns items only). Keyed by the FusedChunk identity.
  const spineByItem = new Map<FusedChunk, SpineCandidate<FusedChunk>['spine']>(
    spineCandidates.map((c) => [c.item, c.spine])
  )
  const reranked = applySpineRerank(spineCandidates, ctx)

  const top = reranked.slice(0, limit)
  // Paint order. score field = descending rank convention the existing callers use
  // (1 - i*0.01). P3: carry the disagree flag so the UI can surface a "sources disagree"
  // chip (I4 — marked, never hidden).
  return top.map((s, i) => {
    const disagrees = spineByItem.get(s)?.disagrees === true
    const src = { ...chunkToSource(s.chunk, q), score: 1 - i * 0.01 }
    return disagrees ? { ...src, disagrees: true } : src
  })
}
