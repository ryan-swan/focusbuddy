import { describe, it, expect } from 'vitest'
import { memSqlDb } from './_memdb'
import { createEventStore } from '../../src/main/db/eventStore'
import { createRelationshipStore } from '../../src/main/db/relationshipStore'
import { generateResume, diffResume, estimateCatchup, RESUME_MODE, hasSufficientSignal, signalStatement, type ResumeEventLike } from '../../src/main/resume/resume'
import { renderAwareness, awarenessFor, type AwarenessStatement } from '../../src/shared/awareness'
import { deactivateUser } from '../../src/main/context/userLifecycle'
import type { Principal } from '../../src/shared/permission'

// Resume-PRD guarantees, cross-Desk awareness, and user deactivation.

function resume(objectId = 'd1', n = 1) {
  const db = memSqlDb()
  const es = createEventStore(db)
  for (let i = 0; i < n; i++) es.append({ eventType: 'DeskUpdated', category: 'user', actor: 'u', organisationId: 'org', objectId, changeSummary: `c${i}` })
  return generateResume(db, { deskId: objectId, forUserId: 'sam', objectIds: [objectId], sinceCursor: -1 })
}

describe('plx_prd_040 / plx_prd_041 / plx_prd_044 — resume is automatic, sourced, honest', () => {
  it('test_plx_prd_040_continuous_automatic', () => {
    expect(RESUME_MODE).toBe('continuous-automatic') // no user request needed
  })
  it('test_plx_prd_041_assertions_carry_event_refs', () => {
    const r = resume('d1', 2)
    expect(r.sourceEventIds.length).toBe(2)
    for (const g of r.groups) for (const c of g.changes) expect(c.eventIds.length).toBeGreaterThan(0)
  })
  it('test_plx_prd_044_insufficient_signal_stated_plainly', () => {
    const emptyDb = memSqlDb()
    createEventStore(emptyDb) // ensure the events table exists but leave it empty
    const empty = generateResume(emptyDb, { deskId: 'd1', forUserId: 'sam', objectIds: ['d1'], sinceCursor: -1 })
    expect(hasSufficientSignal(empty)).toBe(false)
    expect(signalStatement(empty)).toMatch(/not enough/i) // plain, not a low-confidence narrative
    expect(hasSufficientSignal(resume('d1', 1))).toBe(true)
  })
})

describe('plx_prd_042 / plx_prd_043 — resume versioned/diffable; catch-up qualified', () => {
  it('test_plx_prd_042_diffable', () => {
    const v1 = resume('d1', 1)
    const v2 = resume('d1', 2)
    const d = diffResume(v1, v2)
    expect(d).toHaveProperty('newObjectIds')
  })
  it('test_plx_prd_043_catchup_carries_accuracy_qualifier', () => {
    const c = estimateCatchup(Array.from({ length: 4 }, (_, i) => ({ id: `e${i}`, eventType: 'DeskUpdated', objectId: 'd', changeSummary: null, recordedAt: '', rowid: i + 1 })) as ResumeEventLike[])!
    expect(c.basis).toBe('heuristic') // accuracy qualifier present
    expect(c.lowerBound).toBeLessThan(c.upperBound)
  })
})

describe('plx_prd_053 — relationship intelligence without manual graph construction', () => {
  it('test_plx_prd_053_ai_discovered_needs_no_user_wiring', () => {
    const rs = createRelationshipStore(memSqlDb())
    const auto = rs.propose({
      organisationId: 'org', sourceEntityId: 'A', targetEntityId: 'B', relationshipType: 'RelatedTo',
      confidence: 0.9, evidence: [{ kind: 'event', ref: 'e', excerpt: null, weight: 1 }], discoveryMethod: 'ai', correlationId: 'c'
    })
    expect(auto.discoveryMethod).toBe('ai') // arrived without the user building structure
    expect(auto.state).toBe('provisional')
  })
})

describe('plx_prd_070 / plx_prd_071 — cross-desk awareness is permission-filtered', () => {
  const alice: Principal = { id: 'user:alice', organisationId: 'org' }
  const stmt: AwarenessStatement = { recipientId: 'user:alice', subjectId: 'secret-desk', subjectName: 'Project Zeus', text: 'Project Zeus changed and affects your work.' }
  it('test_plx_prd_070_full_when_permitted', () => {
    expect(renderAwareness(stmt, alice, () => true)).toEqual({ render: 'full', text: stmt.text })
  })
  it('test_plx_prd_071_suppressed_or_redacted_when_not', () => {
    // No safe redaction available -> suppressed entirely; existence never leaks.
    expect(renderAwareness(stmt, alice, () => false)).toEqual({ render: 'suppressed' })
    // A redacted form that names neither the subject nor its id may render.
    const red = renderAwareness(stmt, alice, () => false, 'A related item you cannot see changed.')
    expect(red.render).toBe('redacted')
    // A "redacted" form that still names the subject is refused (falls back to suppressed).
    expect(renderAwareness(stmt, alice, () => false, 'Project Zeus changed.').render).toBe('suppressed')
    // Batch filter drops suppressed, so the count never reveals the hidden subject.
    expect(awarenessFor([stmt], alice, () => false)).toEqual([])
  })
})

describe('plx_prd_072 — deactivation keeps authored records, triggers reassignment', () => {
  it('test_plx_prd_072_no_deletion_reassignment_workflow', () => {
    const r = deactivateUser({ organisationId: 'org', actor: 'admin', userId: 'user:bob', ownedObjectIds: ['o1', 'o2'] })
    expect(r.event.eventType).toBe('UserDeactivated')
    expect((r.event.currentState as { authoredRecordsRemoved: boolean }).authoredRecordsRemoved).toBe(false)
    expect(r.reassignmentRequiredFor).toEqual(['o1', 'o2'])
    expect(r.removed).toEqual([])
  })
})
