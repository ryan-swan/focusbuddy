import { describe, it, expect } from 'vitest'
import { memSqlDb } from './_memdb'
import { createEventStore } from '../../src/main/db/eventStore'
import { createDecisionStore } from '../../src/main/db/decisionStore'
import {
  satisfiesScope,
  isExpiredGrant,
  isStandingGrant,
  evaluateEdgeAccess,
  type Principal
} from '../../src/shared/permission'
import { markAiGenerated, isAiGenerated } from '../../src/shared/aiProvenance'

// Tenant isolation across the remaining stores + permission expiry, auditability
// and AI marking (spec §69, ADR-0002).

const human = { kind: 'user' as const, id: 'u1' }

describe('plx_sec_010 — the Decision store enforces tenant isolation at the storage layer', () => {
  it('test_plx_sec_010_decision_store_never_returns_other_org', () => {
    const db = memSqlDb()
    const writer = createDecisionStore(db) // unbound writer for setup
    writer.create({ organisationId: 'org-1', title: 'A', decisionStatement: 's', decisionOwner: human, correlationId: 'c1', noAlternativesConsidered: true })
    writer.create({ organisationId: 'org-2', title: 'B', decisionStatement: 's', decisionOwner: human, correlationId: 'c2', noAlternativesConsidered: true })
    const org1 = createDecisionStore(db, 'org-1')
    expect(org1.all().map((d) => d.title)).toEqual(['A'])
    expect(org1.all().every((d) => d.organisationId === 'org-1')).toBe(true)
  })
})

describe('plx_sec_010 — the Event store scopes replay to one organisation', () => {
  it('test_plx_sec_010_replay_never_crosses_org', () => {
    const db = memSqlDb()
    const writer = createEventStore(db)
    writer.append({ eventType: 'DeskUpdated', category: 'user', actor: 'u', organisationId: 'org-1', deskId: 'desk-1', objectId: 'desk-1', changeSummary: 'a' })
    writer.append({ eventType: 'DeskUpdated', category: 'user', actor: 'u', organisationId: 'org-2', deskId: 'desk-1', objectId: 'desk-1', changeSummary: 'b' })
    // A desk id could collide across orgs; the org-bound store still returns only its own.
    const org1 = createEventStore(db, 'org-1')
    const replay = org1.replayDesk('desk-1')
    expect(replay).toHaveLength(1)
    expect(replay[0].organisationId).toBe('org-1')
  })
})

describe('plx_sec_022 — temporary permissions expire and fail closed', () => {
  it('test_plx_sec_022_expired_grant_is_ignored', () => {
    const principal: Principal = { id: 'u1', organisationId: 'org-1' }
    const now = Date.parse('2026-07-30T12:00:00Z')
    const live = { grants: [{ principal: 'u1', capability: 'read', expiresAt: '2026-07-30T13:00:00Z' }] }
    const expired = { grants: [{ principal: 'u1', capability: 'read', expiresAt: '2026-07-30T11:00:00Z' }] }
    expect(satisfiesScope(principal, live, now)).toBe(true)
    expect(satisfiesScope(principal, expired, now)).toBe(false) // expired -> treated as absent
    // Fail closed: an unparseable expiry is treated as expired, never as open access.
    expect(isExpiredGrant({ expiresAt: 'not-a-date' }, now)).toBe(true)
    // A grant with no expiry is a standing grant (must be an explicit admin action).
    expect(isStandingGrant({ principal: 'u1', capability: 'read' })).toBe(true)
    expect(isStandingGrant({ principal: 'u1', capability: 'read', expiresAt: '2026-07-30T13:00:00Z' })).toBe(false)
  })
})

describe('plx_sec_021 — authorisation decisions are auditable', () => {
  it('test_plx_sec_021_decision_records_principal_resource_verdict_policy_time', () => {
    const principal: Principal = { id: 'u1', organisationId: 'org-1' }
    const edge = { organisationId: 'org-1', sourceEntityId: 'A', targetEntityId: 'B' }
    const at = '2026-07-30T12:00:00Z'
    const allow = evaluateEdgeAccess(principal, 'A', edge, () => true, at)
    expect(allow.allowed).toBe(true)
    expect(allow.decision).toMatchObject({ principal: 'u1', decision: 'allow', at })
    expect(allow.decision.resource).toContain('A')
    expect(allow.decision.policy).toBeTruthy()
    // A denial records why (the failing policy), for the audit trail.
    const crossOrg = evaluateEdgeAccess(principal, 'A', { ...edge, organisationId: 'org-2' }, () => true, at)
    expect(crossOrg.allowed).toBe(false)
    expect(crossOrg.decision.decision).toBe('deny')
    expect(crossOrg.decision.policy).toContain('SEC-011')
    // An unreadable far node denies with the traversal policy named.
    const hidden = evaluateEdgeAccess(principal, 'A', edge, () => false, at)
    expect(hidden.allowed).toBe(false)
    expect(hidden.decision.policy).toContain('GPH-010')
  })
})

describe('plx_sec_027 — AI-generated content is marked in storage', () => {
  it('test_plx_sec_027_ai_content_is_distinguishable', () => {
    const meta = markAiGenerated({ model: 'claude-sonnet-5', promptVersion: 'p', generatedAt: 't', sourceEventIds: ['e1'] })
    expect(isAiGenerated(meta)).toBe(true)
    expect(meta.provenance).toBe('ai_generated') // programmatically distinguishable (also PLX-UX-062 / DOM-014)
  })
})
