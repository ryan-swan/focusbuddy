import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  layoutIslandTree,
  leafBudgetAt,
  nodeFootprint,
  footprintsIntersect,
  nodeShape,
  shapeHalfExtent,
  ISLAND_W,
  ISLAND_H,
  ISLAND_CX,
  ISLAND_CY,
  ISLAND_RING_R,
  UNFILED_STACK_MAX,
  type IslandPlaced
} from '@shared/islandTree'
import type { GraphViewNode, GraphViewEdge } from '@shared/graphView'

// Unit locks for the PURE island-tree layout (P4.5 — DEC-017). The layout is a
// radial DESCENDANCY tree: center = you, rooms = islands orbiting it, desks orbit
// their room, leaves orbit their desk, sizes shrinking by depth. Deterministic —
// same input (any order) → same positions. No clock, no randomness, no DB.
// Structure comes ONLY from stored `contains` edges; nothing is inferred here.

const gn = (over: Partial<GraphViewNode> & { id: string }): GraphViewNode => ({
  id: over.id,
  type: over.type ?? 'project',
  subtype: over.subtype ?? null,
  title: over.title ?? over.id,
  roomId: over.roomId ?? null,
  importance: over.importance ?? 0.5,
  band: over.band ?? 'work',
  conflict: over.conflict ?? false,
  baseId: over.baseId ?? over.id.replace(/^bn-/, 'base-'),
  memberRooms: over.memberRooms ?? (over.roomId ? [over.roomId] : []),
  collapsedIds: over.collapsedIds ?? [over.id]
})
const ge = (srcId: string, dstId: string, type: GraphViewEdge['type']): GraphViewEdge => ({
  srcId,
  dstId,
  type
})

const dist = (p: IslandPlaced, q: { x: number; y: number }): number =>
  Math.hypot(p.x - q.x, p.y - q.y)
const CENTER = { x: ISLAND_CX, y: ISLAND_CY }

// A small real-shaped corpus: two rooms, desks, leaves, an identity, unfiled docs.
function corpus(): { nodes: GraphViewNode[]; edges: GraphViewEdge[] } {
  const nodes = [
    gn({ id: 'room-a', type: 'room', band: 'pillar', importance: 0.9, roomId: 'base-room-a', baseId: 'base-room-a', title: 'Alpha' }),
    gn({ id: 'room-b', type: 'room', band: 'pillar', importance: 0.6, roomId: 'base-room-b', baseId: 'base-room-b', title: 'Beta' }),
    gn({ id: 'desk-a1', type: 'project', roomId: 'base-room-a', importance: 0.7 }),
    gn({ id: 'desk-a2', type: 'project', roomId: 'base-room-a', importance: 0.5 }),
    gn({ id: 'desk-b1', type: 'project', roomId: 'base-room-b', importance: 0.6 }),
    gn({ id: 'w-1', type: 'artifact', subtype: 'sticky', roomId: 'base-room-a', importance: 0.4 }),
    gn({ id: 'w-2', type: 'artifact', subtype: 'webview', roomId: 'base-room-a', importance: 0.35 }),
    gn({ id: 'doc-homed', type: 'document', subtype: 'doc', importance: 0.5 }),
    gn({ id: 'person-1', type: 'person', band: 'identity', importance: 0.6, memberRooms: ['base-room-a', 'base-room-b'], roomId: 'base-room-a' }),
    gn({ id: 'doc-loose-1', type: 'document', subtype: 'sheet', importance: 0.45 }),
    gn({ id: 'note-loose', type: 'note', band: 'orgwide', importance: 0.42 })
  ]
  const edges = [
    ge('room-a', 'desk-a1', 'contains'),
    ge('room-a', 'desk-a2', 'contains'),
    ge('room-b', 'desk-b1', 'contains'),
    ge('desk-a1', 'w-1', 'contains'),
    ge('desk-a1', 'w-2', 'contains'),
    ge('desk-a1', 'doc-homed', 'contains'),
    ge('desk-a1', 'person-1', 'produced') // a non-contains edge must NOT affect structure
  ]
  return { nodes, edges }
}

describe('island tree — the descendancy structure (DEC-017)', () => {
  it('rooms are islands (depth 1), desks orbit their room (depth 2), leaves orbit their desk (depth 3)', () => {
    const { nodes, edges } = corpus()
    const out = layoutIslandTree(nodes, edges)
    expect(out.placed.get('room-a')!.role).toBe('island')
    expect(out.placed.get('room-a')!.depth).toBe(1)
    expect(out.placed.get('desk-a1')!.role).toBe('desk')
    expect(out.placed.get('desk-a1')!.depth).toBe(2)
    expect(out.placed.get('desk-a1')!.parentId).toBe('room-a')
    expect(out.placed.get('w-1')!.role).toBe('leaf')
    expect(out.placed.get('w-1')!.depth).toBe(3)
    expect(out.placed.get('w-1')!.parentId).toBe('desk-a1')
    // the homed document is a leaf on its desk — it went HOME
    expect(out.placed.get('doc-homed')!.parentId).toBe('desk-a1')
  })

  it('everything visibly DESCENDS: desks sit outside their room, leaves cluster around their desk, sizes shrink by depth', () => {
    const { nodes, edges } = corpus()
    const out = layoutIslandTree(nodes, edges)
    const center = { x: out.world.cx, y: out.world.cy } // P4.5c C2: live world center
    const room = out.placed.get('room-a')!
    const desk = out.placed.get('desk-a1')!
    const leaf = out.placed.get('w-1')!
    // desk orbits its room (near it — closer to the room than the room is to center),
    // and sits farther from center than the room (it descends outward)
    expect(dist(desk, room)).toBeLessThan(dist(room, center))
    expect(dist(desk, center)).toBeGreaterThan(dist(room, center))
    // the widget is a real floating node ON its desk's orbit: nearer its own desk
    // than to the room (it belongs to the desk, tethered by a line to it)
    expect(dist(leaf, desk)).toBeLessThan(dist(leaf, room))
    // sizes shrink by depth (room > desk > leaf)
    expect(room.size).toBeGreaterThan(desk.size)
    expect(desk.size).toBeGreaterThan(leaf.size)
  })

  it('structure comes ONLY from contains edges — a produced edge never re-parents a node', () => {
    const { nodes, edges } = corpus()
    const out = layoutIslandTree(nodes, edges)
    expect(out.placed.get('person-1')!.role).toBe('identity')
    expect(out.placed.get('person-1')!.parentId).toBeNull()
  })

  it('the whole subtree inherits its island hue; islands get distinct wheel indices in importance order', () => {
    const { nodes, edges } = corpus()
    const out = layoutIslandTree(nodes, edges)
    const room = out.placed.get('room-a')!
    expect(room.hueIndex).toBe(0) // highest-importance island → first wheel hue
    expect(out.placed.get('room-b')!.hueIndex).toBe(1)
    expect(out.placed.get('desk-a1')!.hueIndex).toBe(room.hueIndex)
    expect(out.placed.get('w-1')!.hueIndex).toBe(room.hueIndex)
    expect(out.placed.get('doc-homed')!.hueIndex).toBe(room.hueIndex)
  })

  it('a standalone desk (containment root with children, no room) is its own small island — and its children are LEAVES', () => {
    const nodes = [
      gn({ id: 'room-a', type: 'room', band: 'pillar', importance: 0.9, roomId: 'base-room-a', baseId: 'base-room-a' }),
      gn({ id: 'solo-desk', type: 'project', importance: 0.5 }),
      gn({ id: 'w-solo', type: 'artifact', subtype: 'note', importance: 0.4 })
    ]
    const edges = [ge('solo-desk', 'w-solo', 'contains')]
    const out = layoutIslandTree(nodes, edges)
    const solo = out.placed.get('solo-desk')!
    expect(solo.role).toBe('island')
    expect(solo.size).toBeLessThan(out.placed.get('room-a')!.size) // smaller than a room island
    expect(out.placed.get('w-solo')!.parentId).toBe('solo-desk')
    // its widgets are LEAVES — the cruise picture stays structure-only (the leaf
    // budget governs them; they must never masquerade as desks)
    expect(out.placed.get('w-solo')!.role).toBe('leaf')
  })

  it('sibling desks NEVER overlap — arc rows guarantee separation even on a crowded island', () => {
    const nodes: GraphViewNode[] = [
      gn({ id: 'room-a', type: 'room', band: 'pillar', importance: 0.9, roomId: 'base-room-a', baseId: 'base-room-a' })
    ]
    const edges: GraphViewEdge[] = []
    for (let i = 0; i < 8; i++) {
      nodes.push(gn({ id: `desk-${i}`, type: 'project', roomId: 'base-room-a', importance: 0.5 + i * 0.01 }))
      edges.push(ge('room-a', `desk-${i}`, 'contains'))
    }
    const out = layoutIslandTree(nodes, edges)
    const desks = [...out.placed.values()].filter((pp) => pp.role === 'desk')
    expect(desks).toHaveLength(8)
    for (let i = 0; i < desks.length; i++) {
      for (let j = i + 1; j < desks.length; j++) {
        const d = Math.hypot(desks[i].x - desks[j].x, desks[i].y - desks[j].y)
        expect(d, `${desks[i].id} vs ${desks[j].id}`).toBeGreaterThanOrEqual(30)
      }
    }
  })
})

