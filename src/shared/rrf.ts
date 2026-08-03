// Reciprocal Rank Fusion for plexi-brain retrieval (I1 — the ranking rewrite).
//
// This is the pure, DB-free, AI-free core of DEC-020: several independent retrieval
// legs each produce a ranked list of chunk ids, and we FUSE those lists by RRF rather
// than blending incommensurable scores. RRF never compares scores across legs — only
// RANKS — so it structurally cannot let one leg's score scale dominate another's (the
// exact defect D5: the old weighted sum hand-normalised keyword against set-max to
// force comparability). SIGIR-2009 constant k = 60 (the value Cerebras cites).
//
//   score(d) = Σ_over_legs  weight_L / (k + rank_L(d))
//
// Four responsibilities live here, all pure so they are unit-locked in isolation
// (tests/unit/rrf.test.ts, tests/unit/plxSchBrainPermissionFloor.test.ts), the same posture as
// chunker.ts and spineRerank.ts:
//
//   0. THE PERMISSION FLOOR (U1a · PLX-SCH-001/002 · invariant U-4) — the FIRST stage, ahead of
//      admission and ahead of any rank, score or count. RRF scores by RANK, so an unpermitted
//      candidate that occupies a rank slot shifts every survivor below it and CHANGES THEIR
//      SCORES: the withheld item becomes inferable from the numbers of the items that were
//      returned. Filtering after fusion cannot repair that — the slot is already spent. This is
//      the only point in the pipeline where the invariant can hold, which is exactly why
//      PLX-SCH-001 requires the filter "at the index or query layer, not as a post-filter over
//      returned results". The predicate is INJECTED (4.0's SEC-020 posture): this layer is the
//      enforcement point and knows nothing about the membership model that answers it.
//   1. FUSION — combine each leg's ranked ids into one fused ordering.
//   2. THE ADMISSION GATE (D6 / DEC-022) — a filler chunk (a default title "Untitled"/
//      "New desk", a one-word sticky, a blank-spreadsheet grid) is not an answer. BM25
//      length-normalisation actively FAVOURS short docs (a 1-token doc matching a 1-token
//      query scores highest), so the lexical leg alone would surface filler FIRST; the gate
//      is what makes "filler leaks → 0" reachable. I3 REPLACED I1's coarse 15-char length
//      proxy here with the real rarity+length+signal gate from shared/admission.ts — the
//      SAME admitChunk() run at INGEST — so there is one definition of "is this filler",
//      applied at both sites (an item that never entered the index can't rank; an item in a
//      STALE index that predates the ingest gate still can't take a slot). Subsumes I1-a.
//   3. DEDUP — collapse duplicates before the limit slice so copies don't eat slots:
//      one chunk per SOURCE (a long doc can't fill every slot with its own chunks) AND
//      one per SOURCE-CONTENT SIGNATURE (twin-room byte-identical sources collapse to one,
//      regardless of which chunk represents each — see FusionCandidate.dupKey).
//
// Recency is deliberately NOT a fused leg (review finding F-6): as an equal RRF voter a
// recency-ordered list gives the newest thing in the corpus a free rank-1 vote on every
// query, re-importing the filler-beats-signal failure. It stays here only as a
// tie-breaker among candidates already judged equally relevant by fusion.

import { admitChunk } from './admission'

export interface FusionCandidate {
  /** The chunk row id (the unit legs rank and this module returns). */
  id: string
  /** `${source_type}:${source_id}` — the per-source dedup key (one chunk per source). */
  sourceKey: string
  /** The SOURCE-level duplicate-collapse key: a signature of the source's FULL content, so
   *  two byte-identical sources (twin rooms) collapse to one regardless of which chunk
   *  represents each. A per-chunk hash misses this when the two sources' best-matching
   *  chunks are different indices (measured on the real corpus — D02's twins). */
  dupKey: string
  /** The chunk text — the admission gate (shared/admission.ts admitChunk) reads this to
   *  decide eligibility, the same gate ingest applies. Replaced the old `textLength` proxy
   *  at I3 so length and signal/rarity are judged by ONE definition at both sites. */
  text: string
  /** Recency in [0,1] (higher = more recent) — a tie-breaker only, never a leg (F-6). */
  recency: number
  /** Derived importance in [0,1] — the last tie-breaker after recency. */
  importance: number
}

export interface FusionOpts {
  /** RRF constant. Larger k flattens the contribution of top ranks. Default 60. */
  k?: number
  /** Per-leg weight (default 1.0 each). A leg at weight 0 contributes nothing — the
   *  mechanism by which the graph leg "ships at weight 0" (F-5) until its fixture passes. */
  legWeights?: Record<string, number>
  /** The permission floor (PLX-SCH-001/002 · U-4). Returns whether the asking principal may read
   *  this candidate. Applied FIRST — before admission, before any rank, score or count — so a
   *  withheld candidate never consumes a rank slot and is therefore not inferable from any
   *  survivor's score, from the result order, or from the count.
   *
   *  Deliberately a bare predicate, not a Principal: the membership model that answers it is
   *  injected by the caller (SEC-020). Omitted ⇒ permit all, so every pre-U1a caller is
   *  behaviourally unchanged.
   *
   *  ⚠ U1a shipped the POSITION of this filter. The production membership model behind it is U1b
   *  and is NOT built — `retrieveViaBrain` currently passes no predicate. Do not read the presence
   *  of this option as "the brain enforces multi-user permission". It does not yet. */
  canRead?: (id: string) => boolean
}

