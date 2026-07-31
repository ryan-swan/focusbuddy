import { getDb } from './database'
import { getActiveOrgId } from './activeOrg'

// The lexical retrieval leg's QUERY side (plexi-brain I1 / DEC-020). The FTS5 index itself
// (fb_chunks_fts) and its lockstep triggers live in database.ts (migrateChunkFts); this
// module turns a free-text query into a BM25-ranked list of chunk ids for RRF fusion.
//
// DEC-012: this only runs on the brain retrieval path (retrieveViaBrain), which the base app
// never calls; no AI, no network — a pure local index read (I1's "AI is never on the render
// path"). It never fabricates: an empty/token-less query yields [] and the caller fuses the
// vector leg alone.

// Tokenise a free-text query into the same [a-z0-9] tokens the default unicode61 tokenizer
// produces at index time, so query and index segment identically (e.g. "sk_test_" →
// ["sk","test"], "CKPT_PREFETCH" → ["ckpt","prefetch"]). Keeps 2-char tokens like "sk"/"q3"
// that the old keywordScore dropped (length>2) — they carry the HIGHEST IDF signal for the
// rare-token cases. No stopword list: BM25/IDF down-weights common words for free, which is
// the entire point of moving off the flat +1-per-term keywordScore (defect D3).
function queryTokens(query: string): string[] {
  return [...new Set(query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 2))]
}

// Build a safe FTS5 MATCH expression: OR of the tokens, each double-quoted so a token that
// happens to be an FTS keyword (OR/AND/NOT/NEAR) is treated as a string literal, and no
// query text can inject FTS syntax (tokens are already stripped to [a-z0-9]). A bare MATCH
// searches ALL indexed columns, so this matches title OR body.
function buildMatch(tokens: string[]): string {
  return tokens.map((t) => `"${t}"`).join(' OR ')
}

// BM25 column weights for `bm25(fb_chunks_fts, <cid>, <org>, <title>, <text>)`. The weights
// map POSITIONALLY to EVERY column, including UNINDEXED ones (verified) — so the two leading
// zeros are the UNINDEXED chunk_id/org_id slots, then title=3, text=1. Title outweighs body
// 3:1, mirroring the old keywordScore (+3 title / +1 body), so a term in a source's title —
// which for documents/widgets is indexed NOWHERE else — still surfaces that source.
const BM25_WEIGHTS = '0.0, 0.0, 3.0, 1.0'

/**
 * The lexical leg: chunk ids matching `query`, best BM25 (rarity-weighted) first, scoped to
 * the active org. `limit` bounds the candidate pool handed to fusion. Returns [] when the
 * query has no usable tokens — the caller then fuses the vector leg alone (never errors).
 *
 * Kept in lockstep with fb_chunks by the triggers in migrateChunkFts, so a deleted or
 * reconciled chunk (I0b) is already absent here — the delete path reaches the index for free.
 */
export function ftsSearchChunkIds(query: string, limit: number): string[] {
  const tokens = queryTokens(query)
  if (tokens.length === 0) return []
  const rows = getDb()
    .prepare(
      `SELECT chunk_id FROM fb_chunks_fts
        WHERE fb_chunks_fts MATCH ? AND org_id = ?
        ORDER BY bm25(fb_chunks_fts, ${BM25_WEIGHTS}) LIMIT ?`
    )
    .all(buildMatch(tokens), getActiveOrgId(), limit) as Array<{ chunk_id: string }>
  return rows.map((r) => r.chunk_id)
}

// Health/telemetry: how many rows the lexical index holds for the active org — the
// "is the FTS leg populated?" check, the lexical counterpart to countChunks().
export function countFtsRows(): number {
  return (
    getDb()
      .prepare('SELECT COUNT(*) AS n FROM fb_chunks_fts WHERE org_id = ?')
      .get(getActiveOrgId()) as { n: number }
  ).n
}
