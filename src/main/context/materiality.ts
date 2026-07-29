// Materiality scoring (spec §51 / §80.1) — the Context Engine keystone.
//
// Every Event gets a materiality score that decides whether it updates Context
// Health, regenerates a Resume, requests AI enrichment, or needs no action. The
// spec's hard rule: this is a PURE, DETERMINISTIC function of its declared
// inputs, with NO model call on the primary path (PLX-CTX-010/011/020), and both
// the function and its weights are VERSIONED and recorded so historical scores
// stay interpretable after the weights change (PLX-CTX-021). Weights are
// tenant-tunable without a code deploy, and a tuning change emits an auditable
// Event (PLX-CTX-022).

import type { AppendInput } from '../db/eventStore'

export type DecisionImpact = 'none' | 'low' | 'high'
export type OrganisationalReach = 'self' | 'desk' | 'team' | 'org'
export type UserRole = 'viewer' | 'member' | 'owner' | 'admin'
export type WorkflowStage = 'draft' | 'active' | 'review' | 'final'

// The declared inputs (spec §80.1). Everything the score depends on is here;
// nothing is read from ambient state, which is what makes it reproducible.
export interface MaterialityInput {
  affectedObjectCount: number
  decisionImpact: DecisionImpact
  relationshipDepth: number // 0 = the object itself, N = N hops away
  organisationalReach: OrganisationalReach
  userRole: UserRole
  workflowStage: WorkflowStage
  historicalSignificance: number // 0..1, prior significance of this subject
}

export interface MaterialityWeights {
  version: string
  affected: number
  decision: number
  depth: number
  reach: number
  role: number
  stage: number
  history: number
}

// The function's own version. Bump when the SHAPE of the computation changes;
// weight-only changes bump the weights version instead.
export const MATERIALITY_FN_VERSION = 'ctx-materiality-1.0.0'

export const DEFAULT_WEIGHTS: MaterialityWeights = {
  version: 'weights-1.0.0',
  affected: 0.18,
  decision: 0.28,
  depth: 0.12,
  reach: 0.16,
  role: 0.08,
  stage: 0.1,
  history: 0.08
}

export type MaterialityBand = 'none' | 'low' | 'medium' | 'high'
export type MaterialityAction = 'none' | 'update-health' | 'regenerate-resume' | 'request-ai'

export interface MaterialityResult {
  score: number // 0..1
  band: MaterialityBand
  action: MaterialityAction
  functionVersion: string
  weightsVersion: string
}

// ── Deterministic normalisers (each returns 0..1) ─────────────────────────────
const clamp01 = (n: number): number => Math.max(0, Math.min(1, n))
const affectedN = (c: number): number => clamp01(Math.log2(Math.max(0, c) + 1) / Math.log2(33)) // 0..~32 objects -> 0..1
const decisionN = (d: DecisionImpact): number => (d === 'high' ? 1 : d === 'low' ? 0.5 : 0)
const depthN = (d: number): number => clamp01(1 - Math.min(Math.max(d, 0), 5) / 5) // closer = more material
const reachN = (r: OrganisationalReach): number => ({ self: 0.15, desk: 0.4, team: 0.7, org: 1 })[r]
const roleN = (r: UserRole): number => ({ viewer: 0.25, member: 0.5, owner: 0.85, admin: 1 })[r]
const stageN = (s: WorkflowStage): number => ({ draft: 0.2, active: 0.55, review: 0.8, final: 1 })[s]

function bandFor(score: number): MaterialityBand {
  if (score < 0.15) return 'none'
  if (score < 0.4) return 'low'
  if (score < 0.7) return 'medium'
  return 'high'
}
function actionFor(band: MaterialityBand): MaterialityAction {
  switch (band) {
    case 'none':
      return 'none'
    case 'low':
      return 'update-health'
    case 'medium':
      return 'regenerate-resume'
    case 'high':
      return 'request-ai'
  }
}

/**
 * Score an Event's materiality. Pure and deterministic: identical inputs and
 * weights always yield an identical result, and no model is invoked (PLX-CTX-010,
 * 011, 020). The weights (and their version) are carried in so a tenant can tune
 * them without a deploy (PLX-CTX-022), and the result records both versions so it
 * stays interpretable later (PLX-CTX-021).
 */
export function scoreMateriality(input: MaterialityInput, weights: MaterialityWeights = DEFAULT_WEIGHTS): MaterialityResult {
  const w = weights
  const weightSum = w.affected + w.decision + w.depth + w.reach + w.role + w.stage + w.history
  const raw =
    w.affected * affectedN(input.affectedObjectCount) +
    w.decision * decisionN(input.decisionImpact) +
    w.depth * depthN(input.relationshipDepth) +
    w.reach * reachN(input.organisationalReach) +
    w.role * roleN(input.userRole) +
    w.stage * stageN(input.workflowStage) +
    w.history * clamp01(input.historicalSignificance)
  const score = weightSum > 0 ? clamp01(raw / weightSum) : 0
  const band = bandFor(score)
  return { score, band, action: actionFor(band), functionVersion: MATERIALITY_FN_VERSION, weightsVersion: w.version }
}

/**
 * Record a materiality-weights change as an auditable Event (PLX-CTX-022). The
 * store is passed in so this stays decoupled from any concrete DB. Returns the
 * AppendInput used (also handy for tests).
 */
export function weightsRetunedEvent(organisationId: string, actor: string, previous: MaterialityWeights, next: MaterialityWeights): AppendInput {
  return {
    eventType: 'MaterialityWeightsRetuned',
    category: 'administrative',
    actor,
    organisationId,
    previousState: { ...previous },
    currentState: { ...next },
    changeSummary: `Materiality weights ${previous.version} -> ${next.version}`
  }
}
