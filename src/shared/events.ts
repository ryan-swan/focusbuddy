// Plexi event contracts (spec §35 Event Entity, §64 Event Contracts).
//
// This is the pure, DB-free contract layer: the canonical Event shape, the eight
// event categories (§48.2), the past-tense naming rule (§64.2), the payload-size
// ceiling, and the mapping to a CloudEvents v1.0.2 envelope with the Plexi
// extension attributes (§64.1). The append-only store that persists these lives
// in src/main/db/eventStore.ts.

// ── Categories (§48.2, PLX-EVT-023) ───────────────────────────────────────────
export const EVENT_CATEGORIES = [
  'user',
  'system',
  'workflow',
  'ai',
  'integration',
  'security',
  'administrative',
  'lifecycle'
] as const
export type EventCategory = (typeof EVENT_CATEGORIES)[number]

// A permission snapshot carried on every Event so replay evaluates access against
// the permissions of the time, not of today (PLX-EVT-012).
export interface PermissionSnapshot {
  // Principal ids and the capability they held at emission. Kept deliberately
  // small; large ACLs are referenced, not inlined.
  grants: Array<{ principal: string; capability: string }>
  ref?: string // optional pointer to a full PermissionSet record
}

// A large state payload carried as a content digest, never inline (PLX-EVT-045).
export interface DigestRef {
  $digest: string // "sha256:<hex>"
}
export type StatePayload = Record<string, unknown> | DigestRef | null

// The canonical Event (spec §35). id is a UUIDv7 (PLX-DOM-010). timestamp is
// occurrence time; recordedAt is ingestion time (PLX-EVT-013). sequence is
// monotonic within the partition (PLX-EVT-022) and assigned by the store.
export interface PlexiEvent {
  id: string
  eventType: string // PascalCase, past tense, e.g. "ObjectUpdated"
  schemaVersion: number
  category: EventCategory
  timestamp: string // RFC 3339 UTC, occurrence time
  recordedAt: string // ingestion time
  actor: string // e.g. "user:<id>" | "agent:<id>" | "system"
  organisationId: string
  deskId: string | null
  objectId: string | null
  previousState: StatePayload
  currentState: StatePayload
  changeSummary: string | null
  correlationId: string
  causationId: string | null
  source: string // URI-reference identifying the emitter
  sequence: number
  permissions: PermissionSnapshot
  confidence: number | null
  metadata: Record<string, unknown>
}

// ── Payload size ceiling (PLX-EVT-036) ────────────────────────────────────────
// Events are metadata about change, not blob transport. Oversized Events are
// rejected, never truncated. Large state must already be a DigestRef by here.
export const MAX_EVENT_PAYLOAD_BYTES = 64 * 1024
// State larger than this is externalised to a content-addressed blob and carried
// as a DigestRef (see eventStore.ts).
export const INLINE_STATE_THRESHOLD_BYTES = 8 * 1024

export function byteLength(value: unknown): number {
  return new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value ?? null)).length
}

export function isDigestRef(v: unknown): v is DigestRef {
  return !!v && typeof v === 'object' && typeof (v as DigestRef).$digest === 'string'
}

/** Throw if the event's wire payload exceeds the ceiling (PLX-EVT-036). */
export function assertPayloadWithinCeiling(evt: Pick<PlexiEvent, 'previousState' | 'currentState' | 'metadata' | 'changeSummary'>): void {
  const bytes = byteLength({
    previousState: evt.previousState,
    currentState: evt.currentState,
    metadata: evt.metadata,
    changeSummary: evt.changeSummary
  })
  if (bytes > MAX_EVENT_PAYLOAD_BYTES) {
    throw new Error(`Event payload ${bytes}B exceeds the ${MAX_EVENT_PAYLOAD_BYTES}B ceiling (PLX-EVT-036). Carry large state as a content digest.`)
  }
}

// ── Naming (§64.2, PLX-EVT-041) ───────────────────────────────────────────────
// Events are facts: past tense only. Command-shaped names are rejected.
const COMMAND_VERBS = new Set([
  'create', 'update', 'delete', 'modify', 'add', 'remove', 'set', 'edit',
  'make', 'change', 'move', 'rename', 'get', 'fetch', 'apply', 'send'
])

