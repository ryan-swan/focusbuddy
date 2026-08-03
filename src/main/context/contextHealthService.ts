// Context Health service glue (spec §51, §80) — ties the three deterministic
// pieces together: score the change's materiality, propagate it across confirmed
// Relationships, and derive the per-(user, Object) health transition for the
// origin and each affected Object. Produces auditable HealthTransition records
// (PLX-UX-024) and the ContextHealthChanged Event (Context Engine emits it).
// Nothing here calls an AI model — the whole path is deterministic (PLX-CTX-011).

import type { AppendInput } from '../db/eventStore'
import {
  computeTransition,
  type DecisionAtRisk,
  type HealthState,
  type HealthTransition
} from '../../shared/contextHealth'
import type { MaterialityResult } from './materiality'
import { propagateHealth, type HealthGraph, type PropagationOptions, type PropagationResult } from './propagation'

export interface HealthContext {
  // Where the changed Object currently sits for this user, and what Decisions
  // (if any) each Object is linked to. Health is looked up per (user, Object),
  // never read off the Object itself (PLX-DOM-030).
  currentState: (userId: string, objectId: string) => HealthState
  decisionsAtRisk?: (objectId: string) => DecisionAtRisk[]
}

export interface BuildTransitionsInput {
  organisationId: string
  userId: string
  originObjectId: string
  triggeringEventId: string
  materiality: MaterialityResult
  graph: HealthGraph
  context: HealthContext
  computedAt: string // ISO; caller supplies (keeps this pure/testable)
  propagation?: PropagationOptions
}

export interface BuildTransitionsResult {
  transitions: HealthTransition[]
  propagation: PropagationResult
}

export function buildTransitions(input: BuildTransitionsInput): BuildTransitionsResult {
  const prop = propagateHealth(input.originObjectId, input.graph, input.propagation)

  // The origin is depth 0; propagated Objects inherit the same triggering Event
  // and carry the path segment that reached them (PLX-UX-024).
  const nodes = [{ objectId: input.originObjectId, depth: 0, viaRelationshipId: null as string | null }, ...prop.affected]

  const transitions: HealthTransition[] = []
  for (const node of nodes) {
    const from = input.context.currentState(input.userId, node.objectId)
    const decisions = input.context.decisionsAtRisk?.(node.objectId) ?? []
    const to = computeTransition({
      fromState: from,
      materialityBand: input.materiality.band,
      materialityScore: input.materiality.score,
      decisionsAtRisk: decisions
    })
    if (to === from) continue // no change, nothing to record
    transitions.push({
      organisationId: input.organisationId,
      userId: input.userId,
      objectId: node.objectId,
      fromState: from,
      toState: to,
      triggeringEventId: input.triggeringEventId,
      materialityScore: input.materiality.score,
      materialityBand: input.materiality.band,
      // The path from origin to this node (origin itself carries just itself).
      propagationPath: node.depth === 0 ? [] : prop.affected.filter((s) => s.depth <= node.depth),
      truncations: prop.truncations,
      decisionsAtRisk: decisions,
      computedAt: input.computedAt
    })
  }

  return { transitions, propagation: prop }
}

// The ContextHealthChanged Event. The propagation bound and any truncation ride
// on the event so truncation is visible rather than silent (PLX-UX-022 /
// PLX-CTX-013).
export function contextHealthChangedEvent(t: HealthTransition, bound: { maxDepth: number; maxFanout: number }): AppendInput {
  return {
    eventType: 'ContextHealthChanged',
    category: 'system',
    actor: `user:${t.userId}`,
    organisationId: t.organisationId,
    objectId: t.objectId,
    correlationId: t.triggeringEventId,
    previousState: { healthState: t.fromState },
    currentState: {
      healthState: t.toState,
      materialityScore: t.materialityScore,
      materialityBand: t.materialityBand,
      propagationBound: bound,
      propagationPath: t.propagationPath,
      truncations: t.truncations,
      decisionsAtRisk: t.decisionsAtRisk.map((d) => d.decisionId)
    },
    changeSummary: `Context Health ${t.fromState} -> ${t.toState}`,
    confidence: 1
  }
}