describe('island tree — identities snap to their strongest member room', () => {
  it('a cross-room person snaps NEAR its strongest (highest-importance) member room, outside the ring', () => {
    // P4.5c C2.3 (operator 2026-07-20): identities snap to their STRONGEST member
    // room's angle (reads cleaner than the drift-prone centroid); bridge-threads still
    // show the other rooms. person-1 belongs to room-a (imp 0.9) + room-b (imp 0.6),
    // so it snaps near room-a, NOT the midpoint between them.
    const { nodes, edges } = corpus()
    const out = layoutIslandTree(nodes, edges)
    const center = { x: out.world.cx, y: out.world.cy }
    const p = out.placed.get('person-1')!
    const a = out.placed.get('room-a')! // the strongest (0.9 > 0.6)
    const b = out.placed.get('room-b')!
    const ang = (q: IslandPlaced): number => Math.atan2(q.y - center.y, q.x - center.x)
    const angDiff = (x: number, y: number): number => Math.abs(Math.atan2(Math.sin(x - y), Math.cos(x - y)))
    // snapped near room-a's angle (fan offset allowed), and CLOSER to room-a's angle
    // than to room-b's — the strongest-room snap, not the centroid
    expect(angDiff(ang(p), ang(a))).toBeLessThan(0.35)
    expect(angDiff(ang(p), ang(a))).toBeLessThan(angDiff(ang(p), ang(b)))
    // outside the room ring — floating just beyond the spaces it belongs to
    expect(dist(p, center)).toBeGreaterThan(dist(a, center))
  })
})

