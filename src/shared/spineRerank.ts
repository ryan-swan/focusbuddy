// The PURE spine re-rank/gate layer (plexi-brain P1 — the payoff: the graph changes
// what retrieval returns). Takes P0's recall (a scored candidate set) + each
// candidate's SPINE signals (from its projected graph node) and returns a
// re-ranked, gated ordering — winning the DECISIVE queries plain RAG structurally
// cannot: current-truth (supersession), confidence-gating, room aperture, freshness.
//
// This is DEC-011 Call A/B made concrete: embedding recall (P0) decides FINDABILITY;
// the graph spine decides QUALITY. Recall is never overridden wholesale — the spine
// GATES (hard filters that remove wrong answers) + RE-RANKS within a BOUNDED band
// (Call B: a rank-40 item can't leap to slot 1; the spine adjusts, recall leads).
//
// PURE (no DB, no AI): the resolver (src/main/brain/spine.ts) fetches each
// candidate's spine signals; this file is the formula both it and its unit tests
// agree on. Formula-only + local — the spine is on the retrieve path, and while
// retrieve isn't the zoom/render path, keeping it AI-free honors I1's spirit and the
// no-key degrade (DEC-012): with no AI the spine still returns current-truth.
//
// ⚠ DEC-014: importance here is the DERIVED value carried on the node — never a
// manual column, never a domain weighting. No domain vocabulary in this module.

import type { Confidence, Lifecycle, Sensitivity } from './brainGraph'

// The spine signals a candidate carries (resolved from its graph node, or null when
// the candidate has no projected node yet — a brand-new/un-typed source. A null-spine
// candidate is NEVER dropped: the store-anyway floor (I3) means recall still ranks it;
// it just gets no spine boost. Meaning-search decides findability, always.)
export interface CandidateSpine {
  importance: number // DERIVED importance in [0,1]
  confidence: Confidence
  lifecycle: Lifecycle
  roomId: string | null
  sensitivity: Sensitivity
  // P3 (Layer 3): this candidate's source node is `same-as`-linked to an entity that has a
  // mention in the ACTIVE room — so even though the candidate itself lives in a DIFFERENT
  // room, it is cross-room-relevant and must survive the aperture gate (the "one Caleb
  // across every room" recall). Resolved by the driver (spine.ts) against the active room;
  // false/absent when there is no cross-room link (the default — GATE 3 applies as before).
  crossRoomLinked?: boolean
  // P3 (Layer 3): this candidate's source node has a `contradicts` edge — another source
  // disagrees with it on a numeric claim. Retrieval annotates the result with a "sources
  // disagree" flag (never dropped — I4: marked, not hidden). Resolved by the driver.
  disagrees?: boolean
}

// One P0 candidate + its (optional) spine + the recall score P0 assigned.
export interface SpineCandidate<T> {
  item: T
  recallScore: number // P0's formula-floor score (recall rank signal)
  spine: CandidateSpine | null // null = no projected node (un-typed / brand-new)
}

// The query-time context the gates read: the active room aperture (null = org-wide,
// no room filter) and whether restricted-sensitivity items are permitted this query.
export interface SpineContext {
  roomId: string | null // the aperture; null = no room scope (org-wide search)
  allowRestricted: boolean // default false — restricted items gated out
}

// ── The bounded re-rank factor ──────────────────────────────────────────────────
// The spine multiplies a candidate's recall score by a factor in [MIN, MAX] — a
// BOUNDED adjustment (Call B), so the spine tunes recall's order but can't invent a
// top hit from a poor recall match. A candidate with no spine gets factor 1.0
// (recall order preserved exactly — the store-anyway floor).
const FACTOR_MIN = 0.6 // strongest demotion (stale, low-confidence)
const FACTOR_MAX = 1.4 // strongest promotion (fresh, high-importance, typed)

