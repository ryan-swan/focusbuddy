// U1b — the PERMISSION PREDICATE behind the floor U1a positioned (spec §69, REQ-SEC, REQ-GPH).
//
// U1a proved the filter runs before any rank, score or count. It shipped with `canRead` optional
// and omitted in production — the floor was correctly placed and permitted everything. U1b makes
// the decision real: DERIVED from the record, at the choke point, never taken from the caller.
//
//   PLX-SEC-011  a principal only ever operates within its own organisation
//   PLX-SEC-022  an expired temporary grant is treated as absent, failing closed
//   PLX-GPH-021  an edge/entity scope is satisfied only by an unexpired matching grant
//   §5.3 of the unified-brain architecture: the coarse `sensitivity` tier is a FAST PRE-FILTER;
//                PermissionSnapshot is the decision of record, and the tier never overrides a grant
//
// THE SENSITIVITY TIER MOVES INTO THE FLOOR, and that is not scope creep — it is the same defect
// U1a fixed. spineRerank gates `sensitivity === 'restricted'` AFTER fusion, so a restricted item
// consumes a rank slot and perturbs every survivor's score: exactly the PLX-SCH-002 leak, on a
// different gate. Every node in the live corpus is currently `normal`, so moving it is behaviourally
// inert TODAY — which is precisely why now is the time, before there is restricted content to leak.
//
// THE NULL-SPINE QUESTION, ANSWERED HONESTLY
// -------------------------------------------
// A chunk whose source has no projected brain node has no org column to read. Failing closed would
// withhold the user's own content over a PROJECTION gap rather than a permission fact — wrong, not
// merely conservative. Falling back to the store's active org is sound ONLY while the store is
// genuinely single-org. So the fallback does not ASSUME that: it is handed the fact and REFUSES when
// it does not hold. The precondition is enforced, not trusted (test_plx_sec_011_*_multi_org_refuses).

import { describe, it, expect } from 'vitest'
import { makeBrainCanRead } from '../../src/shared/brainPermission'
import type { Principal } from '../../src/shared/permission'

const me: Principal = { id: 'caleb@local', organisationId: 'personal' }

type Node = Parameters<typeof makeBrainCanRead>[1] extends (id: string) => infer R ? NonNullable<R> : never

function lookupOf(map: Record<string, Partial<Node>>) {
  return (chunkId: string) => {
    const n = map[chunkId]
    return n ? ({ orgId: 'personal', sensitivity: 'normal', ...n } as Node) : null
  }
}

const SINGLE_ORG = { allowRestricted: false, storeOrgId: 'personal', storeIsSingleOrg: true }

describe('plx_sec_011 — a principal never reads outside its own organisation', () => {
  it('test_plx_sec_011_cross_org_is_withheld', () => {
    const canRead = makeBrainCanRead(me, lookupOf({ mine: {}, theirs: { orgId: 'acme-corp' } }), SINGLE_ORG)
    expect(canRead('mine')).toBe(true)
    expect(canRead('theirs')).toBe(false) // fails closed — SEC-011 is the last line
  })

  // The precondition behind the null-spine fallback is CHECKED, not assumed. If the store is not
  // provably single-org, an unprojected chunk cannot have its org derived, so it is refused.
  it('test_plx_sec_011_unprojected_chunk_in_multi_org_store_refuses', () => {
    const lookup = lookupOf({})
    const single = makeBrainCanRead(me, lookup, SINGLE_ORG)
    const multi = makeBrainCanRead(me, lookup, { ...SINGLE_ORG, storeIsSingleOrg: false })
    expect(single('unprojected')).toBe(true) // sound: every row in a single-org store is this org's
    expect(multi('unprojected')).toBe(false) // unsound: refuse rather than guess
  })

  // Adversarial: the caller must not be able to widen access by claiming an org. The store's org is
  // the authority; a principal asserting a different one gets nothing rather than everything.
  it('test_plx_sec_011_caller_supplied_org_cannot_widen_access', () => {
    const impostor: Principal = { id: 'x', organisationId: 'acme-corp' }
    const canRead = makeBrainCanRead(impostor, lookupOf({ mine: {} }), SINGLE_ORG)
    expect(canRead('mine')).toBe(false) // node is 'personal'; the claim buys nothing
    expect(canRead('unprojected')).toBe(false) // and the fallback resolves to the STORE's org, not the claim
  })
})

