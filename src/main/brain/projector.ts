// The projection-adapter DRIVER (plexi-brain P1 — the migration posture). Walks the
// existing island tables and MATERIALIZES the object graph from them: for each source
// row it upserts a brain_node (idempotent by source), attaches a walkable provenance
// edge back to the source-record, and draws the structural `contains` edge to its
// parent. Runs on the same trigger as P0's chunk index (buildIndex) so the graph
// stays in step with the corpus.
//
// Design (operator's Call-3 choice): MATERIALIZED-ON-INDEX, not virtual/read-time.
// The graph is persisted so the spine re-rank/gate (increment 4) walks cheap FK hops
// with zero graph-compute on the retrieve path (I1), and lifecycle/supersession get
// real stored state. The base island tables are NEVER written — the base row remains
// the single source of truth; we only ADD brain_* rows (additive, non-destructive).
//
// Idempotent: upsertBrainNodeBySource + ensureProvenance + ensureNodeEdge mean
// re-projecting a source yields ONE node / ONE provenance edge / ONE containment
// edge — safe to run on every index. Re-projection PRESERVES a node's DERIVED
// importance (the derivation owns that column; the projector never stomps it).
//
// DEC-012: brain OFF never calls this (buildIndex is brain-path only). No AI here —
// projection is pure structural mapping, fully local, on-device.
//
// ⚠ DEC-014: the node TYPE comes from structure (folder→room, task→task,
// knowledge→note, document→document) — never a domain inference. This driver imports
// no domain vocabulary; the pure mappers (src/shared/projection.ts) are grep-locked.

import { listKnowledge } from '../db/knowledge'
import { listDocuments } from '../db/documents'
import { listNodes } from '../db/nodes'
import { listWidgetsByKind } from '../db/widgets'
import {
  upsertBrainNodeBySource,
  getBrainNodeBySource,
  countBrainNodes,
  listProjectedNodeRefs,
  deleteBrainNode
} from '../db/brainNodes'
import { ensureProvenance, ensureNodeEdge, countBrainEdges } from '../db/brainEdges'
import {
  projectRoomOrTask,
  projectKnowledge,
  projectDocument,
  projectWidget,
  officeDocHomes,
  PROJECTED_WIDGET_KINDS,
  OFFICE_DOC_WIDGET_KINDS,
  CONTAINMENT_EDGE,
  type ProjectedNode,
  type SourceOfficeWidget
} from '@shared/projection'

export interface ProjectionResult {
  nodesProjected: number // sources visited + upserted this pass
  edgesDrawn: number // provenance + containment edges ensured this pass
  nodesPruned: number // I0b: projected nodes deleted because their source is gone/trashed
  totalNodes: number // brain_nodes count for the org after projection
  totalEdges: number // brain_edges count for the org after projection
}

// Gather every projectable source in the active org as pure ProjectedNode specs.
// Order matters for containment: nodes (folders + tasks) first so a parent room's
// node exists before a child draws its `contains` edge — but ensureNodeEdge is
// resilient to ordering too (it only needs both endpoints to exist by pass end;
// see the two-pass edge draw below).
function collectProjections(): ProjectedNode[] {
  const out: ProjectedNode[] = []

  // Rooms + desks + task-items (the folder/task tree → room/project/task nodes +
  // the containment tree). liveById lets a task-item resolve its desk's room and
  // lets widgets verify their canvas container is LIVE org-scoped work.
  const liveNodes = listNodes().filter((n) => !n.archived)
  const liveById = new Map(liveNodes.map((n) => [n.id, n]))
  for (const n of liveNodes) {
    // Skip trashed/archived nodes: they're hidden from the base app, so they must not
    // surface in the graph either (the graph is a lens over LIVE work).
    out.push(
      projectRoomOrTask({
        id: n.id,
        kind: n.kind,
        title: n.title,
        description: n.description ?? '',
        parentId: n.parentId,
        // A task-item's aperture is its desk's parent room (the mapper is
        // single-row-pure; the driver walks the grandparent).
        parentRoomId:
          n.kind === 'task-item' && n.parentId ? (liveById.get(n.parentId)?.parentId ?? null) : null,
        importance: n.importance,
        updatedAt: n.updatedAt
      })
    )
  }

  // Knowledge entries → notes.
  for (const k of listKnowledge()) {
    out.push(projectKnowledge({ id: k.id, title: k.title, body: k.body, tags: k.tags, updatedAt: k.updatedAt }))
  }

  // Widgets → artifact leaves (P4.5 Inc 1 — DEC-017: widgets orbit their desk).
  // Only widgets whose canvas container is live org-scoped work project; the
  // container is usually a desk, and the base app also allows widgets directly on a
  // room's own canvas. Office wrappers are handled below (their DOCUMENT goes home).
  for (const kind of PROJECTED_WIDGET_KINDS) {
    for (const w of listWidgetsByKind(kind)) {
      if (w.archived) continue
      const container = liveById.get(w.taskId)
      if (!container) continue // orphan / other-org / trashed container — not live work
      const spec = projectWidget({
        id: w.id,
        containerId: w.taskId,
        // Desk → its parent folder is the room; room canvas → the room itself;
        // task-item canvas (not observed live, defensively) → resolve via its desk.
        containerRoomId:
          container.kind === 'folder'
            ? container.id
            : container.kind === 'task'
              ? container.parentId
              : (container.parentId ? (liveById.get(container.parentId)?.parentId ?? null) : null),
        kind: w.kind,
        title: w.title,
        updatedAt: w.updatedAt
      })
      if (spec) out.push(spec)
    }
  }

  // Office wrapper widgets → each backing document's HOME desk (ontology §3.5 home
  // pointer). The wrapper never becomes a node; the document it windows goes home.
  const officeWidgets: SourceOfficeWidget[] = []
  for (const kind of OFFICE_DOC_WIDGET_KINDS) {
    for (const w of listWidgetsByKind(kind)) {
      if (w.archived) continue
      if (!liveById.has(w.taskId)) continue
      officeWidgets.push({
        id: w.id,
        containerId: w.taskId,
        kind: w.kind,
        content: w.content || '',
        createdAt: w.createdAt
      })
    }
  }
  const homes = officeDocHomes(officeWidgets)

  // Documents → document nodes, contained by their home desk when a wrapper widget
  // references them (deterministic first-wins), else homeless → the Unfiled stack.
  for (const d of listDocuments()) {
    if (d.archived) continue
    out.push(
      projectDocument(
        { id: d.id, title: d.title, docType: d.docType, updatedAt: d.updatedAt },
        homes.get(d.id) ?? null
      )
    )
  }

  return out
}

