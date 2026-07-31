// The graph-view read DRIVER (plexi-brain P4 — Slice 1). The only DB-touching part
// of the radial view: reads the P1-P3 graph (nodes + node→node edges) for the active
// org and hands it to the PURE projection (src/shared/graphView.ts) — bands, the
// same-as fold, the conflict lift, the LOD cap.
//
// I1 — formula-only, fully local. No embedder, no LLM, no network. This runs ONCE
// per view load; zooming filters CLIENT-side via isVisibleAtAltitude, so the
// render/zoom path never crosses the IPC boundary at all.
//
// DEC-012 — brain OFF never calls this (the handler guards; the renderer's OFF path
// renders the untouched v3.8.0 tag-graph and never invokes the channel).

import { listBrainNodes } from '../db/brainNodes'
import { listNodeEdges, listProvenanceLeaves } from '../db/brainEdges'
import { projectGraphView, GRAPH_TRANSPORT_MAX, type GraphViewProjection } from '@shared/graphView'

export function graphViewPayload(): GraphViewProjection {
  const allNodes = listBrainNodes()
  const nodes = allNodes.map((n) => ({
    id: n.id,
    roomId: n.roomId,
    type: n.type,
    subtype: n.subtype,
    title: n.title,
    importance: n.importanceDerived,
    lifecycle: n.lifecycle,
    baseId: n.sourceId
  }))
  const edges = listNodeEdges().map((e) => ({
    srcId: e.srcId,
    dstId: e.dstId as string,
    type: e.type
  }))
  // P4.5 Inc 4 — provenance threads at NODE level (DEC-017 §3.4): an entity's
  // produced LEAF whose base row is itself projected resolves to that row's node,
  // so doc↔person and widget↔person threads draw node-to-node. Every such line
  // is backed by its stored produced row; self-leaves (a node's own projection
  // provenance) resolve to themselves and are dropped as self-loops downstream.
  const bySource = new Map<string, string>()
  for (const n of allNodes) {
    if (n.sourceTable && n.sourceId) bySource.set(`${n.sourceTable}\u00a6${n.sourceId}`, n.id)
  }
  for (const leaf of listProvenanceLeaves()) {
    if (!leaf.dstSourceTable || !leaf.dstSourceId) continue
    const resolved = bySource.get(`${leaf.dstSourceTable}\u00a6${leaf.dstSourceId}`)
    if (!resolved || resolved === leaf.srcId) continue
    edges.push({ srcId: leaf.srcId, dstId: resolved, type: 'produced' })
  }
  // DEC-017: ship the whole folded tree (transport-bounded); the renderer enforces
  // the DEC-010 ~150 DRAWN cap per-viewport — leaves materialize on approach.
  return projectGraphView(nodes, edges, { maxNodes: GRAPH_TRANSPORT_MAX })
}