describe('island tree — the DELIBERATE ring (P4.5b Phase 5 · re-solved P4.5c C4)', () => {
  // P4.5c C4 triad-tune (operator 2026-07-22: "bring the rooms closer in"): the
  // even-pitch contract is SUPERSEDED by need-proportional seating — each island
  // reserves arc for its own footprint/fan need, so one giant island no longer
  // taxes every gap. The DELIBERATENESS contract is now three-part:
  //  (a) identical islands still seat at EXACTLY even pitch (equal needs → even
  //      ring; guards the slack distribution against reintroducing jitter),
  //  (b) mixed islands share ONE radius (the ring stays a ring), and
  //  (c) the ring CLOSES — gaps sum to 360°, no island collapsed onto a seat.
  // Real spacing safety lives in the zero-overlap invariant lock, not here.
  it('IDENTICAL islands seat at exactly even pitch on one radius (equal needs → even ring)', () => {
    const nodes: GraphViewNode[] = []
    for (let i = 0; i < 6; i++) {
      nodes.push(
        gn({
          id: `room-${i}`,
          type: 'room',
          band: 'pillar',
          importance: 0.9, // identical → identical needs → even pitch
          roomId: `base-${i}`,
          baseId: `base-${i}`,
          title: `Room ${i}`
        })
      )
    }
    const out = layoutIslandTree(nodes, [])
    const islands = [...out.placed.values()].filter((p) => p.role === 'island')
    expect(islands).toHaveLength(6)
    const center = { x: out.world.cx, y: out.world.cy }
    const radii = islands.map((p) => dist(p, center))
    for (const r of radii) expect(Math.abs(r - radii[0])).toBeLessThan(0.5)
    const angs = out.islands
      .map((isl) => ((isl.angleDeg % 360) + 360) % 360)
      .sort((a, b) => a - b)
    for (let i = 1; i < angs.length; i++) {
      expect(Math.abs(angs[i] - angs[i - 1] - 60)).toBeLessThan(0.01)
    }
  })

  it('MIXED islands share one radius and the ring closes — need-proportional, no dead seats', () => {
    const nodes: GraphViewNode[] = []
    for (let i = 0; i < 6; i++) {
      nodes.push(
        gn({
          id: `room-${i}`,
          type: 'room',
          band: 'pillar',
          importance: 0.9 - i * 0.05, // mixed tiers → mixed needs → uneven gaps allowed
          roomId: `base-${i}`,
          baseId: `base-${i}`,
          title: `Room ${i}`
        })
      )
    }
    const out = layoutIslandTree(nodes, [])
    const islands = [...out.placed.values()].filter((p) => p.role === 'island')
    expect(islands).toHaveLength(6)
    // (b) ONE radius — the ring stays a ring even with uneven seating
    const center = { x: out.world.cx, y: out.world.cy }
    const radii = islands.map((p) => dist(p, center))
    for (const r of radii) expect(Math.abs(r - radii[0])).toBeLessThan(0.5)
    // (c) the ring CLOSES: adjacent gaps (including the wrap-around) are all
    // strictly positive and sum to 360° — no dead seat, no unexplained void.
    const angs = out.islands
      .map((isl) => ((isl.angleDeg % 360) + 360) % 360)
      .sort((a, b) => a - b)
    let total = 0
    for (let i = 0; i < angs.length; i++) {
      const gap = i === 0 ? angs[0] + 360 - angs[angs.length - 1] : angs[i] - angs[i - 1]
      expect(gap).toBeGreaterThan(1)
      total += gap
    }
    expect(Math.abs(total - 360)).toBeLessThan(0.01)
  })

  it('no identity overlaps an island, a desk, or another identity (collision relaxation)', () => {
    // a busy corpus: 5 rooms + many people, several spanning rooms, to force the
    // identity band to crowd — the relaxation pass must keep every tile clear.
    const nodes: GraphViewNode[] = []
    const edges: GraphViewEdge[] = []
    for (let r = 0; r < 5; r++) {
      nodes.push(
        gn({ id: `room-${r}`, type: 'room', band: 'pillar', importance: 0.85, roomId: `br-${r}`, baseId: `br-${r}` })
      )
      for (let d = 0; d < 2; d++) {
        const did = `desk-${r}-${d}`
        nodes.push(gn({ id: did, type: 'project', roomId: `br-${r}`, importance: 0.6 }))
        edges.push({ srcId: `room-${r}`, dstId: did, type: 'contains' })
      }
    }
    for (let i = 0; i < 24; i++) {
      // people, each a member of 1-2 rooms, importance-varied → dense identity band
      const homeRooms = i % 3 === 0 ? [`br-${i % 5}`, `br-${(i + 1) % 5}`] : [`br-${i % 5}`]
      nodes.push(
        gn({ id: `p-${String(i).padStart(2, '0')}`, type: 'person', band: 'identity', importance: 0.3 + (i % 7) * 0.08, memberRooms: homeRooms, roomId: homeRooms[0] })
      )
    }
    const out = layoutIslandTree(nodes, edges)
    const ids = [...out.placed.values()].filter((p) => p.role === 'identity')
    const solids = [...out.placed.values()].filter(
      (p) => p.role === 'island' || p.role === 'desk' || p.role === 'identity'
    )
    for (const p of ids) {
      for (const q of solids) {
        if (q.id === p.id) continue
        const d = Math.hypot(p.x - q.x, p.y - q.y)
        const need = p.size / 2 + q.size / 2 // edges must not intersect
        expect(d).toBeGreaterThanOrEqual(need - 0.5)
      }
    }
  })

  it('the ring radius grows with island count so a crowded brain never interleaves', () => {
    const mk = (count: number): number => {
      const nodes: GraphViewNode[] = []
      for (let i = 0; i < count; i++) {
        nodes.push(
          gn({ id: `r-${i}`, type: 'room', band: 'pillar', importance: 0.8, roomId: `b-${i}`, baseId: `b-${i}` })
        )
      }
      const out = layoutIslandTree(nodes, [])
      const isl = [...out.placed.values()].find((p) => p.role === 'island')!
      return dist(isl, { x: out.world.cx, y: out.world.cy }) // from the LIVE center
    }
    // few islands stay intimate; many push out (monotonic, never smaller)
    expect(mk(12)).toBeGreaterThan(mk(4))
    expect(mk(4)).toBeGreaterThanOrEqual(ISLAND_RING_R - 0.5)
  })
})

describe('island tree — the Unfiled stack (a quiet staging shelf on the outer edge)', () => {
  it('homeless documents/notes stack compactly on the outer edge, out of the ring', () => {
    const { nodes, edges } = corpus()
    const out = layoutIslandTree(nodes, edges)
    const d = out.placed.get('doc-loose-1')!
    const n = out.placed.get('note-loose')!
    expect(d.role).toBe('unfiled')
    expect(n.role).toBe('unfiled')
    // P4.5b Phase 5: the pile is a STAGING SHELF pushed OUTSIDE the island ring
    // (ISLAND_RING_R = 280) — the pile by the door, not furniture woven through
    // the rooms. Renderer dims it at rest; it stays descendable to triage.
    expect(dist(d, CENTER)).toBeGreaterThan(ISLAND_RING_R)
    // still COMPACT: stack members sit close together (the invariant that holds)
    expect(dist(d, n)).toBeLessThan(90)
    expect(out.unfiled.shownIds).toContain('doc-loose-1')
    expect(out.unfiled.overflowCount).toBe(0)
  })

  it('the stack shows at most UNFILED_STACK_MAX; the rest park at the anchor as honest overflow', () => {
    const nodes: GraphViewNode[] = [
      gn({ id: 'room-a', type: 'room', band: 'pillar', importance: 0.9, roomId: 'base-room-a', baseId: 'base-room-a' })
    ]
    for (let i = 0; i < UNFILED_STACK_MAX + 5; i++) {
      nodes.push(gn({ id: `loose-${String(i).padStart(2, '0')}`, type: 'document', importance: 0.4 + i * 0.001 }))
    }
    const out = layoutIslandTree(nodes, [])
    expect(out.unfiled.shownIds).toHaveLength(UNFILED_STACK_MAX)
    expect(out.unfiled.overflowCount).toBe(5)
    const shown = new Set(out.unfiled.shownIds)
    for (const n of nodes) {
      if (n.type !== 'document') continue
      const p = out.placed.get(n.id)!
      expect(p.overflow).toBe(!shown.has(n.id))
      if (p.overflow) {
        // overflow parks AT the anchor so threads to it still point somewhere honest
        expect(p.x).toBe(out.unfiled.anchorX)
        expect(p.y).toBe(out.unfiled.anchorY)
      }
    }
  })
})

