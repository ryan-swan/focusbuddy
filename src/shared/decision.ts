// Decision entity (spec §37) — the record of what was decided, by a human, with
// the alternatives that were rejected kept permanently. This is where the
// platform's "decision-making" awareness is grounded: a Decision names what is at
// stake so that a later change can raise Decision Risk against it (PLX-UX-025).
// Two hard lines run through this file. A Decision is owned and approved by a
// HUMAN, never an Agent or service (PLX-DOM-040). AI commentary is advisory and
// can never stand in for the Decision, its rationale, or an approval
// (PLX-DOM-041).

import type { ConfidenceBand, EvidenceRef } from './context'

export type PrincipalKind = 'user' | 'agent' | 'service'

export interface ActorRef {
  kind: PrincipalKind
  id: string
  displayName?: string
}

// Only a user principal is a human. Agents and service accounts are not
// (PLX-DOM-040).
export function isHumanPrincipal(actor: ActorRef): boolean {
  return actor.kind === 'user'
}

export function assertHumanPrincipal(actor: ActorRef, role: string): void {
  if (!isHumanPrincipal(actor)) {
    throw new Error(`${role} MUST be a human principal; "${actor.kind}:${actor.id}" is not (PLX-DOM-040).`)
  }
}

export type DecisionState =
  | 'proposed'
  | 'under_review'
  | 'approved'
  | 'implemented'
  | 'superseded'
  | 'cancelled'
  | 'archived'

export interface Alternative {
  statement: string
  rejectedFor: string
  evidence: EvidenceRef[]
}

export interface Approval {
  approver: ActorRef // human (PLX-DOM-040)
  state: 'pending' | 'granted' | 'declined'
  at: string | null
  rationale: string | null
}

// AI commentary is always advisory. The advisory flag is not optional and is the
// display contract: it MUST NOT be rendered as the Decision or its rationale
// (PLX-DOM-041).
export interface AiCommentary {
  id: string
  author: ActorRef // an agent principal
  text: string
  createdAt: string
  readonly advisory: true
}

export function makeAiCommentary(id: string, author: ActorRef, text: string, createdAt: string): AiCommentary {
  return { id, author, text, createdAt, advisory: true }
}

export interface Decision {
  id: string
  organisationId: string
  entityType: 'decision'
  title: string
  description: string
  decisionStatement: string // what was actually decided — never sourced from aiCommentary
  decisionOwner: ActorRef // human (PLX-DOM-040)
  decisionDate: string | null
  state: DecisionState
  confidence: ConfidenceBand | null
  evidence: EvidenceRef[]
  alternatives: Alternative[]
  // An explicit statement that no alternative was considered — the APP-020 escape
  // hatch, so "none considered" is a recorded choice rather than an empty gap.
  noAlternativesConsidered: boolean
  relatedObjectIds: string[]
  affectedDeskIds: string[]
  dependencyIds: string[]
  approvals: Approval[]
  aiCommentary: AiCommentary[]
  supersededById: string | null
  createdAt: string
  updatedAt: string
}

// PLX-APP-020: a Decision may not move to `approved` until it records either a
// considered alternative or an explicit statement that none was considered.
export function canBeApproved(d: Pick<Decision, 'alternatives' | 'noAlternativesConsidered'>): boolean {
  return d.alternatives.length > 0 || d.noAlternativesConsidered === true
}
