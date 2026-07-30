import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerUpcaster,
  currentSchemaVersion,
  upcastData,
  upcastEvent,
  _clearUpcasters
} from '../../src/main/db/upcasting'
import type { PlexiEvent } from '../../src/shared/events'

// Event schema evolution / upcasting (spec §64, ADR-0004). Read-time, versioned,
// chained, never fabricating absence.

beforeEach(() => _clearUpcasters())

// An archived fixture: a DeskUpdated Event exactly as it was written under v1, with
// only the fields v1 had. This is the "tested against archived fixtures" of
// PLX-EVT-035 — if a later refactor breaks reading it, this test fails.
const V1_DESK_UPDATED = { title: 'Q3 plan', status: 'open' }

describe('plx_evt_035 — read-time upcasting interprets every historical version', () => {
  it('test_plx_evt_035_chained_upcast_v1_to_v3', () => {
    // v1 -> v2 adds `priority` with a truthful universal default (new field, all
    // desks start at normal priority). v2 -> v3 renames status open -> active.
    registerUpcaster('DeskUpdated', 1, (d) => ({ ...d, priority: 'normal' }))
    registerUpcaster('DeskUpdated', 2, (d) => ({ ...d, status: d.status === 'open' ? 'active' : d.status }))
    expect(currentSchemaVersion('DeskUpdated')).toBe(3)
    const upcast = upcastData('DeskUpdated', { ...V1_DESK_UPDATED }, 1)
    expect(upcast).toEqual({ title: 'Q3 plan', status: 'active', priority: 'normal' })
  })

  it('test_plx_evt_035_missing_step_is_an_error_not_a_silent_gap', () => {
    registerUpcaster('DeskUpdated', 2, (d) => d) // a v2->v3 exists but no v1->v2
    // Reading a v1 Event with no v1->v2 upcaster must throw, not silently drop it.
    expect(() => upcastData('DeskUpdated', { ...V1_DESK_UPDATED }, 1)).toThrow(/PLX-EVT-035/)
  })
})

describe('never fabricate absence (ADR-0004, no-fakery over time)', () => {
  it('test_upcast_exposes_absence_rather_than_inventing', () => {
    // A v1 Event never recorded `assignee`. The upcaster must not invent one; it
    // surfaces the field as null (absent), not a plausible guess.
    registerUpcaster('DeskUpdated', 1, (d) => ({ ...d, assignee: d.assignee ?? null }))
    const upcast = upcastData('DeskUpdated', { ...V1_DESK_UPDATED }, 1)
    expect(upcast.assignee).toBeNull()
    expect(upcast).not.toHaveProperty('assignee', 'someone')
  })
})

describe('plx_evt_044 — a version is never redefined in place', () => {
  it('test_plx_evt_044_duplicate_registration_rejected', () => {
    registerUpcaster('DeskUpdated', 1, (d) => ({ ...d, a: 1 }))
    expect(() => registerUpcaster('DeskUpdated', 1, (d) => ({ ...d, a: 2 }))).toThrow(/PLX-EVT-044/)
    // A different fromVersion is a new upcaster, which is fine.
    expect(() => registerUpcaster('DeskUpdated', 2, (d) => d)).not.toThrow()
  })
})

describe('plx_dom_012 — schemaVersion carried; readers tolerate unknown fields', () => {
  it('test_plx_dom_012_upcast_event_sets_version_and_preserves_unknowns', () => {
    registerUpcaster('DeskUpdated', 1, (d) => ({ ...d, priority: 'normal' }))
    const stored: PlexiEvent = {
      id: 'e1', eventType: 'DeskUpdated', schemaVersion: 1, category: 'user', timestamp: '', recordedAt: '',
      actor: 'u', organisationId: 'org', deskId: 'd1', objectId: 'd1',
      previousState: null, currentState: { title: 'X', status: 'open', legacyExtra: 'kept' },
      changeSummary: null, correlationId: 'c', causationId: null, source: 'app', sequence: 1,
      permissions: { grants: [] }, confidence: null, metadata: {}
    } as unknown as PlexiEvent
    const view = upcastEvent(stored)
    expect(view.schemaVersion).toBe(2) // upcast to current
    const cs = view.currentState as Record<string, unknown>
    expect(cs.priority).toBe('normal') // new field added
    expect(cs.legacyExtra).toBe('kept') // unknown/legacy field tolerated, not dropped
    // An Event already at the current version is returned unchanged.
    expect(upcastEvent({ ...stored, schemaVersion: 2 } as PlexiEvent).schemaVersion).toBe(2)
  })
})