describe('island tree — determinism + honesty', () => {
  it('is fully deterministic: shuffled input → byte-identical layout', () => {
    const { nodes, edges } = corpus()
    const a = layoutIslandTree(nodes, edges)
    const b = layoutIslandTree([...nodes].reverse(), [...edges].reverse())
    expect([...a.placed.keys()].sort()).toEqual([...b.placed.keys()].sort())
    for (const [id, p] of a.placed) {
      expect(b.placed.get(id)).toEqual(p)
    }
  })

  it('every node in the payload is placed — nothing silently dropped', () => {
    const { nodes, edges } = corpus()
    const out = layoutIslandTree(nodes, edges)
    for (const n of nodes) expect(out.placed.has(n.id), `${n.id} must be placed`).toBe(true)
  })

  it('all positions are finite and inside the world box', () => {
    const { nodes, edges } = corpus()
    const out = layoutIslandTree(nodes, edges)
    // P4.5c C2: the world box is a computed OUTPUT (grows with content) — bounds
    // come from out.world.size, not the fixed ISLAND_W/H default.
    for (const [id, p] of out.placed) {
      expect(Number.isFinite(p.x), `${id}.x`).toBe(true)
      expect(Number.isFinite(p.y), `${id}.y`).toBe(true)
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.x).toBeLessThanOrEqual(out.world.size)
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeLessThanOrEqual(out.world.size)
    }
  })

  it('rankInParent orders siblings by importance (0 = most important)', () => {
    const { nodes, edges } = corpus()
    const out = layoutIslandTree(nodes, edges)
    expect(out.placed.get('desk-a1')!.rankInParent).toBe(0) // 0.7 beats 0.5
    expect(out.placed.get('desk-a2')!.rankInParent).toBe(1)
  })

  it('a contains cycle cannot hang or crash the layout', () => {
    const nodes = [
      gn({ id: 'x1', type: 'project', importance: 0.5 }),
      gn({ id: 'x2', type: 'project', importance: 0.5 })
    ]
    const edges = [ge('x1', 'x2', 'contains'), ge('x2', 'x1', 'contains')]
    const out = layoutIslandTree(nodes, edges)
    expect(out.placed.has('x1')).toBe(true)
    expect(out.placed.has('x2')).toBe(true)
  })

  it('exposes the base-room → room-node map the renderer needs for identity threads', () => {
    const { nodes, edges } = corpus()
    const out = layoutIslandTree(nodes, edges)
    expect(out.baseToNode.get('base-room-a')).toBe('room-a')
    expect(out.baseToNode.get('base-room-b')).toBe('room-b')
  })
})

// The semantic-zoom WARP (semanticPositions) was REMOVED in P4.5c — C1 replaced it
// with a real pan-and-zoom camera over the fixed world; C2 grows that world so
// nothing overlaps. There is no layout warp to test anymore.

describe('island tree — per-island LOD budget (DEC-010: ~150 drawn per viewport)', () => {
  it('at cruise the budget is ZERO — the picture is structure, never leaf noise', () => {
    expect(leafBudgetAt(0.7)).toBe(0)
    expect(leafBudgetAt(1.0)).toBe(0)
    expect(leafBudgetAt(1.5)).toBe(0)
  })

  it('leaves materialize monotonically as you approach', () => {
    let prev = -1
    for (let z = 0.7; z <= 6; z += 0.1) {
      const b = leafBudgetAt(z)
      expect(b).toBeGreaterThanOrEqual(prev)
      prev = b
    }
    expect(leafBudgetAt(1.8)).toBeGreaterThan(0)
    expect(leafBudgetAt(3.5)).toBeGreaterThan(leafBudgetAt(1.8))
  })
})

// ── DEC-014 grep-lock: the layout carries NO domain taxonomy ─────────────────────
describe('DEC-014 grep-lock — no hardcoded domain vocabulary in the island layout', () => {
  const DOMAIN_WORDS = ['engineering', 'marketing', 'sales', 'finance', 'health', 'fitness', 'department', 'life-area']

  it('the layout source contains no domain word as a code literal', () => {
    const src = readFileSync(resolve(__dirname, '../../src/shared/islandTree.ts'), 'utf-8')
    const code = src
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n')
      .toLowerCase()
    for (const w of DOMAIN_WORDS) {
      expect(code, `islandTree code must not contain "${w}"`).not.toContain(`'${w}'`)
      expect(code, `islandTree code must not contain "${w}"`).not.toContain(`"${w}"`)
    }
  })
})

// ── THE ZERO-OVERLAP INVARIANT (P4.5c C2) — the hard lock where "never overlap"
// is won. On a DENSE corpus matching the real 311-node live shape, NO two nodes'
// footprints (tile ∪ label, reserved at the camera floor per the footprint
// contract) may intersect. This is the operator's rule ("nothing overlaps — no
// word, no widget, no tile, ever") made a provable layout invariant.
//
// Because the footprint is reserved at CAM_S_MIN (the widest world label box),
// disjointness here ⇒ disjointness at EVERY legal zoom (screen gap = world gap ×
// s, monotonic in s ≥ CAM_S_MIN). One static, camera-free test proves the whole
// zoom range. See the footprint-contract note in islandTree.ts.
//
// Sub-locks travel with it: DETERMINISM (already covered above), STRUCTURE-
// PRESERVATION (every widget stays nearer its own desk than any other, so "floats
// on a line to ITS desk" is provable — not just "nothing overlaps anywhere").
//
// A dense corpus at real density: ≥14 rooms, several desks each, one desk with
// 20+ widgets, ≥24 identities (several cross-room), ≥47 unfiled docs (~311 nodes).
function denseCorpus(): { nodes: GraphViewNode[]; edges: GraphViewEdge[] } {
  const nodes: GraphViewNode[] = []
  const edges: GraphViewEdge[] = []
  const ROOMS = 14
  for (let r = 0; r < ROOMS; r++) {
    const base = `br-${String(r).padStart(2, '0')}`
    nodes.push(
      gn({
        id: `room-${String(r).padStart(2, '0')}`,
        type: 'room',
        band: 'pillar',
        importance: 0.95 - r * 0.03,
        roomId: base,
        baseId: base,
        title: `Room number ${r} with a longish name`
      })
    )
    // 2-4 desks per room; the FIRST room's first desk carries 22 widgets (the
    // dense-desk case that stresses widget packing)
    const deskCount = 2 + (r % 3)
    for (let d = 0; d < deskCount; d++) {
      const did = `desk-${String(r).padStart(2, '0')}-${d}`
      nodes.push(gn({ id: did, type: 'project', roomId: base, importance: 0.7 - d * 0.05, title: `Desk ${r}.${d}` }))
      edges.push(ge(`room-${String(r).padStart(2, '0')}`, did, 'contains'))
      const widgetCount = r === 0 && d === 0 ? 22 : 2 + ((r + d) % 5)
      for (let w = 0; w < widgetCount; w++) {
        const wid = `w-${String(r).padStart(2, '0')}-${d}-${String(w).padStart(2, '0')}`
        const kind = w % 3 === 0 ? 'sticky' : w % 3 === 1 ? 'note' : 'webview'
        nodes.push(gn({ id: wid, type: 'artifact', subtype: kind, roomId: base, importance: 0.5 - w * 0.01, title: `Widget ${w} on desk ${r}.${d}` }))
        edges.push(ge(did, wid, 'contains'))
      }
    }
  }
  // 26 identities — a third span 2-3 rooms (cross-room), the rest single-room
  for (let i = 0; i < 26; i++) {
    const spans =
      i % 3 === 0
        ? [`br-${String(i % ROOMS).padStart(2, '0')}`, `br-${String((i + 4) % ROOMS).padStart(2, '0')}`, `br-${String((i + 9) % ROOMS).padStart(2, '0')}`]
        : i % 3 === 1
          ? [`br-${String(i % ROOMS).padStart(2, '0')}`, `br-${String((i + 5) % ROOMS).padStart(2, '0')}`]
          : [`br-${String(i % ROOMS).padStart(2, '0')}`]
    nodes.push(
      gn({
        id: `person-${String(i).padStart(2, '0')}`,
        type: i % 7 === 0 ? 'organization' : 'person',
        band: 'identity',
        importance: 0.35 + (i % 6) * 0.09,
        memberRooms: spans,
        roomId: spans[0],
        title: `Identity person number ${i}`
      })
    )
  }
  // 50 unfiled homeless docs/notes
  for (let u = 0; u < 50; u++) {
    nodes.push(
      gn({
        id: `unfiled-${String(u).padStart(2, '0')}`,
        type: u % 2 === 0 ? 'document' : 'note',
        band: 'orgwide',
        importance: 0.4 + (u % 10) * 0.005,
        title: `Unfiled loose item ${u}`
      })
    )
  }
  return { nodes, edges }
}

