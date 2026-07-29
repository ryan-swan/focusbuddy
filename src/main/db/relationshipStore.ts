// Relationship store (spec §36, REQ-GPH) — provenance-carrying edges of the
// knowledge graph. Every edge is written with evidence (rejected at write time
// otherwise, PLX-GPH-001), a discovery method and a lifecycle state. Only
// confirmed edges are returned for retrieval/propagation (PLX-GPH-002); rejected
// edges are retained and never re-proposed on identical evidence (PLX-GPH-005);
// a confirmed edge whose confidence drops below the tenant threshold reverts to
// provisional (PLX-GPH-003). Types are constrained to the closed registry
// (PLX-GPH-020) and every write carries its originating correlationId
// (PLX-GPH-022). Driver-agnostic (see SqlDb).

import { plexiId } from '../../shared/plexiId'
import type { AppendInput, EventStore, SqlDb } from './eventStore'
import {
  evidenceKey,
  initialState,
  isRelationshipType,
  RELATIONSHIP_CONFIDENCE_THRESHOLD,
  type DiscoveryMethod,
  type Relationship,
  type RelationshipEvidence,
  type RelationshipState,
  type RelationshipTypeId
} from '../../shared/relationship'
import type { PermissionSnapshot } from '../../shared/events'
import { edgeCrossable, type CanRead, type Principal } from '../../shared/permission'

export interface ProposeInput {
  organisationId: string
  sourceEntityId: string
  sourceEntityType?: string
  targetEntityId: string
  targetEntityType?: string
  relationshipType: string
  directed?: boolean
  strength?: number
  confidence: number
  evidence: RelationshipEvidence[]
  discoveryMethod: DiscoveryMethod
  permissionScope?: PermissionSnapshot
  correlationId: string
  confirmedBy?: string | null
}

export interface RelationshipStore {
  propose: (input: ProposeInput) => Relationship
  confirm: (id: string, actor: string) => Relationship | null
  reject: (id: string, actor: string) => Relationship | null
  recomputeConfidence: (id: string, newConfidence: number) => Relationship | null
  activeFor: (entityId: string) => Relationship[]
  // Permission-filtered confirmed neighbours (PLX-GPH-010/021, INV-06): only edges
  // whose far endpoint the principal may read and whose scope it satisfies. Unread-
  // able neighbours are omitted BEFORE the caller derives any count, so their
  // existence never leaks through counts or distances.
  activeForPrincipal: (entityId: string, principal: Principal, canRead: CanRead) => Relationship[]
  get: (id: string) => Relationship | null
  all: () => Relationship[]
  organisationId: string | null
  db: SqlDb
}

