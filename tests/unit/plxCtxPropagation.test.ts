// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { memSqlDb } from './_memdb'
import {
  propagateHealth,
  graphFromRelationships,
  DEFAULT_PROPAGATION_BOUND,
  type HealthGraph,
  type HealthEdge
} from '../../src/main/context/propagation'
import { computeTransition } from '../../src/shared/contextHealth'
import { buildTransitions, contextHealthChangedEvent } from '../../src/main/context/contextHealthService'
import { createRelationshipStore } from '../../src/main/db/relationshipStore'
import { createEventStore } from '../../src/main/db/eventStore'
import { scoreMateriality, type MaterialityInput } from '../../src/main/context/materiality'

// Context Health propagation (spec §20.5, §80.2). Bounded, incremental,
// cycle-safe, budget-limited traversal over confirmed relationships.

// A trivial in-memory adjacency graph for the pure-traversal tests.
function graphOf(adj: Record<string, Array<[string, string, number?]>>): HealthGraph {
  return {
    neighbours(id: string): HealthEdge[] {
      return (adj[id] ?? []).map(([objectId, relationshipId, strength]) => ({ objectId, relationshipId, strength: strength ?? 0.5 }))
    }
  }
}

describe('plx_ctx_026 — propagation is cycle-safe', () => {
  it('test_plx_ctx_026_terminates_on_cyclic_graph', () => {
    // A DependsOn B, B References A, B DependsOn C, C References A — genuinely cyclic.
    const g = graphOf({
      A: [['B', 'r-ab']],
      B: [['A', 'r-ba'], ['C', 'r-bc']],
      C: [['A', 'r-ca']]
    })
    const r = propagateHealth('A', g)
    // Each object visited at most once; traversal returns rather than looping.
    const ids = r.affected.map((s) => s.objectId).sort()
    expect(ids).toEqual(['B', 'C'])
    expect(r.visitedCount).toBe(3) // A, B, C
  })
})

describe('plx_ctx_023 — propagation is incremental', () => {
  it('test_plx_ctx_023_leaves_unaffected_regions_untouched', () => {
    // Two disconnected regions. A change at A must never visit X/Y.
    const g = graphOf({
      A: [['B', 'r-ab']],
      B: [],
      X: [['Y', 'r-xy']],
      Y: []
    })
    const r = propagateHealth('A', g)
    const ids = r.affected.map((s) => s.objectId)
    expect(ids).toContain('B')
    expect(ids).not.toContain('X')
    expect(ids).not.toContain('Y')
  })
})

describe('plx_ctx_013 / plx_ctx_024 — bounded by depth and fan-out, truncation visible', () => {
  it('test_plx_ctx_024_depth_bound_records_truncation', () => {
    // A->B->C->D->E->F, bound maxDepth 2: reaches B, C; truncates at C.
    const g = graphOf({ A: [['B', '1']], B: [['C', '2']], C: [['D', '3']], D: [['E', '4']], E: [['F', '5']] })
    const r = propagateHealth('A', g, { bound: { maxDepth: 2, maxFanout: 25 } })
    expect(r.affected.map((s) => s.objectId).sort()).toEqual(['B', 'C'])
    const depthTrunc = r.truncations.find((t) => t.reason === 'depth')
    expect(depthTrunc).toBeTruthy()
    expect(depthTrunc!.atObjectId).toBe('C') // stopped expanding at the bound
    expect(depthTrunc!.dropped).toBeGreaterThan(0) // D was not silently dropped
  })
  it('test_plx_ctx_013_fanout_bound_records_truncation', () => {
    // A has 5 neighbours, maxFanout 2: two strongest traversed, three recorded.
    const g = graphOf({
      A: [['n1', 'e1', 0.9], ['n2', 'e2', 0.8], ['n3', 'e3', 0.3], ['n4', 'e4', 0.2], ['n5', 'e5', 0.1]]
    })
    const r = propagateHealth('A', g, { bound: { maxDepth: 4, maxFanout: 2 } })
    expect(r.affected.map((s) => s.objectId).sort()).toEqual(['n1', 'n2']) // strongest kept
    const fan = r.truncations.find((t) => t.reason === 'fanout')
    expect(fan).toBeTruthy()
    expect(fan!.dropped).toBe(3)
  })
})

describe('plx_ctx_025 — synchronous budget defers the frontier', () => {
  it('test_plx_ctx_025_budget_exceeded_defers_remainder', () => {
    const g = graphOf({ A: [['B', '1']], B: [['C', '2']], C: [['D', '3']], D: [['E', '4']] })
    // A clock that jumps past the budget after the first dequeue forces deferral.
    let t = 0
    const now = () => { t += 400; return t }
    const r = propagateHealth('A', g, { budgetMs: 500, now })
    expect(r.budgetExceeded).toBe(true)
    expect(r.deferred.length).toBeGreaterThan(0) // remainder handed to async, not dropped
  })
})

describe('plx_ux_022 — propagates over CONFIRMED relationships only', () => {
  it('test_plx_ux_022_provisional_edges_do_not_propagate', () => {
    const rs = createRelationshipStore(memSqlDb())
    // A confirmed A->B and a provisional A->C.
    const ab = rs.propose({
      organisationId: 'org', sourceEntityId: 'A', targetEntityId: 'B', relationshipType: 'References',
      confidence: 0.9, evidence: [{ kind: 'event', ref: 'e1', excerpt: null, weight: 1 }], discoveryMethod: 'ai', correlationId: 'c1'
    })
    rs.confirm(ab.id, 'user:1')
    rs.propose({
      organisationId: 'org', sourceEntityId: 'A', targetEntityId: 'C', relationshipType: 'References',
      confidence: 0.9, evidence: [{ kind: 'event', ref: 'e2', excerpt: null, weight: 1 }], discoveryMethod: 'ai', correlationId: 'c2'
    })
    const g = graphFromRelationships(rs)
    const r = propagateHealth('A', g)
    const ids = r.affected.map((s) => s.objectId)
    expect(ids).toContain('B') // confirmed edge propagates
    expect(ids).not.toContain('C') // provisional edge does not
  })
})

