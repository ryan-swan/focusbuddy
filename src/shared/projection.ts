// The PURE projection mapping (plexi-brain P1 — the migration posture). Maps an
// existing island-table row into the object-graph shape (a node draft + the
// structural edges it implies) WITHOUT touching the DB. The DB-driver that walks
// the tables and writes brain_nodes/brain_edges is src/main/brain/projector.ts;
// this file is the pure per-source resolver both it and its unit tests agree on.
//
// This is the generalization of the describeWidgetForAgent (ai/agentInputs.ts:65)
// pattern the plan calls for: a small resolver per source kind. Kept pure so the
// mapping decisions (which node type, which spine stamps, which structural edge)
// are unit-testable in isolation — the split P0 used (pure chunker / db storage).
//
// ⚠ DEC-014: the node type a row maps to is a STRUCTURAL fact (a folder IS a Room,
// a task IS a Task) — never a domain inference. No content is read to pick a domain
// bucket here; that would be the hardcoded-taxonomy trap. Domain clusters emerge
// later from importance-derivation + capture, never from this projection.

import { SPINE_DEFAULTS, type Confidence, type NodeType, type EdgeType } from './brainGraph'

// The subset of each source row the pure mapper needs. The driver adapts real
// KnowledgeEntry / DocumentMeta / FbNode rows into these — so this module never
// imports DB types (stays pure + dependency-light).
export interface SourceRoomOrTask {
  id: string
  kind: 'folder' | 'task' | 'task-item'
  title: string
  description: string
  parentId: string | null
  // For a task-item ONLY: its desk's parent room, resolved by the driver (the pure
  // mapper is single-row and can't walk grandparents). The aperture must be a real
  // Room, never the desk id.
  parentRoomId?: string | null
  importance?: number // task 3-axis (1-5); ignored for typing — importance is DERIVED
  updatedAt: number
}
export interface SourceKnowledge {
  id: string
  title: string
  body: string
  tags: string[]
  updatedAt: number
}
export interface SourceDocument {
  id: string
  title: string
  docType: string
  updatedAt: number
}

// A projected node: the draft to upsert-by-source, plus the structural edges it
// implies (drawn from structure, NOT from reading content). `provenanceSource` is
// the source-record the node's `produced` edge walks back to (structural
// anti-hallucination — every projected node is grounded by construction).
export interface ProjectedNode {
  sourceTable: string
  sourceId: string
  node: {
    roomId: string | null
    type: NodeType
    // Structural sub-classification within the type (widget kind / docType) so the
    // view can draw the canvas's exact icon. Omitted (undefined) when the source has
    // no finer structure. NEVER a domain label (DEC-014).
    subtype?: string | null
    title: string
    body: string
    confidence: Confidence
    occursAt: number | null
    // importance is DELIBERATELY omitted — the projector must not author it; the
    // derivation (increment 3) owns brain_nodes.importance_derived.
  }
  provenanceSource: { table: string; id: string }
  // Structural edges this node implies. `containedBySource` names the PARENT source
  // row (by table+id) that `contains` this node — the driver resolves the parent's
  // node id and draws parent --contains--> this. Null for a root node.
  containedBySource: { table: string; id: string } | null
}

// Projected rows carry TYPED provenance confidence: they came from a real,
// user-authored row, so the classification (folder→room, task→task) is structural
// and certain. This is NOT over-claiming — no content was interpreted.
const PROJECTED_CONFIDENCE: Confidence = 'typed'