export function ensureRelationshipSchema(db: SqlDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS relationships (
      id TEXT PRIMARY KEY,
      organisation_id TEXT NOT NULL,
      source_entity_id TEXT NOT NULL,
      source_entity_type TEXT NOT NULL,
      target_entity_id TEXT NOT NULL,
      target_entity_type TEXT NOT NULL,
      relationship_type TEXT NOT NULL,
      directed INTEGER NOT NULL DEFAULT 1,
      strength REAL NOT NULL DEFAULT 0.5,
      confidence REAL NOT NULL,
      state TEXT NOT NULL,
      evidence TEXT NOT NULL,
      evidence_key TEXT NOT NULL,
      discovery_method TEXT NOT NULL,
      permission_scope TEXT NOT NULL,
      correlation_id TEXT NOT NULL,
      confirmed_by TEXT,
      confirmed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_rel_source ON relationships(source_entity_id, state);
    CREATE INDEX IF NOT EXISTS idx_rel_target ON relationships(target_entity_id, state);
    CREATE INDEX IF NOT EXISTS idx_rel_dedupe ON relationships(source_entity_id, target_entity_id, relationship_type, evidence_key);
  `)
}

// In production the Context Engine binds this to getActiveOrgId(), so every read is
// hardcoded to a single organisation and a cross-org result is impossible by
// construction (PLX-SEC-011 / GPH-011). An unbound store (organisationId omitted)
// is for single-organisation unit tests only.
// Relationship lifecycle event types. Each carries a FULL snapshot of the edge in
// currentState, so the graph is a projection fully rebuildable from these Events
// alone (PLX-DATA-002 / PLX-DATA-003). Names are past-tense per PLX-EVT-041.
export const RELATIONSHIP_EVENT_TYPES = [
  'RelationshipProposed',
  'RelationshipConfirmed',
  'RelationshipRejected',
  'RelationshipConfidenceChanged'
] as const

export function createRelationshipStore(
  db: SqlDb,
  organisationId?: string | (() => string | null),
  events?: EventStore
): RelationshipStore {
  ensureRelationshipSchema(db)
  // A live resolver, so a store bound in production tracks the active org even
  // across an org switch, rather than freezing the org it was constructed under.
  const resolveOrg: () => string | null =
    typeof organisationId === 'function' ? organisationId : () => organisationId ?? null
  const bound = organisationId != null
  const orgClause = bound ? ' AND organisation_id = ?' : ''
  const orgArg = (): unknown[] => (bound ? [resolveOrg()] : [])

  function rowToRel(r: Record<string, unknown>): Relationship {
    return {
      id: r.id as string,
      organisationId: r.organisation_id as string,
      sourceEntityId: r.source_entity_id as string,
      sourceEntityType: r.source_entity_type as string,
      targetEntityId: r.target_entity_id as string,
      targetEntityType: r.target_entity_type as string,
      relationshipType: r.relationship_type as RelationshipTypeId,
      directed: !!(r.directed as number),
      strength: r.strength as number,
      confidence: r.confidence as number,
      state: r.state as RelationshipState,
      evidence: JSON.parse(r.evidence as string) as RelationshipEvidence[],
      discoveryMethod: r.discovery_method as DiscoveryMethod,
      permissionScope: JSON.parse(r.permission_scope as string) as PermissionSnapshot,
      correlationId: r.correlation_id as string,
      confirmedBy: (r.confirmed_by as string) ?? null,
      confirmedAt: (r.confirmed_at as string) ?? null,
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string
    }
  }

  const get: RelationshipStore['get'] = (id) => {
    const row = db.prepare(`SELECT * FROM relationships WHERE id = ?${orgClause}`).get(id, ...orgArg()) as
      | Record<string, unknown>
      | undefined
    return row ? rowToRel(row) : null
  }

  // Write the edge (insert or overwrite). Used by every mutation and by rebuild.
  function persist(rel: Relationship): void {
    writeRelationshipRow(db, rel)
  }

  // Commit a mutation. When the store is event-sourced, the full-snapshot Event and
  // the row write commit together via the transactional outbox (PLX-EVT-014), so
  // the projection can always be rebuilt from the Event log (PLX-DATA-002).
  function commit(rel: Relationship, eventType: (typeof RELATIONSHIP_EVENT_TYPES)[number]): Relationship {
    if (events) {
      events.appendWithMutation(relationshipLifecycleEvent(eventType, rel), () => persist(rel))
    } else {
      persist(rel)
    }
    return rel
  }

  const propose: RelationshipStore['propose'] = (input) => {
    if (!input.evidence || input.evidence.length === 0) {
      throw new Error('A Relationship MUST carry at least one EvidenceRef (PLX-GPH-001).')
    }
    if (!isRelationshipType(input.relationshipType)) {
      throw new Error(`"${input.relationshipType}" is not in the closed relationship-type registry (PLX-GPH-020).`)
    }
    if (!input.correlationId) {
      throw new Error('A Relationship write MUST carry the originating correlationId (PLX-GPH-022).')
    }
    const key = evidenceKey(input.evidence)
    // Idempotent write: an edge with the same endpoints, type and evidence is
    // returned rather than duplicated. This makes graph writes idempotent with
    // respect to Event replay — replaying the originating Event never creates a
    // second node or edge (PLX-GPH-012) — and it subsumes the rule that a rejected
    // edge is never re-proposed on identical evidence (PLX-GPH-005).
    const priorEdge = db
      .prepare(
        `SELECT * FROM relationships WHERE source_entity_id = ? AND target_entity_id = ? AND relationship_type = ? AND evidence_key = ? LIMIT 1`
      )
      .get(input.sourceEntityId, input.targetEntityId, input.relationshipType, key) as Record<string, unknown> | undefined
    if (priorEdge) return rowToRel(priorEdge)

    const now = new Date().toISOString()
    const confirmedBy = input.confirmedBy ?? null
    const state = initialState(input.discoveryMethod, confirmedBy)
    const rel: Relationship = {
      id: plexiId(),
      organisationId: input.organisationId,
      sourceEntityId: input.sourceEntityId,
      sourceEntityType: input.sourceEntityType ?? 'object',
      targetEntityId: input.targetEntityId,
      targetEntityType: input.targetEntityType ?? 'object',
      relationshipType: input.relationshipType,
      directed: input.directed ?? true,
      strength: input.strength ?? 0.5,
      confidence: input.confidence,
      state,
      evidence: input.evidence,
      discoveryMethod: input.discoveryMethod,
      permissionScope: input.permissionScope ?? { grants: [] },
      correlationId: input.correlationId,
      confirmedBy: state === 'confirmed' ? confirmedBy : null,
      confirmedAt: state === 'confirmed' ? now : null,
      createdAt: now,
      updatedAt: now
    }
    return commit(rel, state === 'confirmed' ? 'RelationshipConfirmed' : 'RelationshipProposed')
  }

  const confirm: RelationshipStore['confirm'] = (id, actor) => {
    const rel = get(id)
    if (!rel || rel.state === 'rejected') return null
    const now = new Date().toISOString()
    return commit({ ...rel, state: 'confirmed', confirmedBy: actor, confirmedAt: now, updatedAt: now }, 'RelationshipConfirmed')
  }

  const reject: RelationshipStore['reject'] = (id, actor) => {
    const rel = get(id)
    if (!rel) return null
    const now = new Date().toISOString()
    // Retained, not deleted (PLX-GPH-005).
    return commit({ ...rel, state: 'rejected', confirmedBy: actor, updatedAt: now }, 'RelationshipRejected')
  }

  const recomputeConfidence: RelationshipStore['recomputeConfidence'] = (id, newConfidence) => {
    const rel = get(id)
    if (!rel || rel.state === 'rejected') return rel
    const now = new Date().toISOString()
    // A confirmed edge that falls below the threshold reverts to provisional (PLX-GPH-003).
    const nextState: RelationshipState = rel.state === 'confirmed' && newConfidence < RELATIONSHIP_CONFIDENCE_THRESHOLD ? 'provisional' : rel.state
    return commit({ ...rel, confidence: newConfidence, state: nextState, updatedAt: now }, 'RelationshipConfidenceChanged')
  }

  // Only CONFIRMED edges feed retrieval, propagation, resume and permissions
  // (PLX-GPH-002). Provisional and rejected edges are deliberately excluded. When
  // the store is org-bound, cross-org edges are excluded at the query (PLX-GPH-011).
  const activeFor: RelationshipStore['activeFor'] = (entityId) => {
    const rows = db
      .prepare(
        `SELECT * FROM relationships WHERE state = 'confirmed' AND (source_entity_id = ? OR target_entity_id = ?)${orgClause} ORDER BY strength DESC`
      )
      .all(entityId, entityId, ...orgArg()) as Record<string, unknown>[]
    return rows.map(rowToRel)
  }

  // Permission-filtered traversal: keep only edges the principal may cross —
  // same-org, far endpoint readable, edge scope satisfied (PLX-GPH-010/021,
  // INV-06). Filtering happens before the caller sees the set, so an unreadable
  // neighbour never contributes to a count or distance (no existence leak).
  const activeForPrincipal: RelationshipStore['activeForPrincipal'] = (entityId, principal, canRead) => {
    return activeFor(entityId).filter((r) => edgeCrossable(principal, entityId, r, canRead))
  }

  const all: RelationshipStore['all'] = () =>
    (db.prepare(`SELECT * FROM relationships${bound ? ' WHERE organisation_id = ?' : ''} ORDER BY created_at ASC`).all(...orgArg()) as Record<
      string,
      unknown
    >[]).map(rowToRel)

  return {
    propose,
    confirm,
    reject,
    recomputeConfidence,
    activeFor,
    activeForPrincipal,
    get,
    all,
    organisationId: bound ? resolveOrg() : null,
    db
  }
}

/** A RelationshipConfirmed event for the Event Store when an edge is promoted
 * to confirmed (PLX-PRD-052). Caller appends it via the event store. */
export function relationshipConfirmedEvent(rel: Relationship, actor: string): AppendInput {
  return {
    eventType: 'RelationshipConfirmed',
    category: 'system',
    actor,
    organisationId: rel.organisationId,
    objectId: rel.sourceEntityId,
    correlationId: rel.correlationId,
    currentState: { relationshipId: rel.id, type: rel.relationshipType, target: rel.targetEntityId, confidence: rel.confidence },
    changeSummary: `Relationship ${rel.relationshipType} confirmed`
  }
}

// Insert-or-overwrite a relationship row. Shared by live mutations and by rebuild,
// so a rebuilt projection is byte-for-byte the same shape as a live-written one.
function writeRelationshipRow(d: SqlDb, rel: Relationship): void {
  d.prepare(
    `INSERT OR REPLACE INTO relationships (id, organisation_id, source_entity_id, source_entity_type, target_entity_id,
      target_entity_type, relationship_type, directed, strength, confidence, state, evidence, evidence_key,
      discovery_method, permission_scope, correlation_id, confirmed_by, confirmed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    rel.id, rel.organisationId, rel.sourceEntityId, rel.sourceEntityType, rel.targetEntityId, rel.targetEntityType,
    rel.relationshipType, rel.directed ? 1 : 0, rel.strength, rel.confidence, rel.state, JSON.stringify(rel.evidence),
    evidenceKey(rel.evidence), rel.discoveryMethod, JSON.stringify(rel.permissionScope), rel.correlationId,
    rel.confirmedBy, rel.confirmedAt, rel.createdAt, rel.updatedAt
  )
}

// A lifecycle Event carrying a FULL snapshot of the edge, so the graph is a
// projection rebuildable from these Events alone (PLX-DATA-002 / PLX-DATA-003).
function relationshipLifecycleEvent(eventType: (typeof RELATIONSHIP_EVENT_TYPES)[number], rel: Relationship): AppendInput {
  return {
    eventType,
    category: 'system',
    actor: rel.confirmedBy ?? 'system',
    organisationId: rel.organisationId,
    objectId: rel.sourceEntityId,
    correlationId: rel.correlationId,
    currentState: { relationship: rel as unknown as Record<string, unknown> },
    changeSummary: `${eventType}: ${rel.relationshipType} ${rel.sourceEntityId} -> ${rel.targetEntityId}`
  }
}

// Rebuild the relationship graph projection from the Event Store alone (PLX-DATA-002).
// Reads every relationship lifecycle Event in ingestion order and replays its
// snapshot into a fresh relationships table. Because each Event carries the full
// post-state, the last Event per edge wins and the result equals the live graph.
// Proves the graph is a derived projection, not a system of record (PLX-DATA-003).
export function rebuildRelationshipGraph(sourceEventsDb: SqlDb, targetDb: SqlDb): { applied: number; edges: number } {
  ensureRelationshipSchema(targetDb)
  targetDb.exec('DELETE FROM relationships')
  const placeholders = RELATIONSHIP_EVENT_TYPES.map(() => '?').join(',')
  const rows = sourceEventsDb
    .prepare(`SELECT current_state FROM events WHERE event_type IN (${placeholders}) ORDER BY rowid ASC`)
    .all(...RELATIONSHIP_EVENT_TYPES) as Array<{ current_state: string }>
  let applied = 0
  for (const row of rows) {
    const state = JSON.parse(row.current_state) as { relationship?: Relationship }
    if (!state.relationship) continue
    writeRelationshipRow(targetDb, state.relationship)
    applied++
  }
  const edges = (targetDb.prepare('SELECT COUNT(*) AS n FROM relationships').get() as { n: number }).n
  return { applied, edges }
}