// list every intersecting footprint pair, with the label-inclusive box, for a
// legible failure message (§1a: the demonstrated-red must name the offenders).
// Overflow tiles are EXCLUDED — the renderer never draws them (they park at the
// stack anchor behind a "+N" chip), so they cannot visually overlap anything.
function intersectingPairs(placed: Map<string, IslandPlaced>): string[] {
  const arr = [...placed.values()].filter((p) => !p.overflow)
  const out: string[] = []
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      const fa = nodeFootprint(arr[i])
      const fb = nodeFootprint(arr[j])
      if (footprintsIntersect(fa, fb)) {
        out.push(`${arr[i].role}:${arr[i].id} ✕ ${arr[j].role}:${arr[j].id}`)
      }
    }
  }
  return out
}

describe('island tree — THE ZERO-OVERLAP INVARIANT (P4.5c C2)', () => {
  // ISLAND ↔ ISLAND disjointness (P4.5c C2.2): the ring is sized from label-
  // inclusive footprints, so no two ROOM/ISLAND footprints (tile AND label) may
  // ever touch — the specific failure the old fixed ~280 ring couldn't avoid.
  // This is C2.2's own green gate; it must STAY green through C2.3/C2.4.
  it('C2.2: no two ISLAND footprints intersect — the label-derived ring holds', () => {
    const { nodes, edges } = denseCorpus()
    const out = layoutIslandTree(nodes, edges)
    const islands = [...out.placed.values()].filter((p) => p.role === 'island')
    expect(islands.length).toBeGreaterThanOrEqual(14)
    const bad: string[] = []
    for (let i = 0; i < islands.length; i++) {
      for (let j = i + 1; j < islands.length; j++) {
        if (footprintsIntersect(nodeFootprint(islands[i]), nodeFootprint(islands[j]))) {
          bad.push(`${islands[i].id} ✕ ${islands[j].id}`)
        }
      }
    }
    expect(bad.length, `island labels overlap:\n  ${bad.join('\n  ')}`).toBe(0)
  })

  it('no two node footprints (tile ∪ label, reserved at the camera floor) intersect on a dense corpus', () => {
    const { nodes, edges } = denseCorpus()
    expect(nodes.length).toBeGreaterThanOrEqual(300) // real density (~311 live)
    const out = layoutIslandTree(nodes, edges)
    const pairs = intersectingPairs(out.placed)
    // report the count + a sample so the red baseline is legible
    expect(
      pairs.length,
      `zero-overlap invariant BROKEN: ${pairs.length} intersecting footprint pairs.\nfirst 25:\n  ${pairs.slice(0, 25).join('\n  ')}`
    ).toBe(0)
  })

  it('STRUCTURE-PRESERVATION: every widget floats nearer its OWN desk than any other (the line reads true)', () => {
    const { nodes, edges } = denseCorpus()
    const out = layoutIslandTree(nodes, edges)
    const desks = [...out.placed.values()].filter((p) => p.role === 'desk')
    const leaves = [...out.placed.values()].filter((p) => p.role === 'leaf')
    expect(leaves.length).toBeGreaterThan(40)
    const violations: string[] = []
    for (const leaf of leaves) {
      const parent = leaf.parentId ? out.placed.get(leaf.parentId) : undefined
      if (!parent || parent.role !== 'desk') continue
      const dOwn = Math.hypot(leaf.x - parent.x, leaf.y - parent.y)
      for (const other of desks) {
        if (other.id === parent.id) continue
        const dOther = Math.hypot(leaf.x - other.x, leaf.y - other.y)
        if (dOther < dOwn) {
          violations.push(`${leaf.id}: closer to ${other.id} (${dOther.toFixed(0)}) than parent ${parent.id} (${dOwn.toFixed(0)})`)
          break
        }
      }
    }
    expect(violations.length, `widgets adrift from their desk:\n  ${violations.slice(0, 15).join('\n  ')}`).toBe(0)
  })

  it('the dense-corpus layout stays fully deterministic (shuffled + reversed → byte-identical)', () => {
    const { nodes, edges } = denseCorpus()
    const a = layoutIslandTree(nodes, edges)
    const b = layoutIslandTree([...nodes].reverse(), [...edges].reverse())
    expect([...a.placed.keys()].sort()).toEqual([...b.placed.keys()].sort())
    for (const [id, p] of a.placed) expect(b.placed.get(id)).toEqual(p)
  })

  // C2.4 — the FLOATER NET backstop, validated ADVERSARIALLY (§1a move 5: a net that
  // has never had to fire is theater). Force the pathological case the net exists for:
  // MANY identities all snapping to the SAME single room (identical strongest-room
  // angle), which would pile them on one band seat without the fan + net. Assert none
  // of them overlap after layout — proving the net (plus the fan) actually separates.
  it('C2.4 floater net: 30 identities all snapping to ONE room never overlap each other', () => {
    const nodes: GraphViewNode[] = [
      gn({ id: 'room-solo', type: 'room', band: 'pillar', importance: 0.95, roomId: 'br-solo', baseId: 'br-solo', title: 'The one room' }),
      gn({ id: 'room-2', type: 'room', band: 'pillar', importance: 0.5, roomId: 'br-2', baseId: 'br-2', title: 'Another' })
    ]
    // 30 people ALL and ONLY in room-solo → all snap to room-solo's exact angle
    for (let i = 0; i < 30; i++) {
      nodes.push(
        gn({ id: `p-${String(i).padStart(2, '0')}`, type: 'person', band: 'identity', importance: 0.4 + (i % 5) * 0.05, memberRooms: ['br-solo'], roomId: 'br-solo', title: `Person ${i}` })
      )
    }
    const out = layoutIslandTree(nodes, [])
    const ids = [...out.placed.values()].filter((p) => p.role === 'identity')
    expect(ids).toHaveLength(30)
    const bad: string[] = []
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        if (footprintsIntersect(nodeFootprint(ids[i]), nodeFootprint(ids[j]))) {
          bad.push(`${ids[i].id} ✕ ${ids[j].id}`)
        }
      }
    }
    expect(bad.length, `crowded identities overlap (net failed):\n  ${bad.slice(0, 20).join('\n  ')}`).toBe(0)
    // and they stay OUT of the room ring — never yanked inward onto a room
    for (const p of ids) {
      const r = Math.hypot(p.x - out.world.cx, p.y - out.world.cy)
      const room = out.placed.get('room-solo')!
      const roomR = Math.hypot(room.x - out.world.cx, room.y - out.world.cy)
      expect(r, `${p.id} landed inside the ring`).toBeGreaterThan(roomR)
    }
  })

  // ── P4.5c C3.5: THE SUB-ROOM LOCK (a room nested inside a room). ──────────────
  // Grounded in the real corpus: the operator's "PlexiiDesk Team" room contains a
  // sub-room "PlexiDesk" which holds 5 real desks + ~88 widgets. The OLD layout had
  // no sub-room concept: the sub-room fell into its parent's desk fan as a plain
  // "desk", its real desks became "leaves", and its widgets (one level too deep) were
  // CLAMPED onto a single seat (islandTree.ts, the `for (const sub of childrenOf...)`
  // block) → a guaranteed pile-up: a sticky sitting on top of a desk. This is the
  // 4-level chain (room → sub-room → desk → widget) the ≤3-level dense corpus never
  // exercised, so the zero-overlap invariant was VACUOUS for this shape.
  //
  // §1a red-then-green: this corpus makes the old clamp overlap DEMONSTRABLE, and the
  // fix (sub-room becomes its OWN island; its desks/widgets lay out through the same
  // packing) makes it green. Reverting the fix re-reds it (verified manually).
  function subRoomCorpus(): { nodes: GraphViewNode[]; edges: GraphViewEdge[] } {
    const nodes: GraphViewNode[] = []
    const edges: GraphViewEdge[] = []
    // two normal rooms so the ring has neighbors (realistic pitch)
    for (let r = 0; r < 2; r++) {
      const base = `plain-${r}`
      nodes.push(gn({ id: `room-plain-${r}`, type: 'room', band: 'pillar', importance: 0.9 - r * 0.1, roomId: base, baseId: base, title: `Plain room ${r}` }))
      const did = `desk-plain-${r}`
      nodes.push(gn({ id: did, type: 'project', roomId: base, importance: 0.6, title: `Plain desk ${r}` }))
      edges.push(ge(`room-plain-${r}`, did, 'contains'))
      for (let w = 0; w < 4; w++) {
        const wid = `w-plain-${r}-${w}`
        nodes.push(gn({ id: wid, type: 'artifact', subtype: 'sticky', roomId: base, importance: 0.4, title: `w ${r}.${w}` }))
        edges.push(ge(did, wid, 'contains'))
      }
    }
    // the PARENT room, its SUB-ROOM, and the sub-room's 5 desks each with widgets
    nodes.push(gn({ id: 'room-parent', type: 'room', band: 'pillar', importance: 0.95, roomId: 'pbase', baseId: 'pbase', title: 'PlexiiDesk Team' }))
    nodes.push(gn({ id: 'subroom', type: 'room', band: 'pillar', importance: 0.85, roomId: 'sbase', baseId: 'sbase', title: 'PlexiDesk' }))
    edges.push(ge('room-parent', 'subroom', 'contains')) // room INSIDE a room
    const deskWidgetCounts = [24, 2, 28, 14, 19] // the real per-desk widget counts
    deskWidgetCounts.forEach((count, di) => {
      const did = `sub-desk-${di}`
      nodes.push(gn({ id: did, type: 'project', roomId: 'sbase', importance: 0.7 - di * 0.05, title: `Sub desk ${di}` }))
      edges.push(ge('subroom', did, 'contains'))
      for (let w = 0; w < count; w++) {
        const wid = `sw-${di}-${String(w).padStart(2, '0')}`
        const kind = w % 3 === 0 ? 'sticky' : w % 3 === 1 ? 'note' : 'webview'
        nodes.push(gn({ id: wid, type: 'artifact', subtype: kind, roomId: 'sbase', importance: 0.5 - w * 0.005, title: `Sub widget ${di}.${w}` }))
        edges.push(ge(did, wid, 'contains'))
      }
    })
    return { nodes, edges }
  }

  it('C3.5: a SUB-ROOM (room in a room) becomes its own island — no clamp, zero overlap on the 4-level tree', () => {
    const { nodes, edges } = subRoomCorpus()
    const out = layoutIslandTree(nodes, edges)
    // the sub-room is now an ISLAND (a top-level root), not a leaf/desk
    const sub = out.placed.get('subroom')
    expect(sub, 'sub-room was not placed').toBeTruthy()
    expect(sub!.role, 'sub-room must be its own island, not collapsed into the parent fan').toBe('island')
    // its 5 desks are real DESKS orbiting the sub-room island (not leaves)
    const subDesks = ['sub-desk-0', 'sub-desk-1', 'sub-desk-2', 'sub-desk-3', 'sub-desk-4']
      .map((id) => out.placed.get(id))
      .filter((p): p is IslandPlaced => !!p)
    expect(subDesks.length, 'sub-room desks missing').toBe(5)
    for (const d of subDesks) {
      expect(d.role, `${d.id} should be a desk of the sub-room island`).toBe('desk')
      expect(d.parentId, `${d.id} should parent to the sub-room`).toBe('subroom')
    }
    // the parent→sub-room link is emitted so the hierarchy stays visible
    expect(out.subRoomLinks).toContainEqual({ parentId: 'room-parent', childId: 'subroom' })
    // THE INVARIANT: no two footprints intersect across the WHOLE 4-level tree.
    // (Old code clamped all 87 sub-room widgets onto 5 seats → dozens of overlaps.)
    const pairs = intersectingPairs(out.placed)
    expect(
      pairs.length,
      `sub-room tree OVERLAPS: ${pairs.length} intersecting pairs.\nfirst 25:\n  ${pairs.slice(0, 25).join('\n  ')}`
    ).toBe(0)
    // structure: every sub-room widget floats nearer ITS OWN desk than any other desk
    const subWidgets = [...out.placed.values()].filter((p) => p.role === 'leaf' && p.id.startsWith('sw-'))
    expect(subWidgets.length, 'sub-room widgets missing').toBeGreaterThan(80)
    const allDesks = [...out.placed.values()].filter((p) => p.role === 'desk')
    const adrift: string[] = []
    for (const leaf of subWidgets) {
      const parent = leaf.parentId ? out.placed.get(leaf.parentId) : undefined
      if (!parent || parent.role !== 'desk') continue
      const dOwn = Math.hypot(leaf.x - parent.x, leaf.y - parent.y)
      for (const other of allDesks) {
        if (other.id === parent.id) continue
        if (Math.hypot(leaf.x - other.x, leaf.y - other.y) < dOwn) {
          adrift.push(`${leaf.id}: closer to ${other.id} than parent ${parent.id}`)
          break
        }
      }
    }
    expect(adrift.length, `sub-room widgets adrift:\n  ${adrift.slice(0, 15).join('\n  ')}`).toBe(0)
  })

  it('C3.5: sub-room layout stays deterministic (shuffled + reversed → byte-identical)', () => {
    const { nodes, edges } = subRoomCorpus()
    const a = layoutIslandTree(nodes, edges)
    const b = layoutIslandTree([...nodes].reverse(), [...edges].reverse())
    expect([...a.placed.keys()].sort()).toEqual([...b.placed.keys()].sort())
    for (const [id, p] of a.placed) expect(b.placed.get(id)).toEqual(p)
  })
})

