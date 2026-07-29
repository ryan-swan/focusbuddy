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
import type { AppendInput, SqlDb } from './eventStore'
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
  get: (id: string) => Relationship | null
  all: () => Relationship[]
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

export function createRelationshipStore(db: SqlDb): RelationshipStore {
  ensureRelationshipSchema(db)

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
    const row = db.prepare('SELECT * FROM relationships WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return row ? rowToRel(row) : null
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
    // Suppress re-proposal of an edge already rejected on identical evidence (PLX-GPH-005).
    const priorRejected = db
      .prepare(
        `SELECT * FROM relationships WHERE source_entity_id = ? AND target_entity_id = ? AND relationship_type = ? AND evidence_key = ? AND state = 'rejected' LIMIT 1`
      )
      .get(input.sourceEntityId, input.targetEntityId, input.relationshipType, key) as Record<string, unknown> | undefined
    if (priorRejected) return rowToRel(priorRejected)

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
    db.prepare(
      `INSERT INTO relationships (id, organisation_id, source_entity_id, source_entity_type, target_entity_id,
        target_entity_type, relationship_type, directed, strength, confidence, state, evidence, evidence_key,
        discovery_method, permission_scope, correlation_id, confirmed_by, confirmed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      rel.id, rel.organisationId, rel.sourceEntityId, rel.sourceEntityType, rel.targetEntityId, rel.targetEntityType,
      rel.relationshipType, rel.directed ? 1 : 0, rel.strength, rel.confidence, rel.state, JSON.stringify(rel.evidence),
      key, rel.discoveryMethod, JSON.stringify(rel.permissionScope), rel.correlationId, rel.confirmedBy, rel.confirmedAt,
      rel.createdAt, rel.updatedAt
    )
    return rel
  }

  const confirm: RelationshipStore['confirm'] = (id, actor) => {
    const rel = get(id)
    if (!rel || rel.state === 'rejected') return null
    const now = new Date().toISOString()
    db.prepare(`UPDATE relationships SET state = 'confirmed', confirmed_by = ?, confirmed_at = ?, updated_at = ? WHERE id = ?`).run(actor, now, now, id)
    return get(id)
  }

  const reject: RelationshipStore['reject'] = (id, actor) => {
    const rel = get(id)
    if (!rel) return null
    const now = new Date().toISOString()
    // Retained, not deleted (PLX-GPH-005).
    db.prepare(`UPDATE relationships SET state = 'rejected', confirmed_by = ?, updated_at = ? WHERE id = ?`).run(actor, now, id)
    return get(id)
  }

  const recomputeConfidence: RelationshipStore['recomputeConfidence'] = (id, newConfidence) => {
    const rel = get(id)
    if (!rel || rel.state === 'rejected') return rel
    const now = new Date().toISOString()
    // A confirmed edge that falls below the threshold reverts to provisional (PLX-GPH-003).
    const nextState: RelationshipState = rel.state === 'confirmed' && newConfidence < RELATIONSHIP_CONFIDENCE_THRESHOLD ? 'provisional' : rel.state
    db.prepare('UPDATE relationships SET confidence = ?, state = ?, updated_at = ? WHERE id = ?').run(newConfidence, nextState, now, id)
    return get(id)
  }

  // Only CONFIRMED edges feed retrieval, propagation, resume and permissions
  // (PLX-GPH-002). Provisional and rejected edges are deliberately excluded.
  const activeFor: RelationshipStore['activeFor'] = (entityId) => {
    const rows = db
      .prepare(`SELECT * FROM relationships WHERE state = 'confirmed' AND (source_entity_id = ? OR target_entity_id = ?) ORDER BY strength DESC`)
      .all(entityId, entityId) as Record<string, unknown>[]
    return rows.map(rowToRel)
  }

  const all: RelationshipStore['all'] = () => (db.prepare('SELECT * FROM relationships ORDER BY created_at ASC').all() as Record<string, unknown>[]).map(rowToRel)

  return { propose, confirm, reject, recomputeConfidence, activeFor, get, all, db }
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
