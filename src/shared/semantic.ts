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

export interface GateOpts {
  // How far below the pool's best semantic score the admission band reaches.
  relFrac?: number
  // Hard cap on how many items may keep a semantic score per pool.
  maxKeep?: number
  // An UNCORROBORATED item (no keyword overlap) must sit this close to the
  // best corroborated item to ride along as a probable paraphrase.
  paraphraseFrac?: number
}

// The #5 gate (fix before any embeddings enable — the standing law since the
// 2026-08-21 audit). The defect: blendSemantic's absolute floor filters
// nothing once a query vector exists — any two English texts score ≈0.07+,
// so six irrelevant documents get injected and cited. The 2026-08-22
// measurement on the real corpus proved an absolute threshold can NEVER
// work: random cross-doc pairs score median 0.361 / p99 0.629 / max 0.797
// while adjacent same-doc chunks score median 0.680 — noise and signal
// distributions overlap. So admission is relative and corroborated instead:
//
// 1. Only items within relFrac of the pool's best semantic score are
//    considered at all (a relative-rank band, never an absolute floor).
// 2. The band needs an ANCHOR: its best item that ALSO has keyword overlap.
//    No anchor means the query has no independent evidence in this pool, and
//    a high cosine alone is indistinguishable from noise — nothing is
//    admitted on semantics (keyword pools still run; nothing is lost).
// 3. With an anchor: corroborated band items keep their semantic score, and
//    uncorroborated ones ride along only within paraphraseFrac of the
//    anchor (a paraphrase sits near a proven match; noise rarely does).
//
// Items that fail keep their keyword standing — semantic is set to null, the
// item is not removed — so composing gateSemantic → blendSemantic demotes
// noise to its (usually zero) keyword score and the blend's floor finally
// has teeth. Pure and deterministic; runs per pool, per route.
export function gateSemantic<T>(scored: ScoredItem<T>[], opts: GateOpts = {}): ScoredItem<T>[] {
  const relFrac = opts.relFrac ?? 0.85
  const maxKeep = opts.maxKeep ?? 6
  const paraphraseFrac = opts.paraphraseFrac ?? 0.92
  // Non-positive similarity is no signal at all — such scores never survive
  // the gate (the blend would clamp them to zero anyway; nulling is honest).
  const cands = scored.filter((s) => s.semantic !== null && s.semantic > 0)
  const top = cands.length ? Math.max(...cands.map((s) => s.semantic as number)) : 0
  const band = cands
    .filter((s) => (s.semantic as number) >= top * relFrac)
    .sort((a, b) => (b.semantic as number) - (a.semantic as number))
    .slice(0, maxKeep)
  const anchor = band.find((s) => s.keyword > 0) ?? null
  const keep = new Set<ScoredItem<T>>()
  if (anchor) {
    for (const s of band) {
      if (s.keyword > 0) keep.add(s)
      else if ((s.semantic as number) >= (anchor.semantic as number) * paraphraseFrac) keep.add(s)
    }
  }
  return scored.map((s) => (s.semantic === null || keep.has(s) ? s : { ...s, semantic: null }))
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