const material: MaterialityInput = {
  affectedObjectCount: 8, decisionImpact: 'high', relationshipDepth: 1,
  organisationalReach: 'org', userRole: 'owner', workflowStage: 'final', historicalSignificance: 0.6
}
const trivial: MaterialityInput = {
  affectedObjectCount: 0, decisionImpact: 'none', relationshipDepth: 0,
  organisationalReach: 'self', userRole: 'viewer', workflowStage: 'draft', historicalSignificance: 0
}

describe('plx_ux_021 — transitions are materiality-driven, not raw-change-driven', () => {
  it('test_plx_ux_021_non_material_change_never_attention_required', () => {
    const low = scoreMateriality(trivial)
    const next = computeTransition({ fromState: 'current', materialityBand: low.band, materialityScore: low.score })
    expect(next).toBe('changed') // visual indication only, never attention-required
    const high = scoreMateriality(material)
    expect(computeTransition({ fromState: 'current', materialityBand: high.band, materialityScore: high.score })).toBe('attention-required')
  })
})

describe('plx_ux_025 — Decision Risk requires a named Decision', () => {
  it('test_plx_ux_025_no_decision_no_risk_state', () => {
    const high = scoreMateriality(material)
    // Material change, but no named Decision -> attention-required, NOT decision-risk.
    expect(computeTransition({ fromState: 'current', materialityBand: high.band, materialityScore: high.score, decisionsAtRisk: [] })).toBe('attention-required')
    // Material change WITH a named Decision -> decision-risk.
    expect(
      computeTransition({
        fromState: 'current', materialityBand: high.band, materialityScore: high.score,
        decisionsAtRisk: [{ decisionId: 'd1', title: 'Ship at $99', invalidatingChange: 'price sheet changed' }]
      })
    ).toBe('decision-risk')
  })
})

describe('plx_ux_024 / plx_dom_030 — auditable, per-(user,Object) transitions', () => {
  it('test_plx_ux_024_transition_records_trigger_score_and_path', () => {
    const g = graphOf({ A: [['B', 'r-ab']], B: [] })
    const res = buildTransitions({
      organisationId: 'org', userId: 'u1', originObjectId: 'A', triggeringEventId: 'evt-99',
      materiality: scoreMateriality(material), graph: g, computedAt: '2026-07-29T00:00:00.000Z',
      context: { currentState: () => 'current' }
    })
    const a = res.transitions.find((t) => t.objectId === 'A')!
    expect(a.triggeringEventId).toBe('evt-99') // triggering Event recorded
    expect(a.materialityScore).toBeGreaterThan(0) // materiality recorded
    const b = res.transitions.find((t) => t.objectId === 'B')!
    expect(b.propagationPath.map((s) => s.objectId)).toContain('B') // propagation path recorded
    // Event carries the bound so truncation is visible (PLX-UX-022).
    const evt = contextHealthChangedEvent(a, DEFAULT_PROPAGATION_BOUND)
    expect(evt.eventType).toBe('ContextHealthChanged')
    expect((evt.currentState as { propagationBound: unknown }).propagationBound).toEqual(DEFAULT_PROPAGATION_BOUND)
  })
  it('test_plx_dom_030_health_computed_per_user_object_not_stored_on_object', () => {
    // Same Object, two users at different review points -> different transitions.
    const g = graphOf({ A: [] })
    const perUser: Record<string, 'current' | 'changed'> = { u1: 'current', u2: 'changed' }
    const mk = (userId: string) =>
      buildTransitions({
        organisationId: 'org', userId, originObjectId: 'A', triggeringEventId: 'e1',
        materiality: scoreMateriality(trivial), graph: g, computedAt: '2026-07-29T00:00:00.000Z',
        context: { currentState: (_u, _o) => perUser[userId] }
      }).transitions
    // u1 was current -> now changed (a transition); u2 already changed -> no change recorded.
    expect(mk('u1').find((t) => t.objectId === 'A')?.toState).toBe('changed')
    expect(mk('u2').find((t) => t.objectId === 'A')).toBeUndefined()
  })
})

describe('event store integration — emitted ContextHealthChanged persists', () => {
  it('test_plx_ux_024_event_appends', () => {
    const es = createEventStore(memSqlDb())
    const g = graphOf({ A: [] })
    const { transitions } = buildTransitions({
      organisationId: 'org', userId: 'u1', originObjectId: 'A', triggeringEventId: 'e1',
      materiality: scoreMateriality(material), graph: g, computedAt: '2026-07-29T00:00:00.000Z',
      context: { currentState: () => 'current', decisionsAtRisk: () => [{ decisionId: 'd1', title: 'x', invalidatingChange: 'y' }] }
    })
    const evt = es.append(contextHealthChangedEvent(transitions[0], DEFAULT_PROPAGATION_BOUND))
    expect(evt.currentState).toMatchObject({ healthState: 'decision-risk' })
    expect(es.replayDesk).toBeTypeOf('function')
  })
})