// Confidence → a small multiplier. Typed content is trusted; ambiguous is softly
// demoted (marked, never dropped — I4: untrusted is marked, not hidden).
function confidenceFactor(c: Confidence): number {
  if (c === 'typed') return 1.0
  if (c === 'inferred') return 0.95
  return 0.85 // ambiguous — softly demoted, still present
}

// Lifecycle → a freshness multiplier. superseded is GATED OUT before this (see
// gate()), so here we only reward fresh/active and softly decay stale.
function lifecycleFactor(l: Lifecycle): number {
  if (l === 'fresh') return 1.1
  if (l === 'active') return 1.0
  if (l === 'stale') return 0.85
  return 1.0 // superseded never reaches here (gated); neutral if it somehow does
}

// The bounded spine factor for one candidate. Combines importance (the DERIVED
// signal, DEC-014), confidence, and lifecycle freshness — then clamps to [MIN,MAX]
// so recall is tuned, never overridden.
export function spineFactor(spine: CandidateSpine | null): number {
  if (!spine) return 1.0 // no node → recall order preserved (store-anyway floor)
  // importance in [0,1] maps to a [0.85, 1.25] importance multiplier (a landmark node
  // gets a real but bounded lift; a trivial node is only mildly demoted).
  const importanceMult = 0.85 + 0.4 * spine.importance
  const raw = importanceMult * confidenceFactor(spine.confidence) * lifecycleFactor(spine.lifecycle)
  return Math.min(FACTOR_MAX, Math.max(FACTOR_MIN, raw))
}

// ── The gates (hard filters — remove WRONG answers, the decisive win) ────────────
// Returns true if the candidate SURVIVES the gates (is eligible), false if gated out.
// The gates are what plain RAG structurally can't do: current-truth (drop superseded),
// aperture (room scope), privacy (sensitivity). A null-spine candidate passes all
// gates except an explicit room scope it can't satisfy — never silently dropped.
export function passesGates<T>(c: SpineCandidate<T>, ctx: SpineContext): boolean {
  const s = c.spine
  if (!s) {
    // No projected node: the store-anyway floor keeps it findable. The ONLY gate that
    // can apply is a room scope — but with no room known, we keep it (org-wide recall
    // shouldn't lose un-typed content; a room-scoped query without a node can't prove
    // membership, so we still keep it rather than hide a possibly-relevant fact — the
    // signal/noise call favors recall completeness, I3).
    return true
  }
  // GATE 1 — current-truth: a superseded fact is never surfaced as an answer (its
  // successor is; the superseded node stays walkable for time-travel, just not ranked).
  if (s.lifecycle === 'superseded') return false
  // GATE 2 — sensitivity: restricted content is withheld unless explicitly permitted.
  if (s.sensitivity === 'restricted' && !ctx.allowRestricted) return false
  // GATE 3 — aperture: when a room scope is active, only that room's content (or
  // room-agnostic content, roomId null) is eligible — EXCEPT P3 cross-room unification:
  // a candidate whose entity is `same-as`-linked into the active room is cross-room-
  // relevant ("one Caleb across every room") and survives the aperture. Without that link,
  // a mismatched room is out of scope (unchanged P1 behavior).
  if (ctx.roomId && s.roomId && s.roomId !== ctx.roomId && !s.crossRoomLinked) return false
  return true
}

// ── The layer: gate then bounded-re-rank ─────────────────────────────────────────
// Applies gates, then multiplies each survivor's recall score by its bounded spine
// factor and re-sorts. Stable within equal scores (preserves recall order for ties).
// Returns the survivors' items in the new order. Pure + deterministic.
export function applySpineRerank<T>(candidates: Array<SpineCandidate<T>>, ctx: SpineContext): T[] {
  const survivors = candidates.filter((c) => passesGates(c, ctx))
  const scored = survivors.map((c, i) => ({
    item: c.item,
    finalScore: c.recallScore * spineFactor(c.spine),
    origIndex: i // stable tiebreak → preserves recall order among equals
  }))
  scored.sort((a, b) => (b.finalScore - a.finalScore) || (a.origIndex - b.origIndex))
  return scored.map((s) => s.item)
}
