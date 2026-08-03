// Architectural discipline (spec §31, §45, REQ-ARC/DATA/DOM). The rules that keep
// the system coherent: every persisted concept is a canonical entity (DOM-001) and
// no domain state lives outside the entity model (DOM-002); every entity carries an
// organisationId filtered at the persistence layer (DOM-011); each store has exactly
// one owning service and no other service reads or writes it directly (DATA-001 /
// ARC-001 / ARC-002); services tolerate concurrent instances on the same stream
// (ARC-010); and data is classified so presence-class data gets its retention
// constraints (DOM-050).

import type { EntityType } from './object'

// ── Canonical entity model (DOM-001 / DOM-002) ───────────────────────────────

export const CANONICAL_ENTITY_TYPES: EntityType[] = [
  'object', 'desk', 'decision', 'relationship', 'resume', 'organisation', 'session', 'agent', 'event'
]
// A persisted concept must be one of the canonical entities; a new one is added by
// amending this model, not by inventing an ad-hoc persisted shape (DOM-001).
export function isCanonicalEntity(t: string): t is EntityType {
  return (CANONICAL_ENTITY_TYPES as string[]).includes(t)
}
// No domain state may be persisted outside the entity model (DOM-002): a store that
// claims to hold domain state must declare a canonical entity type.
export function assertPersistsCanonical(entityType: string): void {
  if (!isCanonicalEntity(entityType)) {
    throw new Error(`"${entityType}" is not a canonical entity; domain state MUST live in the entity model (PLX-DOM-001/002).`)
  }
}

// ── Store ownership (DATA-001 / ARC-001 / ARC-002) ───────────────────────────

const STORE_OWNERS = new Map<string, string>()

// Register a store's single owning service. A store owned by two services is a
// shared-database integration, which is forbidden (DATA-001 / ARC-001).
export function registerStoreOwner(store: string, owningService: string): void {
  const existing = STORE_OWNERS.get(store)
  if (existing && existing !== owningService) {
    throw new Error(`Store "${store}" is already owned by ${existing}; a store has exactly one owner (PLX-DATA-001).`)
  }
  STORE_OWNERS.set(store, owningService)
}
export function storeOwner(store: string): string | undefined {
  return STORE_OWNERS.get(store)
}
// A service may access a store directly only if it owns it; otherwise it must go
// through the owner's published API or Events (ARC-002).
export function canAccessStoreDirectly(service: string, store: string): boolean {
  return STORE_OWNERS.get(store) === service
}

// ── Tenancy (DOM-011) ────────────────────────────────────────────────────────

// Every entity carries an organisationId; a persistence path filters on it. This is
// the guard a store's write boundary calls (the stores already bind org for reads).
export function requireOrganisationId(entity: { organisationId?: string | null }): string {
  if (!entity.organisationId) throw new Error('Every entity MUST carry organisationId (PLX-DOM-011).')
  return entity.organisationId
}

// ── Concurrency (ARC-010) ────────────────────────────────────────────────────

// A service tolerates concurrent instances processing the same Event stream when
// its consumers are idempotent (dedupe by Event id). This asserts a consumer
// declares idempotency, the property ARC-010 depends on (see foldIdempotent).
export function assertConcurrencySafe(consumer: { idempotent: boolean }): void {
  if (!consumer.idempotent) {
    throw new Error('A consumer MUST be idempotent to run as concurrent instances on one stream (PLX-ARC-010 / EVT-015).')
  }
}

// ── Data classification (DOM-050) ────────────────────────────────────────────

export type DataClass = 'standard' | 'presence' | 'personal' | 'derived'
const DATA_CLASSES: Record<string, DataClass> = {
  FocusRecord: 'presence', // which Object, for how long — presence-class (DOM-050 / UX-072)
  DeskPresence: 'presence',
  dwellTelemetry: 'presence'
}
export function dataClassOf(concept: string): DataClass {
  return DATA_CLASSES[concept] ?? 'standard'
}
export function isPresenceClass(concept: string): boolean {
  return dataClassOf(concept) === 'presence'
}
