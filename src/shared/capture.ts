// The PURE capture-as-decomposition core (plexi-brain P2). Turns a minted
// ActionProposal + its source utterance into a CAPTURE PLAN — the born-tagged,
// confidence-stamped description of the brain node(s) + edge(s) to write. NO DB, no
// Electron, no AI: same pure/storage split P0 used (chunker/chunks) and P1 used
// (brainGraph/brainNodes, projection/projector). The DB-driver that executes a plan
// against brain_nodes/brain_edges is src/main/brain/capture.ts; this file is the
// pure decomposition both it and its unit tests agree on.
//
// P2 goal (06-PLAN.md ## P2): incoming input is decomposed into born-tagged,
// entity-resolved objects that land in the P1 graph as typed nodes with a provenance
// edge, a confidence stamp (via the P1 classifier), and a change-log row — with the
// store-anyway floor (I3) so nothing is ever lost.
//
// ── The convergence guarantee (operator decision, 2026-07-18) ──────────────────
// A captured node SHARES the base-row back-pointer with the projected node: when
// capture creates a task, it writes the brain node with (source_table='nodes',
// source_id=<the new task row id>) — IDENTICAL to what projection.ts's
// projectRoomOrTask would later emit. So capture + projection CONVERGE on ONE node
// via the idempotent upsertBrainNodeBySource(source_table, source_id) — never a
// duplicate. This is why the kind→type + kind→source-table maps below MUST agree
// with projection.ts: a captured task and a projected task are the same node.
//
// ⚠ DEC-014: the kind→type map is a STRUCTURAL fact (a create-task IS a task, a
// create-document IS a document) — never a domain inference. No content is read to
// pick a domain bucket. Domain clusters emerge later from importance-derivation +
// capture accumulation, never from a hardcoded list here. Grep-locked by
// capture.test.ts (the 5th DEC-014 lock — the first over capture code).

import { classifyConfidence, downgradeOnly } from './confidenceClassifier'
import { PROVENANCE_EDGE, type NodeType, type Confidence, type EdgeType } from './brainGraph'

// ── The ActionProposal kinds capture cares about ───────────────────────────────
// We depend only on { id, kind } + the few fields we read (title/body), NOT on the
// full 25-variant union in shared/types.ts — this keeps the pure core decoupled and
// testable without constructing whole proposals. The driver passes real proposals.
export interface CapturableProposal {
  id: string
  kind: string
  // Fields we read for the node title/body when present (all optional — a kind may
  // carry none, in which case the utterance text is the fallback title).
  title?: string
  body?: string
  notes?: string
  content?: string
}

// ── kind → NodeType (the structural map; MUST agree with projection.ts) ─────────
// Only kinds that MEAN a durable graph object are mapped. Ephemeral/navigational
// kinds (navigate-to, focus-widget, arrange-widgets, drill-in-widget, open-url,
// start-focus-session, link-widgets, toggle-todo-item, delete-widget, update-widget)
// are DELIBERATELY absent → they produce no node. Capture is ADDITIVE, not total:
// a proposal that doesn't create a durable thing doesn't create a brain node.
//
// Convergence check (projection.ts): create-task → 'project' (projectRoomOrTask maps
// a base kind='task' row — a DESK — to Project per DEC-017 / ontology §1 #4),
// create-knowledge-entry → 'note' (projectKnowledge), create-document/create-page →
// 'document' (projectDocument). A captured task and a later-projected desk collapse
// to ONE node because both write (source_table='nodes', type='project').
const KIND_TO_NODE_TYPE: Readonly<Record<string, NodeType>> = {
  // Work — these kinds write base kind='task' rows (desks), so they mint what
  // projection mints for those rows: 'project' (the convergence law).
  'create-task': 'project',
  'create-todo-list': 'project', // a checklist is a desk with items (decomposed into item bodies later)
  'update-task': 'project', // acting on an existing desk still refers to its node
  // Knowledge & artifacts
  'create-knowledge-entry': 'note', // a saved fact/decision → a Note (§1 #9)
  'create-page': 'document', // a written page is a formal artifact
  'create-document': 'document',
  'edit-document': 'document',
  'create-table': 'artifact', // a table is a content artifact (§3.5 Type 16)
  'create-widget': 'artifact', // a canvas widget is an artifact
  // Events & communications
  'schedule-event': 'event', // a dated point (§1 #12)
  // Draft-only actions (no base row → no projection to converge with): a single
  // actionable thing is a TASK in the ontology's sense.
  'compose-mail': 'task', // an outbound action to do — the person is a separate node
  'post-chat': 'task' // same: an action; the conversation partner resolves separately
} as const

// ── kind → base source table (MUST agree with the base-app write + projection.ts) ─
// When a proposal is applied, the base app writes a row to one of these tables. The
// captured brain node points at THAT row (source_table, source_id) so it converges
// with projection. The driver supplies the real new row id (from resolvedIds) — this
// map only names WHICH table the kind writes to.
//   create-task/create-todo-list/update-task → the 'nodes' table (folder/task tree)
//   create-knowledge-entry → 'fb_knowledge'
//   create-document/create-page/edit-document → 'documents'
//   create-table/create-widget → 'widgets'
//   schedule-event → 'calendar_events'
// compose-mail/post-chat are DRAFT-ONLY (no base row is written — see actionExecutor
// notes) → they get no source table and are handled as draft captures (utterance-only,
// store-anyway floor) rather than born nodes. Excluded here on purpose.
const KIND_TO_SOURCE_TABLE: Readonly<Record<string, string>> = {
  'create-task': 'nodes',
  'create-todo-list': 'nodes',
  'update-task': 'nodes',
  'create-knowledge-entry': 'fb_knowledge',
  'create-page': 'documents',
  'create-document': 'documents',
  'edit-document': 'documents',
  'create-table': 'widgets',
  'create-widget': 'widgets',
  'schedule-event': 'calendar_events'
} as const