// Irregular past-tense verbs whose form does not end in -ed/-en (safety net; the
// common case is -ed/-en). Some double as nouns, which is fine: they only need to
// mark a name as past-tense-capable, and the command-verb check below is what
// actually rejects imperative names.
const IRREGULAR_PAST = ['sent', 'built', 'made', 'ran', 'began', 'left', 'lost', 'found', 'shown', 'undone', 'redone', 'read', 'set', 'put', 'won', 'met', 'held', 'told', 'sold', 'kept']

/** Validate a PascalCase event type name is past-tense, not command-shaped. */
export function isValidEventTypeName(name: string): boolean {
  if (!/^[A-Z][A-Za-z0-9]+$/.test(name)) return false
  const words = (name.match(/[A-Z][a-z0-9]*/g) ?? []).map((w) => w.toLowerCase())
  if (words.length === 0) return false
  // Reject imperative/command shapes by their leading verb (CreateDesk, UpdateObject).
  if (COMMAND_VERBS.has(words[0])) return false
  // A past-tense verb may appear anywhere (e.g. AgentCompletedTask); require at least one.
  return words.some((w) => /(ed|en)$/.test(w) || IRREGULAR_PAST.includes(w))
}

export function assertEventTypeName(name: string): void {
  if (!isValidEventTypeName(name)) {
    throw new Error(`Event type "${name}" is not a valid past-tense event name (PLX-EVT-041). Use e.g. "ObjectUpdated", not "UpdateObject".`)
  }
}

/** Reverse-DNS wire type with a version suffix (§64.2): com.plexi.<agg>.<verb>.v<n>. */
export function wireType(aggregate: string, pastTenseVerb: string, version = 1): string {
  return `com.plexi.${aggregate.toLowerCase()}.${pastTenseVerb.toLowerCase()}.v${version}`
}

// The partition an Event orders within (PLX-EVT-022): deskId for Desk-scoped,
// objectId for Object-scoped, else the organisation.
export function partitionKey(evt: Pick<PlexiEvent, 'deskId' | 'objectId' | 'organisationId'>): string {
  return evt.deskId ?? evt.objectId ?? evt.organisationId
}

// ── CloudEvents v1.0.2 envelope (§64.1, PLX-EVT-040) ──────────────────────────
export interface CloudEvent {
  specversion: '1.0'
  id: string
  source: string
  type: string
  time: string
  subject: string
  datacontenttype: 'application/json'
  dataschema: string
  plexiorganisationid: string
  plexideskid: string | null
  plexiobjectid: string | null
  plexiactor: string
  plexicorrelationid: string
  plexicausationid: string | null
  plexicategory: EventCategory
  plexisequence: number
  plexirecordedat: string
  plexischemaversion: number
  data: {
    previousState: StatePayload
    currentState: StatePayload
    changeSummary: string | null
    permissions: PermissionSnapshot
    confidence: number | null
    metadata: Record<string, unknown>
  }
}

const SCHEMA_BASE = 'https://schemas.plexi.dev/events'

/** Map a stored PlexiEvent to its CloudEvents v1.0.2 wire envelope. */
export function toCloudEvent(evt: PlexiEvent, aggregate: string, pastTenseVerb: string): CloudEvent {
  return {
    specversion: '1.0',
    id: evt.id,
    source: evt.source,
    type: wireType(aggregate, pastTenseVerb, evt.schemaVersion),
    time: evt.timestamp,
    subject: evt.objectId ? `object/${evt.objectId}` : evt.deskId ? `desk/${evt.deskId}` : `org/${evt.organisationId}`,
    datacontenttype: 'application/json',
    dataschema: `${SCHEMA_BASE}/${aggregate.toLowerCase()}.${pastTenseVerb.toLowerCase()}.v${evt.schemaVersion}.json`,
    plexiorganisationid: evt.organisationId,
    plexideskid: evt.deskId,
    plexiobjectid: evt.objectId,
    plexiactor: evt.actor,
    plexicorrelationid: evt.correlationId,
    plexicausationid: evt.causationId,
    plexicategory: evt.category,
    plexisequence: evt.sequence,
    plexirecordedat: evt.recordedAt,
    plexischemaversion: evt.schemaVersion,
    data: {
      previousState: evt.previousState,
      currentState: evt.currentState,
      changeSummary: evt.changeSummary,
      permissions: evt.permissions,
      confidence: evt.confidence,
      metadata: evt.metadata
    }
  }
}