// A folder is a Room; a desk (kind='task') is a PROJECT — the ontology (§1 #4)
// books `nodes` task-kind rows under Project, and its containment chain "Room
// contains Project; Project contains Task" is exactly the island tree's
// room → desk → leaf cascade (DEC-017). A task-item (the to-do inside a desk) is
// the TASK. Structural, universal — the parentId gives the `contains` tree.
export function projectRoomOrTask(row: SourceRoomOrTask): ProjectedNode {
  const type: NodeType = row.kind === 'folder' ? 'room' : row.kind === 'task' ? 'project' : 'task'
  return {
    sourceTable: 'nodes',
    sourceId: row.id,
    node: {
      // A room is its own aperture; a desk's room is its parent folder (matches P0's
      // indexer, which sets a chunk's room_id = the task's parentId); a task-item's
      // room is its desk's room, resolved by the driver (never the desk id).
      roomId: type === 'room' ? row.id : row.kind === 'task-item' ? (row.parentRoomId ?? null) : row.parentId,
      type,
      title: row.title || (type === 'room' ? 'Untitled room' : type === 'project' ? 'Untitled desk' : 'Untitled task'),
      body: row.description ?? '',
      confidence: PROJECTED_CONFIDENCE,
      occursAt: null
    },
    provenanceSource: { table: 'nodes', id: row.id },
    // Parent contains this node (room contains desk, desk contains task-item; a
    // root folder has no parent → null).
    containedBySource: row.parentId ? { table: 'nodes', id: row.parentId } : null
  }
}

// A knowledge entry is a Note (a small, informal captured fact — ontology §1 #9).
// Its room is unknown at projection time (knowledge isn't folder-scoped today);
// left null — the aperture gate treats a null room as org-visible, never wrong.
export function projectKnowledge(row: SourceKnowledge): ProjectedNode {
  const body = [row.tags.join(' '), row.body].filter(Boolean).join('\n').trim()
  return {
    sourceTable: 'fb_knowledge',
    sourceId: row.id,
    node: {
      roomId: null,
      type: 'note',
      title: row.title || 'Untitled note',
      body,
      confidence: PROJECTED_CONFIDENCE,
      occursAt: null
    },
    provenanceSource: { table: 'fb_knowledge', id: row.id },
    containedBySource: null
  }
}

// A document is a Document (a formal artifact/file — ontology §1 #10). docType is
// carried as structural detail (subtype → exact office icon), not a domain label.
// `homeDesk` is the ontology §3.5 home pointer resolved by the driver from the
// office wrapper widget that references this document (officeDocHomes) — when set,
// the desk `contains` the document and the island tree takes it home. roomId stays
// null EITHER WAY: the home is expressed by the contains edge only, so retrieval's
// room gating sees exactly what it saw before this projection existed (additive law).
export function projectDocument(
  row: SourceDocument,
  homeDesk: { table: string; id: string } | null = null
): ProjectedNode {
  return {
    sourceTable: 'documents',
    sourceId: row.id,
    node: {
      roomId: null,
      type: 'document',
      subtype: row.docType || null,
      title: row.title || 'Untitled document',
      body: '', // doc body is chunked by P0 for recall; the node is the handle + spine
      confidence: PROJECTED_CONFIDENCE,
      occursAt: null
    },
    provenanceSource: { table: 'documents', id: row.id },
    containedBySource: homeDesk
  }
}

// ── P4.5 Inc 1 — widgets become Level-3 leaves (DEC-017 island tree) ─────────────

// The widget kinds that project as artifact nodes: content the user would recognize
// as "a thing on my desk" — text, structured data, references, media, agents. An
// ALLOWLIST (skip-by-default posture): layout/ephemeral furniture (sections,
// minimaps, timers…) is UI state, not knowledge, and unknown future kinds stay out
// until deliberately admitted. Aligned with 03-CONTENT-EXTRACTION-INVENTORY §1.
export const PROJECTED_WIDGET_KINDS = [
  // text-bearing (P2.5 already chunks these)
  'sticky', 'note', 'markdown', 'page', 'living-doc', 'card', 'voice-recorder',
  // structured
  'table', 'field', 'custom-block', 'diagram', 'chart', 'mindmap',
  // reference / external
  'webview', 'pdf', 'gdoc', 'gsheet', 'gslide', 'email', 'chat-thread', 'file',
  'drive', 'task-link', 'portal',
  // doers + media
  'agent', 'image', 'video'
] as const
const PROJECTED_WIDGET_KIND_SET: ReadonlySet<string> = new Set(PROJECTED_WIDGET_KINDS)

