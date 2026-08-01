import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  NODE_TYPES,
  EDGE_TYPES,
  PROVENANCE_EDGE,
  CONFIDENCE_LEVELS,
  LIFECYCLE_STATES,
  SENSITIVITY_TIERS,
  SPINE_DEFAULTS,
  isNodeType,
  isEdgeType,
  clampImportance,
  isProvenanceLeaf,
  edgeEndpointsValid
} from '@shared/brainGraph'

// Unit lock for the plexi-brain P1 graph vocabulary + spine (pure, no DB). The
// storage layer (db/brainNodes.ts, db/brainEdges.ts) and the projector both agree
// on these shapes, so the invariants below are the contract both sides trust.

describe('brainGraph vocabulary', () => {
  it('node + edge type sets are non-empty and unique', () => {
    expect(NODE_TYPES.length).toBeGreaterThanOrEqual(15)
    expect(EDGE_TYPES.length).toBeGreaterThanOrEqual(13)
    expect(new Set(NODE_TYPES).size).toBe(NODE_TYPES.length)
    expect(new Set(EDGE_TYPES).size).toBe(EDGE_TYPES.length)
  })

  it('the ontology signature types are present (05-ARCHITECTURE/01-OBJECT-ONTOLOGY.md)', () => {
    for (const t of ['room', 'person', 'decision', 'goal', 'task', 'document', 'note']) {
      expect(NODE_TYPES).toContain(t)
    }
    // The cross-room edges P3 mints must already exist as type values (no new tables).
    for (const e of ['produced', 'supersedes', 'same-as', 'contradicts', 'related']) {
      expect(EDGE_TYPES).toContain(e)
    }
  })

  it('provenance is an edge type — "produced/came-from"', () => {
    expect(EDGE_TYPES).toContain(PROVENANCE_EDGE)
    expect(PROVENANCE_EDGE).toBe('produced')
  })

  it('type guards accept known values and reject unknowns', () => {
    expect(isNodeType('decision')).toBe(true)
    expect(isNodeType('Engineering')).toBe(false)
    expect(isEdgeType('same-as')).toBe(true)
    expect(isEdgeType('reports-to')).toBe(false)
  })
})

describe('brainGraph spine', () => {
  it('spine enums are the ontology §3 sets', () => {
    expect(CONFIDENCE_LEVELS).toEqual(['typed', 'inferred', 'ambiguous'])
    expect(LIFECYCLE_STATES).toEqual(['fresh', 'active', 'stale', 'superseded'])
    expect(SENSITIVITY_TIERS).toContain('normal')
  })

  it('spine defaults are conservative — a new/projected node is honest, not over-confident', () => {
    // Unknown-provenance nodes start 'inferred', never 'typed' (I4: never fake certainty).
    expect(SPINE_DEFAULTS.confidence).toBe('inferred')
    expect(SPINE_DEFAULTS.lifecycle).toBe('active')
    expect(SPINE_DEFAULTS.importanceDerived).toBe(0.5) // neutral prior until DERIVED
  })

  it('clampImportance keeps the retriever [0,1] contract and survives garbage', () => {
    expect(clampImportance(0.7)).toBe(0.7)
    expect(clampImportance(2)).toBe(1)
    expect(clampImportance(-1)).toBe(0)
    expect(clampImportance(NaN)).toBe(SPINE_DEFAULTS.importanceDerived)
  })
})

describe('brainGraph edge endpoints (polymorphic: node→node XOR provenance leaf)', () => {
  it('a node→node edge is valid, and is NOT a provenance leaf', () => {
    const e = { dstId: 'bn-1', dstSourceTable: null, dstSourceId: null }
    expect(edgeEndpointsValid(e)).toBe(true)
    expect(isProvenanceLeaf(e)).toBe(false)
  })

  it('a provenance leaf (source-record target) is valid, and IS a leaf', () => {
    const e = { dstId: null, dstSourceTable: 'fb_knowledge', dstSourceId: 'k-1' }
    expect(edgeEndpointsValid(e)).toBe(true)
    expect(isProvenanceLeaf(e)).toBe(true)
  })

  it('rejects both-set (ambiguous) and neither-set (dangling) endpoints', () => {
    expect(edgeEndpointsValid({ dstId: 'bn-1', dstSourceTable: 'x', dstSourceId: 'y' })).toBe(false)
    expect(edgeEndpointsValid({ dstId: null, dstSourceTable: null, dstSourceId: null })).toBe(false)
    // half-set leaf is also invalid (a leaf needs BOTH table + id)
    expect(edgeEndpointsValid({ dstId: null, dstSourceTable: 'x', dstSourceId: null })).toBe(false)
  })
})

// ── DEC-014 grep-lock (planted red-then-green): the graph builds itself, NEVER a ──
// hardcoded taxonomy. The vocabulary must contain ONLY universal structural
// primitives — no domain/department/pillar names. A business's departments, a
// student's courses, a freelancer's clients all EMERGE as named Rooms; if any of
// those domain words leak into the type vocabulary, universality is broken.
// This test reads the source of brainGraph.ts and fails if a domain name appears
// as a vocabulary VALUE (checked against the actual type arrays, so a domain word
// in a COMMENT explaining what NOT to do doesn't false-positive).
describe('DEC-014 grep-lock — no hardcoded domain taxonomy in the vocabulary', () => {
  const DOMAIN_WORDS = [
    'engineering',
    'marketing',
    'sales',
    'finance',
    'operations',
    'legal',
    'product',
    'human resources',
    'health',
    'fitness',
    'family',
    'wedding'
  ]

  it('no NODE_TYPES or EDGE_TYPES value is a domain/department/pillar name', () => {
    const vocab = [...NODE_TYPES, ...EDGE_TYPES].map((v) => v.toLowerCase())
    for (const w of DOMAIN_WORDS) {
      expect(vocab, `vocabulary must not contain the domain word "${w}"`).not.toContain(w)
    }
  })

  it('the brainGraph source declares the DEC-014 guard-rail (self-documenting lock)', () => {
    const src = readFileSync(resolve(__dirname, '../../src/shared/brainGraph.ts'), 'utf-8')
    expect(src).toContain('DEC-014')
    expect(src.toLowerCase()).toContain('never')
  })
})
