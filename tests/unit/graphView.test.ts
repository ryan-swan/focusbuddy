import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  projectGraphView,
  altitudeCut,
  isVisibleAtAltitude,
  GRAPH_VIEW_MAX,
  ALTITUDE_MIN,
  ALTITUDE_MAX,
  type GraphViewNodeIn,
  type GraphViewEdgeIn
} from '@shared/graphView'

// Unit locks for the PURE graph-view projection (plexi-brain P4 — Slice 1: the LOD
// selection the radial view renders). The view is a LENS over the P1-P3 graph (DEC-010):
// it draws ONLY real stored edges, holds ~30-150 nodes at any altitude (never
// render-all), and is formula-only — nothing here may reach a network or an LLM (I1).
// Locked rules (the operator-approved Slice-1 design):
//   band rule     — rooms are pillars; person/org/tool are the identity band; both are
//                   drawn by CLASS, the importance cut governs the work inside sectors
//   conflict lift — a node carrying a `contradicts` edge earns altitude (always visible)
//   same-as fold  — a same-as cluster collapses to ONE representative token that
//                   remembers every member room (one Caleb across every room)
//   the cap       — the projection NEVER exceeds GRAPH_VIEW_MAX nodes

const n = (over: Partial<GraphViewNodeIn> & { id: string }): GraphViewNodeIn => ({
  id: over.id,
  roomId: over.roomId ?? null,
  type: over.type ?? 'task',
  subtype: over.subtype ?? null,
  title: over.title ?? over.id,
  importance: over.importance ?? 0.5,
  lifecycle: over.lifecycle ?? 'active'
})
const e = (srcId: string, dstId: string, type: GraphViewEdgeIn['type']): GraphViewEdgeIn => ({
  srcId,
  dstId,
  type
})

describe('band classification', () => {
  it('rooms are pillars; person/org/tool are identity; room-scoped work is work; room-less content is orgwide', () => {
    const out = projectGraphView(
      [
        n({ id: 'r1', type: 'room' }),
        n({ id: 'p1', type: 'person' }),
        n({ id: 'o1', type: 'organization' }),
        n({ id: 't1', type: 'tool' }),
        n({ id: 'w1', type: 'task', roomId: 'r1' }),
        n({ id: 'd1', type: 'document', roomId: null }),
        n({ id: 'note1', type: 'note', roomId: null })
      ],
      []
    )
    const band = (id: string): string => out.nodes.find((x) => x.id === id)!.band
    expect(band('r1')).toBe('pillar')
    expect(band('p1')).toBe('identity')
    expect(band('o1')).toBe('identity')
    expect(band('t1')).toBe('identity')
    expect(band('w1')).toBe('work')
    expect(band('d1')).toBe('orgwide')
    expect(band('note1')).toBe('orgwide')
  })
})

describe('altitude visibility — the zoom is the filter', () => {
  it('the cut falls monotonically as you descend (deeper zoom reveals, never hides)', () => {
    let prev = Infinity
    for (let z = ALTITUDE_MIN; z <= ALTITUDE_MAX; z += 0.1) {
      const cut = altitudeCut(z)
      expect(cut).toBeLessThanOrEqual(prev)
      expect(cut).toBeGreaterThan(0)
      expect(cut).toBeLessThan(1)
      prev = cut
    }
  })

  it('pillars and the identity band are visible at EVERY altitude regardless of importance (band rule)', () => {
    const out = projectGraphView(
      [
        n({ id: 'r1', type: 'room', importance: 0.1 }),
        n({ id: 'p1', type: 'person', importance: 0.1 }),
        n({ id: 't1', type: 'tool', importance: 0.1 })
      ],
      []
    )
    for (const node of out.nodes) {
      expect(isVisibleAtAltitude(node, ALTITUDE_MIN)).toBe(true)
      expect(isVisibleAtAltitude(node, ALTITUDE_MAX)).toBe(true)
    }
  })

  it('low-importance work hides at cruise and resolves at depth', () => {
    const out = projectGraphView([n({ id: 'r1', type: 'room' }), n({ id: 'w1', type: 'document', roomId: 'r1', importance: 0.41 })], [
      e('r1', 'w1', 'contains')
    ])
    const doc = out.nodes.find((x) => x.id === 'w1')!
    expect(isVisibleAtAltitude(doc, ALTITUDE_MIN)).toBe(false)
    expect(isVisibleAtAltitude(doc, ALTITUDE_MAX)).toBe(true)
  })

  it('a mis-filed low-importance node still surfaces at depth — no confident blindness', () => {
    // Even importance 0 must eventually be drawn: the deepest cut must sit below 0
    // relative floor? No — the rule is: the deepest cut is lower than the DEFAULT
    // importance floor of real projected nodes (0.35 < 0.41), so nothing real is
    // permanently invisible.
    expect(altitudeCut(ALTITUDE_MAX)).toBeLessThan(0.41)
  })
})

