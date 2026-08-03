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

// Band cutoffs (lower bound to ENTER each band above 'none'). Tenant-configurable
// and versioned, and recorded on every scoring result so a threshold change is
// distinguishable from a behaviour change when auditing later (PLX-CTX-012).
export interface MaterialityThresholds {
  version: string
  low: number // score >= low -> at least 'low'
  medium: number // score >= medium -> at least 'medium'
  high: number // score >= high -> 'high'
}

export const DEFAULT_THRESHOLDS: MaterialityThresholds = {
  version: 'thresholds-1.0.0',
  low: 0.15,
  medium: 0.4,
  high: 0.7
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
  thresholdsVersion: string
  thresholds: MaterialityThresholds
}

// ── Deterministic normalisers (each returns 0..1) ─────────────────────────────
const clamp01 = (n: number): number => Math.max(0, Math.min(1, n))
const affectedN = (c: number): number => clamp01(Math.log2(Math.max(0, c) + 1) / Math.log2(33)) // 0..~32 objects -> 0..1
const decisionN = (d: DecisionImpact): number => (d === 'high' ? 1 : d === 'low' ? 0.5 : 0)
const depthN = (d: number): number => clamp01(1 - Math.min(Math.max(d, 0), 5) / 5) // closer = more material
const reachN = (r: OrganisationalReach): number => ({ self: 0.15, desk: 0.4, team: 0.7, org: 1 })[r]
const roleN = (r: UserRole): number => ({ viewer: 0.25, member: 0.5, owner: 0.85, admin: 1 })[r]
const stageN = (s: WorkflowStage): number => ({ draft: 0.2, active: 0.55, review: 0.8, final: 1 })[s]

function bandFor(score: number, t: MaterialityThresholds = DEFAULT_THRESHOLDS): MaterialityBand {
  if (score >= t.high) return 'high'
  if (score >= t.medium) return 'medium'
  if (score >= t.low) return 'low'
  return 'none'
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
export function scoreMateriality(
  input: MaterialityInput,
  weights: MaterialityWeights = DEFAULT_WEIGHTS,
  thresholds: MaterialityThresholds = DEFAULT_THRESHOLDS
): MaterialityResult {
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
  const band = bandFor(score, thresholds)
  return {
    score,
    band,
    action: actionFor(band),
    functionVersion: MATERIALITY_FN_VERSION,
    weightsVersion: w.version,
    thresholdsVersion: thresholds.version,
    thresholds
  }
}

// A MaterialityScored Event that records the score alongside the exact weights and
// thresholds used, so a historical score stays interpretable after either is
// retuned (PLX-CTX-012 / PLX-CTX-021).
export function materialityScoredEvent(
  organisationId: string,
  actor: string,
  objectId: string,
  result: MaterialityResult
): AppendInput {
  return {
    eventType: 'MaterialityScored',
    category: 'system',
    actor,
    organisationId,
    objectId,
    currentState: {
      score: result.score,
      band: result.band,
      functionVersion: result.functionVersion,
      weightsVersion: result.weightsVersion,
      thresholdsVersion: result.thresholdsVersion,
      thresholds: result.thresholds
    },
    changeSummary: `Materiality scored ${result.band} (${result.score.toFixed(2)})`,
    confidence: 1
  }
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
