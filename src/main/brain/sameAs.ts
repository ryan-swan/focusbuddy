// The cross-room same-as DRIVER (plexi-brain P3 — Layer 3: the brain recalls ONE entity
// across EVERY room). P2.7 mints person/organization nodes WITHIN scope only — "Caleb
// Wilton" named in 4 rooms is 4 separate nodes. This driver reads those nodes + their
// provenance out of the graph, asks the PURE resolver (src/shared/sameAsResolve.ts) which
// cross-room pairs are confidently the same entity, and mints REVERSIBLE `same-as` edges
// so a single recall gathers the whole cluster (cross-room re-render) — without ever
// merging the nodes.
//
// ── Why a driver + a pure resolver (the P1/P2/P2.7 split, kept) ─────────────────
// The DECISION (which pairs link) is pure + unit-locked in sameAsResolve.test.ts against
// adversarial false-merge inputs. This driver only does the STATEFUL parts the pure layer
// can't: read the entity nodes, derive each one's provenance ROOTS from its `produced`
// edges, and persist the chosen links via ensureNodeEdge (idempotent + reversible).
//
// ── Safe-asymmetry, RAISED for cross-room (DEC-016, DEC-011 §D) ─────────────────
// A wrong cross-room `same-as` corrupts recall SILENTLY across the WHOLE workspace (two
// unrelated "John"s collapse, every fact mis-attributed org-wide). So the bar is higher
// than P2's within-scope match — the pure resolver requires TYPE match + EXACT normalized
// name + DIFFERENT rooms + PROVENANCE-INDEPENDENCE (an echo of one origin never links).
// The failure direction is a visible duplicate (harmless), never a wrong link. And the
// edge is REVERSIBLE (delete it); a node merge would not be.
//
// ── DEC-012 / DEC-014 / idempotency ────────────────────────────────────────────
// Runs only on the brain path (the indexer, gated on isBrainEnabled by its caller). No AI
// — the DEC-015 router identity-match pass (purpose 'entity_match') is reserved-inert and
// would feed this same exact-match+independence gate. Re-running mints no duplicate edges
// (ensureNodeEdge is idempotent). Entity TYPE is the universal person|organization
// primitive (DEC-014) — no domain inference here.

import { listBrainNodes } from '../db/brainNodes'
import { provenanceOf, ensureNodeEdge } from '../db/brainEdges'
import { getDb } from '../db/database'
import { getActiveOrgId } from '../db/activeOrg'
import { resolveCrossRoomSameAs, type SameAsEntity } from '@shared/sameAsResolve'
import type { BrainNode } from '@shared/brainGraph'

export interface SameAsResult {
  entitiesConsidered: number // person/org nodes fed to the resolver
  linksProposed: number // cross-room pairs the pure resolver returned
  edgesMinted: number // links that were newly persisted (idempotent: re-run → 0)
}

// Derive an entity's DISTINCT provenance ROOTS — one stable key per independent origin.
// The `produced` provenance leaves point at the source ROWS the entity was read from
// (table:id). Each distinct source row is an independent root; the pure resolver uses
// these to reject echoes (N mentions tracing to one root do not corroborate a same-as).
// A node with no provenance yields [] → the resolver conservatively declines to link it
// (independence cannot be established — safe-asymmetry favors not-linking).
function provenanceRootsOf(nodeId: string): string[] {
  const roots = new Set<string>()
  for (const p of provenanceOf(nodeId)) {
    if (p.dstSourceTable && p.dstSourceId) roots.add(`${p.dstSourceTable}:${p.dstSourceId}`)
  }
  return [...roots]
}

// Materialize cross-room `same-as` edges over the current entity graph. Idempotent.
// Called by the indexer AFTER entity extraction (so every within-scope node exists before
// we look for cross-room identities). Isolated by its caller so a failure never aborts the
// index or the graph.
export function materializeCrossRoomSameAs(): SameAsResult {
  const nodes: BrainNode[] = listBrainNodes()

  // Only person/organization nodes are same-as candidates (the entity kinds P2.7 mints).
  const entities: SameAsEntity[] = nodes
    .filter((n) => n.type === 'person' || n.type === 'organization')
    .map((n) => ({
      nodeId: n.id,
      name: n.title,
      type: n.type as 'person' | 'organization',
      roomId: n.roomId,
      provenanceRoots: provenanceRootsOf(n.id)
    }))

  const links = resolveCrossRoomSameAs(entities)

  let edgesMinted = 0
  for (const link of links) {
    // Reversible, idempotent, undirected-in-effect: we store ONE directed row a→b; the
    // spine walk treats `same-as` as symmetric (it gathers the cluster from either end).
    // ensureNodeEdge is a no-op if this exact edge already exists (re-index safe).
    const before = edgeExists(link.aNodeId, link.bNodeId)
    ensureNodeEdge(link.aNodeId, link.bNodeId, 'same-as', link.why)
    if (!before) edgesMinted++
  }

  return {
    entitiesConsidered: entities.length,
    linksProposed: links.length,
    edgesMinted
  }
}

// Cheap existence check so the result's edgesMinted is HONEST (distinguishes "newly
// minted" from "already present" across re-indexes). Uses the same key ensureNodeEdge
// dedupes on (src,dst,type in the active org).
function edgeExists(srcId: string, dstId: string): boolean {
  const r = getDb()
    .prepare("SELECT 1 FROM brain_edges WHERE src_id = ? AND dst_id = ? AND type = 'same-as' AND org_id = ? LIMIT 1")
    .get(srcId, dstId, getActiveOrgId())
  return !!r
}
