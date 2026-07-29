// Permission model for graph traversal and Context propagation (spec §69, §44 R6,
// INV-06). The rules, in one place: a principal only ever operates within its own
// organisation (SEC-011); traversal only reaches nodes the principal can read, and
// never leaks the existence of the rest (GPH-010); an edge is crossable only when
// both endpoints are readable and the edge's own scope is satisfied, most-
// restrictive-wins (GPH-021, INV-06). The concrete "can this principal read this
// object" decision is injected, so this layer stays independent of the membership
// model while remaining the enforcement point (SEC-020).

import type { PermissionSnapshot } from './events'

export interface Principal {
  id: string
  organisationId: string
  // Optional role/capability tokens the principal holds. An edge scope naming a
  // capability is satisfied if the principal holds it.
  capabilities?: string[]
}

// A predicate resolving object-level readability from the real membership model.
// The graph layer calls it; it does not implement it.
export type CanRead = (objectId: string) => boolean

// Same-organisation guard. Cross-organisation access is never permitted; this is
// the last line behind the store-level binding (SEC-011).
export function sameOrg(principal: Principal, entityOrganisationId: string): boolean {
  return principal.organisationId === entityOrganisationId
}

// Does the principal satisfy an edge's permission scope (GPH-021)? An empty grant
// set means "any principal within the organisation" (the edge adds no restriction
// beyond org and endpoint readability). A non-empty grant set requires the
// principal id or one of its capabilities to appear.
export function satisfiesScope(principal: Principal, scope: PermissionSnapshot | undefined): boolean {
  const grants = scope?.grants ?? []
  if (grants.length === 0) return true
  const caps = new Set(principal.capabilities ?? [])
  return grants.some((g) => g.principal === principal.id || caps.has(g.capability))
}

export interface TraversableEdge {
  organisationId: string
  sourceEntityId: string
  targetEntityId: string
  permissionScope?: PermissionSnapshot
}

// Most-restrictive-wins (INV-06): an edge from `fromId` is crossable only when it
// is in the principal's organisation, the far endpoint is readable, and the edge
// scope is satisfied. Returns false for anything the principal may not know exists,
// so the caller omits it before deriving any count or distance (GPH-010).
export function edgeCrossable(principal: Principal, fromId: string, edge: TraversableEdge, canRead: CanRead): boolean {
  if (!sameOrg(principal, edge.organisationId)) return false // SEC-011
  const otherId = edge.sourceEntityId === fromId ? edge.targetEntityId : edge.sourceEntityId
  if (!canRead(otherId)) return false // GPH-010 — no crossing into an unreadable node
  return satisfiesScope(principal, edge.permissionScope) // GPH-021
}
