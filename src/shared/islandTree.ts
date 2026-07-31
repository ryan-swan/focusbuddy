// The ISLAND-TREE layout (P4.5 — DEC-017). PURE: no DB, no Electron, no AI, no
// clock, no randomness — the same split every brain layer uses (chunker /
// projection / graphView). The view is a radial DESCENDANCY tree:
//
//   center = YOU → rooms are islands orbiting it (sized by DEC-014 derived
//   importance, hued by the sector wheel) → each room's desks orbit their room →
//   each desk's leaves (widgets, homed documents, task-items) orbit their desk —
//   sizes shrinking by depth. Everything visibly DESCENDS parent → child: not
//   containment-inside-a-box, a connected cascade radiating outward.
//
// Structure is drawn ONLY from stored `contains` edges — never inferred at render
// (the honest-rubric law: every line is a stored row). Two line voices belong to
// the RENDERER: descent (short quiet, from each node's parentId here) vs threads
// (the intelligence — same-as folds, contradicts, produced chains, person→spaces).
//
// Identities (person/organization/tool) are not part of any island: ONE token per
// identity (the same-as fold stays law), placed BETWEEN its member rooms at the
// angular centroid, floating outside the room ring. Homeless documents/notes live
// in a compact UNFILED STACK near the center — a place, not a ring.
//
// Deterministic by construction: same payload (in any order) → identical layout.
// I1 — this feeds the render path; it must stay formula-only and local.
//
// ⚠ DEC-014: islands are whatever rooms the importance-derivation ranked — this
// module contains NO domain vocabulary (grep-locked by islandTree.test.ts).

import type { GraphViewNode, GraphViewEdge } from './graphView'

// ── the world box (the renderer's world→screen transform frames this) ──────────
// P4.5c C2: the box is now a COMPUTED OUTPUT that grows with content, not a fixed
// 1000². These constants are the DEFAULT / MINIMUM world (an empty or small brain
// stays intimate); `computeWorld()` grows the square world when the content needs
// more room, and `layoutIslandTree` returns the actual `world` it laid out in.
// Under the C1 camera a bigger world is free — it just lowers the fit scale, so
// "bigger world" = "start more zoomed-out, zoom in more for detail" (the operator's
// own rule). ISLAND_W/H/CX/CY remain exported as the default center + the base the
// (now-dead-under-C1) semanticPositions path frames.
export const ISLAND_W = 1000
export const ISLAND_H = 1000
export const ISLAND_CX = 500
export const ISLAND_CY = 500

/** the room-island orbit radius around the center */
export const ISLAND_RING_R = 280
/** identity band radii: just outside a single room / floating between several */
/** the Unfiled stack anchor as a FRACTION of the world (P4.5c C2): a quiet STAGING
 *  SHELF in the bottom-LEFT corner — OUTSIDE the centered island ring, so it never
 *  sits on a room no matter how many rooms there are (a corner is always clear of a
 *  centered ring). Fractional so it tracks the world as the world grows. The pile
 *  by the door, not furniture woven through the rooms; dimmed at rest by the
 *  renderer, descendable to triage. (0.15, 0.858) ≡ the old (150, 858) at 1000². */
const UNFILED_ANCHOR_FX = 0.15
const UNFILED_ANCHOR_FY = 0.858

/** the world Plexi Brain lays out in — square, centered. size grows with content. */
export interface World {
  size: number
  cx: number
  cy: number
  /** the radius (world units from center) of the ROOM RING + its labels — the
   *  cruise "story" the camera frames by default. The full world extends past this
   *  (widgets fan further out, resolving on zoom-in); the camera opens on the ring so
   *  cruise shows the labeled rooms at a readable size, not a tiny far-flung sprinkle. */
  cruiseRadius: number
}

/**
 * The world size for a given content reach: a square big enough to hold the island
 * ring, the desks+widgets orbiting each island, and the identity band outside it —
 * never smaller than the default 1000². `outerReach` is the farthest any placed
 * node sits from the center (world units); the world adds a margin around it.
 * Deterministic (pure arithmetic). C2.2/C2.3 feed it the construction-derived reach.
 */
export function computeWorldSize(outerReach: number): number {
  const WORLD_MARGIN = 90
  const needed = 2 * (outerReach + WORLD_MARGIN)
  return Math.max(ISLAND_W, Math.ceil(needed))
}

/** how many unfiled tiles the stack shows before honest "+N" overflow */
export const UNFILED_STACK_MAX = 12

// base tile sizes (world units) — sizes shrink by depth: room > desk > leaf.
// P4.5c C2.6: bumped up so tiles read as SUBSTANTIAL presences at cruise, not tiny
// dots (the big-world camera rendered the old sizes as specks). The invariant
// auto-holds — bigger tiles just reserve more footprint, which the ring/world size from.
// P4.5c C4 triad-tune (operator 2026-07-22: "make the rooms a bit bigger when
// zoomed out"): [100,88,76] → [140,124,108]. Near-free on spacing — the ring is
// FAN-dominated (needChord = 2×fanTangential ≥ maxIslandDiag), so bigger room
// tiles don't push the ring out; they just fill more of their reserved seat.
const SIZE_ROOM = [140, 124, 108] as const // importance ≥.8 / ≥.6 / rest
const SIZE_SOLO_ISLAND = 56
const SIZE_DESK = 46
const SIZE_LEAF = 26
const SIZE_IDENTITY_PERSON = 38
const SIZE_IDENTITY_ORG = 42
const SIZE_UNFILED = 24

// ── THE FOOTPRINT CONTRACT (P4.5c C2) — the ONE definition of "how much room a
// node occupies", used by BOTH the de-overlap invariant test AND the construction
// that guarantees it. A node's footprint is the union of its TILE (a square, side
// = size) and its LABEL rectangle (below the tile). Overlap becomes a bounded-BOX
// problem, provable once by a static test.
//
// The label is reserved AT THE ZOOM WHERE IT FIRST APPEARS, not the global floor.
// The renderer shows labels progressively (operator: ROOMS ONLY at cruise; desk /
// leaf / identity labels fade in only as you zoom toward them, by which point the
// camera has already spread their neighbors). Reserving every label at the floor
// would explode the world (a leaf's 92px label ÷ floor ≈ 186 world units per
// widget). Instead each role reserves at ITS appearance zoom zApp:
//   worldLabelW = labelPx × lf(zApp) / sApp,  sApp = zApp × S_CRUISE
// S_CRUISE cancels via the fixed floor fraction (CAM_S_MIN = S_CRUISE × frac), so
// this is scale-agnostic: worldLabelW = labelPx × lf(zApp) × frac / (zApp × CAM_S_MIN).
// lf(z) = clamp(0.85, 2.6, sqrt(z)) mirrors the renderer. Because a label's WORLD
// width only shrinks as you zoom past its appearance (lf grows ∝√s, width ∝ 1/s),
// the reservation at zApp is its widest-while-visible extent — so a layout proven
// disjoint here is disjoint at every zoom the label is on screen (monotonic). The
// renderer clamps rendered max-width to the budgeted world width × s, so reserve
// and reality cannot diverge.
export const CAM_S_MIN = 0.42 // the whole-world-framed camera scale floor (mirrors the renderer)
const CAM_S_MIN_FRAC = 0.55 // CAM_S_MIN = S_CRUISE × this (mirrors the renderer floor fraction)
/** screen-px label width per role (mirrors the renderer's labelW) */
const LABEL_PX: Record<IslandPlaced['role'], number> = {
  island: 120,
  desk: 104,
  identity: 104,
  leaf: 92,
  unfiled: 92
}
/** screen-px line height per role (mirrors the renderer's fontSize × lineHeight 1.2) */
const LABEL_LINE_PX: Record<IslandPlaced['role'], number> = {
  island: 13 * 1.2,
  desk: 10 * 1.2,
  identity: 9 * 1.2,
  leaf: 9 * 1.2,
  unfiled: 9 * 1.2
}
/** the "z" (= s / S_CRUISE) at which each role's label FIRST appears (mirrors the
 *  renderer's showLabel thresholds). z_floor = CAM_S_MIN_FRAC (whole-world framing).
 *  Rooms/unfiled speak at cruise; desks at 1.25; identities at ~2.2; leaves at 2.6. */
