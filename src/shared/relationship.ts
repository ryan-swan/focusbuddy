// Relationship entity (spec §36, Appendix E) — the "surfaces with relations" of
// the 4.0 brain. Every edge carries provenance: how it was discovered, the
// evidence for it, a confidence, and a lifecycle state. Inference is never fact:
// AI-discovered edges start provisional and only confirmed edges count toward
// Context Health, Resume, search, or permissions.

import type { PermissionSnapshot } from './events'

// The single closed relationship-type registry (Appendix E). Services MUST NOT
// invent edge types outside this set (PLX-GPH-020).
export const RELATIONSHIP_TYPES = [
  'DependsOn', 'Enables', 'Blocks', 'BlockedBy', 'Unblocks', 'Supports', 'SupportedBy',
  'References', 'ReferencedBy', 'Duplicates', 'ConflictsWith', 'Contradicts', 'Extends',
  'ExtendedBy', 'Supersedes', 'SupersededBy', 'Replaces', 'RelatedTo', 'Owns', 'OwnedBy',
  'Created', 'CreatedBy', 'Generated', 'GeneratedBy', 'Derived', 'DerivedFrom', 'Contains',
  'PartOf', 'Requires', 'RequiredBy', 'Uses', 'UsedBy', 'Informs', 'InformedBy', 'Explains',
  'ExplainedBy', 'Mentions', 'MentionedBy', 'Approves', 'ApprovedBy', 'AssignedTo',
  'RequestedBy', 'Updates', 'UpdatedBy', 'EvidenceFor', 'EvidenceAgainst'
] as const
export type RelationshipTypeId = (typeof RELATIONSHIP_TYPES)[number]
const TYPE_SET = new Set<string>(RELATIONSHIP_TYPES)
export function isRelationshipType(t: string): t is RelationshipTypeId {
  return TYPE_SET.has(t)
}

export type RelationshipState = 'provisional' | 'confirmed' | 'rejected' | 'superseded'
export type DiscoveryMethod = 'user' | 'ai' | 'integration' | 'import' | 'workflow' | 'automation' | 'system_rule'

export interface RelationshipEvidence {
  kind: 'event' | 'object' | 'decision' | 'meeting' | 'message' | 'external'
  ref: string
  excerpt: string | null
  weight: number
}

export interface Relationship {
  id: string
  organisationId: string
  sourceEntityId: string
  sourceEntityType: string
  targetEntityId: string
  targetEntityType: string
  relationshipType: RelationshipTypeId
  directed: boolean
  strength: number // 0..1 traversal weight
  confidence: number // 0..1
  state: RelationshipState
  evidence: RelationshipEvidence[] // non-empty (PLX-GPH-001 / PLX-INV-03)
  discoveryMethod: DiscoveryMethod
  permissionScope: PermissionSnapshot
  correlationId: string // originating Event (PLX-GPH-022)
  confirmedBy: string | null
  confirmedAt: string | null
  createdAt: string
  updatedAt: string
}

// Below this a confirmed edge reverts to provisional (PLX-GPH-003). Tenant-tunable.
export const RELATIONSHIP_CONFIDENCE_THRESHOLD = 0.6

// A canonical key over the evidence set, so the same edge proposed on identical
// evidence can be recognised and not re-proposed once rejected (PLX-GPH-005).
export function evidenceKey(evidence: RelationshipEvidence[]): string {
  return evidence
    .map((e) => `${e.kind}:${e.ref}`)
    .sort()
    .join('|')
}

/** The starting state for a newly discovered edge: user confirmation lands it
 * confirmed; everything inferred/imported starts provisional (PLX-PRD-051). */
export function initialState(discoveryMethod: DiscoveryMethod, confirmedBy: string | null): RelationshipState {
  return discoveryMethod === 'user' && confirmedBy ? 'confirmed' : 'provisional'
}