// ── THE AUTHENTIC-SHAPE LOCK (P4.5c C3.3) — nodes reserve + draw their REAL
// silhouette (doc = portrait page, spreadsheet = landscape grid, sticky = square),
// and the C2 zero-overlap invariant STILL holds on the real (non-square) footprints.
//
// The operator fork: `size` is the node's LONGEST side; the short side = aspect ×
// size. So a shaped tile's bounding box (and its half-diagonal) is ≤ the size×size
// square's — which is why the C2 construction, built on square reservations, keeps
// its zero-overlap guarantee BY CONSTRUCTION. These locks prove BOTH halves:
//   (1) nodeShape/shapeHalfExtent/nodeFootprint reserve the REAL aspect box, and
//   (2) the dense-corpus overlap invariant survives shaped nodes of every kind.
// §1a: an ADVERSARIAL plant (a doc that under-reserves its true portrait height)
// is caught by lock (3) — see the "adversarial" test — so the reservation is a
// real guard, not theater.
describe('island tree — AUTHENTIC SHAPES (P4.5c C3.3)', () => {
  it('nodeShape types each kind by its real silhouette (doc portrait, sheet/webview landscape, sticky square)', () => {
    // documents / pages → portrait (the LONG axis is height)
    expect(nodeShape('document', 'doc').longAxis).toBe('h')
    expect(nodeShape('document', 'doc').aspect).toBeLessThan(1) // narrower than tall
    expect(nodeShape('artifact', 'page').sil).toBe('page')
    // spreadsheets / webviews / images → landscape (the LONG axis is width)
    expect(nodeShape('artifact', 'sheet').longAxis).toBe('w')
    expect(nodeShape('artifact', 'sheet').aspect).toBeLessThan(1) // shorter than wide
    expect(nodeShape('artifact', 'webview').sil).toBe('browser')
    expect(nodeShape('artifact', 'image').sil).toBe('image')
    // desk (project) → landscape mini-canvas; room → its own true form
    expect(nodeShape('project', null).sil).toBe('desk')
    expect(nodeShape('room', null).sil).toBe('room')
    // sticky / note / card → square (a sticky note IS square)
    expect(nodeShape('artifact', 'sticky').aspect).toBe(1)
    expect(nodeShape('artifact', 'note').aspect).toBe(1)
    expect(nodeShape('person', null).aspect).toBe(1) // avatars stay square
  })

  it('shapeHalfExtent puts the FULL size on the long axis and aspect×size on the short axis', () => {
    const SIZE = 40
    const doc = shapeHalfExtent(SIZE, nodeShape('document', 'doc')) // portrait
    expect(doc.hh).toBeCloseTo(SIZE / 2, 5) // long axis (height) = full size
    expect(doc.hw).toBeLessThan(doc.hh) // width narrower
    const sheet = shapeHalfExtent(SIZE, nodeShape('artifact', 'sheet')) // landscape
    expect(sheet.hw).toBeCloseTo(SIZE / 2, 5) // long axis (width) = full size
    expect(sheet.hh).toBeLessThan(sheet.hw) // height shorter
    const sticky = shapeHalfExtent(SIZE, nodeShape('artifact', 'sticky')) // square
    expect(sticky.hw).toBeCloseTo(sticky.hh, 5)
  })

  it('a shaped footprint is NEVER larger than the size×size square (the C2 guarantee)', () => {
    // For every kind, the aspect-correct box fits INSIDE the square the C2
    // construction reserved → the world spacing built on squares stays valid.
    const SIZE = 46
    const square = SIZE / 2 + 6 /* FOOTPRINT_GAP */
    const kinds: Array<[string, string | null]> = [
      ['document', 'doc'], ['artifact', 'page'], ['artifact', 'sheet'], ['artifact', 'table'],
      ['artifact', 'webview'], ['artifact', 'image'], ['project', null], ['room', null],
      ['artifact', 'sticky'], ['artifact', 'note'], ['person', null]
    ]
    for (const [type, sub] of kinds) {
      const shape = nodeShape(type, sub)
      const p = { x: 0, y: 0, size: SIZE, role: 'leaf', shape } as IslandPlaced
      const fp = nodeFootprint(p, { label: false })
      // both half-extents must be ≤ the square's (never wider/taller than the reserve)
      expect((fp.maxX - fp.minX) / 2, `${type}:${sub} width`).toBeLessThanOrEqual(square + 1e-6)
      expect((fp.maxY - fp.minY) / 2, `${type}:${sub} height`).toBeLessThanOrEqual(square + 1e-6)
    }
  })

  it('nodeFootprint reserves the REAL non-square box for a placed doc vs sheet (not a square)', () => {
    // a portrait doc's footprint is TALLER than wide; a landscape sheet WIDER than
    // tall. This is the property that would break if a future edit dropped `shape`
    // from nodeFootprint (falling back to square) — the reservation must track the
    // authentic silhouette, or content drawn to that silhouette could overrun a
    // neighbor's tile.
    const doc = { x: 0, y: 0, size: 40, role: 'leaf', shape: nodeShape('document', 'doc') } as IslandPlaced
    const dfp = nodeFootprint(doc, { label: false })
    expect(dfp.maxY - dfp.minY, 'doc reserves portrait (taller than wide)').toBeGreaterThan(dfp.maxX - dfp.minX)
    const sheet = { x: 0, y: 0, size: 40, role: 'leaf', shape: nodeShape('artifact', 'sheet') } as IslandPlaced
    const sfp = nodeFootprint(sheet, { label: false })
    expect(sfp.maxX - sfp.minX, 'sheet reserves landscape (wider than tall)').toBeGreaterThan(sfp.maxY - sfp.minY)
  })

  it('ADVERSARIAL: a doc footprint that UNDER-reserves its true portrait height would be CAUGHT', () => {
    // §1a red-then-green: prove the reservation is a real guard. Build a doc placed
    // node, then a HAND-BROKEN copy whose footprint pretends the doc is square-SHORT
    // (under-reserving its true height — the exact regression a careless refactor of
    // nodeFootprint/shapeHalfExtent would introduce). The true portrait height must
    // exceed the broken (under-reserved) height — so a lock comparing them fires.
    const SIZE = 40
    const trueShape = nodeShape('document', 'doc') // longAxis 'h' → tall
    const trueHalf = shapeHalfExtent(SIZE, trueShape)
    // the deliberate break: reserve it as a WIDE-short landscape (height = aspect×size)
    const brokenShape = { longAxis: 'w' as const, aspect: trueShape.aspect, sil: trueShape.sil }
    const brokenHalf = shapeHalfExtent(SIZE, brokenShape)
    // the TRUE portrait reserves MORE height than the broken landscape → the guard
    // (footprint height must equal the true silhouette height) would catch the break.
    expect(trueHalf.hh, 'true doc is taller than the under-reserved break').toBeGreaterThan(brokenHalf.hh)
    // and nodeFootprint on the true doc reflects the TRUE (taller) reservation
    const truePlaced = { x: 0, y: 0, size: SIZE, role: 'leaf', shape: trueShape } as IslandPlaced
    const brokenPlaced = { x: 0, y: 0, size: SIZE, role: 'leaf', shape: brokenShape } as IslandPlaced
    const trueFp = nodeFootprint(truePlaced, { label: false })
    const brokenFp = nodeFootprint(brokenPlaced, { label: false })
    expect(trueFp.maxY - trueFp.minY, 'true footprint taller than the under-reserved one').toBeGreaterThan(
      brokenFp.maxY - brokenFp.minY
    )
  })

  it('ZERO-OVERLAP holds on a dense corpus of SHAPED nodes (doc/sheet/webview/sticky mixed)', () => {
    // the dense corpus already mixes sticky/note/webview leaves; add doc + sheet
    // kinds so every silhouette class is present in the overlap invariant. If any
    // shaped footprint escaped its reserved seat, a pair would intersect here.
    const { nodes, edges } = denseCorpusShaped()
    expect(nodes.length).toBeGreaterThanOrEqual(300)
    const out = layoutIslandTree(nodes, edges)
    const pairs = intersectingPairs(out.placed)
    expect(
      pairs.length,
      `zero-overlap BROKEN with authentic shapes: ${pairs.length} pairs.\nfirst 25:\n  ${pairs.slice(0, 25).join('\n  ')}`
    ).toBe(0)
    // and the shaped kinds are actually present (guard against the corpus silently
    // dropping them → a vacuous pass)
    const leafShapes = [...out.placed.values()].filter((p) => p.role === 'leaf').map((p) => p.shape.sil)
    expect(new Set(leafShapes).size, 'multiple silhouette classes present').toBeGreaterThanOrEqual(3)
  })

  it('is deterministic with shaped nodes (shuffled + reversed → byte-identical, shape included)', () => {
    const { nodes, edges } = denseCorpusShaped()
    const a = layoutIslandTree(nodes, edges)
    const b = layoutIslandTree([...nodes].reverse(), [...edges].reverse())
    for (const [id, p] of a.placed) expect(b.placed.get(id)).toEqual(p) // shape field included in deep-equal
  })
})