const LABEL_APPEAR_Z: Record<IslandPlaced['role'], number> = {
  island: CAM_S_MIN_FRAC,
  unfiled: CAM_S_MIN_FRAC,
  desk: 1.25,
  identity: 2.2,
  leaf: 2.6
}
const lfAt = (z: number): number => Math.min(2.6, Math.max(0.85, Math.sqrt(z)))
/** per-role CAP on the reserved label world-width (P4.5c C2.3). A leaf/desk label's
 *  natural world width (≈75/122) would force a huge seat per widget, exploding the
 *  world for a busy desk. The renderer CLAMPS the rendered label to this same cap
 *  (max-width, ellipsized) so reserve == reality — widgets pack tight by ~tile, and
 *  a long widget title truncates rather than shoving the whole brain apart. Rooms
 *  keep their full label (they headline the cruise view and sit on a spacious ring);
 *  Infinity = no cap. Mirrored in the renderer's labelW clamp. */
const LABEL_WORLD_W_CAP: Record<IslandPlaced['role'], number> = {
  island: Infinity,
  desk: 64,
  identity: 84,
  leaf: 40,
  unfiled: Infinity
}
/** small breathing gap (world units) added around every footprint */
export const FOOTPRINT_GAP = 6

// ── THE AUTHENTIC-SHAPE SPEC (P4.5c C3.3) — each node's real SILHOUETTE, so a
// document reads as a portrait page, a spreadsheet as a landscape grid, a sticky
// as a square note, "recognizable by shape at a glance" (Conducting-AI type-as-
// visual-primitive, authentic app shapes not colored dots). PURE + deterministic +
// DEC-014-clean: keyed ONLY on structural node type + widget/doc SUBTYPE (a widget
// KIND like 'sheet'/'webview' is app furniture, not domain vocabulary), never on a
// room name or any authored taxonomy.
//
// SIZE IS THE LONGEST SIDE (operator fork 2026-07-20): a node's `size` field is its
// LONG axis; the short axis = aspect × size (aspect ≤ 1). Because a w×h box whose
// longest side is `size` has a bounding DIAGONAL ≤ the size×size square's diagonal,
// the aspect-correct footprint never exceeds the old square on the orbit-pitch axis
// (footprintRadius = half-diagonal) → the C2 zero-overlap construction stays valid
// BY CONSTRUCTION and the world does not re-space. `sil` is a render hint only (the
// footprint math ignores it; the renderer draws the literal chrome).
export type Silhouette =
  | 'square' // sticky / note / card / person / org / tool / unfiled / room-fallback
  | 'page' // portrait document — folded corner
  | 'grid' // landscape spreadsheet / table — grid card
  | 'browser' // webview / portal — browser frame + title-bar strip
  | 'image' // landscape framed image / video
  | 'desk' // landscape mini desk-canvas (DeskMiniature)
  | 'room' // room true form (RoomThumb desk-cluster)
export interface NodeShape {
  /** which axis carries the full `size`; the other is `aspect × size` */
  longAxis: 'w' | 'h'
  /** short-side ÷ long-side, in (0, 1]; 1 = square */
  aspect: number
  /** render silhouette (chrome hint for the renderer; footprint math ignores it) */
  sil: Silhouette
}

/** the authentic shape for a node's structural type + subtype (widget kind / docType).
 *  Pure, deterministic, DEC-014-clean. The renderer reads the SAME function so the
 *  reserved footprint and the drawn silhouette can never diverge (the C2 discipline). */
export function nodeShape(type: string, subtype: string | null): NodeShape {
  // documents / pages → portrait page (taller than wide)
  const DOC_SUB = new Set(['doc', 'page', 'pdf', 'gdoc', 'living-doc'])
  const GRID_SUB = new Set(['sheet', 'table', 'gsheet'])
  const BROWSER_SUB = new Set(['webview', 'portal'])
  const IMAGE_SUB = new Set(['image', 'video', 'file'])
  if (type === 'room') return { longAxis: 'w', aspect: 0.82, sil: 'room' }
  if (type === 'project') return { longAxis: 'w', aspect: 0.66, sil: 'desk' } // desk = landscape mini-canvas
  if (type === 'document') return { longAxis: 'h', aspect: 0.77, sil: 'page' }
  if (type === 'artifact' && subtype) {
    if (DOC_SUB.has(subtype)) return { longAxis: 'h', aspect: 0.77, sil: 'page' }
    if (GRID_SUB.has(subtype)) return { longAxis: 'w', aspect: 0.72, sil: 'grid' }
    if (BROWSER_SUB.has(subtype)) return { longAxis: 'w', aspect: 0.72, sil: 'browser' }
    if (IMAGE_SUB.has(subtype)) return { longAxis: 'w', aspect: 0.72, sil: 'image' }
    if (subtype === 'slides' || subtype === 'gslide') return { longAxis: 'w', aspect: 0.62, sil: 'grid' }
  }
  // sticky / note / markdown / card / scratchpad / shape / identities / unfiled →
  // square (their real proportion — a sticky note is square).
  return { longAxis: 'w', aspect: 1, sil: 'square' }
}

/** the shape's world-space half-extents (half-width, half-height) for a tile whose
 *  `size` is its LONG axis. longAxis carries size/2; the other is aspect×size/2. */
export function shapeHalfExtent(size: number, shape: NodeShape): { hw: number; hh: number } {
  const halfLong = size / 2
  const halfShort = (size * shape.aspect) / 2
  return shape.longAxis === 'w'
    ? { hw: halfLong, hh: halfShort }
    : { hw: halfShort, hh: halfLong }
}

/** an axis-aligned world-space box: [minX, minY, maxX, maxY] */
export type Footprint = { minX: number; minY: number; maxX: number; maxY: number }

/** the world-space width a role's label reserves, at its appearance zoom (capped). */
function labelWorldW(role: IslandPlaced['role']): number {
  const z = LABEL_APPEAR_Z[role]
  const natural = (LABEL_PX[role] * lfAt(z) * CAM_S_MIN_FRAC) / (z * CAM_S_MIN)
  return Math.min(natural, LABEL_WORLD_W_CAP[role])
}
function labelWorldH(role: IslandPlaced['role']): number {
  const z = LABEL_APPEAR_Z[role]
  return (2 * LABEL_LINE_PX[role] * lfAt(z) * CAM_S_MIN_FRAC) / (z * CAM_S_MIN)
}

