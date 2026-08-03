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

// A grant is expired if it carries an expiry that is at or before `now`. Expired
// temporary grants are treated as absent (PLX-SEC-022), and evaluation fails
// closed: an unparseable or future-relative expiry never widens access.
export function isExpiredGrant(grant: { expiresAt?: string | null }, now: number): boolean {
  if (!grant.expiresAt) return false // no expiry = not a temporary grant
  const t = Date.parse(grant.expiresAt)
  if (Number.isNaN(t)) return true // fail closed on an unparseable expiry
  return t <= now
}

// A grant without an expiry is a standing grant, which the spec requires to be an
// explicit, audited administrative action rather than an accident (PLX-SEC-022).
export function isStandingGrant(grant: { expiresAt?: string | null }): boolean {
  return grant.expiresAt === undefined || grant.expiresAt === null
}

// Does the principal satisfy an edge's permission scope (GPH-021)? An empty grant
// set means "any principal within the organisation" (the edge adds no restriction
// beyond org and endpoint readability). A non-empty grant set requires an
// unexpired grant naming the principal id or one of its capabilities.
export function satisfiesScope(principal: Principal, scope: PermissionSnapshot | undefined, now = Date.now()): boolean {
  const grants = scope?.grants ?? []
  if (grants.length === 0) return true
  const caps = new Set(principal.capabilities ?? [])
  return grants.some((g) => !isExpiredGrant(g, now) && (g.principal === principal.id || caps.has(g.capability)))
}

// An auditable authorisation decision (PLX-SEC-021): who asked, for what, the
// verdict, the policy evaluated and when. Returned by evaluateEdgeAccess so the
// caller can persist it to the audit log.
export interface AuthorizationDecision {
  principal: string
  resource: string
  decision: 'allow' | 'deny'
  policy: string
  at: string
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
export function edgeCrossable(principal: Principal, fromId: string, edge: TraversableEdge, canRead: CanRead, now = Date.now()): boolean {
  if (!sameOrg(principal, edge.organisationId)) return false // SEC-011
  const otherId = edge.sourceEntityId === fromId ? edge.targetEntityId : edge.sourceEntityId
  if (!canRead(otherId)) return false // GPH-010 — no crossing into an unreadable node
  return satisfiesScope(principal, edge.permissionScope, now) // GPH-021
}

// The same decision, but returning an auditable record of why (PLX-SEC-021). The
// caller persists the record. `at` is injected for determinism.
export function evaluateEdgeAccess(
  principal: Principal,
  fromId: string,
  edge: TraversableEdge,
  canRead: CanRead,
  at: string
): { allowed: boolean; decision: AuthorizationDecision } {
  const otherId = edge.sourceEntityId === fromId ? edge.targetEntityId : edge.sourceEntityId
  let allowed = true
  let policy = 'edge-crossable'
  if (!sameOrg(principal, edge.organisationId)) { allowed = false; policy = 'same-org (SEC-011)' }
  else if (!canRead(otherId)) { allowed = false; policy = 'node-readable (GPH-010)' }
  else if (!satisfiesScope(principal, edge.permissionScope, Date.parse(at) || Date.now())) { allowed = false; policy = 'edge-scope (GPH-021/SEC-022)' }
  return {
    allowed,
    decision: { principal: principal.id, resource: `edge:${edge.sourceEntityId}->${edge.targetEntityId}`, decision: allowed ? 'allow' : 'deny', policy, at }
  }
}
