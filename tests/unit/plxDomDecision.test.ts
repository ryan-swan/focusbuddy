// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { memSqlDb } from './_memdb'
import { createDecisionStore, type CreateDecisionInput } from '../../src/main/db/decisionStore'
import { createEventStore } from '../../src/main/db/eventStore'
import { canBeApproved, isHumanPrincipal, type ActorRef } from '../../src/shared/decision'
import { buildTransitions } from '../../src/main/context/contextHealthService'
import { scoreMateriality, type MaterialityInput } from '../../src/main/context/materiality'

// Decision entity (spec §37). Human-only ownership/approval, advisory-only AI
// commentary, permanently-retained alternatives, atomic supersede, and the
// end-to-end Decision Risk alert loop.

const human: ActorRef = { kind: 'user', id: 'u1', displayName: 'Sam' }
const agent: ActorRef = { kind: 'agent', id: 'plexi', displayName: 'Plexi' }

function baseDecision(over: Partial<CreateDecisionInput> = {}): CreateDecisionInput {
  return {
    organisationId: 'org', title: 'Ship at $99', decisionStatement: 'Launch price is $99/mo',
    decisionOwner: human, correlationId: 'c1', relatedObjectIds: ['obj-pricing'],
    alternatives: [{ statement: '$129/mo', rejectedFor: 'churn risk too high', evidence: [] }],
    ...over
  }
}

describe('plx_dom_040 — owner and approvers must be human', () => {
  it('test_plx_dom_040_rejects_agent_owner_and_approver', () => {
    const ds = createDecisionStore(memSqlDb())
    expect(() => ds.create(baseDecision({ decisionOwner: agent }))).toThrow(/human/i)
    const d = ds.create(baseDecision())
    expect(() => ds.addApproval(d.id, agent, 'granted', null, '2026-07-29T00:00:00Z')).toThrow(/human/i)
    expect(isHumanPrincipal(human)).toBe(true)
    expect(isHumanPrincipal(agent)).toBe(false)
  })
})

describe('plx_dom_041 — AI commentary is advisory only', () => {
  it('test_plx_dom_041_commentary_stored_advisory_never_the_decision', () => {
    const ds = createDecisionStore(memSqlDb())
    const d = ds.create(baseDecision())
    const c = ds.addAiCommentary(d.id, agent, 'Consider a 14-day trial', '2026-07-29T00:00:00Z')
    expect(c.advisory).toBe(true)
    const reloaded = ds.get(d.id)!
    expect(reloaded.aiCommentary[0].advisory).toBe(true)
    // Commentary never overwrites the decision statement / rationale of record.
    expect(reloaded.decisionStatement).toBe('Launch price is $99/mo')
    expect(reloaded.decisionStatement).not.toContain('trial')
  })
})

describe('plx_app_020 — approval gate requires alternatives or explicit none', () => {
  it('test_plx_app_020_blocks_approval_without_alternatives', () => {
    const ds = createDecisionStore(memSqlDb())
    const bare = ds.create(baseDecision({ alternatives: [], noAlternativesConsidered: false }))
    expect(canBeApproved(bare)).toBe(false)
    expect(() => ds.approve(bare.id, human, '2026-07-29T00:00:00Z')).toThrow(/PLX-APP-020/)
    // Explicit "none considered" satisfies the gate.
    const explicit = ds.create(baseDecision({ alternatives: [], noAlternativesConsidered: true }))
    expect(ds.approve(explicit.id, human, '2026-07-29T00:00:00Z').state).toBe('approved')
    // A recorded alternative also satisfies it.
    const withAlt = ds.create(baseDecision())
    expect(ds.approve(withAlt.id, human, '2026-07-29T00:00:00Z').state).toBe('approved')
  })
})

describe('plx_dom_043 — rejected alternatives retained permanently', () => {
  it('test_plx_dom_043_alternatives_survive_approve_and_supersede', () => {
    const ds = createDecisionStore(memSqlDb())
    const es = createEventStore(memSqlDb())
    const d = ds.create(baseDecision())
    ds.approve(d.id, human, '2026-07-29T00:00:00Z')
    ds.supersede(d.id, null, human, es, '2026-07-29T01:00:00Z')
    const after = ds.get(d.id)!
    expect(after.alternatives).toHaveLength(1)
    expect(after.alternatives[0].rejectedFor).toBe('churn risk too high') // the "why not" survives
  })
})

describe('plx_dom_042 — supersede is atomic, emits event, flags re-evaluation', () => {
  it('test_plx_dom_042_supersede_sets_pointer_emits_event_and_lists_objects', () => {
    const ds = createDecisionStore(memSqlDb())
    const es = createEventStore(memSqlDb())
    const old = ds.create(baseDecision({ relatedObjectIds: ['obj-pricing', 'obj-proposal'] }))
    const next = ds.create(baseDecision({ title: 'Ship at $89', decisionStatement: 'Launch price is $89/mo' }))
    const r = ds.supersede(old.id, next.id, human, es, '2026-07-29T02:00:00Z')
    expect(r.superseded.supersededById).toBe(next.id) // pointer set
    expect(r.superseded.state).toBe('superseded')
    // DecisionSuperseded event committed atomically with the state change.
    const events = es.replayDesk('any')
    // (replayDesk filters by desk; here we assert via the outbox/count instead)
    expect(es.db.prepare("SELECT COUNT(*) AS n FROM events WHERE event_type='DecisionSuperseded'").get()).toEqual({ n: 1 })
    // Every Object referencing the superseded Decision is flagged for re-evaluation.
    expect(r.objectsToReevaluate).toEqual(['obj-pricing', 'obj-proposal'])
    void events
  })
})

const material: MaterialityInput = {
  affectedObjectCount: 6, decisionImpact: 'high', relationshipDepth: 1,
  organisationalReach: 'org', userRole: 'owner', workflowStage: 'final', historicalSignificance: 0.7
}

describe('plx_ux_025 — Decision Risk names the specific Decision end-to-end', () => {
  it('test_plx_ux_025_supersede_drives_named_decision_risk', () => {
    const ds = createDecisionStore(memSqlDb())
    const es = createEventStore(memSqlDb())
    const decision = ds.create(baseDecision({ relatedObjectIds: ['obj-pricing'] }))
    // A change to obj-pricing that materially affects a linked Decision.
    const graph = { neighbours: () => [] }
    const decisionsFor = (objectId: string) =>
      ds.all()
        .filter((d) => d.relatedObjectIds.includes(objectId))
        .map((d) => ({ decisionId: d.id, title: d.title, invalidatingChange: 'pricing sheet edited' }))
    const { transitions } = buildTransitions({
      organisationId: 'org', userId: 'u1', originObjectId: 'obj-pricing', triggeringEventId: 'evt-1',
      materiality: scoreMateriality(material), graph, computedAt: '2026-07-29T03:00:00Z',
      context: { currentState: () => 'current', decisionsAtRisk: decisionsFor }
    })
    const t = transitions.find((x) => x.objectId === 'obj-pricing')!
    expect(t.toState).toBe('decision-risk')
    expect(t.decisionsAtRisk[0].decisionId).toBe(decision.id) // the SPECIFIC decision is named
    expect(t.decisionsAtRisk[0].invalidatingChange).toBe('pricing sheet edited')
    void es
  })
})
