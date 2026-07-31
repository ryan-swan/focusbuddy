import { describe, it, expect } from 'vitest'
import { memSqlDb } from './_memdb'
import { createEventStore } from '../../src/main/db/eventStore'
import {
  validate,
  validateEvent,
  registerEventSchema,
  eventSchemaFor,
  dataschemaUri,
  PRODUCED_EVENT_TYPES,
  ENVELOPE_SCHEMA,
  type JsonSchema
} from '../../src/main/db/eventSchemas'

// Event JSON-Schema registry + validation (spec §64, PLX-EVT-043/044).

describe('plx_evt_043 — every produced Event type has a published, versioned schema', () => {
  it('test_plx_evt_043_producer_coverage', () => {
    // The CI gate: a producer emitting a type with no schema fails here.
    for (const t of PRODUCED_EVENT_TYPES) {
      const entry = eventSchemaFor(t, 1)
      expect(entry, `no schema for produced type ${t}`).toBeTruthy()
      expect(entry!.uri).toBe(dataschemaUri(t, 1)) // stable, versioned URI
      expect(entry!.uri).toContain('.v1.json')
    }
  })

  it('test_plx_evt_043_real_event_validates_and_malformed_fails', () => {
    const es = createEventStore(memSqlDb())
    const good = es.append({
      eventType: 'DeskUpdated', category: 'user', actor: 'u', organisationId: 'org', deskId: 'd1', objectId: 'd1',
      currentState: { title: 'Q3', status: 'open' }, changeSummary: 'x'
    })
    expect(validateEvent(good)).toEqual({ valid: true, errors: [] })
    // A DeskUpdated missing the required `status` in its payload fails.
    const bad = { ...good, currentState: { title: 'Q3' } }
    const r = validateEvent(bad)
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => e.includes('status'))).toBe(true)
  })

  it('test_plx_evt_043_widget_object_events_validate', () => {
    // Widgets are first-class Context-Engine producers (PLX-APP-002); their
    // lifecycle Events must validate against published schemas.
    const es = createEventStore(memSqlDb())
    const created = es.append({
      eventType: 'WidgetCreated', category: 'user', actor: 'u', organisationId: 'org', deskId: 'd1', objectId: 'w1',
      currentState: { kind: 'sticky', title: 'Note' }, changeSummary: 'Added sticky'
    })
    expect(validateEvent(created)).toEqual({ valid: true, errors: [] })
    const deleted = es.append({
      eventType: 'WidgetDeleted', category: 'user', actor: 'u', organisationId: 'org', deskId: 'd1', objectId: 'w1',
      currentState: { kind: 'sticky', trashed: true }, changeSummary: 'Removed sticky'
    })
    expect(validateEvent(deleted)).toEqual({ valid: true, errors: [] })
    // A WidgetCreated missing its required `kind` fails.
    const bad = { ...created, currentState: { title: 'Note' } }
    expect(validateEvent(bad).valid).toBe(false)
  })

  it('test_plx_evt_043_unregistered_type_is_a_failure', () => {
    const r = validateEvent({ id: 'e', eventType: 'TotallyNewThing', category: 'user', actor: 'u', organisationId: 'o', timestamp: 't', recordedAt: 't', sequence: 1, correlationId: 'c', currentState: {} })
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => e.includes('no published schema') && e.includes('PLX-EVT-043'))).toBe(true)
  })
})

describe('plx_evt_044 — a schema version is never redefined in place', () => {
  it('test_plx_evt_044_duplicate_schema_rejected', () => {
    expect(() => registerEventSchema('DeskUpdated', 1, { type: 'object' })).toThrow(/PLX-EVT-044/)
    // A new version is allowed (a breaking change publishes a new version).
    expect(() => registerEventSchema('DeskUpdated', 2, { type: 'object' })).not.toThrow()
  })
})

describe('the validator subset behaves', () => {
  it('test_validator_type_required_enum_additional', () => {
    const schema: JsonSchema = {
      type: 'object',
      required: ['name', 'kind'],
      properties: { name: { type: 'string' }, kind: { type: 'string', enum: ['a', 'b'] }, n: { type: 'number' } },
      additionalProperties: false
    }
    expect(validate(schema, { name: 'x', kind: 'a', n: 3 }).valid).toBe(true)
    expect(validate(schema, { name: 'x' }).errors.some((e) => e.includes('kind'))).toBe(true) // required
    expect(validate(schema, { name: 5, kind: 'a' }).errors.some((e) => e.includes('expected string'))).toBe(true) // type
    expect(validate(schema, { name: 'x', kind: 'z' }).errors.some((e) => e.includes('enum'))).toBe(true) // enum
    expect(validate(schema, { name: 'x', kind: 'a', extra: 1 }).errors.some((e) => e.includes('additional'))).toBe(true)
  })
  it('test_envelope_requires_category_enum', () => {
    // A bogus category is rejected by the shared envelope (EVT-023 category on wire).
    const bad = { id: 'e', eventType: 'DeskUpdated', category: 'nonsense', actor: 'u', organisationId: 'o', timestamp: 't', recordedAt: 't', sequence: 1, correlationId: 'c' }
    expect(validate(ENVELOPE_SCHEMA, bad).errors.some((e) => e.includes('category'))).toBe(true)
  })
})
