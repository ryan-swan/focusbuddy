// brain_nodes storage (plexi-brain P1 — the GRAPH SPINE). The DATA layer only:
// CRUD + queries + the change-log write. The graph vocabulary + spine rules are the
// pure src/shared/brainGraph.ts; projection (filling these from island tables) is
// src/main/brain/projector.ts; the re-rank/gate that reads them is the retriever.
//
// Mirrors db/chunks.ts exactly: org-scoped via getActiveOrgId(), prepared
// statements, a Row (snake_case) ↔ domain (camelCase) mapping, idempotent upsert.
//
// DEC-012: brain OFF never calls into here → the table stays dormant + harmless.
// Nothing base-app reads brain_nodes.

import { randomUUID } from 'crypto'
import { getDb } from './database'
import { getActiveOrgId } from './activeOrg'
import {
  isNodeType,
  clampImportance,
  SPINE_DEFAULTS,
  type BrainNode,
  type NodeType,
  type Confidence,
  type Lifecycle,
  type Sensitivity
} from '@shared/brainGraph'

interface NodeRow {
  id: string
  org_id: string
  room_id: string | null
  type: string
  subtype: string | null
  title: string
  body: string
  confidence: string
  lifecycle: string
  occurs_at: number | null
  recurrence: string | null
  sensitivity: string
  importance_derived: number
  source_table: string | null
  source_id: string | null
  created_at: number
  updated_at: number
}

// What a caller supplies to create/project a node. Spine parts are optional — the
// SPINE_DEFAULTS fill any omitted stamp so a projected node is valid immediately.
export interface BrainNodeDraft {
  id?: string
  roomId?: string | null
  type: NodeType
  subtype?: string | null
  title?: string
  body?: string
  confidence?: Confidence
  lifecycle?: Lifecycle
  occursAt?: number | null
  recurrence?: string | null
  sensitivity?: Sensitivity
  importanceDerived?: number
  sourceTable?: string | null
  sourceId?: string | null
}