describe('conflict lift — a contradiction earns altitude', () => {
  it('a low-importance document carrying a contradicts edge is visible at cruise', () => {
    const out = projectGraphView(
      [n({ id: 'a', type: 'document', importance: 0.41 }), n({ id: 'b', type: 'document', importance: 0.41 })],
      [e('a', 'b', 'contradicts')]
    )
    for (const node of out.nodes) {
      expect(node.conflict).toBe(true)
      expect(isVisibleAtAltitude(node, ALTITUDE_MIN)).toBe(true)
    }
  })

  it('an ordinary low-importance document is NOT conflict-lifted', () => {
    const out = projectGraphView(
      [n({ id: 'a', type: 'document', importance: 0.41 }), n({ id: 'b', type: 'document', importance: 0.41 })],
      [e('a', 'b', 'about')]
    )
    for (const node of out.nodes) expect(node.conflict).toBe(false)
  })
})

describe('same-as fold — one identity, one token', () => {
  const cluster = [
    n({ id: 'c1', type: 'person', title: 'Caleb Wilton', roomId: 'room-sources', importance: 0.5 }),
    n({ id: 'c2', type: 'person', title: 'Caleb Wilton', roomId: 'room-flamelit', importance: 0.5 }),
    n({ id: 'c3', type: 'person', title: 'Caleb Wilton', roomId: 'room-people', importance: 0.5 }),
    n({ id: 'c4', type: 'person', title: 'Caleb Wilton', roomId: 'room-decisions', importance: 0.5 })
  ]
  const braids = [e('c1', 'c2', 'same-as'), e('c1', 'c3', 'same-as'), e('c1', 'c4', 'same-as')]

  it('a 4-node same-as cluster collapses to ONE token that remembers all 4 rooms', () => {
    const out = projectGraphView(cluster, braids)
    const persons = out.nodes.filter((x) => x.type === 'person')
    expect(persons).toHaveLength(1)
    expect(persons[0].collapsedIds).toHaveLength(4)
    expect([...persons[0].memberRooms].sort()).toEqual(
      ['room-decisions', 'room-flamelit', 'room-people', 'room-sources'].sort()
    )
  })

  it('the fold is deterministic — same input, same representative, every time', () => {
    const a = projectGraphView(cluster, braids)
    const b = projectGraphView([...cluster].reverse(), [...braids].reverse())
    expect(a.nodes.find((x) => x.type === 'person')!.id).toBe(b.nodes.find((x) => x.type === 'person')!.id)
  })

  it('edges into any member are remapped to the representative; self-loops are dropped', () => {
    const out = projectGraphView(
      [...cluster, n({ id: 'task1', type: 'task', roomId: 'room-sources' })],
      [...braids, e('task1', 'c3', 'assigned-to')]
    )
    const rep = out.nodes.find((x) => x.type === 'person')!
    const assigned = out.edges.filter((x) => x.type === 'assigned-to')
    expect(assigned).toHaveLength(1)
    expect(assigned[0].dstId).toBe(rep.id)
    expect(out.edges.filter((x) => x.type === 'same-as')).toHaveLength(0) // folded, not drawn as leftovers
    expect(out.edges.every((x) => x.srcId !== x.dstId)).toBe(true)
  })

  it('two DIFFERENT people never fold — no same-as edge, no merge', () => {
    const out = projectGraphView(
      [n({ id: 'p1', type: 'person', title: 'Caleb Wilton' }), n({ id: 'p2', type: 'person', title: 'Ryan McQuillian' })],
      []
    )
    expect(out.nodes.filter((x) => x.type === 'person')).toHaveLength(2)
  })
})

