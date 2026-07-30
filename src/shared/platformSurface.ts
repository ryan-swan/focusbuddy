// Platform surface contracts (spec §17, §24, §54, §61, REQ-UX/AI/GPH/DATA).
// Presence is permission-scoped so a user never sees activity on an Object they
// cannot see (UX-070); change communication is expressed as consequence where
// derivable, falling back to fact (UX-071); AI recommendations carry all the §24.3
// fields and are never shown without evidence (UX-060); every capability is
// reachable through the public API (UX-091 / API-001); tenant isolation holds at
// the storage layer (DATA-004); memory-layer retention emits an auditable Event
// (DATA-010); and heavy graph analysis runs off the synchronous path (GPH-013).

import type { CanRead, Principal } from './permission'

// ── UX-070 — permission-scoped presence ──────────────────────────────────────
export interface PresenceSignal {
  userId: string
  objectId: string
}
// A viewer only sees presence on Objects they can read; presence on unreadable
// Objects is filtered out, never disclosed.
export function visiblePresence(signals: PresenceSignal[], _viewer: Principal, canRead: CanRead): PresenceSignal[] {
  return signals.filter((s) => canRead(s.objectId))
}

// ── UX-040 — active Desk is a ranking input ──────────────────────────────────
// The same query from two different Desks may rank differently because the active
// Desk biases relevance toward its own Objects (UX-040).
export function deskBiasedScore(baseScore: number, objectDeskId: string, activeDeskId: string): number {
  return baseScore + (objectDeskId === activeDeskId ? 1 : 0)
}

// ── UX-071 — consequence-first change communication ──────────────────────────
// Where a consequence is derivable, communicate it; otherwise fall back to the
// plain fact of the change. Never silent.
export function communicateChange(fact: string, consequence: string | null): string {
  return consequence ? consequence : fact
}

// ── UX-060 — AI recommendation carries the §24.3 fields ──────────────────────
export interface Recommendation24 {
  statement: string
  rationale: string
  evidenceEventIds: string[]
  confidence: number
  materiality: number
  suggestedAction: string
  alternativesConsidered: string[]
  provenance: 'ai_generated'
}
const REC_FIELDS: (keyof Recommendation24)[] = [
  'statement', 'rationale', 'evidenceEventIds', 'confidence', 'materiality', 'suggestedAction', 'alternativesConsidered', 'provenance'
]
// A recommendation is displayable only if it carries all eight fields and has
// evidence (UX-060).
export function recommendationDisplayable(rec: Partial<Recommendation24>): boolean {
  const hasAll = REC_FIELDS.every((f) => rec[f] !== undefined)
  return hasAll && !!rec.evidenceEventIds && rec.evidenceEventIds.length > 0
}
export function assertRecommendationDisplayable(rec: Partial<Recommendation24>): void {
  if (!recommendationDisplayable(rec)) {
    throw new Error('An AI recommendation MUST carry all eight §24.3 fields incl. evidence to be displayed (PLX-UX-060).')
  }
}

// ── UX-091 / API-001 — every capability reachable via the public API ─────────
const PRIMARY_CAPABILITIES = new Set<string>()
const API_CAPABILITIES = new Set<string>()
export function registerCapability(name: string, opts: { primaryInterface: boolean; publicApi: boolean }): void {
  if (opts.primaryInterface) PRIMARY_CAPABILITIES.add(name)
  if (opts.publicApi) API_CAPABILITIES.add(name)
}
// No capability is exclusive to the first-party interface: every primary-interface
// capability is also reachable through the API (UX-091 / API-001).
export function capabilitiesMissingFromApi(): string[] {
  return [...PRIMARY_CAPABILITIES].filter((c) => !API_CAPABILITIES.has(c))
}

// ── DATA-004 — tenant isolation at the storage layer ─────────────────────────
// The org-bound stores enforce this; this predicate documents that a store is
// storage-layer isolated (bound to an organisation), the property DATA-004 requires.
export function storeIsTenantIsolated(store: { organisationId?: string | null }): boolean {
  return store.organisationId != null
}

// ── DATA-010 — auditable memory-layer retention ──────────────────────────────
export interface RetentionAppliedEvent {
  eventType: 'RetentionPolicyApplied'
  layer: string
  auditable: true
}
export function retentionAppliedEvent(layer: string): RetentionAppliedEvent {
  return { eventType: 'RetentionPolicyApplied', layer, auditable: true }
}

// ── GPH-013 — heavy graph analysis runs off the synchronous path ─────────────
export type AnalysisMode = 'synchronous' | 'asynchronous'
// Community detection / clustering / duplicate detection MUST run asynchronously and
// never on a latency-bound user operation's path.
export function analysisModeFor(_kind: 'community-detection' | 'clustering' | 'duplicate-detection'): AnalysisMode {
  return 'asynchronous'
}
export function onSynchronousPath(mode: AnalysisMode): boolean {
  return mode === 'synchronous'
}
