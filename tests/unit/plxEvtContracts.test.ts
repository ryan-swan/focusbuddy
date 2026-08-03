import { describe, it, expect } from 'vitest'
import {
  EVENT_CATEGORIES,
  isValidEventTypeName,
  assertEventTypeName,
  wireType,
  toCloudEvent,
  assertPayloadWithinCeiling,
  MAX_EVENT_PAYLOAD_BYTES,
  partitionKey,
  type PlexiEvent
} from '../../src/shared/events'

// Event contract layer (spec §35, §64). Traceability anchors for the pure,
// DB-free requirements: envelope, naming, categories, size ceiling, partitioning.

function sampleEvent(over: Partial<PlexiEvent> = {}): PlexiEvent {
  return {
    id: '018f3c2a-7b41-7c9e-9f2d-3a1b5c8d4e6f',
    eventType: 'ObjectUpdated',
    schemaVersion: 1,
    category: 'user',
    timestamp: '2026-07-29T04:15:22.481Z',
    recordedAt: '2026-07-29T04:15:22.612Z',
    actor: 'user:abc',
    organisationId: 'org-1',
    deskId: 'desk-1',
    objectId: 'obj-1',
    previousState: { title: 'A' },
    currentState: { title: 'B' },
    changeSummary: 'renamed',
    correlationId: 'corr-1',
    causationId: 'cause-1',
    source: '/plexi/org/org-1/service/desktop',
    sequence: 42,
    permissions: { grants: [{ principal: 'user:abc', capability: 'object.write' }] },
    confidence: null,
    metadata: {},
    ...over
  }
}

describe('plx_evt_040 — CloudEvents v1.0.2 envelope', () => {
  it('test_plx_evt_040_envelope: maps to CloudEvents with Plexi extension attributes', () => {
    const ce = toCloudEvent(sampleEvent(), 'object', 'updated')
    expect(ce.specversion).toBe('1.0')
    expect(ce.type).toBe('com.plexi.object.updated.v1')
    expect(ce.datacontenttype).toBe('application/json')
    expect(ce.dataschema).toBe('https://schemas.plexi.dev/events/object.updated.v1.json')
    expect(ce.subject).toBe('object/obj-1')
    // §64.1 plexi* extension attributes, lowercase.
    expect(ce.plexiorganisationid).toBe('org-1')
    expect(ce.plexideskid).toBe('desk-1')
    expect(ce.plexicategory).toBe('user')
    expect(ce.plexisequence).toBe(42)
    expect(ce.id).toBe(sampleEvent().id)
  })
  it('test_plx_evt_013_time_split: envelope keeps occurrence time and ingestion time distinct', () => {
    const ce = toCloudEvent(sampleEvent(), 'object', 'updated')
    expect(ce.time).toBe('2026-07-29T04:15:22.481Z') // occurrence
    expect(ce.plexirecordedat).toBe('2026-07-29T04:15:22.612Z') // ingestion
    expect(ce.time).not.toBe(ce.plexirecordedat)
  })
  it('test_plx_evt_011_causality: envelope carries correlation and causation ids', () => {
    const ce = toCloudEvent(sampleEvent(), 'object', 'updated')
    expect(ce.plexicorrelationid).toBe('corr-1')
    expect(ce.plexicausationid).toBe('cause-1')
  })
  it('test_plx_evt_012_permissions: envelope carries the permission snapshot', () => {
    const ce = toCloudEvent(sampleEvent(), 'object', 'updated')
    expect(ce.data.permissions.grants[0]).toEqual({ principal: 'user:abc', capability: 'object.write' })
  })
})

describe('plx_evt_041 — past-tense event naming', () => {
  it('test_plx_evt_041_accepts_past_tense', () => {
    for (const n of ['DeskCreated', 'ObjectShared', 'DecisionApproved', 'RelationshipDiscovered', 'ResumeGenerated', 'AgentCompletedTask', 'SpreadsheetUpdated']) {
      expect(isValidEventTypeName(n)).toBe(true)
    }
  })
  it('test_plx_evt_041_rejects_commands', () => {
    for (const n of ['CreateDesk', 'UpdateDocument', 'ModifyRelationship', 'DeleteObject', 'AddRow']) {
      expect(isValidEventTypeName(n)).toBe(false)
    }
    expect(() => assertEventTypeName('CreateDesk')).toThrow(/PLX-EVT-041/)
  })
  it('test_plx_evt_041_wire_type: reverse-DNS with version suffix', () => {
    expect(wireType('object', 'updated', 2)).toBe('com.plexi.object.updated.v2')
  })
})

describe('plx_evt_023 — categories', () => {
  it('test_plx_evt_023_eight_categories_on_wire', () => {
    expect(EVENT_CATEGORIES).toHaveLength(8)
    expect(EVENT_CATEGORIES).toContain('security')
    expect(toCloudEvent(sampleEvent({ category: 'ai' }), 'object', 'updated').plexicategory).toBe('ai')
  })
})

describe('plx_evt_036 — payload ceiling', () => {
  it('test_plx_evt_036_rejects_oversized', () => {
    const big = { blob: 'x'.repeat(MAX_EVENT_PAYLOAD_BYTES + 1) }
    expect(() => assertPayloadWithinCeiling(sampleEvent({ currentState: big }))).toThrow(/PLX-EVT-036/)
  })
  it('test_plx_evt_036_allows_small', () => {
    expect(() => assertPayloadWithinCeiling(sampleEvent())).not.toThrow()
  })
})

describe('plx_evt_022 — partition key', () => {
  it('test_plx_evt_022_partition_key_selection', () => {
    expect(partitionKey({ deskId: 'd', objectId: 'o', organisationId: 'org' })).toBe('d')
    expect(partitionKey({ deskId: null, objectId: 'o', organisationId: 'org' })).toBe('o')
    expect(partitionKey({ deskId: null, objectId: null, organisationId: 'org' })).toBe('org')
  })
})