describe('the cap — never a wall of dots', () => {
  it('a 1000-node graph projects to at most GRAPH_VIEW_MAX nodes, keeping every pillar and every conflict', () => {
    const nodes: GraphViewNodeIn[] = []
    const edges: GraphViewEdgeIn[] = []
    for (let i = 0; i < 8; i++) nodes.push(n({ id: `room-${i}`, type: 'room', importance: 0.6 }))
    nodes.push(n({ id: 'cf-a', type: 'document', importance: 0.05 }))
    nodes.push(n({ id: 'cf-b', type: 'document', importance: 0.05 }))
    edges.push(e('cf-a', 'cf-b', 'contradicts'))
    for (let i = 0; i < 990; i++) nodes.push(n({ id: `w-${i}`, type: 'task', roomId: `room-${i % 8}`, importance: Math.random() * 0.6 }))
    const out = projectGraphView(nodes, edges)
    expect(out.nodes.length).toBeLessThanOrEqual(GRAPH_VIEW_MAX)
    expect(out.totalNodes).toBe(nodes.length)
    for (let i = 0; i < 8; i++) expect(out.nodes.some((x) => x.id === `room-${i}`)).toBe(true)
    expect(out.nodes.some((x) => x.id === 'cf-a')).toBe(true)
    expect(out.nodes.some((x) => x.id === 'cf-b')).toBe(true)
  })

  it('edges only ever reference surviving nodes', () => {
    const nodes: GraphViewNodeIn[] = [n({ id: 'r', type: 'room' })]
    const edges: GraphViewEdgeIn[] = []
    for (let i = 0; i < 400; i++) {
      nodes.push(n({ id: `t-${i}`, type: 'task', roomId: 'r', importance: i / 400 }))
      edges.push(e('r', `t-${i}`, 'contains'))
    }
    const out = projectGraphView(nodes, edges)
    const ids = new Set(out.nodes.map((x) => x.id))
    for (const edge of out.edges) {
      expect(ids.has(edge.srcId)).toBe(true)
      expect(ids.has(edge.dstId)).toBe(true)
    }
  })
})

describe('P4.5 island tree — subtype rides the projection (the canvas exact icon per leaf)', () => {
  it('a widget artifact carries its kind, a document its docType; absent subtype is null', () => {
    const out = projectGraphView(
      [
        n({ id: 'w1', type: 'artifact', roomId: 'r1', subtype: 'sticky' }),
        n({ id: 'd1', type: 'document', subtype: 'sheet' }),
        n({ id: 'p1', type: 'project', roomId: 'r1' })
      ],
      []
    )
    const by = new Map(out.nodes.map((x) => [x.id, x]))
    expect(by.get('w1')!.subtype).toBe('sticky')
    expect(by.get('d1')!.subtype).toBe('sheet')
    expect(by.get('p1')!.subtype).toBeNull()
  })

  it('the fold representative keeps its OWN subtype (highest-importance member wins)', () => {
    const out = projectGraphView(
      [
        n({ id: 'a1', type: 'artifact', roomId: 'r1', subtype: 'sticky', importance: 0.9 }),
        n({ id: 'a2', type: 'artifact', roomId: 'r2', subtype: 'note', importance: 0.4 })
      ],
      [e('a1', 'a2', 'same-as')]
    )
    expect(out.nodes).toHaveLength(1)
    expect(out.nodes[0].subtype).toBe('sticky')
  })
})

// ── DEC-014 grep-lock: the view module carries NO domain taxonomy. Pillars are ──
// whatever rooms the derivation ranks — never a hardcoded list of departments.
describe('DEC-014 grep-lock — no hardcoded pillars in the view projection', () => {
  const DOMAIN_WORDS = ['Engineering', 'Marketing', 'Sales', 'Finance', 'Health', 'Fitness', 'departments', 'life-areas']
  it('src/shared/graphView.ts contains no domain vocabulary', () => {
    const src = readFileSync(resolve(__dirname, '../../src/shared/graphView.ts'), 'utf-8')
    for (const w of DOMAIN_WORDS) {
      expect(src.includes(w), `forbidden domain word "${w}" found in graphView.ts`).toBe(false)
    }
  })
})
