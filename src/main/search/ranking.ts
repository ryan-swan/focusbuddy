// Search ranking pipeline (spec §54, REQ-SCH). Permission filtering is the FIRST
// stage, applied before counting or scoring, so result counts, pagination totals and
// relevance scores never disclose non-permitted results (SCH-001/002). AI re-ranking
// is the optional FINAL stage: disabling it degrades ordering, never correctness
// (SCH-003). An Object with a stale embedding is still returned via its keyword
// match rather than dropped (SCH-005).

export interface SearchCandidate {
  id: string
  keywordScore: number
  semanticScore: number
  embeddingStale: boolean
}

export interface SearchResult {
  results: Array<{ id: string; score: number }>
  total: number // count of PERMITTED results only (SCH-002)
}

export type Reranker = (permitted: Array<{ id: string; base: number }>) => Array<{ id: string; score: number }>

export function rankSearch(
  candidates: SearchCandidate[],
  canRead: (id: string) => boolean,
  opts: { aiRerank?: Reranker } = {}
): SearchResult {
  // Stage 1 — permission filter, FIRST, before any count or score is derived
  // (SCH-001). Everything downstream sees only permitted candidates.
  const permitted = candidates.filter((c) => canRead(c.id))

  // Base relevance: keyword + semantic. A stale embedding does not drop the result;
  // its keyword score still carries it (SCH-005).
  const base = permitted.map((c) => ({
    id: c.id,
    base: c.embeddingStale ? c.keywordScore : c.keywordScore + c.semanticScore
  }))

  // Stage N — AI re-ranking, optional and LAST (SCH-003). With it off, results are
  // still correct (the permitted set is unchanged), only the ordering is simpler.
  const ranked = opts.aiRerank
    ? opts.aiRerank(base)
    : [...base].sort((a, b) => b.base - a.base).map((x) => ({ id: x.id, score: x.base }))

  // The total reflects only permitted results, so a withheld result never shows up
  // in a count or pagination total (SCH-002).
  return { results: ranked, total: permitted.length }
}
