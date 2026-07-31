// The plexi-brain object-graph vocabulary + spine (P1 — the GRAPH SPINE keystone).
//
// This module is PURE (no DB, no Electron, no AI) so the graph's vocabulary and
// spine rules are unit-testable in isolation — the same split P0 used between the
// pure chunker (src/main/brain/chunker.ts) and its storage (src/main/db/chunks.ts).
// Storage lives in src/main/db/brainNodes.ts + brainEdges.ts; this file is the
// shared shape + the pure invariants both sides agree on.
//
// What P1 builds (06-PLAN.md ## P1): a typed node table carrying the 6-part spine
// + a general cross-entity edge table + a projection-adapter that fills them from
// existing island tables — wired behind retrieveSources() as a re-rank/gate LAYER
// over P0's recall (05-ARCHITECTURE/01-OBJECT-ONTOLOGY.md is the source of truth).
//
// ⚠ DEC-014 GUARD-RAIL (the self-building graph): the node/edge type sets below are
// UNIVERSAL STRUCTURAL PRIMITIVES ONLY (Room · Person · Task · Decision · Goal…).
// They are NEVER domain categories ("Engineering", "Sales", "Health"). A business's
// pillars, a student's courses, a freelancer's clients all EMERGE from content as
// named Rooms — the vocabulary here must contain no domain/department/pillar names,
// grep-locked by brainGraph.test.ts. Adding a domain name here breaks universality.

// ── The ~16 node types (05-ARCHITECTURE/01-OBJECT-ONTOLOGY.md §1) ─────────────
// Grouped for understanding, not as rigid categories. Every value is a universal
// structural primitive — a shape a thing can take in ANYONE's life or work.
export const NODE_TYPES = [
  // Containers — the structural furniture
  'room', // the aperture: a bounded space that scopes everything inside it (5 jobs)
  'person', // a human — you, a teammate, a professor, a contact
  'organization', // an external entity you deal with (a company isn't a person)
  // Work — what you're actually doing
  'project', // a bounded body of work with a goal + lifespan
  'task', // a single actionable thing
  'decision', // ⭐ a choice made WITH its reasoning kept — the signature type
  'goal', // the durable WHY above projects — an open-ended target
  // Knowledge & events — what you know and what happened
  'meeting', // a conversation/event that happened; PRODUCES decisions/tasks/risks
  'note', // a small, informal captured idea/fact — a little page, not a formal file
  'document', // a formal artifact/file — PDF, spreadsheet, deck, contract
  'risk', // something that could go wrong (surfaced as a plain "watch-out")
  'event', // a dated point (± recurrence) that isn't a task — exam, rent-due, renewal
  // Doers — who does the work, how, with what (planned now, wired Phases 4-5)
  'agent', // an AI worker that does a category of work for you
  'process', // a repeatable routine — a saved recipe (SOP/Playbook)
  'tool', // an external app/capability the brain/agents can reach
  // The artifact layer (Type 16, ontology §3.5) — a sticky/sheet/canvas-object with
  // a home pointer; content-first, points back to the idea it's about.
  'artifact'
] as const
export type NodeType = (typeof NODE_TYPES)[number]

// ── The ~13 edge types (05-ARCHITECTURE/01-OBJECT-ONTOLOGY.md §2) ─────────────
// The relationships that make it a graph look like a company/life, not a tag-cloud.
// P3's cross-room edges (same-as, contradicts) are ALREADY here as type values —
// so P3 adds no new tables, only starts minting these two (06-PLAN.md ## P3).
export const EDGE_TYPES = [
  'contains', // structural nesting: Room contains Project; Project contains Task
  'produced', // ⭐ provenance — a walkable edge to the source (Meeting produced Decision)
  'assigned-to', // responsibility: Task assigned-to Person
  'about', // subject matter: Note about Organization; Document references Decision
  'blocks', // negative dependency: Risk threatens Project; Task blocks Task
  'affected', // impact: Decision affected Launch
  'uses', // how work gets done: Agent follows Process; Task uses Tool
  'involves', // ⭐ people in the loop, WITH their role (evaluator/approver/objector)
  'member-of', // who belongs where: Person works-at Organization
  'advances', // contribution to a goal: Task advances Goal; Project serves Goal
  'supersedes', // ⭐ retained old→new (never deletes) — walkable = time-travel
  'same-as', // ⭐ entity identity across rooms (P3 — powers cross-room re-render)
  'contradicts', // source disagreement (P3 — the everyday "plausible garbage" guard)
  'related' // soft catch-all — the honest fallback when it's just "these go together"
] as const
export type EdgeType = (typeof EDGE_TYPES)[number]

// The provenance edge type — the one that makes structural anti-hallucination real.
// A fact node with NO 'produced' edge to a source cannot be trusted as grounded.
export const PROVENANCE_EDGE: EdgeType = 'produced'

// ── The 6-part spine (05-ARCHITECTURE/01-OBJECT-ONTOLOGY.md §3) ────────────────
// Stamped on EVERY node — the genuinely-new brain. Five parts are scalar columns
// on brain_nodes; provenance is an EDGE (walkable, ontology §3) and change-log is
// its own append-only table (brain_change_log) — both relational, not scalar.

// Confidence (I4): the brain shows uncertainty instead of faking certainty.
//   typed    = confidently classified → trusted node
//   inferred = the brain's best guess → may prompt a "?" on high-stakes items
//   ambiguous= genuinely unclear → stamped low-confidence, still indexed, never faked
export const CONFIDENCE_LEVELS = ['typed', 'inferred', 'ambiguous'] as const
export type Confidence = (typeof CONFIDENCE_LEVELS)[number]

