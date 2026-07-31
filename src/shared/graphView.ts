// The graph-view PROJECTION (plexi-brain P4 — Slice 1). PURE: no DB, no Electron,
// no AI, no clock — the same split every brain layer uses (chunker/projection/
// sameAsResolve). The radial view is a LENS over the P1-P3 graph (DEC-010): this
// module decides WHAT the lens may draw; the renderer decides where pixels go.
//
// I1 — this feeds the render/zoom path, so it MUST stay formula-only and local.
// Nothing here may fetch, embed, or infer. Zoom never waits on anything.
//
// The locked Slice-1 selection rules (operator-approved design, 2026-07-18):
//   band rule     — rooms are pillars; person/organization/tool are the identity
//                   band; both draw by CLASS at every altitude. The importance cut
//                   governs only the work inside the sectors.
//   conflict lift — a node carrying a `contradicts` edge is always visible: a
//                   contradiction earns altitude by definition.
//   same-as fold  — a same-as cluster collapses to ONE representative token that
//                   remembers every member's room ("one Caleb across every room").
//   the cap       — never more than GRAPH_VIEW_MAX nodes leave this projection;
//                   pillars and conflicts survive first, then importance decides.
//
// ⚠ DEC-014: pillars are whatever rooms the importance-derivation ranked — this
// module contains NO domain vocabulary (grep-locked by graphView.test.ts).

import type { NodeType, EdgeType } from './brainGraph'

export interface GraphViewNodeIn {
  id: string
  roomId: string | null
  type: NodeType
  /** structural sub-class within the type (widget kind / docType) — the view draws
   *  the canvas's exact icon per leaf (P4.5 island tree). Never a domain label. */
  subtype?: string | null
  title: string
  importance: number // importance_derived, verbatim (DEC-014: derived, never authored)
  lifecycle: string
  /** the base-app row this node projects from (source_id) — lets the renderer map a
   *  room-node to the base room id that OTHER nodes' roomId/memberRooms point at */
  baseId?: string | null
}

export interface GraphViewEdgeIn {
  srcId: string
  dstId: string
  type: EdgeType
}

export type GraphViewBand = 'pillar' | 'identity' | 'work' | 'orgwide'

export interface GraphViewNode {
  id: string
  type: NodeType
  /** structural sub-class within the type (widget kind / docType), from the representative */
  subtype: string | null
  title: string
  roomId: string | null
  importance: number
  band: GraphViewBand
  conflict: boolean
  baseId: string | null
  /** rooms of every member folded into this token (≥1 entry incl. its own room) */
  memberRooms: string[]
  /** node ids folded into this representative (≥1 — itself) */
  collapsedIds: string[]
}

export interface GraphViewEdge {
  srcId: string
  dstId: string
  type: EdgeType
}

export interface GraphViewProjection {
  nodes: GraphViewNode[]
  edges: GraphViewEdge[]
  /** how many nodes existed before the cap — honesty for the "Showing N of M" readout */
  totalNodes: number
}

/** The hard ceiling on DRAWN nodes — the view never renders a wall of dots
 *  (DEC-010 LOD). Since DEC-017 the renderer enforces this PER-VIEWPORT (leaves
 *  materialize per island as you approach); the projection itself uses the
 *  transport bound below so the whole folded tree reaches the client. */
export const GRAPH_VIEW_MAX = 150

/** The transport safety bound for the payload — the projection still refuses to
 *  ship an unbounded graph (importance decides survivors past this), but the
 *  island tree needs the full containment tree client-side so leaves can
 *  materialize on approach without ever touching IPC (I1). */
export const GRAPH_TRANSPORT_MAX = 1200

/** The altitude range the renderer's zoom maps onto. */
export const ALTITUDE_MIN = 0.7
export const ALTITUDE_MAX = 3.2

/**
 * The importance bar a work/orgwide node must clear to be drawn at altitude z.
 * Falls monotonically from ~0.55 (cruise: landmarks only) to 0.35 (working layer:
 * everything real is reachable — the floor sits BELOW the 0.41 default-importance
 * floor of projected nodes, so nothing is ever permanently invisible).
 */
export function altitudeCut(z: number): number {
  const t = Math.min(1, Math.max(0, ((z - ALTITUDE_MIN) / (ALTITUDE_MAX - ALTITUDE_MIN)) * 1.35))
  return 0.55 - 0.2 * t
}

/** The band rule + conflict lift, as one testable predicate the renderer uses per frame. */
export function isVisibleAtAltitude(node: GraphViewNode, z: number): boolean {
  if (node.band === 'pillar' || node.band === 'identity') return true
  if (node.conflict) return true
  return node.importance >= altitudeCut(z)
}