// a shaped variant of the dense corpus: same shape/density as denseCorpus but the
// widgets span the full silhouette taxonomy (sticky/note/webview/sheet/doc/image)
// so the overlap invariant exercises every non-square footprint kind.
function denseCorpusShaped(): { nodes: GraphViewNode[]; edges: GraphViewEdge[] } {
  const nodes: GraphViewNode[] = []
  const edges: GraphViewEdge[] = []
  const ROOMS = 14
  const KINDS = ['sticky', 'note', 'webview', 'sheet', 'doc', 'image'] as const
  for (let r = 0; r < ROOMS; r++) {
    const base = `br-${String(r).padStart(2, '0')}`
    nodes.push(
      gn({ id: `room-${String(r).padStart(2, '0')}`, type: 'room', band: 'pillar', importance: 0.95 - r * 0.03, roomId: base, baseId: base, title: `Room number ${r} with a longish name` })
    )
    const deskCount = 2 + (r % 3)
    for (let d = 0; d < deskCount; d++) {
      const did = `desk-${String(r).padStart(2, '0')}-${d}`
      nodes.push(gn({ id: did, type: 'project', roomId: base, importance: 0.7 - d * 0.05, title: `Desk ${r}.${d}` }))
      edges.push(ge(`room-${String(r).padStart(2, '0')}`, did, 'contains'))
      const widgetCount = r === 0 && d === 0 ? 22 : 2 + ((r + d) % 5)
      for (let w = 0; w < widgetCount; w++) {
        const wid = `w-${String(r).padStart(2, '0')}-${d}-${String(w).padStart(2, '0')}`
        const kind = KINDS[(r + d + w) % KINDS.length]
        // a 'doc' kind rides as a document node; the rest as artifacts (real shapes)
        nodes.push(
          kind === 'doc'
            ? gn({ id: wid, type: 'document', subtype: 'doc', roomId: base, importance: 0.5 - w * 0.01, title: `Doc ${w} on desk ${r}.${d}` })
            : gn({ id: wid, type: 'artifact', subtype: kind, roomId: base, importance: 0.5 - w * 0.01, title: `Widget ${w} on desk ${r}.${d}` })
        )
        edges.push(ge(did, wid, 'contains'))
      }
    }
  }
  for (let i = 0; i < 26; i++) {
    const spans =
      i % 3 === 0
        ? [`br-${String(i % ROOMS).padStart(2, '0')}`, `br-${String((i + 4) % ROOMS).padStart(2, '0')}`, `br-${String((i + 9) % ROOMS).padStart(2, '0')}`]
        : i % 3 === 1
          ? [`br-${String(i % ROOMS).padStart(2, '0')}`, `br-${String((i + 5) % ROOMS).padStart(2, '0')}`]
          : [`br-${String(i % ROOMS).padStart(2, '0')}`]
    nodes.push(
      gn({ id: `person-${String(i).padStart(2, '0')}`, type: i % 7 === 0 ? 'organization' : 'person', band: 'identity', importance: 0.35 + (i % 6) * 0.09, memberRooms: spans, roomId: spans[0], title: `Identity person number ${i}` })
    )
  }
  for (let u = 0; u < 50; u++) {
    nodes.push(
      gn({ id: `unfiled-${String(u).padStart(2, '0')}`, type: u % 2 === 0 ? 'document' : 'note', band: 'orgwide', importance: 0.4 + (u % 10) * 0.005, title: `Unfiled loose item ${u}` })
    )
  }
  return { nodes, edges }
}
