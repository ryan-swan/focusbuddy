// Pure semantic-retrieval math, shared by the main-process retrieval service and
// its unit tests. No embeddings model and no DB here, just the vector similarity
// and the keyword/semantic blend, so the ranking is testable in isolation.
//
// The foundation: items carry a stored embedding (a vector). A query is embedded
// to a vector, each item's cosine similarity to the query is its semantic score,
// and that is blended with the existing keyword score so results are strong when
// either signal is strong. Items without a stored vector fall back to keyword
// alone, so a half-indexed corpus still ranks sensibly. Nothing is invented: an
// item with no signal scores zero and drops out.

export function cosineSim(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

export interface ScoredItem<T> {
  item: T
  // Raw keyword relevance (any non-negative scale; normalised internally).
  keyword: number
  // Cosine similarity to the query in [-1, 1], or null when the item has no
  // stored vector (then keyword carries it).
  semantic: number | null
}

export interface BlendOpts {
  semWeight?: number
  kwWeight?: number
  threshold?: number
  limit?: number
}

// Blend semantic + keyword into one ranking. Keyword scores are normalised to
// [0,1] against the best keyword match in the set so the two signals are
// comparable; cosine is already in range. Returns the items ranked best-first,
// dropping anything below the threshold. Pure and deterministic.
export function blendSemantic<T>(scored: ScoredItem<T>[], opts: BlendOpts = {}): T[] {
  const sw = opts.semWeight ?? 0.7
  const kw = opts.kwWeight ?? 0.3
  const th = opts.threshold ?? 0.01
  const maxKw = Math.max(1, ...scored.map((s) => s.keyword))
  const ranked = scored
    .map((s) => {
      const kwNorm = s.keyword / maxKw
      // Clamp cosine to [0,1] for blending; negative similarity is no signal.
      const sem = s.semantic === null ? null : Math.max(0, s.semantic)
      // A vectorless item earns only its keyword weight, never a free full score,
      // so it cannot unfairly outrank a genuine semantic match.
      const combined = sem === null ? kw * kwNorm : sw * sem + kw * kwNorm
      return { item: s.item, combined }
    })
    .filter((s) => s.combined > th)
    .sort((a, b) => b.combined - a.combined)
    .map((s) => s.item)
  return opts.limit ? ranked.slice(0, opts.limit) : ranked
}
