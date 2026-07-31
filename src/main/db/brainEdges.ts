// brain_edges storage (plexi-brain P1 — the GRAPH SPINE). ONE polymorphic edge
// table for the whole graph: node→node edges AND provenance leaves (a raw
// source-record that is not a node, orthogonality rule 3). "Provenance is just an
// edge type" (type='produced') stays literally true; P3's same-as/contradicts are
// just new `type` values here — no new tables.
//
// Mirrors db/chunks.ts idiom. Endpoint well-formedness is enforced at the boundary
// via the pure edgeEndpointsValid() so the graph can't hold a dangling/ambiguous
// link. DEC-012: brain OFF never reads brain_edges.

import { randomUUID } from 'crypto'
import { getDb } from './database'
import { getActiveOrgId } from './activeOrg'
import {
  isEdgeType,
  edgeEndpointsValid,
  PROVENANCE_EDGE,
  type BrainEdge,
  type EdgeType,
  type Confidence
} from '@shared/brainGraph'

interface EdgeRow {
  id: string
  org_id: string
  src_id: string
  dst_id: string | null
  dst_source_table: string | null
  dst_source_id: string | null
  type: string
  role: string | null
  confidence: string
  created_at: number
}

export interface BrainEdgeDraft {
  id?: string
  srcId: string
  // Exactly one of these two targets is set:
  dstId?: string | null // node→node
  dstSource?: { table: string; id: string } // provenance leaf
  type: EdgeType
  role?: string | null
  confidence?: Confidence
}

function rowToEdge(r: EdgeRow): BrainEdge {
  return {
    id: r.id,
    orgId: r.org_id,
    srcId: r.src_id,
    dstId: r.dst_id,
    dstSourceTable: r.dst_source_table,
    dstSourceId: r.dst_source_id,
    type: r.type as EdgeType,
    role: r.role,
    confidence: r.confidence as Confidence,
    createdAt: r.created_at
  }
}

// Create an edge. Validates the type is a known ontology edge AND that exactly one
// endpoint shape is set (node target xor provenance leaf) — a malformed edge is
// rejected, never persisted (structural-integrity guard).
export function createBrainEdge(draft: BrainEdgeDraft): BrainEdge {
  if (!isEdgeType(draft.type)) {
    throw new Error(`[brainEdges] unknown edge type: ${draft.type}`)
  }
  const dstId = draft.dstId ?? null
  const dstSourceTable = draft.dstSource?.table ?? null
  const dstSourceId = draft.dstSource?.id ?? null
  if (!edgeEndpointsValid({ dstId, dstSourceTable, dstSourceId })) {
    throw new Error(
      `[brainEdges] malformed endpoints: set exactly one of dstId (node→node) or dstSource (provenance leaf)`
    )
  }
  const row: EdgeRow = {
    id: draft.id ?? `be-${randomUUID()}`,
    org_id: getActiveOrgId(),
    src_id: draft.srcId,
    dst_id: dstId,
    dst_source_table: dstSourceTable,
    dst_source_id: dstSourceId,
    type: draft.type,
    role: draft.role ?? null,
    confidence: draft.confidence ?? 'inferred',
    created_at: Date.now()
  }
  getDb()
    .prepare(
      `INSERT INTO brain_edges
         (id, org_id, src_id, dst_id, dst_source_table, dst_source_id, type, role, confidence, created_at)
       VALUES
         (@id, @org_id, @src_id, @dst_id, @dst_source_table, @dst_source_id, @type, @role, @confidence, @created_at)`
    )
    .run(row)
  return rowToEdge(row)
}

// Convenience: attach a PROVENANCE edge from a node back to the source-record it
// came from. This is the walkable "produced/came-from" edge that makes structural
// anti-hallucination real (a node with no such edge is not grounded).
export function attachProvenance(
  nodeId: string,
  source: { table: string; id: string },
  confidence: Confidence = 'typed'
): BrainEdge {
  return createBrainEdge({
    srcId: nodeId,
    dstSource: source,
    type: PROVENANCE_EDGE,
    confidence
  })
}

// Idempotent provenance attach used by the projector: only creates the edge if this
// node doesn't already have one pointing at this exact source-record. Re-projecting
// a source therefore doesn't multiply its provenance edges.
export function ensureProvenance(
  nodeId: string,
  source: { table: string; id: string },
  confidence: Confidence = 'typed'
): void {
  const existing = getDb()
    .prepare(
      `SELECT id FROM brain_edges
       WHERE src_id = ? AND type = ? AND dst_source_table = ? AND dst_source_id = ? AND org_id = ?`
    )
    .get(nodeId, PROVENANCE_EDGE, source.table, source.id, getActiveOrgId()) as { id: string } | undefined
  if (!existing) attachProvenance(nodeId, source, confidence)
}