/**
 * The world-space footprint a node reserves — tile square ∪ label rectangle
 * (label sized at its appearance zoom), + FOOTPRINT_GAP inset on all sides. Pass
 * `{ label: false }` for the tile-only box (e.g. computing a widget-orbit that
 * ignores labels the camera has already spread). The invariant test uses the full
 * footprint — labels included at their appearance zoom.
 */
export function nodeFootprint(p: IslandPlaced, opts?: { label?: boolean }): Footprint {
  // P4.5c C3.3: reserve the AUTHENTIC (non-square) tile box. `shape` may be absent on
  // the synthetic {x,y,size,role} probes the packer builds → default to a square, so
  // those orbit-pitch callers keep their prior (square) reservation. The real placed
  // nodes carry their shape → the world spaces the true portrait/landscape footprint.
  const shape: NodeShape = p.shape ?? { longAxis: 'w', aspect: 1, sil: 'square' }
  const { hw, hh } = shapeHalfExtent(p.size, shape)
  let minX = p.x - hw
  let maxX = p.x + hw
  let minY = p.y - hh
  let maxY = p.y + hh
  // Tile-only for roles the renderer never labels EN-MASSE at cruise (so their labels
  // can't collide with a sibling's): unfiled (group caption only), leaf + desk (P4.5c
  // C2.6 — hover/deep-zoom only, per the operator's "rooms only at cruise"). These
  // pack by TILE → the world stays compact and tiles read big. Only ROOMS + identities
  // reserve a label box (they're the cruise story). A desk/leaf label appears solo on
  // hover or at deep zoom, where the camera has already spread its neighbors.
  const labelless = p.role === 'unfiled' || p.role === 'leaf' || p.role === 'desk'
  if (opts?.label !== false && !labelless) {
    const wLabel = labelWorldW(p.role)
    const hLabel = labelWorldH(p.role)
    const gapBelow = ((p.role === 'island' ? 6 : 4) * lfAt(LABEL_APPEAR_Z[p.role]) * CAM_S_MIN_FRAC) / (LABEL_APPEAR_Z[p.role] * CAM_S_MIN)
    const lminX = p.x - wLabel / 2
    const lmaxX = p.x + wLabel / 2
    const lminY = p.y + hh + gapBelow // below the tile's real (aspect-correct) bottom edge
    const lmaxY = lminY + hLabel
    minX = Math.min(minX, lminX)
    maxX = Math.max(maxX, lmaxX)
    minY = Math.min(minY, lminY)
    maxY = Math.max(maxY, lmaxY)
  }
  return {
    minX: minX - FOOTPRINT_GAP,
    minY: minY - FOOTPRINT_GAP,
    maxX: maxX + FOOTPRINT_GAP,
    maxY: maxY + FOOTPRINT_GAP
  }
}

/** do two world-space footprints intersect? (AABB overlap) */
export function footprintsIntersect(a: Footprint, b: Footprint): boolean {
  return a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY
}

/** the bounding radius (world units) of a role's footprint = half its diagonal.
 *  Two same-role tiles whose centers sit ≥ 2×this apart cannot intersect in ANY
 *  orientation — the tilt-independent seat size for the (rotationally-placed) desk
 *  fan + island ring, where a tile can face any direction. */
function footprintRadius(role: IslandPlaced['role'], size: number): number {
  const fp = nodeFootprint({ x: 0, y: 0, size, role } as IslandPlaced)
  return Math.hypot(fp.maxX - fp.minX, fp.maxY - fp.minY) / 2
}
/** the radius desks must clear around their ISLAND (P4.5c C2.6). Desks fan OUTWARD
 *  (radially away from center) while the room's big label extends DOWNWARD, so a desk
 *  only needs to clear the room TILE + a modest label-height margin — NOT the full
 *  ~242-wide label box (using that pushed desks 3× too far and made every tile a dot).
 *  The floater net still resolves the rare desk-under-a-lower-island-label case. */
function islandClearR(islandSize: number): number {
  const labelH = nodeFootprint({ x: 0, y: 0, size: islandSize, role: 'island' } as IslandPlaced)
  const belowExtent = labelH.maxY - islandSize / 2 // tile bottom → label bottom (+gap)
  return islandSize / 2 + belowExtent
}

/** a local (desk-relative) offset produced by the widget-orbit packer */
interface OrbitSeat {
  dx: number
  dy: number
  /** the widest reach (world units) from the desk center any seat occupies */
}
/**
 * BRICK-STAGGERED CONCENTRIC ORBIT (P4.5c C2.3): pack N leaves around a desk on
 * rings, each seat a full leaf footprint-radius apart from its neighbors so no two
 * widgets (tile OR label) touch — "a sticky floating in free space on a line to
 * its desk". Rings step outward by the leaf diameter (footprint), fanned toward
 * `outwardDeg` so widgets open into empty space away from the island interior.
 * Ring k+1 is half-pitch offset (brick stagger) so no widget sits radially behind
 * another. Deterministic — index order only, no hash/clock. Returns the seats +
 * the outer reach (for desk-fan sizing).
 */
/** widgets fan within this bounded OUTWARD wedge (deg) — never a full ring, so they
 *  always open AWAY from the island (a full 360° ring would wrap widgets back toward
 *  the island and into neighbor desks, breaking "floats outward" + structure). */
const ORBIT_WEDGE_DEG = 300
function packOrbit(
  count: number,
  centerRole: IslandPlaced['role'],
  centerSize: number,
  leafSize: number,
  outwardDeg: number
): { seats: OrbitSeat[]; reach: number } {
  const seats: OrbitSeat[] = []
  const centerR = footprintRadius(centerRole, centerSize) // tile+label of the center
  if (count <= 0) return { seats, reach: centerR }
  // seat = the leaf's footprint bounding radius (half-diagonal): a seat can face any
  // arc direction, so the diagonal is the provably-safe pitch both tangentially and
  // radially (a tighter axis-split let brick-staggered ring-neighbors collide).
  const seatR = footprintRadius('leaf', leafSize)
  const seatArc = 2 * seatR + FOOTPRINT_GAP // min center-to-center along a ring
  const ringStep = 2 * seatR + FOOTPRINT_GAP // ring k→k+1 clears full footprints
  const r0 = centerR + seatR + FOOTPRINT_GAP // first ring clears the desk's full footprint
  const wedge = (ORBIT_WEDGE_DEG * Math.PI) / 180
  let remaining = count
  let ring = 0
  let maxReach = centerSize / 2
  while (remaining > 0) {
    const rr = r0 + ring * ringStep
    // how many seats fit in the OUTWARD WEDGE at this radius (arc length wedge·rr),
    // at the seatArc pitch — always ≥ 1 so a lone widget still gets a seat.
    const cap = Math.max(1, Math.floor((wedge * rr) / seatArc))
    const take = Math.min(cap, remaining)
    // even pitch across the wedge (pitch = wedge/cap ≥ seatArc/rr by construction so
    // neighbors never crowd); center the used seats on the outward direction. Ring
    // k+1 is half-pitch offset (brick stagger) so no widget sits radially behind
    // the one inside it.
    const pitchDeg = ORBIT_WEDGE_DEG / cap
    const stagger = ring % 2 === 0 ? 0 : pitchDeg / 2
    const start = outwardDeg - ((take - 1) / 2) * pitchDeg
    for (let k = 0; k < take; k++) {
      const ang = start + k * pitchDeg + stagger
      seats.push({ dx: Math.cos(rad(ang)) * rr, dy: Math.sin(rad(ang)) * rr })
    }
    maxReach = Math.max(maxReach, rr + seatR)
    remaining -= take
    ring++
  }
  return { seats, reach: maxReach }
}

