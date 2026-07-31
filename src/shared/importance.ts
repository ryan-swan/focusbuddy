// The PURE importance-derivation formula (plexi-brain P1 — DEC-014's near-crux
// engine: "detect your foundational nodes"). Derives a node's importance in [0,1]
// from FOUR signals — never from a manual column, never from a domain taxonomy.
//
// This IS the mechanism behind universality (DEC-014): the highest-importance
// top-level Rooms/Goals this produces become P4's radial "pillars." A business's
// derived-important clusters are its departments; a person's are their life-areas;
// a freelancer's are their clients — THE ALGORITHM IS IDENTICAL, only the content
// differs. Getting the signal mix right = the graph builds itself to fit the user.
//
// ⚠ DEC-014 GUARD-RAIL: this module contains NO domain/department/pillar names. The
// `type` term is a UNIVERSAL STRUCTURAL prior (a Decision-with-reasoning is inherently
// more load-bearing than a scratch Note — true for a student AND a business), NOT a
// domain bucket. Grep-locked by importance.test.ts. A domain name here breaks
// universality itself.
//
// PURE (no DB): the driver (src/main/brain/importanceEngine.ts) gathers the raw
// signals per node and calls derive(); this file is the formula both it and its unit
// tests agree on. Local + formula-only — importance is on the render/zoom path (I1),
// so it MUST stay AI-free and cheap.

import { clampImportance, type NodeType } from './brainGraph'

// ── Signal weights ────────────────────────────────────────────────────────────
// Degree leads (a node's connectedness is the strongest "is this load-bearing?"
// signal on a real graph), then the universal structural prior, then liveness
// (recency) and history (change volume). Sum = 1.0 so the output is a clean [0,1].
export const IMPORTANCE_WEIGHTS = {
  degree: 0.4, // edge connectivity — how wired into the rest of the graph
  type: 0.3, // universal structural prior (below) — content-agnostic
  activity: 0.2, // liveness — recency of the node's last update
  change: 0.1 // history — how many change-log rows (load-bearing over time)
} as const

// ── The universal structural type-prior (operator's Call: structural, not domain) ─
// A weighting over the ~16 UNIVERSAL structural primitives. "Landmark" structural
// roles (a Goal, a Decision, a Room, a Project) are inherently more foundational than
// a scratch Note or a single spreadsheet cell — for everyone. This is the opposite of
// a hardcoded taxonomy: it never mentions a domain; it ranks STRUCTURE, which is
// identical across a student, a freelancer, and a business.
export const TYPE_PRIOR: Record<NodeType, number> = {
  // landmark structural roles — the pillars a life/company is organized around
  goal: 1.0,
  decision: 1.0,
  room: 1.0,
  project: 1.0,
  // significant actors / events
  person: 0.7,
  organization: 0.7,
  meeting: 0.7,
  agent: 0.7,
  // the everyday working set
  task: 0.5,
  document: 0.5,
  note: 0.5,
  event: 0.5,
  risk: 0.5,
  process: 0.5,
  tool: 0.5,
  // the finest-grain artifact (a sticky / a cell) — surfaced only when zoomed deep
  artifact: 0.3
}

// The raw signals the driver measures for one node. Kept primitive so the formula is
// trivially testable and the driver's gathering is the only DB-touching part.
export interface ImportanceSignals {
  type: NodeType
  degreeIn: number // edges pointing AT this node
  degreeOut: number // edges leaving this node
  updatedAt: number // the node's last-update ms (liveness)
  changeCount: number // brain_change_log rows for this node (history)
}

// Normalization context — the corpus-wide maxima the driver computes once per pass so
// each node's raw signal is scaled relative to the busiest node (a graph-relative
// score, not an absolute one; a small graph and a huge graph both span [0,1]).
export interface ImportanceContext {
  maxDegree: number // max (degreeIn+degreeOut) across the org's nodes
  maxChange: number // max changeCount across the org's nodes
  now: number // reference time for recency decay
}

// Recency half-life (ms): a node's liveness halves every ~60 days. Gentle — recency
// is only 20% of the score, so a permanent-but-old landmark (a Goal) doesn't sink.
const ACTIVITY_HALF_LIFE_MS = 60 * 24 * 60 * 60 * 1000

function recencyScore(updatedAt: number, now: number): number {
  if (!updatedAt || updatedAt <= 0) return 0.5 // unknown → neutral, never penalized to 0
  const age = Math.max(0, now - updatedAt)
  return Math.pow(0.5, age / ACTIVITY_HALF_LIFE_MS)
}

// Derive a node's importance in [0,1] from its signals + the corpus context. Pure,
// deterministic, cheap (a few multiplies) — safe on the render/zoom path (I1).
export function deriveImportance(sig: ImportanceSignals, ctx: ImportanceContext): number {
  const degree = sig.degreeIn + sig.degreeOut
  // Graph-relative normalization: scale against the busiest node so the score spans
  // [0,1] on both a 40-node and a 40k-node graph. maxDegree 0 (edgeless graph) → 0.
  const degreeNorm = ctx.maxDegree > 0 ? degree / ctx.maxDegree : 0
  const typePrior = TYPE_PRIOR[sig.type] ?? 0.5
  const activityNorm = recencyScore(sig.updatedAt, ctx.now)
  const changeNorm = ctx.maxChange > 0 ? sig.changeCount / ctx.maxChange : 0

  const score =
    IMPORTANCE_WEIGHTS.degree * degreeNorm +
    IMPORTANCE_WEIGHTS.type * typePrior +
    IMPORTANCE_WEIGHTS.activity * activityNorm +
    IMPORTANCE_WEIGHTS.change * changeNorm

  return clampImportance(score)
}

// A legible one-clause "why" for the importance score — the dominant signal names it
// (the receipt-style legibility DEC-011 Call B demands, applied to the ring). Used by
// P4's propose/confirm UI ("this is a core area because…").
export function importanceWhy(sig: ImportanceSignals, ctx: ImportanceContext): string {
  const degree = sig.degreeIn + sig.degreeOut
  const degreeNorm = ctx.maxDegree > 0 ? degree / ctx.maxDegree : 0
  const typePrior = TYPE_PRIOR[sig.type] ?? 0.5
  const activityNorm = recencyScore(sig.updatedAt, ctx.now)
  // Report the largest WEIGHTED contribution.
  const contributions: Array<[string, number]> = [
    ['well-connected', IMPORTANCE_WEIGHTS.degree * degreeNorm],
    ['a foundational kind of thing', IMPORTANCE_WEIGHTS.type * typePrior],
    ['recently active', IMPORTANCE_WEIGHTS.activity * activityNorm]
  ]
  contributions.sort((a, b) => b[1] - a[1])
  return contributions[0][0]
}
