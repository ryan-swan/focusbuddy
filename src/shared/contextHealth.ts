// Context Health (spec §20, §51, §80) — the per-(user, Object) understanding
// state that drives "contextual organisational awareness". Health is NEVER a
// scalar stored on the Object (PLX-DOM-030); it is computed per (user, Object)
// relative to that user's last review point (PLX-UX-020). Transitions are driven
// by the deterministic materiality score, not raw change detection (PLX-UX-021),
// and Decision Risk is only raised with a named Decision (PLX-UX-025).

import type { MaterialityBand } from '../main/context/materiality'

// §20.3 states. `Live Activity` is deliberately absent: presence is an orthogonal
// overlay that MUST NOT overwrite Attention Required / Decision Risk (PLX-UX-023),
// so it is not part of this state enum.
export type HealthState = 'current' | 'changed' | 'attention-required' | 'decision-risk'

export interface DecisionAtRisk {
  decisionId: string
  title: string
  invalidatingChange: string // the specific change believed to invalidate it (PLX-UX-025)
}

export interface TransitionInput {
  fromState: HealthState
  materialityBand: MaterialityBand
  materialityScore: number
  // A material change that invalidates linked Decisions escalates to Decision Risk.
  decisionsAtRisk?: DecisionAtRisk[]
  // The user has reviewed at this point; any state returns to `current`.
  reviewed?: boolean
}

// The §20.4 state machine as a pure function. Materiality drives it (PLX-UX-021):
// a non-material change can only reach `changed`, never `attention-required`.
export function computeTransition(input: TransitionInput): HealthState {
  if (input.reviewed) return 'current'

  const material = input.materialityBand === 'medium' || input.materialityBand === 'high'
  const hasNamedDecision = !!input.decisionsAtRisk && input.decisionsAtRisk.length > 0

  // Decision Risk requires a named Decision AND a material change (PLX-UX-025).
  // A Decision Risk state without a named Decision MUST NOT be raised.
  if (material && hasNamedDecision) return 'decision-risk'
  if (material) return 'attention-required'

  // Non-material change: visual indication only (PLX-UX-021). Never escalates.
  return input.fromState === 'current' ? 'changed' : input.fromState === 'changed' ? 'changed' : input.fromState
}

// Records exactly why a change surfaced, so the transition is inspectable by the
// user (PLX-UX-024, PLX-INV-07).
export interface PropagationStep {
  objectId: string
  depth: number
  viaRelationshipId: string | null
}

export interface TruncationRecord {
  reason: 'depth' | 'fanout'
  atObjectId: string
  depth: number
  dropped: number // neighbours not traversed because of the bound
}

// The full auditable transition record (PLX-UX-024): the triggering Event, the
// materiality score, and the propagation path, all retrievable by the user.
export interface HealthTransition {
  organisationId: string
  userId: string
  objectId: string
  fromState: HealthState
  toState: HealthState
  triggeringEventId: string
  materialityScore: number
  materialityBand: MaterialityBand
  propagationPath: PropagationStep[]
  truncations: TruncationRecord[]
  decisionsAtRisk: DecisionAtRisk[]
  computedAt: string
}