export interface FusedResult {
  id: string
  /** The fused RRF score (sum of weight/(k+rank) over the legs the id appears in). */
  rrf: number
}

// The SIGIR-2009 RRF constant Cerebras cites.
export const DEFAULT_RRF_K = 60

/**
 * Fuse per-leg ranked id lists into one gated, deduplicated ordering.
 *
 * @param candidates the union of ids appearing across the legs, each carrying the
 *   metadata the gate + dedup + tie-breaks need. Ids in a leg but absent here are
 *   ignored (no metadata ⇒ cannot be gated or deduped safely).
 * @param legs legName → the leg's ordered chunk ids, rank-1 first.
 * @param opts k / legWeights.
 * @returns the surviving ids in fused order, best first. Pure + deterministic.
 */
export function fuseCandidates(
  candidates: FusionCandidate[],
  legs: Record<string, string[]>,
  opts: FusionOpts = {}
): FusedResult[] {
  const k = opts.k ?? DEFAULT_RRF_K
  const legWeights = opts.legWeights ?? {}

  // ── STAGE 0 — THE PERMISSION FLOOR (PLX-SCH-001/002 · U-4), then the admission gate
  // (D6 / DEC-022): only chunks the principal may read AND that clear admitChunk — the SAME
  // rarity+length+signal gate ingest applies — are eligible to be fused. One definition of
  // filler, two sites (shared/admission.ts).
  //
  // ORDER IS NORMATIVE, not stylistic. PLX-SCH-001 makes permission the FIRST stage, so an
  // unreadable candidate is never assessed for quality — the system does not decide whether
  // content the principal may not read is "good enough to rank". Both predicates are evaluated
  // (no short-circuit past canRead) so the floor applies uniformly.
  //
  // Because eligibility is what the leg loop below re-densifies over, a withheld candidate never
  // takes a rank slot — the same mechanism that already stops gated filler from taking one. That
  // is what makes U-4 structural here rather than a convention someone must remember.
  const canRead = opts.canRead ?? ((): boolean => true)
  const eligible = new Map<string, FusionCandidate>()
  for (const c of candidates) {
    const permitted = canRead(c.id) // stage 0 — always evaluated, always first
    if (permitted && admitChunk(c.text)) eligible.set(c.id, c)
  }
  if (eligible.size === 0) return []

  // ── RRF over the ELIGIBLE candidates. Each leg is re-densified to eligible ids so a
  // gated filler doesn't consume a rank slot (the real answer moves up, not just the
  // filler out). A leg's rank of an id = its 1-based index in the filtered order. ────
  const rrf = new Map<string, number>()
  for (const [name, order] of Object.entries(legs)) {
    const weight = legWeights[name] ?? 1
    if (weight === 0) continue // a weight-0 leg is inert (graph leg ships at 0, F-5)
    let rank = 0
    const seenInLeg = new Set<string>()
    for (const id of order) {
      if (!eligible.has(id) || seenInLeg.has(id)) continue // gated, or a dup id in one leg
      seenInLeg.add(id)
      rank += 1
      rrf.set(id, (rrf.get(id) ?? 0) + weight / (k + rank))
    }
  }

  // ── Order: RRF desc, then recency desc, then importance desc, then id asc (stable,
  // fully deterministic). Recency is a TIE-BREAKER here — never a leg (F-6). ─────────
  const ordered = [...rrf.keys()]
    .map((id) => ({ id, rrf: rrf.get(id)!, c: eligible.get(id)! }))
    .sort(
      (a, b) =>
        b.rrf - a.rrf ||
        b.c.recency - a.c.recency ||
        b.c.importance - a.c.importance ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    )

  // ── Dedup before the limit slice: one chunk per source AND one per source-content
  // signature. A candidate survives only if BOTH its source and its dupKey are still unseen,
  // so a long doc can't fill every slot and twin-room byte-identical sources collapse to one.
  // Because every chunk of a source shares that source's dupKey, once a source is represented
  // the dupKey gate also blocks all of a byte-identical twin's OTHER chunks — the failure a
  // per-chunk hash had (the twin's second chunk, a different hash, slipped through).
  const seenSource = new Set<string>()
  const seenDup = new Set<string>()
  const out: FusedResult[] = []
  for (const { id, rrf: score, c } of ordered) {
    if (seenSource.has(c.sourceKey) || seenDup.has(c.dupKey)) continue
    seenSource.add(c.sourceKey)
    seenDup.add(c.dupKey)
    out.push({ id, rrf: score })
  }
  return out
}