describe('plx_gph_021 / plx_sec_022 — grants decide, and expiry fails closed', () => {
  const scoped = (grants: Array<{ principal: string; capability: string; expiresAt?: string | null }>) =>
    lookupOf({ doc: { permissionScope: { grants } } })

  it('test_plx_gph_021_empty_scope_permits_within_org', () => {
    // An empty grant set means "any principal within the organisation" — it adds no restriction
    // beyond org membership. This is what makes the single-principal case correct rather than faked.
    expect(makeBrainCanRead(me, scoped([]), SINGLE_ORG)('doc')).toBe(true)
  })

  it('test_plx_gph_021_named_grant_required_when_scope_is_non_empty', () => {
    expect(makeBrainCanRead(me, scoped([{ principal: 'someone-else', capability: 'read' }]), SINGLE_ORG)('doc')).toBe(false)
    expect(makeBrainCanRead(me, scoped([{ principal: 'caleb@local', capability: 'read' }]), SINGLE_ORG)('doc')).toBe(true)
  })

  it('test_plx_sec_022_expired_grant_is_treated_as_absent', () => {
    const past = new Date(Date.now() - 60_000).toISOString()
    const future = new Date(Date.now() + 60_000).toISOString()
    expect(makeBrainCanRead(me, scoped([{ principal: 'caleb@local', capability: 'read', expiresAt: past }]), SINGLE_ORG)('doc')).toBe(false)
    expect(makeBrainCanRead(me, scoped([{ principal: 'caleb@local', capability: 'read', expiresAt: future }]), SINGLE_ORG)('doc')).toBe(true)
    // Unparseable expiry must fail closed, never widen.
    expect(makeBrainCanRead(me, scoped([{ principal: 'caleb@local', capability: 'read', expiresAt: 'soon' }]), SINGLE_ORG)('doc')).toBe(false)
  })

  it('test_plx_gph_021_capability_grant_matches', () => {
    const withCap: Principal = { ...me, capabilities: ['finance.read'] }
    expect(makeBrainCanRead(withCap, scoped([{ principal: 'nobody', capability: 'finance.read' }]), SINGLE_ORG)('doc')).toBe(true)
    expect(makeBrainCanRead(me, scoped([{ principal: 'nobody', capability: 'finance.read' }]), SINGLE_ORG)('doc')).toBe(false)
  })
})

describe('architecture §5.3 — the sensitivity tier is a pre-filter and never overrides a grant', () => {
  it('test_plx_sec_020_restricted_withheld_unless_explicitly_permitted', () => {
    const lookup = lookupOf({ secret: { sensitivity: 'restricted' }, open: {} })
    expect(makeBrainCanRead(me, lookup, SINGLE_ORG)('secret')).toBe(false)
    expect(makeBrainCanRead(me, lookup, SINGLE_ORG)('open')).toBe(true)
    expect(makeBrainCanRead(me, lookup, { ...SINGLE_ORG, allowRestricted: true })('secret')).toBe(true)
  })

  // The tier is a FAST PRE-FILTER, not the authority. A coarse tier saying "normal" must never
  // rescue content whose actual grant set excludes the principal — otherwise the cheap check
  // silently overrides the decision of record.
  it('test_plx_sec_020_normal_tier_does_not_override_a_failing_grant', () => {
    const lookup = lookupOf({ doc: { sensitivity: 'normal', permissionScope: { grants: [{ principal: 'other', capability: 'read' }] } } })
    expect(makeBrainCanRead(me, lookup, SINGLE_ORG)('doc')).toBe(false)
  })

  // ...and in the other direction, the tier must not be the ONLY thing consulted: a restricted node
  // the principal explicitly holds a grant for is still withheld without allowRestricted, because
  // the tier is a floor on top of grants, not a substitute for them.
  it('test_plx_sec_020_tier_and_grant_are_both_required', () => {
    const lookup = lookupOf({ doc: { sensitivity: 'restricted', permissionScope: { grants: [{ principal: 'caleb@local', capability: 'read' }] } } })
    expect(makeBrainCanRead(me, lookup, SINGLE_ORG)('doc')).toBe(false)
    expect(makeBrainCanRead(me, lookup, { ...SINGLE_ORG, allowRestricted: true })('doc')).toBe(true)
  })
})

describe('U-4 — the resolver is pure and total, so the floor can run before any rank', () => {
  // The floor is called once per candidate inside fuseCandidates, ahead of ranking. It must never
  // throw (a throw there would take out retrieval) and must be deterministic for a given record.
  it('test_plx_sec_020_resolver_is_total_and_deterministic', () => {
    const canRead = makeBrainCanRead(me, lookupOf({ a: {} }), SINGLE_ORG)
    expect(() => canRead('does-not-exist')).not.toThrow()
    expect(canRead('a')).toBe(canRead('a'))
  })
})