function rowToNode(r: NodeRow): BrainNode {
  return {
    id: r.id,
    orgId: r.org_id,
    roomId: r.room_id,
    // A row's type is validated on write; fall back defensively if a hand-edited DB
    // ever holds an unknown value — never crash the graph read.
    type: (isNodeType(r.type) ? r.type : 'note') as NodeType,
    subtype: r.subtype ?? null,
    title: r.title,
    body: r.body,
    confidence: r.confidence as Confidence,
    lifecycle: r.lifecycle as Lifecycle,
    occursAt: r.occurs_at,
    recurrence: r.recurrence,
    sensitivity: r.sensitivity as Sensitivity,
    importanceDerived: r.importance_derived,
    sourceTable: r.source_table,
    sourceId: r.source_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

// Create a node (born-from-capture in P2, or manual). Returns the persisted node.
// Rejects an unknown type at the boundary so the DEC-014 vocabulary is the only
// gate — the SQL layer has no CHECK list (that would be a hardcoded taxonomy).
export function createBrainNode(draft: BrainNodeDraft): BrainNode {
  if (!isNodeType(draft.type)) {
    throw new Error(`[brainNodes] unknown node type: ${draft.type}`)
  }
  const db = getDb()
  const org = getActiveOrgId()
  const now = Date.now()
  const node: NodeRow = {
    id: draft.id ?? `bn-${randomUUID()}`,
    org_id: org,
    room_id: draft.roomId ?? null,
    type: draft.type,
    subtype: draft.subtype ?? null,
    title: draft.title ?? '',
    body: draft.body ?? '',
    confidence: draft.confidence ?? SPINE_DEFAULTS.confidence,
    lifecycle: draft.lifecycle ?? SPINE_DEFAULTS.lifecycle,
    occurs_at: draft.occursAt ?? null,
    recurrence: draft.recurrence ?? null,
    sensitivity: draft.sensitivity ?? SPINE_DEFAULTS.sensitivity,
    importance_derived: clampImportance(draft.importanceDerived ?? SPINE_DEFAULTS.importanceDerived),
    source_table: draft.sourceTable ?? null,
    source_id: draft.sourceId ?? null,
    created_at: now,
    updated_at: now
  }
  db.prepare(
    `INSERT INTO brain_nodes
       (id, org_id, room_id, type, subtype, title, body, confidence, lifecycle, occurs_at,
        recurrence, sensitivity, importance_derived, source_table, source_id,
        created_at, updated_at)
     VALUES
       (@id, @org_id, @room_id, @type, @subtype, @title, @body, @confidence, @lifecycle,
        @occurs_at, @recurrence, @sensitivity, @importance_derived, @source_table,
        @source_id, @created_at, @updated_at)`
  ).run(node)
  return rowToNode(node)
}

// Upsert a node BY its projection source (source_table, source_id) — the idempotent
// primitive the projection-adapter uses. If a node already projects from this source
// it's updated in place (preserving its id + created_at + any DERIVED importance);
// otherwise it's created. Returns the node. This is what makes re-indexing safe:
// projecting the same island row twice yields one node, not two.
export function upsertBrainNodeBySource(
  sourceTable: string,
  sourceId: string,
  draft: Omit<BrainNodeDraft, 'sourceTable' | 'sourceId'>
): BrainNode {
  if (!isNodeType(draft.type)) {
    throw new Error(`[brainNodes] unknown node type: ${draft.type}`)
  }
  const db = getDb()
  const org = getActiveOrgId()
  const now = Date.now()
  const existing = db
    .prepare('SELECT * FROM brain_nodes WHERE source_table = ? AND source_id = ? AND org_id = ?')
    .get(sourceTable, sourceId, org) as NodeRow | undefined

  if (existing) {
    // Update the projected content + moving spine parts; PRESERVE id, created_at,
    // and importance_derived (that's the DERIVED signal — the derivation owns it, the
    // projector must not stomp it back to a default on every re-index).
    const updated: NodeRow = {
      ...existing,
      room_id: draft.roomId ?? existing.room_id,
      type: draft.type,
      subtype: draft.subtype ?? existing.subtype,
      title: draft.title ?? existing.title,
      body: draft.body ?? existing.body,
      confidence: draft.confidence ?? existing.confidence,
      lifecycle: draft.lifecycle ?? existing.lifecycle,
      occurs_at: draft.occursAt ?? existing.occurs_at,
      recurrence: draft.recurrence ?? existing.recurrence,
      sensitivity: draft.sensitivity ?? existing.sensitivity,
      importance_derived:
        draft.importanceDerived !== undefined
          ? clampImportance(draft.importanceDerived)
          : existing.importance_derived,
      updated_at: now
    }
    db.prepare(
      `UPDATE brain_nodes SET
         room_id=@room_id, type=@type, subtype=@subtype, title=@title, body=@body, confidence=@confidence,
         lifecycle=@lifecycle, occurs_at=@occurs_at, recurrence=@recurrence,
         sensitivity=@sensitivity, importance_derived=@importance_derived, updated_at=@updated_at
       WHERE id=@id`
    ).run(updated)
    return rowToNode(updated)
  }

  return createBrainNode({ ...draft, sourceTable, sourceId })
}

// The node a source projects to, if any (used to attach provenance edges + to check
// projection idempotency). Org-scoped.
export function getBrainNodeBySource(sourceTable: string, sourceId: string): BrainNode | null {
  const r = getDb()
    .prepare('SELECT * FROM brain_nodes WHERE source_table = ? AND source_id = ? AND org_id = ?')
    .get(sourceTable, sourceId, getActiveOrgId()) as NodeRow | undefined
  return r ? rowToNode(r) : null
}

export function getBrainNode(id: string): BrainNode | null {
  const r = getDb()
    .prepare('SELECT * FROM brain_nodes WHERE id = ? AND org_id = ?')
    .get(id, getActiveOrgId()) as NodeRow | undefined
  return r ? rowToNode(r) : null
}

// All nodes in the active org (the candidate universe the spine re-rank/gate reads).
export function listBrainNodes(): BrainNode[] {
  return (
    getDb()
      .prepare('SELECT * FROM brain_nodes WHERE org_id = ? ORDER BY updated_at DESC')
      .all(getActiveOrgId()) as NodeRow[]
  ).map(rowToNode)
}

export function countBrainNodes(): number {
  const r = getDb()
    .prepare('SELECT COUNT(*) AS n FROM brain_nodes WHERE org_id = ?')
    .get(getActiveOrgId()) as { n: number }
  return r.n
}

// ── I0b (the delete path) ────────────────────────────────────────────────────────
// Two removals, and the line between them is DEC-010's "does this node have value
// independent of the row it came from?"
//
//   • A PROJECTED node (source_table + source_id set) is a 1:1 shadow of one base row.
//     upsertBrainNodeBySource recreates it identically the moment that row reappears —
//     idempotent projection is the whole design — so it holds nothing of its own. When
//     the row is deleted the node is a shell asserting content that no longer exists,
//     and its title/body still CARRY that content. It goes.
//   • An ENTITY node (person/organization; source_table NULL) is minted by inference —
//     either by EXTRACTION (a `produced` leaf to each source that named it) or by
//     CAPTURE (an `involves` edge from a task node; NO `produced` leaf of its own).
//     Deleting one source drops one of its connections — the entity survives on the
//     rest. Only when it is FULLY DISCONNECTED (zero edges of any kind) does it go.
//     See listOrphanedEntityNodeIds for why "zero edges" and not "no provenance edge".
//
// NOTE ON DEC-011 CALL C ("forgetting is ranking suppression, NEVER deletion"): that
// governs the brain's own forgetting — decay, staleness, supersession — where deleting
// would destroy knowledge the user still has. It does not govern USER deletion, which
// is an explicit instruction to forget. Suppressing rather than deleting here would
// leave the deleted content sitting in brain_nodes.title/body and drawn on the graph
// view: exactly the failure this phase exists to close.
//
// brain_edges (src_id and dst_id) and brain_change_log (node_id) are declared ON DELETE
// CASCADE and foreign_keys is ON (database.ts), so removing a node takes its edges and
// its change-log with it — no second delete statement, no chance of a missed table.

/** Remove the node PROJECTED from this source row. Returns true if one was removed. */
export function deleteBrainNodeBySource(sourceTable: string, sourceId: string): boolean {
  const info = getDb()
    .prepare('DELETE FROM brain_nodes WHERE source_table = ? AND source_id = ? AND org_id = ?')
    .run(sourceTable, sourceId, getActiveOrgId())
  return info.changes > 0
}

/**
 * Inferred entity nodes that have become FULLY ORPHANED: person/organization, minted
 * (not projected — `source_table IS NULL`), with **zero edges of any kind** — no
 * outbound, no inbound, no provenance leaf.
 *
 * ⚠️ "Zero edges", NOT "no `produced` edge" — the distinction is a data-loss bug the
 * adversarial review caught. An inferred entity is grounded two different ways:
 *   • EXTRACTION-minted (entityExtract.ts) — a `produced` leaf from the person to each
 *     source row that named it. Deleting a source drops that leaf.
 *   • CAPTURE-minted (capture.ts) — an `involves` edge from the captured TASK node to
 *     the person. The person never gets a `produced` edge of its own.
 * A "no `produced` edge" predicate treats every capture-minted person as ungrounded, so
 * the FIRST delete of ANY unrelated content would wipe all of them (their `involves`
 * edge survives but is ignored) — silent loss of content the user did not delete.
 * Requiring zero edges keeps a capture-person alive while her task (or any same-as link)
 * survives, and still GCs a truly disconnected node.
 *
 * Scoped tightly on purpose — an inferred entity with ANY surviving connection is left
 * alone (safe-asymmetry: a stray node is visible+harmless, a wrongly-deleted one is data
 * loss). This GC is a consequence of the delete path, never a general graph pruner.
 */
export function listOrphanedEntityNodeIds(): string[] {
  const rows = getDb()
    .prepare(
      `SELECT n.id FROM brain_nodes n
        WHERE n.org_id = ?
          AND n.source_table IS NULL
          AND n.type IN ('person', 'organization')
          AND NOT EXISTS (SELECT 1 FROM brain_edges e WHERE e.src_id = n.id AND e.org_id = n.org_id)
          AND NOT EXISTS (SELECT 1 FROM brain_edges e WHERE e.dst_id = n.id AND e.org_id = n.org_id)`
    )
    .all(getActiveOrgId()) as Array<{ id: string }>
  return rows.map((r) => r.id)
}

/** Every PROJECTED node's identity (id + its source key), org-scoped. Lets the projector
 *  reconcile: a projected node whose source is no longer in the live projection set is a
 *  shadow of a row that is gone, and must be pruned (the graph's own delete path, I0b).
 *  Excludes inferred entities (source_table NULL) — those are the entity GC's concern. */
export function listProjectedNodeRefs(): Array<{ id: string; sourceTable: string; sourceId: string }> {
  return getDb()
    .prepare(
      `SELECT id, source_table AS sourceTable, source_id AS sourceId
         FROM brain_nodes
        WHERE org_id = ? AND source_table IS NOT NULL AND source_id IS NOT NULL`
    )
    .all(getActiveOrgId()) as Array<{ id: string; sourceTable: string; sourceId: string }>
}

/** Remove a node by id (cascades its edges + change-log). Returns true if it existed. */
export function deleteBrainNode(id: string): boolean {
  const info = getDb()
    .prepare('DELETE FROM brain_nodes WHERE id = ? AND org_id = ?')
    .run(id, getActiveOrgId())
  return info.changes > 0
}

// Set a node's DERIVED importance (the DEC-014 engine writes here; nothing else
// should). Logs the change so the derivation is auditable via the change-log.
export function setDerivedImportance(id: string, importance: number): void {
  const db = getDb()
  const org = getActiveOrgId()
  const before = db
    .prepare('SELECT importance_derived FROM brain_nodes WHERE id = ? AND org_id = ?')
    .get(id, org) as { importance_derived: number } | undefined
  if (!before) return
  const next = clampImportance(importance)
  if (before.importance_derived === next) return
  const now = Date.now()
  const tx = db.transaction(() => {
    db.prepare('UPDATE brain_nodes SET importance_derived = ?, updated_at = ? WHERE id = ? AND org_id = ?').run(
      next,
      now,
      id,
      org
    )
    appendChangeLog(id, 'importance_derived', String(before.importance_derived), String(next), 'brain')
  })
  tx()
}

// Append a change-log row (spine part 6). Append-only — never updates in place.
export function appendChangeLog(
  nodeId: string,
  field: string,
  fromVal: string | null,
  toVal: string | null,
  actor: string
): void {
  getDb()
    .prepare(
      `INSERT INTO brain_change_log (id, node_id, field, from_val, to_val, changed_at, actor)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(`cl-${randomUUID()}`, nodeId, field, fromVal, toVal, Date.now(), actor)
}

// The change history for a node (newest first) — powers "what changed while you
// were out" + time-travel.
export function listChangeLog(nodeId: string): Array<{
  field: string
  fromVal: string | null
  toVal: string | null
  changedAt: number
  actor: string
}> {
  const rows = getDb()
    .prepare('SELECT field, from_val, to_val, changed_at, actor FROM brain_change_log WHERE node_id = ? ORDER BY changed_at DESC')
    .all(nodeId) as Array<{ field: string; from_val: string | null; to_val: string | null; changed_at: number; actor: string }>
  return rows.map((r) => ({ field: r.field, fromVal: r.from_val, toVal: r.to_val, changedAt: r.changed_at, actor: r.actor }))
}
