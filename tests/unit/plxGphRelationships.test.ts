import { describe, it, expect } from 'vitest'
import { memSqlDb } from './_memdb'
import { createRelationshipStore, relationshipConfirmedEvent, type ProposeInput } from '../../src/main/db/relationshipStore'
import { createEventStore } from '../../src/main/db/eventStore'
import { RELATIONSHIP_TYPES, RELATIONSHIP_CONFIDENCE_THRESHOLD } from '../../src/shared/relationship'

// Relationship entity (spec §36, Appendix E). Provenance, lifecycle, and the
// closed type registry.

function baseInput(over: Partial<ProposeInput> = {}): ProposeInput {
  return {
    organisationId: 'org-1',
    sourceEntityId: 'obj-A',
    targetEntityId: 'obj-B',
    relationshipType: 'DependsOn',
    confidence: 0.8,
    evidence: [{ kind: 'event', ref: 'evt-1', excerpt: 'edited together', weight: 1 }],
    discoveryMethod: 'ai',
    correlationId: 'corr-1',
    ...over
  }
}

describe('plx_gph_001 — evidence is mandatory', () => {
  it('test_plx_gph_001_rejects_empty_evidence', () => {
    const rs = createRelationshipStore(memSqlDb())
    expect(() => rs.propose(baseInput({ evidence: [] }))).toThrow(/evidence/i)
    expect(() => rs.propose(baseInput())).not.toThrow()
  })
})

describe('plx_gph_020 — closed type registry', () => {
  it('test_plx_gph_020_rejects_unregistered_type', () => {
    const rs = createRelationshipStore(memSqlDb())
    expect(() => rs.propose(baseInput({ relationshipType: 'VibesWith' }))).toThrow(/registry/i)
    expect(RELATIONSHIP_TYPES).toContain('DependsOn')
    expect(() => rs.propose(baseInput({ relationshipType: 'Blocks' }))).not.toThrow()
  })
})

describe('plx_gph_022 — correlationId traceability', () => {
  it('test_plx_gph_022_requires_correlation_id', () => {
    const rs = createRelationshipStore(memSqlDb())
    expect(() => rs.propose(baseInput({ correlationId: '' }))).toThrow(/correlationId/i)
    expect(rs.propose(baseInput({ correlationId: 'corr-xyz' })).correlationId).toBe('corr-xyz')
  })
})

describe('plx_prd_050 / plx_prd_051 — provenance and provisional-by-default', () => {
  it('test_plx_prd_050_carries_provenance', () => {
    const rs = createRelationshipStore(memSqlDb())
    const r = rs.propose(baseInput())
    expect(r.discoveryMethod).toBe('ai')
    expect(r.evidence.length).toBeGreaterThan(0)
    expect(typeof r.confidence).toBe('number')
  })
  it('test_plx_prd_051_ai_discovered_is_provisional', () => {
    const rs = createRelationshipStore(memSqlDb())
    expect(rs.propose(baseInput({ discoveryMethod: 'ai' })).state).toBe('provisional')
    // a user confirmation lands it confirmed
    expect(rs.propose(baseInput({ discoveryMethod: 'user', confirmedBy: 'user:1' })).state).toBe('confirmed')
  })
})

describe('plx_gph_002 — provisional edges are inert', () => {
  it('test_plx_gph_002_provisional_excluded_confirmed_included', () => {
    const rs = createRelationshipStore(memSqlDb())
    const prov = rs.propose(baseInput())
    expect(rs.activeFor('obj-A')).toHaveLength(0) // provisional does not surface
    rs.confirm(prov.id, 'user:1')
    const active = rs.activeFor('obj-A')
    expect(active).toHaveLength(1)
    expect(active[0].state).toBe('confirmed')
  })
})

describe('plx_prd_052 — confirmation promotes and can emit', () => {
  it('test_plx_prd_052_confirm_promotes_and_event', () => {
    const rs = createRelationshipStore(memSqlDb())
    const es = createEventStore(memSqlDb())
    const prov = rs.propose(baseInput())
    const confirmed = rs.confirm(prov.id, 'user:1')!
    expect(confirmed.state).toBe('confirmed')
    expect(confirmed.confirmedBy).toBe('user:1')
    const evt = es.append(relationshipConfirmedEvent(confirmed, 'user:1'))
    expect(evt.eventType).toBe('RelationshipConfirmed')
  })
})

describe('plx_gph_005 — rejected edges retained, not re-proposed', () => {
  it('test_plx_gph_005_reject_retained_and_suppressed', () => {
    const rs = createRelationshipStore(memSqlDb())
    const prov = rs.propose(baseInput())
    rs.reject(prov.id, 'user:1')
    expect(rs.get(prov.id)!.state).toBe('rejected') // retained
    // re-proposing on identical evidence returns the rejected edge, creating nothing new
    const again = rs.propose(baseInput())
    expect(again.id).toBe(prov.id)
    expect(again.state).toBe('rejected')
    expect(rs.all()).toHaveLength(1)
  })
})

describe('plx_gph_003 — confidence revert', () => {
  it('test_plx_gph_003_below_threshold_reverts_to_provisional', () => {
    const rs = createRelationshipStore(memSqlDb())
    const prov = rs.propose(baseInput({ confidence: 0.9 }))
    rs.confirm(prov.id, 'user:1')
    expect(rs.get(prov.id)!.state).toBe('confirmed')
    const reverted = rs.recomputeConfidence(prov.id, RELATIONSHIP_CONFIDENCE_THRESHOLD - 0.1)!
    expect(reverted.state).toBe('provisional')
    expect(rs.activeFor('obj-A')).toHaveLength(0) // no longer surfaces
  })
})
