// The spine RESOLVER (plexi-brain P1 increment 4, extended for P3). Bridges P0's
// retrieved candidates back to their projected graph nodes and reads the spine signals the
// pure re-rank/gate layer (src/shared/spineRerank.ts) needs. This is the only DB-touching
// part of the spine layer; the ranking math is pure + unit-tested.
//
// The bridge: a P0 candidate is a chunk-derived source carrying (source_type, source_id);
// projection stored nodes keyed by (source_table, source_id). The source_type→source_table
// map below is the ONE place that correspondence lives, so the indexer (which stamps chunk
// source_types) and the spine (which resolves them) can never drift. A candidate whose
// source has no projected node resolves to a null spine — the store-anyway floor: recall
// still ranks it, it just gets no spine boost.
//
// ── P3 (Layer 3): cross-room unification + disagreement, read from the edges ────
// resolveSpine now also computes two P3 signals from the node's graph edges:
//   • crossRoomLinked — the node is `same-as`-linked (one hop) to an entity that has a
//     mention in the ACTIVE room → it survives the aperture gate ("one Caleb everywhere").
//   • disagrees — the node has a `contradicts` edge → retrieval flags "sources disagree".
// Both are pure DB reads (no AI). When no active room is passed, crossRoomLinked is
// irrelevant (no aperture to cross) and left false.
//
// DEC-012: this only runs when the brain is on (retrieveViaBrain is brain-path only).
// No AI — pure DB reads + the pure formula (I1: no network on the retrieve path).

import { getBrainNodeBySource, getBrainNode } from '../db/brainNodes'
import { edgesFrom, edgesTo } from '../db/brainEdges'
import { DISAGREES_SURFACING_ENABLED, type CandidateSpine } from '@shared/spineRerank'

// The correspondence between a chunk's source_type (indexer.ts SourceDoc.sourceType) and
// the projection's source_table. Single source of truth — keep in lockstep with both. A
// source_type not listed has no graph node (null spine).
//
// EVERY registered connector's sourceType MUST appear here, or its content is retrievable
// but graph-blind — a null spine means no importance, no room, no lifecycle, no cross-room
// unification, nothing. `widget` was missing from P4.5 Inc 1 until 2026-08-01, so all 38
// indexed widgets fell to the store-anyway floor while their 69 projected brain nodes sat
// unused. Locked as a CLASS invariant by tests/unit/spineBridgeCoverage.test.ts so the next
// connector added (the I5 external connectors) cannot repeat it.
export const SOURCE_TYPE_TO_TABLE: Record<string, string> = {
  knowledge: 'fb_knowledge',
  document: 'documents',
  task: 'nodes',
  widget: 'widgets'
}

// Does this node have any `contradicts` edge (either direction)? A contradicted source is
// flagged "sources disagree" — never dropped (I4: marked, not hidden).
function nodeDisagrees(nodeId: string): boolean {
  if (edgesFrom(nodeId).some((e) => e.type === 'contradicts')) return true
  if (edgesTo(nodeId).some((e) => e.type === 'contradicts')) return true
  return false
}

// Is this node `same-as`-linked (one hop, either direction) to an ENTITY that lives in the
// active room? That makes a candidate in a DIFFERENT room cross-room-relevant (the "one
// Caleb across every room" recall) so it survives the aperture gate. One hop is enough:
// the same-as driver chain-links a cluster, and any member in the active room proves the
// cluster reaches it. Provenance-independent by construction (the driver's gate).
function isCrossRoomLinkedInto(nodeId: string, activeRoomId: string): boolean {
  const neighborIds = new Set<string>()
  for (const e of edgesFrom(nodeId)) if (e.type === 'same-as' && e.dstId) neighborIds.add(e.dstId)
  for (const e of edgesTo(nodeId)) if (e.type === 'same-as') neighborIds.add(e.srcId)
  for (const nid of neighborIds) {
    const n = getBrainNode(nid)
    if (n && n.roomId === activeRoomId) return true
  }
  return false
}

// Resolve the spine signals for one retrieved source. Returns null when the source has no
// projected node (un-typed / brand-new / an un-mapped source_type) — the pure layer treats
// a null spine as "recall order preserved, no boost" (store-anyway floor I3).
//
// activeRoomId (optional): the aperture the query runs under. When set, the P3
// crossRoomLinked signal is computed against it (so a same-as-linked entity survives the
// room gate). When null/undefined there is no aperture, so crossRoomLinked stays false.
export function resolveSpine(
  sourceType: string,
  sourceId: string,
  activeRoomId?: string | null
): CandidateSpine | null {
  const table = SOURCE_TYPE_TO_TABLE[sourceType]
  if (!table) return null
  const node = getBrainNodeBySource(table, sourceId)
  if (!node) return null
  return {
    importance: node.importanceDerived,
    confidence: node.confidence,
    lifecycle: node.lifecycle,
    roomId: node.roomId,
    sensitivity: node.sensitivity,
    // P3 signals (pure DB reads). crossRoomLinked only matters under an active aperture
    // that the candidate's own room doesn't already satisfy.
    crossRoomLinked:
      !!activeRoomId && node.roomId !== activeRoomId
        ? isCrossRoomLinkedInto(node.id, activeRoomId)
        : false,
    // S-007: the detector still runs (its edges are the measurement that will justify
    // re-opening this), but the flag does not surface while the gate is closed. See
    // DISAGREES_SURFACING_ENABLED for the evidence required, and disagreesGate.test.ts.
    disagrees: DISAGREES_SURFACING_ENABLED && nodeDisagrees(node.id)
  }
}
