// Event JSON-Schema registry and validator (spec §64, PLX-EVT-043/044). Every
// Event type has a published, versioned schema at a stable dataschema URI, and
// events are validated against it. The test suite is the CI gate: it asserts every
// type the app produces has a schema and that representative events conform, so a
// new producer that emits an unschema'd or malformed Event fails the build.
//
// The validator is a small, dependency-free subset of JSON Schema (type, required,
// properties, enum, items, additionalProperties) — enough for the Event contract,
// with no native or third-party dependency to compile for Electron.

import { EVENT_CATEGORIES } from '../../shared/events'

export interface JsonSchema {
  type?: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null'
  required?: string[]
  properties?: Record<string, JsonSchema>
  items?: JsonSchema
  enum?: unknown[]
  additionalProperties?: boolean // default true (tolerant of unknown fields, DOM-012)
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

const SCHEMA_BASE = 'https://schemas.plexi.dev/events'

// A stable, versioned dataschema URI for an Event type (PLX-EVT-043), consistent
// with the CloudEvents dataschema attribute emitted by toCloudEvent.
export function dataschemaUri(eventType: string, version = 1): string {
  return `${SCHEMA_BASE}/${eventType}.v${version}.json`
}

function typeOf(v: unknown): string {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  if (Number.isInteger(v)) return 'integer'
  return typeof v
}

function matchesType(v: unknown, t: NonNullable<JsonSchema['type']>): boolean {
  const actual = typeOf(v)
  if (t === 'number') return actual === 'number' || actual === 'integer'
  if (t === 'object') return actual === 'object'
  return actual === t
}

export function validate(schema: JsonSchema, data: unknown, path = '$'): ValidationResult {
  const errors: string[] = []
  if (schema.type && !matchesType(data, schema.type)) {
    errors.push(`${path}: expected ${schema.type}, got ${typeOf(data)}`)
    return { valid: false, errors } // no point recursing on a type mismatch
  }
  if (schema.enum && !schema.enum.includes(data)) {
    errors.push(`${path}: ${JSON.stringify(data)} not in enum ${JSON.stringify(schema.enum)}`)
  }
  if (schema.type === 'object' && data && typeof data === 'object') {
    const obj = data as Record<string, unknown>
    for (const req of schema.required ?? []) {
      if (!(req in obj) || obj[req] === undefined) errors.push(`${path}.${req}: required`)
    }
    for (const [k, v] of Object.entries(obj)) {
      const sub = schema.properties?.[k]
      if (sub) errors.push(...validate(sub, v, `${path}.${k}`).errors)
      else if (schema.additionalProperties === false) errors.push(`${path}.${k}: additional property not allowed`)
    }
  }
  if (schema.type === 'array' && Array.isArray(data) && schema.items) {
    data.forEach((el, i) => errors.push(...validate(schema.items!, el, `${path}[${i}]`).errors))
  }
  return { valid: errors.length === 0, errors }
}

// ── Registry ─────────────────────────────────────────────────────────────────

interface SchemaEntry {
  eventType: string
  version: number
  schema: JsonSchema
  uri: string
}
const REGISTRY = new Map<string, SchemaEntry>()
const key = (t: string, v: number): string => `${t}@${v}`

// Register a data schema for an Event type version. A version is never redefined in
// place — a breaking change is a new version (PLX-EVT-044).
export function registerEventSchema(eventType: string, version: number, schema: JsonSchema): SchemaEntry {
  if (REGISTRY.has(key(eventType, version))) {
    throw new Error(`Schema for ${eventType} v${version} already exists; publish a new version, do not redefine (PLX-EVT-044).`)
  }
  const entry: SchemaEntry = { eventType, version, schema, uri: dataschemaUri(eventType, version) }
  REGISTRY.set(key(eventType, version), entry)
  return entry
}
export function eventSchemaFor(eventType: string, version = 1): SchemaEntry | undefined {
  return REGISTRY.get(key(eventType, version))
}
export function registeredEventTypes(): string[] {
  return [...new Set([...REGISTRY.values()].map((e) => e.eventType))]
}

// The envelope every Event shares, validated for all types (PLX-EVT-023 category on
// the wire; PLX-EVT-011 correlationId present).
export const ENVELOPE_SCHEMA: JsonSchema = {
  type: 'object',
  required: ['id', 'eventType', 'category', 'actor', 'organisationId', 'timestamp', 'recordedAt', 'sequence', 'correlationId'],
  properties: {
    id: { type: 'string' },
    eventType: { type: 'string' },
    schemaVersion: { type: 'integer' },
    category: { type: 'string', enum: [...EVENT_CATEGORIES] },
    actor: { type: 'string' },
    organisationId: { type: 'string' },
    timestamp: { type: 'string' },
    recordedAt: { type: 'string' },
    sequence: { type: 'integer' },
    correlationId: { type: 'string' }
  },
  additionalProperties: true
}

// Validate an Event: its envelope, then its data payload against the registered
// schema for its type and version. An unregistered type is a failure (a producer
// must publish a schema, PLX-EVT-043).
export function validateEvent(event: {
  eventType: string
  schemaVersion?: number
  currentState?: unknown
  [k: string]: unknown
}): ValidationResult {
  const errors = validate(ENVELOPE_SCHEMA, event).errors
  const version = event.schemaVersion ?? 1
  const entry = eventSchemaFor(event.eventType, version)
  if (!entry) {
    errors.push(`no published schema for ${event.eventType} v${version} (PLX-EVT-043)`)
    return { valid: false, errors }
  }
  errors.push(...validate(entry.schema, event.currentState ?? {}, '$.currentState').errors)
  return { valid: errors.length === 0, errors }
}

// ── Published schemas for every Event type the app produces ───────────────────
// If a producer emits a type not covered here, the coverage test fails.

const s = (required: string[], properties: Record<string, JsonSchema> = {}): JsonSchema => ({
  type: 'object',
  required,
  properties,
  additionalProperties: true // tolerant of payload growth (DOM-012)
})

// Node (Room/Desk) lifecycle.
registerEventSchema('RoomCreated', 1, s(['title', 'kind']))
registerEventSchema('DeskCreated', 1, s(['title', 'kind']))
registerEventSchema('DeskUpdated', 1, s(['title', 'status']))
registerEventSchema('DeskCompleted', 1, s(['title', 'status']))
registerEventSchema('DeskDeleted', 1, s(['trashed'], { trashed: { type: 'boolean' } }))
// Relationship lifecycle (full snapshot under `relationship`).
for (const t of ['RelationshipProposed', 'RelationshipConfirmed', 'RelationshipRejected', 'RelationshipConfidenceChanged']) {
  registerEventSchema(t, 1, s(['relationship'], { relationship: { type: 'object' } }))
}
// Context / materiality / decisions / AI / privacy.
registerEventSchema('ContextHealthChanged', 1, s(['healthState'], { healthState: { type: 'string' } }))
registerEventSchema('MaterialityScored', 1, s(['score', 'band'], { score: { type: 'number' }, band: { type: 'string' } }))
registerEventSchema('MaterialityWeightsRetuned', 1, s(['version'], { version: { type: 'string' } }))
registerEventSchema('DecisionSuperseded', 1, s(['state'], { state: { type: 'string' } }))
registerEventSchema('AiChangeProposed', 1, s(['proposal', 'requiresConfirmation'], { requiresConfirmation: { type: 'boolean' } }))
registerEventSchema('SubjectErased', 1, s(['subjectId', 'mechanism'], { subjectId: { type: 'string' }, mechanism: { type: 'string' } }))

// The canonical list of types the app produces. Kept in step with the emitters; the
// coverage test asserts every one has a registered schema (PLX-EVT-043 CI gate).
export const PRODUCED_EVENT_TYPES = [
  'RoomCreated', 'DeskCreated', 'DeskUpdated', 'DeskCompleted', 'DeskDeleted',
  'RelationshipProposed', 'RelationshipConfirmed', 'RelationshipRejected', 'RelationshipConfidenceChanged',
  'ContextHealthChanged', 'MaterialityScored', 'MaterialityWeightsRetuned', 'DecisionSuperseded',
  'AiChangeProposed', 'SubjectErased'
] as const
