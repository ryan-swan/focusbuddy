// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { memSqlDb } from './_memdb'
import { createEventStore } from '../../src/main/db/eventStore'
import { deriveHealthSnapshot, ensureReviewSchema, recordReview } from '../../src/main/context/health'
import type { MaterialityInput } from '../../src/main/context/materiality'
import type { DecisionAtRisk } from '../../src/shared/contextHealth'

// Live Context Health derivation over a real SqlDb (spec §20). This is the wire
// the desktop app runs: Object Events + the user's last review point -> health.

function setup() {
  const db = memSqlDb()
  const es = createEventStore(db)
  ensureReviewSchema(db)
  return { db, es }
}
function objEvent(objectId: string, n: number) {
  return {
    eventType: n === 0 ? 'DeskCreated' : 'DeskUpdated',
    category: 'user' as const,
    actor: 'user:sam',
    organisationId: 'org',
    objectId,
    changeSummary: `change ${n}`
  }
}
const material: MaterialityInput = {
  affectedObjectCount: 8, decisionImpact: 'high', relationshipDepth: 1,
  organisationalReach: 'org', userRole: 'owner', workflowStage: 'final', historicalSignificance: 0.7
}
const trivial: MaterialityInput = {
  affectedObjectCount: 0, decisionImpact: 'none', relationshipDepth: 0,
  organisationalReach: 'self', userRole: 'viewer', workflowStage: 'draft', historicalSignificance: 0
}

describe('plx_ux_020 — health is relative to the user last review point', () => {
  it('test_plx_ux_020_changes_since_review_drive_state_then_reset', () => {
    const { db, es } = setup()
    es.append(objEvent('desk-1', 0))
    es.append(objEvent('desk-1', 1))
    // Never reviewed: two material changes -> attention-required.
    const before = deriveHealthSnapshot(db, 'sam', 'desk-1', material, [])
    expect(before.changedEventCount).toBe(2)
    expect(before.state).toBe('attention-required')
    // Review it -> current, nothing pending.
    recordReview(db, 'sam', 'desk-1', '2026-07-29T00:00:00Z')
    const after = deriveHealthSnapshot(db, 'sam', 'desk-1', material, [])
    expect(after.changedEventCount).toBe(0)
    expect(after.state).toBe('current')
    // A new change after review re-raises it.
    es.append(objEvent('desk-1', 2))
    const reraised = deriveHealthSnapshot(db, 'sam', 'desk-1', material, [])
    expect(reraised.changedEventCount).toBe(1)
    expect(reraised.state).toBe('attention-required')
  })
})

describe('plx_ux_022 — a change to a related desk raises this desk (read layer)', () => {
  it('test_plx_ux_022_related_change_counts_toward_health', () => {
    const { db, es } = setup()
    es.append(objEvent('desk-1', 0))
    recordReview(db, 'sam', 'desk-1', '2026-07-29T00:00:00Z') // caught up on desk-1
    // No further change to desk-1 itself -> current when ignoring relations.
    expect(deriveHealthSnapshot(db, 'sam', 'desk-1', material, []).state).toBe('current')
    // A change lands on the confirmed-related desk-2.
    es.append(objEvent('desk-2', 1))
    // With desk-2 passed as a related neighbour, desk-1 now needs attention.
    const withRelated = deriveHealthSnapshot(db, 'sam', 'desk-1', material, [], ['desk-2'])
    expect(withRelated.changedEventCount).toBe(1)
    expect(withRelated.state).toBe('attention-required')
  })
})

describe('plx_dom_030 — computed per (user, Object), not stored on the Object', () => {
  it('test_plx_dom_030_two_users_differ_on_the_same_object', () => {
    const { db, es } = setup()
    es.append(objEvent('desk-1', 0))
    recordReview(db, 'sam', 'desk-1', '2026-07-29T00:00:00Z') // Sam reviewed
    // Sam sees current; Dana (never reviewed) sees a pending change on the SAME object.
    expect(deriveHealthSnapshot(db, 'sam', 'desk-1', material, []).state).toBe('current')
    expect(deriveHealthSnapshot(db, 'dana', 'desk-1', material, []).state).toBe('attention-required')
  })
})

describe('plx_ux_021 — non-material change never reaches attention-required (live)', () => {
  it('test_plx_ux_021_trivial_change_is_only_changed', () => {
    const { db, es } = setup()
    es.append(objEvent('desk-1', 0))
    expect(deriveHealthSnapshot(db, 'sam', 'desk-1', trivial, []).state).toBe('changed')
  })
})

describe('plx_ux_025 — Decision Risk names the Decision (live)', () => {
  it('test_plx_ux_025_linked_decision_makes_it_decision_risk', () => {
    const { db, es } = setup()
    es.append(objEvent('desk-1', 0))
    const risks: DecisionAtRisk[] = [{ decisionId: 'd-42', title: 'Ship at $99', invalidatingChange: 'desk edited' }]
    const snap = deriveHealthSnapshot(db, 'sam', 'desk-1', material, risks)
    expect(snap.state).toBe('decision-risk')
    expect(snap.decisionsAtRisk[0].decisionId).toBe('d-42')
  })
})
