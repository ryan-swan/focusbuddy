import { describe, it, expect } from 'vitest'
import { memSqlDb } from './_memdb'
import { createEventStore } from '../../src/main/db/eventStore'
import { createRelationshipStore, rebuildRelationshipGraph, type ProposeInput } from '../../src/main/db/relationshipStore'
import {
  isCanonicalEntity,
  assertPersistsCanonical,
  registerStoreOwner,
  canAccessStoreDirectly,
  requireOrganisationId,
  assertConcurrencySafe,
  isPresenceClass,
  dataClassOf
} from '../../src/shared/architecture'
import { closeSession, resumeBlockedByOpenSession, type Session } from '../../src/shared/session'
import { createContextObjectStore } from '../../src/main/context/contextObjectStore'
import { computeTraceability, invariantHasDetection, invariantsMissingDetection, INVARIANT_DETECTION_TESTS } from '../../src/main/meta/engStandards'
import { validateEvent } from '../../src/main/db/eventSchemas'

// Foundational architecture, data, context, session and engineering standards.

describe('plx_dom_001 / plx_dom_002 — canonical entity model', () => {
  it('test_plx_dom_001_persisted_concepts_are_canonical', () => {
    expect(isCanonicalEntity('object')).toBe(true)
    expect(isCanonicalEntity('desk')).toBe(true)
    expect(isCanonicalEntity('adhocThing')).toBe(false)
    expect(() => assertPersistsCanonical('adhocThing')).toThrow(/PLX-DOM-001/)
    expect(() => assertPersistsCanonical('decision')).not.toThrow()
  })
})

describe('plx_dom_011 — every entity carries organisationId', () => {
  it('test_plx_dom_011_org_required', () => {
    expect(requireOrganisationId({ organisationId: 'org-1' })).toBe('org-1')
    expect(() => requireOrganisationId({ organisationId: null })).toThrow(/PLX-DOM-011/)
  })
})

describe('plx_data_001 / plx_arc_001 / plx_arc_002 — one store, one owner', () => {
  it('test_plx_data_001_single_owner_and_no_direct_cross_access', () => {
    registerStoreOwner('events', 'event-service')
    registerStoreOwner('events', 'event-service') // idempotent for the same owner
    expect(() => registerStoreOwner('events', 'other-service')).toThrow(/PLX-DATA-001/)
    // Only the owning service reads/writes directly; others go via API/Events (ARC-002).
    expect(canAccessStoreDirectly('event-service', 'events')).toBe(true)
    expect(canAccessStoreDirectly('resume-service', 'events')).toBe(false)
  })
})

describe('plx_arc_010 — concurrent instances tolerated via idempotency', () => {
  it('test_plx_arc_010_requires_idempotent_consumer', () => {
    expect(() => assertConcurrencySafe({ idempotent: true })).not.toThrow()
    expect(() => assertConcurrencySafe({ idempotent: false })).toThrow(/PLX-ARC-010/)
  })
})

describe('plx_dom_050 — FocusRecord is presence-class data', () => {
  it('test_plx_dom_050_presence_classification', () => {
    expect(isPresenceClass('FocusRecord')).toBe(true)
    expect(dataClassOf('FocusRecord')).toBe('presence')
    expect(isPresenceClass('Invoice')).toBe(false)
  })
})

describe('plx_dom_051 — sessions close by exit/timeout/recovery; open session never blocks resume', () => {
  it('test_plx_dom_051_close_and_non_blocking', () => {
    const s: Session = { id: 's1', state: 'open', closeReason: null, openedAt: 't0', closedAt: null }
    expect(resumeBlockedByOpenSession(s)).toBe(false) // an open session never blocks Resume
    const closed = closeSession(s, 'timeout', 't1')
    expect(closed.state).toBe('closed')
    expect(closed.closeReason).toBe('timeout')
  })
})

describe('plx_ctx_001 — Context Objects are versioned and retained', () => {
  it('test_plx_ctx_001_supersede_retains_prior_versions', () => {
    const store = createContextObjectStore(memSqlDb())
    const v1 = store.put('desk-1', 'org', 'understanding v1', 't1')
    const v2 = store.put('desk-1', 'org', 'understanding v2', 't2')
    expect(store.current('desk-1')!.version).toBe(2)
    // The superseded v1 remains retrievable for audit — not overwritten.
    expect(store.get(v1.id)!.body).toBe('understanding v1')
    expect(store.get(v1.id)!.supersededById).toBe(v2.id)
    expect(store.history('desk-1').map((r) => r.version)).toEqual([1, 2])
  })
})

describe('plx_eng_021 — requirement-to-test traceability is machine-checkable', () => {
  it('test_plx_eng_021_computes_covered_and_uncovered', () => {
    const t = computeTraceability(['PLX-A-001', 'PLX-A-002', 'PLX-A-003'], ['PLX-A-001', 'PLX-A-003'])
    expect(t.total).toBe(3)
    expect(t.covered.sort()).toEqual(['PLX-A-001', 'PLX-A-003'])
    expect(t.uncovered).toEqual(['PLX-A-002']) // CI reports the gap
    expect(t.pct).toBeCloseTo(2 / 3)
  })
})

describe('plx_eng_001 / plx_eng_014 — every enforced invariant has a detection test', () => {
  it('test_plx_eng_001_invariants_have_detection', () => {
    expect(invariantsMissingDetection()).toEqual([]) // none asserted in docs only
    expect(invariantHasDetection('PLX-INV-05')).toBe(true)
    for (const inv of Object.keys(INVARIANT_DETECTION_TESTS)) expect(INVARIANT_DETECTION_TESTS[inv].length).toBeGreaterThan(0)
  })
})

describe('plx_eng_011 / plx_eng_012 — event contract + replay tests exist and pass', () => {
  it('test_plx_eng_011_produced_event_validates_against_its_contract', () => {
    const es = createEventStore(memSqlDb())
    const evt = es.append({ eventType: 'DeskUpdated', category: 'user', actor: 'u', organisationId: 'org', objectId: 'd1', currentState: { title: 'x', status: 'open' }, changeSummary: 'c' })
    expect(validateEvent(evt).valid).toBe(true) // producer conforms to the published contract
  })
  it('test_plx_eng_012_replay_reproduces_identical_derived_state', () => {
    const liveDb = memSqlDb()
    const events = createEventStore(liveDb)
    const live = createRelationshipStore(liveDb, undefined, events)
    const input: ProposeInput = { organisationId: 'org', sourceEntityId: 'A', targetEntityId: 'B', relationshipType: 'RelatedTo', confidence: 1, evidence: [{ kind: 'event', ref: 'e', excerpt: null, weight: 1 }], discoveryMethod: 'user', correlationId: 'c', confirmedBy: 'u' }
    const r = live.propose(input)
    live.confirm(r.id, 'u')
    const rebuiltDb = memSqlDb()
    rebuildRelationshipGraph(liveDb, rebuiltDb)
    expect(createRelationshipStore(rebuiltDb).get(r.id)?.state).toBe('confirmed') // identical derived state
  })
})