export interface IslandPlaced {
  id: string
  x: number
  y: number
  /** island root = 1, desk-level = 2, leaf = 3 (identities/unfiled use their band) */
  depth: 1 | 2 | 3
  role: 'island' | 'desk' | 'leaf' | 'identity' | 'unfiled'
  /** the drawn descent parent (null for islands, identities, unfiled) */
  parentId: string | null
  /** the island root this node descends from (null for identities/unfiled) */
  islandId: string | null
  /** sector-wheel index inherited from the island (null → renderer class hue) */
  hueIndex: number | null
  /** base tile size in world units (the node's LONG axis) — the renderer multiplies by its growth curve */
  size: number
  /** the authentic silhouette + aspect (P4.5c C3.3) — the short axis = aspect × size.
   *  Defaults to a square for roles the shape spec doesn't distinguish (identities,
   *  unfiled). Reserved by nodeFootprint so the world spaces the real, non-square form. */
  shape: NodeShape
  /** importance rank among siblings (0 = most important) — per-island LOD budgets cut on this */
  rankInParent: number
  /** unfiled overflow: parked at the stack anchor; renderer shows a "+N" chip instead */
  overflow: boolean
  /** the outward direction (deg) this node's children fan toward */
  outwardDeg: number
}

export interface IslandTreeLayout {
  placed: Map<string, IslandPlaced>
  islands: Array<{ id: string; angleDeg: number; hueIndex: number; deskCount: number }>
  unfiled: { anchorX: number; anchorY: number; shownIds: string[]; overflowCount: number }
  /** base-app room id → room NODE id (identity memberRooms hold base ids) */
  baseToNode: Map<string, string>
  /** P4.5c C3.5: parent-room → sub-room links (a room nested inside a room). Both are
   *  islands; the renderer draws a descent line between them so the folder-in-folder
   *  hierarchy stays visible even though the sub-room is placed as its own island. */
  subRoomLinks: Array<{ parentId: string; childId: string }>
  /** the square world this layout was laid out in (P4.5c C2 — grows with content) */
  world: World
}

// The Unfiled stack is focusable as a pseudo-island ("what's in the pile?"). The
// old semantic-zoom WARP (semanticPositions + RIM/FOCUS spread) was REMOVED in
// P4.5c — C1 replaced it with a real pan-and-zoom camera over the fixed world, and
// C2/C3 grow that world so nothing overlaps; there is no layout warp anymore.
/** the focusable pseudo-island id for the Unfiled stack ("what's in the pile?") */
export const UNFILED_FOCUS_ID = '__unfiled__'

// ── per-island LOD budgets (DEC-010: ~30-150 DRAWN per frame, enforced by the
// renderer per-viewport — the payload carries the whole folded tree). At cruise the
// picture is center + islands + desks (+ identities + the unfiled stack); leaves
// MATERIALIZE per island as you approach. This is the pure budget curve the
// renderer cuts rankInParent against — deterministic, no clock.
export function leafBudgetAt(z: number): number {
  if (z < 1.55) return 0 // cruise: structure only — no leaf noise
  if (z < 2.1) return 4 // approaching: each desk shows its top leaves
  if (z < 2.8) return 9 // working: a full first ring per desk
  return 24 // deep: everything a desk realistically holds
}

// P4.5c C2.3: the layout is now FULLY construction-based — every position derives
// from deterministic packing/fan math (packOrbit, label-derived rings, strongest-
// room snap), so the old hash01 organic jitter was removed entirely. The layout is
// pure and deterministic by construction, with no variation source at all.

const rad = (deg: number): number => (deg * Math.PI) / 180
const clampBox = (v: number, max: number): number => Math.min(max - 6, Math.max(6, v))

function byImportanceThenId(a: GraphViewNode, b: GraphViewNode): number {
  return b.importance - a.importance || a.id.localeCompare(b.id)
}

function roomSize(importance: number): number {
  return importance >= 0.8 ? SIZE_ROOM[0] : importance >= 0.6 ? SIZE_ROOM[1] : SIZE_ROOM[2]
}

/**
 * Lay the payload out as the island tree. Positions, depths, hue inheritance, and
 * per-sibling ranks — the renderer decides pixels, budgets, and line voices.
 */