// Lifecycle (DEC-011 Call C): "is this still true?" — decay is type+lifecycle aware,
// never raw age. A superseded node stays WALKABLE (time-travel), never deleted.
export const LIFECYCLE_STATES = ['fresh', 'active', 'stale', 'superseded'] as const
export type Lifecycle = (typeof LIFECYCLE_STATES)[number]

// Sensitivity tier — guards the cross-room privacy boundary. null = normal/default.
export const SENSITIVITY_TIERS = ['normal', 'private', 'restricted'] as const
export type Sensitivity = (typeof SENSITIVITY_TIERS)[number]

// The canonical spine defaults for a freshly-projected/created node. Deliberately
// conservative: a node with unknown provenance starts 'inferred', not 'typed' — the
// store-anyway floor (I3) keeps it findable while the confidence stamp stays honest.
export const SPINE_DEFAULTS = {
  confidence: 'inferred' as Confidence,
  lifecycle: 'active' as Lifecycle,
  sensitivity: 'normal' as Sensitivity,
  // importance is DERIVED (DEC-014), never authored — this is the neutral prior a
  // node carries until the derivation runs. Kept in [0,1] to match the retriever's
  // importanceSignal() contract (src/main/brain/retriever.ts).
  importanceDerived: 0.5
} as const

// ── The node shape (the scalar spine) ─────────────────────────────────────────
// source_table/source_id are the projection back-pointer: a node materialized from
// an existing island table records where it came from, so re-projection is idempotent
// and the base row stays the single source of truth (migration posture — additive,
// never destructive). A born-from-capture node (P2) has these null.
export interface BrainNode {
  id: string
  orgId: string
  roomId: string | null // the aperture (orthogonality rule 1: every node lives-in one Room)
  type: NodeType
  // Structural sub-classification WITHIN a type — an artifact's widget kind
  // ('sticky'/'webview'/…), a document's docType ('doc'/'sheet'/…). Carried so the
  // view can draw the canvas's exact icon per node (P4.5 island tree). STRUCTURAL
  // detail only — never a domain label (DEC-014 applies to this field too).
  subtype: string | null
  title: string
  body: string
  // spine (scalar parts)
  confidence: Confidence
  lifecycle: Lifecycle
  occursAt: number | null // time: due/occurs_at (ms) — null for non-dated nodes
  recurrence: string | null // optional cadence (RRULE-ish string), null = one-off
  sensitivity: Sensitivity
  importanceDerived: number // [0,1], DERIVED (DEC-014) — never read from a manual column
  // projection back-pointer (null for born-from-capture nodes)
  sourceTable: string | null
  sourceId: string | null
  createdAt: number
  updatedAt: number
}

// ── The edge shape (polymorphic — node→node AND provenance leaves) ────────────
// One table for the whole graph (operator's Call-2 choice). A node→node edge sets
// dstId; a PROVENANCE LEAF (ontology orthogonality rule 3 — a Slack line / source
// row is a walkable source-record, NOT a first-class node) sets dstSourceTable +
// dstSourceId instead. "Provenance is just an edge type" stays literally true.
export interface BrainEdge {
  id: string
  orgId: string
  srcId: string // always a brain_nodes.id
  dstId: string | null // node→node target, OR null for a provenance leaf
  dstSourceTable: string | null // provenance leaf: the source table it came from
  dstSourceId: string | null // provenance leaf: the source row id
  type: EdgeType
  role: string | null // role-qualifier for 'involves' (evaluator/approver/objector)
  confidence: Confidence // a drawn link can itself be uncertain
  createdAt: number
}

// ── The change-log shape (spine part 6, append-only) ──────────────────────────
// {node, field, from, to, when, actor} — powers "3 decisions while you were out",
// "pricing MOVED to $40k", and feeds the trust-ledger "corrected" signal for free.
export interface BrainChangeLogEntry {
  id: string
  nodeId: string
  field: string
  fromVal: string | null
  toVal: string | null
  changedAt: number
  actor: string // 'user' | 'brain' | 'projection' | an agent id
}

// ── Pure invariants (unit-tested; used by both storage + projection) ──────────

const NODE_TYPE_SET: ReadonlySet<string> = new Set(NODE_TYPES)
const EDGE_TYPE_SET: ReadonlySet<string> = new Set(EDGE_TYPES)

export function isNodeType(v: string): v is NodeType {
  return NODE_TYPE_SET.has(v)
}
export function isEdgeType(v: string): v is EdgeType {
  return EDGE_TYPE_SET.has(v)
}

// Clamp a derived importance signal to the [0,1] contract the retriever expects.
export function clampImportance(v: number): number {
  if (!Number.isFinite(v)) return SPINE_DEFAULTS.importanceDerived
  return Math.min(1, Math.max(0, v))
}

// Is this edge a provenance leaf (points at a raw source-record, not a node)?
// The structural anti-hallucination check reads this: a grounded fact has at least
// one such edge back to where it came from.
export function isProvenanceLeaf(e: Pick<BrainEdge, 'dstId' | 'dstSourceTable' | 'dstSourceId'>): boolean {
  return e.dstId === null && e.dstSourceTable !== null && e.dstSourceId !== null
}

// Validate an edge's endpoints are well-formed: EXACTLY one of (node target) or
// (provenance leaf) is set — never both, never neither. Storage rejects malformed
// edges so the graph can't hold a dangling or ambiguous link.
export function edgeEndpointsValid(
  e: Pick<BrainEdge, 'dstId' | 'dstSourceTable' | 'dstSourceId'>
): boolean {
  const isNodeTarget = e.dstId !== null && e.dstSourceTable === null && e.dstSourceId === null
  const isLeaf = isProvenanceLeaf(e)
  return isNodeTarget || isLeaf
}