// Idempotent node→node edge (projection draws structural edges — contains, etc. —
// and must not duplicate them on re-index).
export function ensureNodeEdge(srcId: string, dstId: string, type: EdgeType, role: string | null = null): void {
  const existing = getDb()
    .prepare('SELECT id FROM brain_edges WHERE src_id = ? AND dst_id = ? AND type = ? AND org_id = ?')
    .get(srcId, dstId, type, getActiveOrgId()) as { id: string } | undefined
  if (!existing) createBrainEdge({ srcId, dstId, type, role })
}

// All edges leaving a node (the spine walks these to gather context, provenance,
// supersession, cross-room links).
export function edgesFrom(nodeId: string): BrainEdge[] {
  return (
    getDb()
      .prepare('SELECT * FROM brain_edges WHERE src_id = ? AND org_id = ? ORDER BY created_at DESC')
      .all(nodeId, getActiveOrgId()) as EdgeRow[]
  ).map(rowToEdge)
}

// All edges INTO a node (who points here — degree-in is an importance-derivation
// signal per DEC-014).
export function edgesTo(nodeId: string): BrainEdge[] {
  return (
    getDb()
      .prepare('SELECT * FROM brain_edges WHERE dst_id = ? AND org_id = ? ORDER BY created_at DESC')
      .all(nodeId, getActiveOrgId()) as EdgeRow[]
  ).map(rowToEdge)
}

// The provenance leaf/leaves for a node — the walkable source-records the hover
// thread lands on ("walk to source"). Empty ⇒ this node is not grounded.
export function provenanceOf(nodeId: string): BrainEdge[] {
  return (
    getDb()
      .prepare('SELECT * FROM brain_edges WHERE src_id = ? AND type = ? AND org_id = ? ORDER BY created_at DESC')
      .all(nodeId, PROVENANCE_EDGE, getActiveOrgId()) as EdgeRow[]
  ).map(rowToEdge)
}

// Edges of a given type in the active org (e.g. every 'supersedes' for the lifecycle
// gate; every 'same-as' for cross-room in P3).
export function listEdgesByType(type: EdgeType): BrainEdge[] {
  return (
    getDb()
      .prepare('SELECT * FROM brain_edges WHERE type = ? AND org_id = ? ORDER BY created_at DESC')
      .all(type, getActiveOrgId()) as EdgeRow[]
  ).map(rowToEdge)
}

// Every node→node edge in the active org (provenance leaves excluded — their dst is
// a source-record, not a node). The graph-view projection (P4) reads this once per
// load; it never runs on the zoom path (I1: zoom is client-side filtering only).
export function listNodeEdges(): BrainEdge[] {
  return (
    getDb()
      .prepare('SELECT * FROM brain_edges WHERE dst_id IS NOT NULL AND org_id = ? ORDER BY created_at DESC')
      .all(getActiveOrgId()) as EdgeRow[]
  ).map(rowToEdge)
}

// Every PROVENANCE LEAF in the active org (dst is a source-record, not a node).
// P4.5 Inc 4 reads these once per view load to lift entity mentions up to
// node-to-node threads: a leaf pointing at a base row that IS projected resolves
// to that row's node — every drawn thread is backed by this stored row.
export function listProvenanceLeaves(): BrainEdge[] {
  return (
    getDb()
      .prepare('SELECT * FROM brain_edges WHERE dst_id IS NULL AND org_id = ? ORDER BY created_at DESC')
      .all(getActiveOrgId()) as EdgeRow[]
  ).map(rowToEdge)
}

// ── I0b (the delete path) ────────────────────────────────────────────────────────
// Drop every LEAF edge that points at a source-record which no longer exists. A leaf
// names a raw row (dst_source_table/dst_source_id), so when that row is deleted the
// edge is dangling by definition — it asserts provenance from something that is gone.
//
// Deliberately NOT filtered to type='produced': any edge type that ever names a source
// record is dangling under the same argument, and a delete path that silently skips
// tomorrow's leaf types is a delete path that leaks. Returns the number removed.
export function deleteEdgeLeavesForSource(sourceTable: string, sourceId: string): number {
  const info = getDb()
    .prepare(
      'DELETE FROM brain_edges WHERE dst_source_table = ? AND dst_source_id = ? AND org_id = ?'
    )
    .run(sourceTable, sourceId, getActiveOrgId())
  return info.changes
}

export function countBrainEdges(): number {
  const r = getDb()
    .prepare('SELECT COUNT(*) AS n FROM brain_edges WHERE org_id = ?')
    .get(getActiveOrgId()) as { n: number }
  return r.n
}

// Degree (in + out) for a node — the primary importance-derivation signal (DEC-014).
export function nodeDegree(nodeId: string): { in: number; out: number } {
  const org = getActiveOrgId()
  const db = getDb()
  const outN = (db.prepare('SELECT COUNT(*) AS n FROM brain_edges WHERE src_id = ? AND org_id = ?').get(nodeId, org) as { n: number }).n
  const inN = (db.prepare('SELECT COUNT(*) AS n FROM brain_edges WHERE dst_id = ? AND org_id = ?').get(nodeId, org) as { n: number }).n
  return { in: inN, out: outN }
}