export function layoutIslandTree(
  nodesIn: GraphViewNode[],
  edgesIn: GraphViewEdge[]
): IslandTreeLayout {
  const nodes = [...nodesIn].sort((a, b) => a.id.localeCompare(b.id))
  const byId = new Map(nodes.map((n) => [n.id, n]))

  // ── containment: child → deterministic single parent; parent → ranked children ──
  const parentOf = new Map<string, string>()
  for (const e of [...edgesIn].sort((a, b) => a.srcId.localeCompare(b.srcId) || a.dstId.localeCompare(b.dstId))) {
    if (e.type !== 'contains') continue
    if (!byId.has(e.srcId) || !byId.has(e.dstId)) continue
    if (e.srcId === e.dstId) continue
    if (!parentOf.has(e.dstId)) parentOf.set(e.dstId, e.srcId) // smallest src wins → deterministic
  }
  // break cycles: walk each chain; a repeat visit severs the link that closes the loop
  for (const id of [...parentOf.keys()].sort()) {
    const seen = new Set<string>([id])
    let cur = id
    while (parentOf.has(cur)) {
      const p = parentOf.get(cur)!
      if (seen.has(p)) {
        parentOf.delete(cur)
        break
      }
      seen.add(p)
      cur = p
    }
  }
  const childrenOf = new Map<string, GraphViewNode[]>()
  for (const [child, parent] of parentOf) {
    const list = childrenOf.get(parent) ?? []
    list.push(byId.get(child)!)
    childrenOf.set(parent, list)
  }
  for (const list of childrenOf.values()) list.sort(byImportanceThenId)

  const isIdentity = (n: GraphViewNode): boolean =>
    n.type === 'person' || n.type === 'organization' || n.type === 'tool'

  // ── SUB-ROOMS (P4.5c C3.5): a room can live INSIDE another room (a folder in a
  //    folder). The old layout had no sub-room concept, so a sub-room fell into its
  //    parent's desk fan as an ordinary "desk", its real desks became "leaves", and
  //    its widgets (one level too deep) were CLAMPED onto a single seat → a guaranteed
  //    pile-up (a sticky sitting on top of a desk). Operator decision: a sub-room is
  //    its OWN ISLAND placed near its parent, linked by a descent line — so its desks
  //    fan and its widgets orbit through the SAME zero-overlap machinery every island
  //    uses. We detect sub-rooms (a `room` WITH a parent), record the parent for the
  //    link, then SEVER the containment edge so the sub-room is a fresh island root and
  //    is NOT also fanned as a desk of its parent (which would double-place it).
  const subRoomParent = new Map<string, string>() // subRoomId → parentRoomId
  for (const n of nodes) {
    if (n.type === 'room' && parentOf.has(n.id)) {
      subRoomParent.set(n.id, parentOf.get(n.id)!)
    }
  }
  for (const [subId, parentId] of subRoomParent) {
    parentOf.delete(subId) // sub-room becomes a top-level root…
    const sibs = childrenOf.get(parentId)
    if (sibs) {
      // …and drops out of its parent's child fan (no longer a phantom desk)
      const next = sibs.filter((c) => c.id !== subId)
      if (next.length > 0) childrenOf.set(parentId, next)
      else childrenOf.delete(parentId)
    }
  }

  // ── island roots: every room (INCLUDING former sub-rooms, now severed to roots),
  //    plus any containment root WITH children that isn't an identity (a standalone
  //    desk carrying its own widgets is its own island). Rooms are always roots. ──
  const islandRoots = nodes
    .filter(
      (n) =>
        !isIdentity(n) &&
        !parentOf.has(n.id) &&
        (n.type === 'room' || (childrenOf.get(n.id)?.length ?? 0) > 0)
    )
    .sort(byImportanceThenId)

  const placed = new Map<string, IslandPlaced>()
  const islands: IslandTreeLayout['islands'] = []
  const baseToNode = new Map<string, string>()
  for (const n of nodes) {
    if (n.type === 'room' && n.baseId) baseToNode.set(n.baseId, n.id)
  }

  // ── Level 1: islands on a DELIBERATE even ring (P4.5b Phase 5) — perfect
  //    angular pitch (no jitter) so the composition reads as balanced and
  //    geometric with no dead regions. P4.5c C2.2: the ring radius is DERIVED FROM
  //    LABEL-INCLUSIVE FOOTPRINTS so adjacent islands (tile AND label) can never
  //    touch — the failure the old fixed ~280 ring couldn't avoid (a room's ~243-
  //    world-unit label box overlapping its neighbor). The arc distance between
  //    island centers must exceed the sum of their footprint half-spans; solve for
  //    the radius that guarantees it, then FREEZE the islands. Deterministic.
  const islandSizeOf = (root: GraphViewNode): number =>
    root.type === 'room' ? roomSize(root.importance) : SIZE_SOLO_ISLAND
  // footprint DIAGONAL (world units): the box's bounding radius in ANY direction.
  // Two axis-aligned boxes whose centers sit ≥ (diagA/2 + diagB/2) apart cannot
  // intersect no matter how the chord is oriented on the ring — the provable,
  // tilt-independent no-touch condition (an x/y-projection bound fails near the
  // ring's poles, where the chord is nearly axis-aligned; the diagonal doesn't).
  // Derived from the ONE footprint contract, so reserve == the test's reality.
  const islandDiag = (size: number): number => {
    const fp = nodeFootprint({ x: 0, y: 0, size, role: 'island' } as IslandPlaced)
    return Math.hypot(fp.maxX - fp.minX, fp.maxY - fp.minY)
  }
  const nIslands = Math.max(1, islandRoots.length)
  const maxIslandDiag = islandRoots.length
    ? Math.max(...islandRoots.map((r) => islandDiag(islandSizeOf(r))))
    : islandDiag(SIZE_ROOM[0])

  // ── each island's full REACH (world units from its own center) = its desk fan +
  //    the outer desk's widget disk. Computed EXACTLY by pre-packing (same packOrbit
  //    the placement uses), so the ring + world always contain it — nothing clamps.
  //    Used BOTH to size the ring (so neighbor islands' whole disks never touch) AND
  //    to grow the world. Reach ignores labels below the island (they point outward,
  //    into empty radial space) — the ring's label-diagonal term covers island labels.
  const islandReachOf = (root: GraphViewNode): number => {
    const isRoom = root.type === 'room'
    const childRole: 'desk' | 'leaf' = isRoom ? 'desk' : 'leaf'
    const childSize = isRoom ? SIZE_DESK : SIZE_LEAF
    const islandSize = islandSizeOf(root)
    const kids = childrenOf.get(root.id) ?? []
    const islandR = islandClearR(islandSize)
    if (kids.length === 0) return islandR + footprintRadius(childRole, childSize)
    if (!isRoom) return islandR + footprintRadius('leaf', childSize) // standalone-desk: children are leaves at the island
    // mirror the placement's concentric-arc desk fan (wedge capacity) to learn the
    // outermost row's reach — same math, so the world always contains it.
    const diskRs = kids.map((desk) => {
      const leaves = childrenOf.get(desk.id) ?? []
      const pack = packOrbit(leaves.length, 'desk', childSize, SIZE_LEAF, 0)
      return Math.max(footprintRadius('desk', childSize), pack.reach)
    })
    const maxDiskR = Math.max(...diskRs, childSize / 2)
    const DESK_WEDGE_DEG = 300
    let reach = 0
    let idx = 0
    let row = 0
    while (idx < diskRs.length) {
      const orbit = islandR + FOOTPRINT_GAP + maxDiskR + row * (2 * maxDiskR + FOOTPRINT_GAP)
      const pitchDeg = (2 * Math.asin(Math.min(1, (maxDiskR + FOOTPRINT_GAP) / orbit)) * 180) / Math.PI
      const cap = Math.max(1, Math.floor(DESK_WEDGE_DEG / Math.max(pitchDeg, 1e-3)))
      const take = Math.min(cap, diskRs.length - idx)
      reach = Math.max(reach, orbit + maxDiskR)
      idx += take
      row++
    }
    return reach
  }
  const maxIslandReach = islandRoots.length ? Math.max(...islandRoots.map(islandReachOf)) : maxIslandDiag / 2

  // ── the RING radius + SEATING (P4.5c C2.2 + C2.6, re-solved C4 triad-tune):
  //    big enough that neither adjacent island LABELS nor their desk/widget FANS
  //    touch. The fans point OUTWARD (radially away from center) in a bounded
  //    wedge, so a neighbor only sees an island's TANGENTIAL extent
  //    (≈ reach × sin(wedgeHalf)), NOT its full radial reach.
  //
  //    C4 triad-tune (operator 2026-07-22: "bring the rooms a bit closer in —
  //    everything seems very far from each other"): the old even-pitch solve
  //    sized EVERY pitch by the WORST island's fan — one giant island (a room
  //    with 20+ widget desks reaches ~1100 world units) taxed all fourteen gaps,
  //    blowing the ring to ~2800 and rendering every room as a ~19px speck
  //    (measured in-app). Re-solve with NEED-PROPORTIONAL seating: each island
  //    reserves arc for ITS OWN half-need; the gap between neighbors i,j is
  //    halfNeed_i + halfNeed_j; the ring is the smallest R whose circumference
  //    holds the sum (arc ≥ chord, so the arc-sum solve is conservative). Small
  //    islands pack close; the giant keeps its clearance. Leftover slack is
  //    distributed evenly so the ring stays balanced. Same R for every island
  //    (the ring stays a ring — the structure sub-lock's tolerance holds);
  //    deterministic (seat order = islandRoots order); frozen after seating.
  //    The dense-corpus zero-overlap lock remains the arbiter.
  //    NOTE (found closing the C4 re-solve): for a wedge ≥ 180° the tangential
  //    half-extent is the FULL reach — the wedge contains the ±90° directions, so
  //    sin(wedgeHalf) under-measures (the old even-pitch slack silently absorbed
  //    that model error; exact-need packing exposed it — the lock went red on
  //    island-vs-neighbor-leaf pairs until corrected). Cap the angle at 90°.
  const tangentialHalfOf = (root: GraphViewNode): number =>
    islandReachOf(root) * Math.sin(Math.min(90, ORBIT_WEDGE_DEG / 2) * (Math.PI / 180))
  const halfNeedOf = (root: GraphViewNode): number =>
    Math.max(islandDiag(islandSizeOf(root)), 2 * tangentialHalfOf(root)) / 2 + FOOTPRINT_GAP / 2
  //    THE LABEL SEAT-ARC FLOOR (found live-shotting the re-solve): an EMPTY room's
  //    world need is just its tile diag — but at cruise it still carries a ~120px
  //    screen LABEL. Seating two empty rooms at their tiny world need crashed their
  //    labels ("wedding"/"Q3 Product Launch" collided at the top of the real
  //    corpus). A cruise label's width vs the ring's screen radius is a pure ANGLE
  //    (both are screen quantities: ring screen-R ≈ vpMin×0.94/2 at the cruise
  //    framing, label ≈ 132px incl. gap → ≈0.34 rad on a typical viewport), so
  //    floor every seat's arc at MIN_SEAT_ARC. Converted to world units against the
  //    world-need ring R0, then the ring re-solved once (2-pass, monotone: R only
  //    ever grows, so fan/tile world needs stay respected). Deterministic.
  const rawHalfNeeds = islandRoots.map(halfNeedOf)
  const ringR0 = Math.max(
    ISLAND_RING_R + Math.max(0, islandRoots.length - 6) * 12,
    nIslands > 1 ? (2 * rawHalfNeeds.reduce((a, b) => a + b, 0)) / (2 * Math.PI) : 0
  )
  const MIN_SEAT_ARC_RAD = 0.34
  const labelHalfFloor = (MIN_SEAT_ARC_RAD * ringR0) / 2
  const halfNeeds = rawHalfNeeds.map((h) => Math.max(h, labelHalfFloor))
  const totalNeedArc = 2 * halfNeeds.reduce((a, b) => a + b, 0) // Σ adjacent-pair needs
  const ringByGeom = nIslands > 1 ? totalNeedArc / (2 * Math.PI) : 0
  const ringR = Math.max(ISLAND_RING_R + Math.max(0, islandRoots.length - 6) * 12, ringByGeom)

  // ── THE WORLD (P4.5c C2): grown to CONTAIN the ring + island reach + identity band.
  //    Under the C1 camera a bigger world just lowers the fit scale (start more
  //    zoomed-out, zoom in more) — the operator's rule. Never below 1000². Center =
  //    size/2, so cx/cy + clampBox W/H frame the grown world. computeWorldSize margins it.
  // the identity band sits just outside the ring's outer edge; its own footprint +
  // a few fan-out steps set the outermost reach.
  const idHalfSpanEst = footprintRadius('identity', SIZE_IDENTITY_ORG)
  const identityBandOuter = ringR + maxIslandDiag / 2 + idHalfSpanEst + FOOTPRINT_GAP + 3 * (2 * idHalfSpanEst + FOOTPRINT_GAP)
  const outerReach = Math.max(ringR + maxIslandReach, identityBandOuter)
  // the cruise story (P4.5c C2.6: "denser, more alive" — operator). Frame the room
  // ring SNUGLY (just past the room tiles, NOT their full outward labels or the desk
  // orbit) so cam.s is large and tiles render BIG — tiles grow ∝ s while labels grow
  // ∝ √s, so a tight frame lets tiles catch up to the labels (fixes the "small dots,
  // huge labels" imbalance). Desks peek in at the frame edges → busy/alive; rooms fill
  // the view. Widgets resolve fully on zoom-in.
  const cruiseRadius = ringR + SIZE_ROOM[0] / 2 + FOOTPRINT_GAP
  const world: World = (() => {
    const size = computeWorldSize(outerReach)
    return { size, cx: size / 2, cy: size / 2, cruiseRadius }
  })()
  const W = world.size
  const H = world.size
  const cx = world.cx
  const cy = world.cy

  // seat islands by CUMULATIVE per-pair need (C4 triad-tune): the arc between
  // neighbors i-1,i = (halfNeed_{i-1} + halfNeed_i)/R, plus an even share of any
  // slack the floor term added. Angles are cumulative from -90°; deterministic.
  const slackDeg = Math.max(0, 360 - (totalNeedArc / ringR) * (180 / Math.PI))
  const seatAngles: number[] = []
  {
    let a = -90
    for (let i = 0; i < islandRoots.length; i++) {
      if (i > 0) {
        const pairArcDeg = ((halfNeeds[i - 1] + halfNeeds[i]) / ringR) * (180 / Math.PI)
        a += pairArcDeg + slackDeg / nIslands
      }
      seatAngles.push(a)
    }
  }
  islandRoots.forEach((root, i) => {
    const angleDeg = seatAngles[i]
    const r = ringR
    const size = islandSizeOf(root)
    const x = clampBox(cx + Math.cos(rad(angleDeg)) * r, W)
    const y = clampBox(cy + Math.sin(rad(angleDeg)) * r, H)
    placed.set(root.id, {
      id: root.id,
      x,
      y,
      depth: 1,
      role: 'island',
      parentId: null,
      islandId: root.id,
      hueIndex: i,
      size,
      shape: nodeShape(root.type, root.subtype),
      rankInParent: i,
      overflow: false,
      outwardDeg: angleDeg
    })
    islands.push({ id: root.id, angleDeg, hueIndex: i, deskCount: childrenOf.get(root.id)?.length ?? 0 })
  })

  // ── Level 2 + 3 (P4.5c C2.3): desks fan OUTWARD from their island in a wedge
  //    SIZED FROM each desk's widget REACH, so a busy desk and its whole widget
  //    orbit never touch the next desk; widgets (leaves) are real FLOATING NODES on
  //    a brick-staggered orbit around their desk (packOrbit), each on a descent line
  //    desk→widget — "a sticky floating in free space, tethered to its desk". All
  //    deterministic (index order, no hash/clock). ──
  for (const root of islandRoots) {
    const island = placed.get(root.id)!
    const desks = childrenOf.get(root.id) ?? []
    // a standalone-desk island's children are its WIDGETS/items — leaves, so the
    // cruise picture stays structure-only (the leaf budget governs them)
    const childRole: 'desk' | 'leaf' = root.type === 'room' ? 'desk' : 'leaf'
    const childSize = childRole === 'desk' ? SIZE_DESK : SIZE_LEAF

    // Pre-pack each desk's widget orbit to learn its reach, so the desk fan can be
    // sized to hold every desk's full disk without sibling desks colliding.
    const deskPacks = desks.map((desk) => {
      const leaves = childRole === 'desk' ? childrenOf.get(desk.id) ?? [] : []
      const pack = packOrbit(leaves.length, 'desk', childSize, SIZE_LEAF, island.outwardDeg)
      // the desk's own footprint radius (tile+label) OR its widget reach, whichever
      // is bigger — the radius the fan must keep clear around this desk center.
      const selfR = footprintRadius(childRole, childSize)
      return { desk, leaves, pack, diskR: Math.max(selfR, pack.reach) }
    })

    // Fan the desks on concentric arcs facing outward, within a BOUNDED wedge (so
    // the extreme desks of a row never wrap around toward each other). Each arc holds
    // what fits at its orbit in the wedge at the required per-desk pitch; the rest
    // spill to the next arc further out. Row assignment + pitch are computed up-front
    // per desk so a busy room's desks (+ their whole widget disks) never collide.
    const islandR = islandClearR(island.size)
    const DESK_WEDGE_DEG = 300 // desks fan within this outward wedge (matches widgets)
    const maxDiskR = Math.max(...deskPacks.map((d) => d.diskR), childSize / 2)
    type DeskSlot = { row: number; inRow: number; rowCount: number; orbit: number; pitchDeg: number }
    const slots: DeskSlot[] = []
    {
      let idx = 0
      let row = 0
      while (idx < deskPacks.length) {
        // orbit for this row: clears the island + all prior rows' disks
        const orbit = islandR + FOOTPRINT_GAP + maxDiskR + row * (2 * maxDiskR + FOOTPRINT_GAP)
        // pitch that clears two max disks at this orbit; capacity = wedge / pitch
        const pitchDeg = (2 * Math.asin(Math.min(1, (maxDiskR + FOOTPRINT_GAP) / orbit)) * 180) / Math.PI
        const cap = Math.max(1, Math.floor(DESK_WEDGE_DEG / Math.max(pitchDeg, 1e-3)))
        const take = Math.min(cap, deskPacks.length - idx)
        for (let k = 0; k < take; k++) slots.push({ row, inRow: k, rowCount: take, orbit, pitchDeg })
        idx += take
        row++
      }
    }
    deskPacks.forEach(({ desk, leaves }, di) => {
      const { inRow, rowCount, orbit, pitchDeg } = slots[di]
      const t = rowCount === 1 ? 0 : inRow - (rowCount - 1) / 2
      const aDeg = island.outwardDeg + t * pitchDeg
      const x = clampBox(island.x + Math.cos(rad(aDeg)) * orbit, W)
      const y = clampBox(island.y + Math.sin(rad(aDeg)) * orbit, H)
      placed.set(desk.id, {
        id: desk.id,
        x,
        y,
        depth: 2,
        role: childRole,
        parentId: root.id,
        islandId: root.id,
        hueIndex: island.hueIndex,
        size: childSize,
        shape: nodeShape(desk.type, desk.subtype),
        rankInParent: di,
        overflow: false,
        outwardDeg: aDeg
      })

      // widgets: brick-staggered orbit around this desk, opening outward from it.
      // (For a standalone-desk island the "desk" IS a leaf and has no sub-leaves.)
      if (childRole === 'desk') {
        // re-pack with THIS desk's real outward direction so widgets open away from
        // the island (pack above used the island direction only to measure reach).
        const orbitOut = packOrbit(leaves.length, 'desk', childSize, SIZE_LEAF, aDeg)
        leaves.forEach((leaf, li) => {
          const seat = orbitOut.seats[li] ?? { dx: 0, dy: 0 }
          const lx = clampBox(x + seat.dx, W)
          const ly = clampBox(y + seat.dy, H)
          const lDeg = (Math.atan2(seat.dy, seat.dx) * 180) / Math.PI
          placed.set(leaf.id, {
            id: leaf.id,
            x: lx,
            y: ly,
            depth: 3,
            role: 'leaf',
            parentId: desk.id,
            islandId: root.id,
            hueIndex: island.hueIndex,
            size: SIZE_LEAF,
            shape: nodeShape(leaf.type, leaf.subtype),
            rankInParent: li,
            overflow: false,
            outwardDeg: lDeg
          })
          // deeper nesting clamps to the leaf's seat (rare; nothing real nests below 3)
          for (const sub of childrenOf.get(leaf.id) ?? []) {
            if (placed.has(sub.id)) continue
            placed.set(sub.id, {
              id: sub.id,
              x: lx,
              y: ly,
              depth: 3,
              role: 'leaf',
              parentId: leaf.id,
              islandId: root.id,
              hueIndex: island.hueIndex,
              size: SIZE_LEAF,
              shape: nodeShape(sub.type, sub.subtype),
              rankInParent: 0,
              overflow: false,
              outwardDeg: lDeg
            })
          }
        })
      }
    })
  }

  // ── identities: ONE token per identity, SNAPPED to its STRONGEST member room
  //    (operator 2026-07-20: reads cleaner than the drift-prone centroid — they sit
  //    by their home base; the renderer's bridge-threads still show the other rooms
  //    they span). Floats just OUTSIDE the island ring (relative to ringR, which now
  //    grows), on a band; identities sharing an anchor fan so they never stack.
  //    Lone identities (no placed member room) park on an outer arc. Deterministic. ──
  const identities = nodes.filter(isIdentity).sort(byImportanceThenId)
  // the outer edge of the island ring (islands + their outward label), so the
  // identity band always clears the rooms no matter how big the ring grew.
  // outside EVERYTHING an island occupies — its label diagonal AND its desk+widget
  // disk reach — so identities never land on a room's widgets.
  const ringOuterEdge = ringR + Math.max(maxIslandDiag / 2, maxIslandReach)
  const idHalfSpan = footprintRadius('identity', SIZE_IDENTITY_ORG)
  const ID_BAND_SINGLE = ringOuterEdge + idHalfSpan + FOOTPRINT_GAP
  const ID_BAND_STEP = 2 * idHalfSpan + FOOTPRINT_GAP // fan seats step outward if crowded
  const anchorBuckets = new Map<number, number>() // rounded anchor deg → fan count
  for (const n of identities) {
    // strongest member room = the placed member room with highest importance
    // (tie → smallest id), by whose ANGLE the identity is snapped. Falls back to a
    // deterministic arc slot when the identity has no placed member room.
    const memberRooms = n.memberRooms
      .map((baseRoom) => baseToNode.get(baseRoom))
      .map((nodeId) => (nodeId ? placed.get(nodeId) : undefined))
      .filter((p): p is IslandPlaced => !!p)
    let aDeg: number
    if (memberRooms.length === 0) {
      // lone: deterministic slot on the outer arc from its importance rank position
      const idx = identities.indexOf(n)
      aDeg = -90 + (idx / Math.max(1, identities.length)) * 360
    } else {
      const strongest = memberRooms
        .map((p) => ({ p, node: byId.get(p.id)! }))
        .sort((a, b) => b.node.importance - a.node.importance || (a.p.id < b.p.id ? -1 : 1))[0].p
      aDeg = (Math.atan2(strongest.y - cy, strongest.x - cx) * 180) / Math.PI
    }
    // fan identities sharing an anchor: alternate around the anchor AND step the
    // band outward every couple of seats so a busy room's people never stack.
    const bucket = Math.round(aDeg / 12) * 12
    const seat = anchorBuckets.get(bucket) ?? 0
    anchorBuckets.set(bucket, seat + 1)
    const fanDeg = (seat % 2 === 0 ? 1 : -1) * Math.ceil(seat / 2) * 9
    const bandStep = Math.floor(seat / 4) // every 4 seats, step out one band
    const r = ID_BAND_SINGLE + bandStep * ID_BAND_STEP
    const fDeg = aDeg + fanDeg
    placed.set(n.id, {
      id: n.id,
      x: clampBox(cx + Math.cos(rad(fDeg)) * r, W),
      y: clampBox(cy + Math.sin(rad(fDeg)) * r, H),
      depth: 1,
      role: 'identity',
      parentId: null,
      islandId: null,
      hueIndex: null,
      size: n.type === 'organization' ? SIZE_IDENTITY_ORG : SIZE_IDENTITY_PERSON,
      shape: nodeShape(n.type, n.subtype), // person/org/tool → square (avatar/mark)
      rankInParent: 0,
      overflow: false,
      outwardDeg: fDeg
    })
  }

  // ── the Unfiled stack: homeless docs/notes/anything parentless — a compact grid
  //    near the center. Top UNFILED_STACK_MAX by importance shown; rest = honest +N ──
  const unfiledNodes = nodes
    .filter((n) => !placed.has(n.id))
    .sort(byImportanceThenId)
  const anchorX = UNFILED_ANCHOR_FX * world.size
  const anchorY = UNFILED_ANCHOR_FY * world.size
  const unfiledShift = { x: 0, y: 0 } // filled by the collision-relaxation pass
  const shownIds: string[] = []
  // grid step clears a full unfiled footprint (tile + gap) so stack tiles never touch
  const unfiledStep = SIZE_UNFILED + 2 * FOOTPRINT_GAP
  unfiledNodes.forEach((n, i) => {
    const shown = i < UNFILED_STACK_MAX
    if (shown) shownIds.push(n.id)
    const col = i % 4
    const row = Math.floor(i / 4)
    placed.set(n.id, {
      id: n.id,
      x: shown ? clampBox(anchorX + (col - 1.5) * unfiledStep, W) : anchorX,
      y: shown ? clampBox(anchorY + row * unfiledStep, H) : anchorY,
      depth: 1,
      role: 'unfiled',
      parentId: null,
      islandId: null,
      hueIndex: null,
      size: SIZE_UNFILED,
      // the pile is a tidy SQUARE-slot grid in the corner (a stack of loose items) —
      // shaping each to its docType would ragged the grid for no gain at this size.
      shape: { longAxis: 'w', aspect: 1, sil: 'square' },
      rankInParent: i,
      overflow: !shown,
      // opens up-and-right, toward the center, when the pile is descended into
      outwardDeg: (Math.atan2(cy - anchorY, cx - anchorX) * 180) / Math.PI
    })
  })

  // ── THE FLOATER NET (P4.5c C2.4): a FOOTPRINT-aware safety backstop over the only
  //    two free-floating classes — identities (snapped to their strongest room) and
  //    the unfiled stack. C2.3's construction already places everything overlap-free
  //    by design, so this net is IDEMPOTENT on the normal path (a no-op); it exists
  //    to catch the pathological residue — e.g. two identities that snap to the exact
  //    same room angle AND band seat. It uses the ONE footprint contract (matches the
  //    invariant), pushes an overlapping floater OUTWARD along the center→floater ray
  //    (staying on/beyond its identity band, never yanked back onto the ring), against
  //    FROZEN solids (islands/desks/widgets) + earlier floaters. Fixed iteration order
  //    (rank → id) → byte-identical for a given payload; the determinism lock holds. ──
  {
    const frozen = [...placed.values()].filter(
      (p) => p.role === 'island' || p.role === 'desk' || p.role === 'leaf'
    )
    const floaters = [...placed.values()]
      .filter((p) => p.role === 'identity')
      .sort((a, b) => a.rankInParent - b.rankInParent || (a.id < b.id ? -1 : 1))
    const unfiledShown = [...placed.values()].filter((p) => p.role === 'unfiled' && !p.overflow)
    // push floater p outward until its footprint clears every collider's footprint;
    // keepBand ≥ 0 pins it to at least that radius from center (identities stay on
    // their band). Returns whether it moved.
    const clearOf = (p: IslandPlaced, colliders: IslandPlaced[], keepBand: number): boolean => {
      let moved = false
      for (const q of colliders) {
        if (q.id === p.id) continue
        if (!footprintsIntersect(nodeFootprint(p), nodeFootprint(q))) continue
        // step outward along center→p (or the p−q ray if p is at center) until clear
        const dcx = p.x - cx
        const dcy = p.y - cy
        const dc = Math.hypot(dcx, dcy) || 1
        let ux = dcx / dc
        let uy = dcy / dc
        if (Math.hypot(p.x - q.x, p.y - q.y) < 1e-6) {
          // exactly coincident: break the tie along the q→center-perpendicular
          ux = 1
          uy = 0
        }
        // advance in bounded steps until footprints separate (cap the loop)
        const step = SIZE_IDENTITY_ORG + FOOTPRINT_GAP
        for (let k = 0; k < 40 && footprintsIntersect(nodeFootprint(p), nodeFootprint(q)); k++) {
          let nx = p.x + ux * step
          let ny = p.y + uy * step
          if (keepBand > 0) {
            const rr = Math.hypot(nx - cx, ny - cy) || 1
            const band = Math.max(keepBand, rr)
            nx = cx + ((nx - cx) / rr) * band
            ny = cy + ((ny - cy) / rr) * band
          }
          p.x = clampBox(nx, W)
          p.y = clampBox(ny, H)
          moved = true
        }
      }
      return moved
    }
    for (let pass = 0; pass < 6; pass++) {
      let moved = false
      for (let i = 0; i < floaters.length; i++) {
        const p = floaters[i]
        if (clearOf(p, frozen, ID_BAND_SINGLE)) moved = true
        if (clearOf(p, floaters.slice(0, i), ID_BAND_SINGLE)) moved = true
      }
      if (!moved) break
    }
    // unfiled stack: nudge the whole grid together if its anchor collides with a
    // frozen solid (rare — it lives in the outer corner — but guaranteed clear now)
    if (unfiledShown.length) {
      const proxy = { x: anchorX, y: anchorY, size: 96, role: 'unfiled', id: '__uf__' } as IslandPlaced
      const x0 = proxy.x
      const y0 = proxy.y
      for (let pass = 0; pass < 6; pass++) if (!clearOf(proxy, frozen, 0)) break
      unfiledShift.x = proxy.x - x0
      unfiledShift.y = proxy.y - y0
      if (unfiledShift.x !== 0 || unfiledShift.y !== 0) {
        for (const t of unfiledShown) {
          t.x = clampBox(t.x + unfiledShift.x, W)
          t.y = clampBox(t.y + unfiledShift.y, H)
        }
      }
    }
  }

  // P4.5c C3.5: emit the parent-room → sub-room links for the renderer's descent line.
  // Only links where BOTH ends were actually placed (defensive: a parent could have
  // been trashed/absent). Deterministic order for a stable render.
  const subRoomLinks = [...subRoomParent.entries()]
    .filter(([childId, parentId]) => placed.has(childId) && placed.has(parentId))
    .map(([childId, parentId]) => ({ parentId, childId }))
    .sort((a, b) => a.parentId.localeCompare(b.parentId) || a.childId.localeCompare(b.childId))

  return {
    placed,
    islands,
    unfiled: {
      anchorX: anchorX + unfiledShift.x,
      anchorY: anchorY + unfiledShift.y,
      shownIds,
      overflowCount: Math.max(0, unfiledNodes.length - UNFILED_STACK_MAX)
    },
    baseToNode,
    subRoomLinks,
    world
  }
}