// Does this proposal kind become a durable graph node?
export function kindProducesNode(kind: string): boolean {
  return kind in KIND_TO_NODE_TYPE && kind in KIND_TO_SOURCE_TABLE
}

export function nodeTypeForKind(kind: string): NodeType | null {
  return KIND_TO_NODE_TYPE[kind] ?? null
}

export function sourceTableForKind(kind: string): string | null {
  return KIND_TO_SOURCE_TABLE[kind] ?? null
}

// ── The born confidence stamp (wires the P1 classifier) ────────────────────────
// The deterministic classifier is the FLOOR (P1 §10 lock — negation/quantifier/
// attribution can never be `typed`). An optional LLM typing pass (DEC-015 router,
// cloud-on-opt-in) may propose a stamp, but downgradeOnly() guarantees it can only
// make the stamp MORE cautious, never raise a hazard-flagged fact back to `typed`.
// No key ⇒ no llmProposed ⇒ the classifier stamp stands (store-anyway floor: the
// node is still born + findable; only the extra-caution pass is absent).
export function bornConfidence(
  utteranceText: string,
  llmProposed?: Confidence
): { confidence: Confidence; why: string; hazards: string[] } {
  const verdict = classifyConfidence(utteranceText)
  const base: Confidence = verdict.confidence
  const final: Confidence = llmProposed ? downgradeOnly(base, llmProposed) : base
  const why =
    llmProposed && final !== base
      ? `${verdict.why}; LLM pass downgraded to ${final}`
      : verdict.why
  return { confidence: final, why, hazards: verdict.hazards }
}

// ── The capture plan (what the driver writes) ──────────────────────────────────
// A single born node + its provenance edge back to the utterance + the change-log
// row it should log. Entity-resolution edges (involves/about a resolved person/org)
// are added by the driver in increment 5 (within-scope resolution) — the pure core
// describes the primary node; the driver enriches it against the live graph.
export interface CapturePlan {
  // The node to upsert-by-source. sourceTable is known here; sourceId is filled by
  // the driver from resolvedIds (the real base-app row the apply produced).
  sourceTable: string
  node: {
    type: NodeType
    title: string
    body: string
    confidence: Confidence
    occursAt: number | null
  }
  // The provenance leaf edge: node --produced--> the utterance's activity_log row.
  // The driver supplies the utterance's activity row id (increment 3 files it).
  provenance: {
    edgeType: EdgeType // always PROVENANCE_EDGE ('produced')
    // dstSourceTable is 'activity_log'; dstSourceId is the utterance row id (driver).
    dstSourceTable: string
  }
  // The change-log row to append when the node is first born.
  changeLog: { field: string; fromVal: string | null; toVal: string; actor: string }
  // Legible reason (the receipt headline) — why this confidence, what type.
  why: string
}

// Decompose a proposal + its utterance into a capture plan. Returns null for a kind
// that produces no durable node (ephemeral/navigational, or draft-only) — the driver
// still files the utterance (store-anyway floor), but no node is born. PURE.
export function decomposeProposal(
  proposal: CapturableProposal,
  utteranceText: string,
  llmProposedConfidence?: Confidence
): CapturePlan | null {
  const type = nodeTypeForKind(proposal.kind)
  const sourceTable = sourceTableForKind(proposal.kind)
  if (!type || !sourceTable) return null

  // Title: the proposal's own title if present, else a trimmed slice of the utterance
  // (never empty — a node always has a handle). Body: the proposal's descriptive text.
  const title = pickTitle(proposal, utteranceText)
  const body = pickBody(proposal)

  // Confidence is stamped from the UTTERANCE (the thing actually said), not the
  // model's cleaned-up title — the hazards live in the raw human phrasing.
  const stamp = bornConfidence(utteranceText, llmProposedConfidence)

  return {
    sourceTable,
    node: {
      type,
      title,
      body,
      confidence: stamp.confidence,
      occursAt: null // dated kinds (schedule-event) get occursAt from the driver's real row
    },
    provenance: {
      edgeType: PROVENANCE_EDGE,
      dstSourceTable: 'activity_log'
    },
    changeLog: { field: 'created', fromVal: null, toVal: type, actor: 'capture' },
    why: `${type} born from capture — ${stamp.why}`
  }
}

function pickTitle(p: CapturableProposal, utterance: string): string {
  const t = (p.title ?? '').trim()
  if (t) return t
  const u = utterance.trim()
  if (!u) return 'Untitled capture'
  // A short handle — the first line, capped, so a node title stays legible.
  const firstLine = u.split('\n')[0].trim()
  return firstLine.length > 120 ? firstLine.slice(0, 117) + '…' : firstLine
}

function pickBody(p: CapturableProposal): string {
  // Prefer the richest descriptive field the kind carries.
  return (p.body ?? p.notes ?? p.content ?? '').trim()
}