// Build (or refresh) the object graph for the active org from existing data. Safe to
// call repeatedly (idempotent). Two passes so containment edges can resolve a parent
// whose node is created in the same run regardless of walk order.
export function projectGraph(): ProjectionResult {
  const specs = collectProjections()

  // Pass 1 — upsert every node + attach its provenance edge. After this pass every
  // projected source has a node, so pass 2's parent lookups always resolve.
  let edgesDrawn = 0
  for (const spec of specs) {
    const node = upsertBrainNodeBySource(spec.sourceTable, spec.sourceId, {
      roomId: spec.node.roomId,
      type: spec.node.type,
      subtype: spec.node.subtype ?? null,
      title: spec.node.title,
      body: spec.node.body,
      confidence: spec.node.confidence,
      occursAt: spec.node.occursAt
      // lifecycle/sensitivity/importance fall to SPINE_DEFAULTS on create and are
      // PRESERVED on update (upsertBrainNodeBySource keeps importance_derived).
    })
    // Provenance: this node came-from its source-record (walkable leaf). Idempotent.
    ensureProvenance(node.id, { table: spec.provenanceSource.table, id: spec.provenanceSource.id }, spec.node.confidence)
    edgesDrawn++
  }

  // Pass 2 — draw containment edges (parent --contains--> child) now that both
  // endpoints exist. A parent that wasn't projected (e.g. an archived folder) is
  // skipped rather than dangling.
  for (const spec of specs) {
    if (!spec.containedBySource) continue
    const parent = getBrainNodeBySource(spec.containedBySource.table, spec.containedBySource.id)
    const child = getBrainNodeBySource(spec.sourceTable, spec.sourceId)
    if (parent && child) {
      ensureNodeEdge(parent.id, child.id, CONTAINMENT_EDGE)
      edgesDrawn++
    }
  }

  // Pass 3 — PRUNE (I0b, the graph's delete path). collectProjections() already excludes
  // trashed/archived/other-org sources, so a previously-projected node whose source is no
  // longer in this pass's live set is a shadow of a row the user deleted. The upsert above
  // never removes it — so a folder/room, a document, or a non-text widget deleted while
  // the brain was OFF (the immediate delete path didn't fire) would linger on the graph
  // view carrying the deleted content's title. This closes that: any projected node not
  // reprojected this pass is deleted (cascading its edges + change-log). Idempotent with
  // the chunk reconcile (both may target a trashed task's node — deleting twice is a
  // no-op). Inferred entity nodes (source_table NULL) are untouched — the entity GC owns
  // those. A wrongful prune from a transient collector gap self-heals: the next index
  // re-upserts the node and re-derives its importance.
  let nodesPruned = 0
  const liveKeys = new Set(specs.map((s) => `${s.sourceTable} ${s.sourceId}`))
  for (const ref of listProjectedNodeRefs()) {
    if (!liveKeys.has(`${ref.sourceTable} ${ref.sourceId}`)) {
      if (deleteBrainNode(ref.id)) nodesPruned++
    }
  }

  return {
    nodesProjected: specs.length,
    edgesDrawn,
    nodesPruned,
    totalNodes: countBrainNodes(),
    totalEdges: countBrainEdges()
  }
}