function bandOf(node: GraphViewNodeIn): GraphViewBand {
  if (node.type === 'room') return 'pillar'
  if (node.type === 'person' || node.type === 'organization' || node.type === 'tool') return 'identity'
  return node.roomId === null ? 'orgwide' : 'work'
}

/**
 * Fold same-as clusters (union-find), classify bands, mark conflicts, and cap the
 * node count. Deterministic: same input (in any order) → same output.
 */
export function projectGraphView(
  nodesIn: GraphViewNodeIn[],
  edgesIn: GraphViewEdgeIn[],
  opts?: { maxNodes?: number }
): GraphViewProjection {
  const maxNodes = opts?.maxNodes ?? GRAPH_VIEW_MAX
  const byId = new Map<string, GraphViewNodeIn>()
  for (const n of nodesIn) byId.set(n.id, n)

  // ── same-as fold: union-find over same-as edges whose both ends exist ──
  const parent = new Map<string, string>()
  const find = (x: string): string => {
    let r = x
    while (parent.get(r) !== r) r = parent.get(r)!
    // path compression
    let c = x
    while (parent.get(c) !== c) {
      const next = parent.get(c)!
      parent.set(c, r)
      c = next
    }
    return r
  }
  for (const n of nodesIn) parent.set(n.id, n.id)
  const sortedEdges = [...edgesIn].sort((a, b) => (a.srcId + a.dstId).localeCompare(b.srcId + b.dstId))
  for (const e of sortedEdges) {
    if (e.type !== 'same-as') continue
    if (!byId.has(e.srcId) || !byId.has(e.dstId)) continue
    const ra = find(e.srcId)
    const rb = find(e.dstId)
    if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb) // smaller id wins → deterministic
  }

  // cluster → members
  const members = new Map<string, string[]>()
  for (const n of nodesIn) {
    const root = find(n.id)
    const list = members.get(root) ?? []
    list.push(n.id)
    members.set(root, list)
  }

  // representative per cluster: highest importance, then lexicographic id
  const repOf = new Map<string, string>() // any member id → representative id
  const folded: GraphViewNode[] = []
  for (const [, ids] of [...members.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const nodes = ids.map((id) => byId.get(id)!)
    const rep = [...nodes].sort((a, b) => b.importance - a.importance || a.id.localeCompare(b.id))[0]
    for (const id of ids) repOf.set(id, rep.id)
    const memberRooms = [...new Set(nodes.map((x) => x.roomId).filter((r): r is string => r !== null))].sort()
    folded.push({
      id: rep.id,
      type: rep.type,
      subtype: rep.subtype ?? null,
      title: rep.title,
      roomId: rep.roomId,
      importance: Math.max(...nodes.map((x) => x.importance)),
      band: bandOf(rep),
      conflict: false, // marked below, post-remap
      baseId: rep.baseId ?? null,
      memberRooms: memberRooms.length ? memberRooms : rep.roomId ? [rep.roomId] : [],
      collapsedIds: [...ids].sort()
    })
  }

  // ── remap edges onto representatives; drop folded same-as + self-loops; dedupe ──
  const seen = new Set<string>()
  const edges: GraphViewEdge[] = []
  for (const e of sortedEdges) {
    if (!byId.has(e.srcId) || !byId.has(e.dstId)) continue
    const src = repOf.get(e.srcId)!
    const dst = repOf.get(e.dstId)!
    if (src === dst) continue // includes every folded same-as edge
    if (e.type === 'same-as') continue // the fold IS the rendering; braids derive from memberRooms
    const key = `${src}→${dst}:${e.type}`
    if (seen.has(key)) continue
    seen.add(key)
    edges.push({ srcId: src, dstId: dst, type: e.type })
  }

  // conflict lift: any representative touching a contradicts edge
  const conflicted = new Set<string>()
  for (const e of edges) {
    if (e.type === 'contradicts') {
      conflicted.add(e.srcId)
      conflicted.add(e.dstId)
    }
  }
  for (const n of folded) n.conflict = conflicted.has(n.id)

  // ── the cap: pillars + conflicts always survive; the rest by importance ──
  let selected = folded
  if (folded.length > maxNodes) {
    const keep = folded.filter((n) => n.band === 'pillar' || n.conflict)
    const rest = folded
      .filter((n) => !(n.band === 'pillar' || n.conflict))
      .sort((a, b) => b.importance - a.importance || a.id.localeCompare(b.id))
    selected = [...keep, ...rest.slice(0, Math.max(0, maxNodes - keep.length))]
  }
  const selectedIds = new Set(selected.map((n) => n.id))
  const selectedEdges = edges.filter((e) => selectedIds.has(e.srcId) && selectedIds.has(e.dstId))

  return {
    nodes: [...selected].sort((a, b) => a.id.localeCompare(b.id)),
    edges: selectedEdges,
    totalNodes: nodesIn.length
  }
}