// Office wrapper kinds: the widget is a WINDOW onto an fb_documents row (its content
// holds the backing document id — OfficeDocWidget). The wrapper never becomes a
// widget node (double-count guard, inventory §1); instead the backing DOCUMENT node
// goes home to the wrapper's desk via officeDocHomes below. ('design' is a docType
// only — no wrapper widget kind exists for it, so it is not in this set.)
export const OFFICE_DOC_WIDGET_KINDS = ['doc', 'sheet', 'slides', 'map'] as const
const OFFICE_DOC_WIDGET_KIND_SET: ReadonlySet<string> = new Set(OFFICE_DOC_WIDGET_KINDS)

// The subset of a widgets-table row the pure mapper needs. containerId is
// widgets.task_id — the canvas node the widget lives on (usually a desk; the base
// app also allows widgets directly on a room's own canvas). containerRoomId is that
// container's room, resolved by the driver (desk → its parent folder; room → itself).
export interface SourceWidget {
  id: string
  containerId: string
  containerRoomId: string | null
  kind: string
  title: string
  updatedAt: number
}

// Honest fallback label for an untitled widget: the kind, humanized — never
// fabricated content. 'living-doc' → 'Living doc'.
function widgetKindLabel(kind: string): string {
  const words = kind.split('-').join(' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

// A canvas widget is an ARTIFACT (ontology Type 16 — §3.5: content-first, with a
// home pointer). Its widget kind rides as subtype so the view draws the canvas's
// exact icon per leaf. Returns null for kinds that must not project (layout
// furniture + office wrappers) — the allowlist is the gate.
export function projectWidget(row: SourceWidget): ProjectedNode | null {
  if (!PROJECTED_WIDGET_KIND_SET.has(row.kind)) return null
  return {
    sourceTable: 'widgets',
    sourceId: row.id,
    node: {
      roomId: row.containerRoomId,
      type: 'artifact',
      subtype: row.kind,
      title: row.title || widgetKindLabel(row.kind),
      body: '', // text kinds are chunked by P2.5 for recall; the node is the handle
      confidence: PROJECTED_CONFIDENCE,
      occursAt: null
    },
    provenanceSource: { table: 'widgets', id: row.id },
    containedBySource: { table: 'nodes', id: row.containerId }
  }
}

// The subset of an office wrapper widget the home resolver needs.
export interface SourceOfficeWidget {
  id: string
  containerId: string
  kind: string
  content: string // holds the backing fb_documents id (OfficeDocWidget contract)
  createdAt: number
}

// Resolve each backing document's HOME desk from the office wrappers that reference
// it. Deterministic: the earliest wrapper wins (createdAt, then id) when the same
// document is windowed on several desks. Empty content / non-office kinds are
// ignored — a home is only ever a stored reference, never inferred.
export function officeDocHomes(
  widgets: SourceOfficeWidget[]
): Map<string, { table: string; id: string }> {
  const sorted = [...widgets].sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const homes = new Map<string, { table: string; id: string }>()
  for (const w of sorted) {
    if (!OFFICE_DOC_WIDGET_KIND_SET.has(w.kind)) continue
    const docId = w.content.trim()
    if (!docId || homes.has(docId)) continue
    homes.set(docId, { table: 'nodes', id: w.containerId })
  }
  return homes
}

// The structural edge a projected node draws to its parent (if any). Exposed so the
// driver + tests share one definition of "which edge type nests a child in a parent".
export const CONTAINMENT_EDGE: EdgeType = 'contains'

// The spine defaults a projected node inherits for the parts the mapper doesn't set
// (lifecycle/sensitivity/importance) — re-exported so the driver stamps consistently.
export const PROJECTED_SPINE_DEFAULTS = {
  lifecycle: SPINE_DEFAULTS.lifecycle,
  sensitivity: SPINE_DEFAULTS.sensitivity,
  importanceDerived: SPINE_DEFAULTS.importanceDerived
} as const
