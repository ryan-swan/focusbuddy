// The contradiction DRIVER (plexi-brain P3 — Layer 3: the everyday "plausible garbage"
// guard). When two provenance-independent sources assert conflicting numeric values for
// the same subject ("precision 85%" vs "100 versus 70 on precision"), this mints a
// `contradicts` edge between the two SOURCE NODES those rows projected to — so retrieval
// can annotate a result with a "sources disagree" chip instead of silently surfacing one
// number as truth.
//
// ── Driver + pure resolver split (as with same-as / entity-extract) ────────────
// The DECISION (which claims conflict) is pure + unit-locked in contradictResolve.test.ts.
// This driver does the stateful parts: take the same ingested sources the indexer built,
// run the resolver, map each conflicting source row back to its PROJECTED brain node
// (getBrainNodeBySource — the row→node back-pointer projection maintains), and persist a
// `contradicts` edge between those nodes via ensureNodeEdge (idempotent + reversible).
//
// ── Safe-asymmetry (DEC-016, DEC-011 §D) ───────────────────────────────────────
// A FALSE `contradicts` puts a wrong "sources disagree" chip on a correct result — worse
// than missing one. The pure resolver already declines on doubt (no shared subject, same
// value within tolerance, shared provenance root). This driver adds one more decline: if
// EITHER conflicting source row hasn't projected to a node yet, we skip the edge (nothing
// to attach to) rather than guess. Reversible edge; no node is ever mutated.
//
// DEC-012 (brain-path only, gated by the indexer) · DEC-014 (no domain vocabulary here) ·
// DEC-015 (the LLM claim-extraction pass is reserved-inert, would feed the same gate).

import { getBrainNodeBySource } from '../db/brainNodes'
import { ensureNodeEdge } from '../db/brainEdges'
import { getDb } from '../db/database'
import { getActiveOrgId } from '../db/activeOrg'
import { resolveContradictions, type ClaimSource } from '@shared/contradictResolve'
import { ENTITY_SOURCE_TABLES } from './entityExtract'

// The minimal per-source shape this driver reads — the SAME EntitySource the indexer
// already builds for entity extraction (sourceTable/sourceId identify the projected node;
// text is what claims are read from). roomId is unused here (contradiction is provenance-
// keyed, not room-keyed) but kept for parity with the source shape.
export interface ContradictSource {
  sourceTable: string
  sourceId: string
  roomId: string | null
  text: string
}

export interface ContradictResult {
  sourcesScanned: number
  contradictionsFound: number // conflicting claim pairs the resolver returned
  edgesMinted: number // pairs newly persisted as `contradicts` (idempotent: re-run → 0)
  edgesSkipped: number // conflicts where a source row hadn't projected to a node yet
}

// The provenance root key for a source row — matches how same-as derives roots and how
// projection keys nodes (table:id). Two rows with the SAME key are one origin (an echo),
// never a contradiction with each other (the resolver enforces this).
function rootKey(sourceTable: string, sourceId: string): string {
  const provTable = ENTITY_SOURCE_TABLES[sourceTable] ?? sourceTable
  return `${provTable}:${sourceId}`
}

// Map a claim-source's root key back to the two identifying parts (for getBrainNodeBySource).
function splitRoot(root: string): { table: string; id: string } {
  const idx = root.indexOf(':')
  return { table: root.slice(0, idx), id: root.slice(idx + 1) }
}

// Detect cross-source numeric contradictions over the ingested sources and mint a
// `contradicts` edge between the two projected SOURCE NODES for each. Idempotent.
export function materializeContradictions(sources: ContradictSource[]): ContradictResult {
  const result: ContradictResult = {
    sourcesScanned: sources.length,
    contradictionsFound: 0,
    edgesMinted: 0,
    edgesSkipped: 0
  }

  // Build ClaimSources keyed by provenance ROOT (so echoes of one row share an id and
  // never contradict each other).
  const claimSources: ClaimSource[] = sources.map((s) => ({
    sourceId: rootKey(s.sourceTable, s.sourceId),
    roomId: s.roomId,
    text: s.text
  }))

  const contradictions = resolveContradictions(claimSources)
  result.contradictionsFound = contradictions.length

  for (const c of contradictions) {
    const a = splitRoot(c.aSourceId)
    const b = splitRoot(c.bSourceId)
    const aNode = getBrainNodeBySource(a.table, a.id)
    const bNode = getBrainNodeBySource(b.table, b.id)
    // Decline if either row hasn't projected to a node (nothing to attach the edge to).
    if (!aNode || !bNode || aNode.id === bNode.id) {
      result.edgesSkipped++
      continue
    }
    const before = contradictEdgeExists(aNode.id, bNode.id)
    ensureNodeEdge(aNode.id, bNode.id, 'contradicts', c.why)
    if (!before) result.edgesMinted++
  }

  return result
}

// Honest edgesMinted accounting across re-indexes (mirrors the same-as driver). A
// `contradicts` is symmetric in effect; we store one directed row and check both keys so a
// prior a→b OR b→a counts as "already present".
function contradictEdgeExists(aId: string, bId: string): boolean {
  const org = getActiveOrgId()
  const r = getDb()
    .prepare(
      "SELECT 1 FROM brain_edges WHERE type='contradicts' AND org_id=? AND ((src_id=? AND dst_id=?) OR (src_id=? AND dst_id=?)) LIMIT 1"
    )
    .get(org, aId, bId, bId, aId)
  return !!r
}
