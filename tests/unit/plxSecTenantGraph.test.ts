import { describe, it, expect } from 'vitest'
import { memSqlDb } from './_memdb'
import { createRelationshipStore, type ProposeInput } from '../../src/main/db/relationshipStore'
import { permissionedGraphFromRelationships, propagateHealth } from '../../src/main/context/propagation'
import { edgeCrossable, satisfiesScope, sameOrg, type Principal } from '../../src/shared/permission'

// Tenant isolation + permission-filtered graph traversal (spec §69, §44 R6;
// ADR-0002). The graph is the hard case: a single traversal must never leave the
// organisation or reach a node the principal cannot read, and must never leak the
// existence of what it cannot reach.

function edge(over: Partial<ProposeInput>): ProposeInput {
  return {
    organisationId: 'org-1',
    sourceEntityId: 'A',
    targetEntityId: 'B',
    relationshipType: 'RelatedTo',
    confidence: 1,
    evidence: [{ kind: 'event', ref: 'e', excerpt: null, weight: 1 }],
    discoveryMethod: 'user',
    correlationId: 'c',
    confirmedBy: 'user:1',
    ...over
  }
}
const principal: Principal = { id: 'user:1', organisationId: 'org-1' }
const readAll = (): boolean => true

describe('plx_sec_011 / plx_gph_011 — cross-org is impossible by construction', () => {
  it('test_plx_sec_011_org_bound_store_never_returns_other_org', () => {
    const db = memSqlDb()
    // A single shared DB holding two organisations' edges.
    const writer = createRelationshipStore(db) // unbound writer for setup
    const a1 = writer.propose(edge({ organisationId: 'org-1', targetEntityId: 'B' }))
    writer.confirm(a1.id, 'user:1')
    const a2 = writer.propose(edge({ organisationId: 'org-2', targetEntityId: 'C', evidence: [{ kind: 'event', ref: 'e2', excerpt: null, weight: 1 }] }))
    writer.confirm(a2.id, 'user:9')
    // A store bound to org-1 can only ever see org-1 data.
    const org1 = createRelationshipStore(db, 'org-1')
    const neighbours = org1.activeFor('A')
    expect(neighbours.map((r) => r.targetEntityId)).toEqual(['B'])
    expect(neighbours.every((r) => r.organisationId === 'org-1')).toBe(true)
    expect(org1.all().every((r) => r.organisationId === 'org-1')).toBe(true)
    // The org-2 edge is invisible to the org-1 store even by id.
    expect(org1.get(a2.id)).toBeNull()
  })
})

describe('plx_gph_010 / inv_06 — permission-filtered traversal, no existence leak', () => {
  it('test_plx_gph_010_traversal_omits_unreadable_and_does_not_leak_count', () => {
    const db = memSqlDb()
    const store = createRelationshipStore(db, 'org-1')
    // A relates to B (readable), C (secret) and D (readable), all confirmed.
    for (const [t, ref] of [['B', 'e1'], ['C', 'e2'], ['D', 'e3']] as const) {
      const r = store.propose(edge({ targetEntityId: t, evidence: [{ kind: 'event', ref, excerpt: null, weight: 1 }] }))
      store.confirm(r.id, 'user:1')
    }
    const canRead = (id: string): boolean => id !== 'C' // C is not readable by this principal
    const visible = store.activeForPrincipal('A', principal, canRead)
    const seen = visible.map((r) => (r.sourceEntityId === 'A' ? r.targetEntityId : r.sourceEntityId)).sort()
    expect(seen).toEqual(['B', 'D']) // C omitted
    // The count the caller derives is 2, not 3 — the secret node's existence does
    // not leak through the neighbour count (INV-06 existence-leak).
    expect(visible.length).toBe(2)
  })
  it('test_plx_gph_010_propagation_never_reaches_unreadable_node', () => {
    const db = memSqlDb()
    const store = createRelationshipStore(db, 'org-1')
    // A -> B -> C, but B is not readable: traversal must stop at A and never reach
    // B or C, and must not count them.
    const ab = store.propose(edge({ sourceEntityId: 'A', targetEntityId: 'B', evidence: [{ kind: 'event', ref: 'e1', excerpt: null, weight: 1 }] }))
    store.confirm(ab.id, 'user:1')
    const bc = store.propose(edge({ sourceEntityId: 'B', targetEntityId: 'C', evidence: [{ kind: 'event', ref: 'e2', excerpt: null, weight: 1 }] }))
    store.confirm(bc.id, 'user:1')
    const canRead = (id: string): boolean => id !== 'B'
    const graph = permissionedGraphFromRelationships(store, principal, canRead)
    const r = propagateHealth('A', graph)
    const reached = r.affected.map((s) => s.objectId)
    expect(reached).not.toContain('B')
    expect(reached).not.toContain('C') // unreachable because the path runs through B
    expect(r.visitedCount).toBe(1) // only A — no hidden node inflates the count
  })
})

describe('plx_gph_021 — every edge carries a permission scope that traversal evaluates', () => {
  it('test_plx_gph_021_scope_is_evaluated', () => {
    // Empty grant set = any principal in the org may cross.
    expect(satisfiesScope(principal, { grants: [] })).toBe(true)
    // A restricted scope excludes a principal not named and lacking the capability.
    const restricted = { grants: [{ principal: 'user:2', capability: 'read' }] }
    expect(satisfiesScope(principal, restricted)).toBe(false)
    expect(satisfiesScope({ ...principal, capabilities: ['read'] }, restricted)).toBe(true)
    // edgeCrossable combines org + readability + scope (most-restrictive-wins).
    const scopedEdge = { organisationId: 'org-1', sourceEntityId: 'A', targetEntityId: 'B', permissionScope: restricted }
    expect(edgeCrossable(principal, 'A', scopedEdge, readAll)).toBe(false) // scope fails
    expect(edgeCrossable({ ...principal, capabilities: ['read'] }, 'A', scopedEdge, readAll)).toBe(true)
  })
})

describe('plx_sec_020 / dom_011 — authorisation enforced at the data-access layer', () => {
  it('test_plx_sec_020_store_enforces_not_the_caller', () => {
    const db = memSqlDb()
    const store = createRelationshipStore(db, 'org-1')
    const other = createRelationshipStore(db, 'org-2')
    const r = store.propose(edge({ organisationId: 'org-1' }))
    store.confirm(r.id, 'user:1')
    // The org-2 store returns nothing for the same query — the STORE refuses,
    // regardless of what the caller asks, so a caller cannot opt out of isolation.
    expect(other.activeFor('A')).toEqual([])
    expect(store.activeFor('A').length).toBe(1)
  })
  it('test_plx_sec_011_same_org_guard', () => {
    expect(sameOrg({ id: 'u', organisationId: 'org-1' }, 'org-1')).toBe(true)
    expect(sameOrg({ id: 'u', organisationId: 'org-1' }, 'org-2')).toBe(false)
  })
})
