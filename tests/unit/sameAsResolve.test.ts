import { describe, it, expect } from 'vitest'
import {
  shouldLinkSameAs,
  resolveCrossRoomSameAs,
  provenanceIndependent,
  type SameAsEntity
} from '@shared/sameAsResolve'

// Unit lock for the PURE cross-room same-as resolver (plexi-brain P3 — Layer 3: recall
// ONE entity across EVERY room). THE KEEL (DEC-016 / DEC-011 §D safe-asymmetry, raised
// for cross-room): a wrong cross-room link corrupts recall SILENTLY across the whole
// workspace — so the failure direction MUST be NOT-linking (a visible duplicate), never
// wrong-linking. These locks are dominated by the false-LINK guards.

const ent = (over: Partial<SameAsEntity>): SameAsEntity => ({
  nodeId: over.nodeId ?? `n-${Math.random()}`,
  name: over.name ?? 'Caleb Wilton',
  type: over.type ?? 'person',
  roomId: over.roomId ?? null,
  provenanceRoots: over.provenanceRoots ?? ['root-1']
})

describe('shouldLinkSameAs — genuine cross-room recurrence DOES link', () => {
  it('same name, different rooms, provenance-independent → link', () => {
    const a = ent({ nodeId: 'a', name: 'Caleb Wilton', roomId: 'room-1', provenanceRoots: ['src-A'] })
    const b = ent({ nodeId: 'b', name: 'Caleb Wilton', roomId: 'room-2', provenanceRoots: ['src-B'] })
    expect(shouldLinkSameAs(a, b)).toBe(true)
  })

  it('organizations link the same way as people (type-general)', () => {
    const a = ent({ nodeId: 'a', name: 'Flamelit', type: 'organization', roomId: 'r1', provenanceRoots: ['s1'] })
    const b = ent({ nodeId: 'b', name: 'Flamelit', type: 'organization', roomId: 'r2', provenanceRoots: ['s2'] })
    expect(shouldLinkSameAs(a, b)).toBe(true)
  })

  it('name matching is normalized (punctuation/case/whitespace tolerant)', () => {
    const a = ent({ nodeId: 'a', name: 'Caleb  Wilton', roomId: 'r1', provenanceRoots: ['s1'] })
    const b = ent({ nodeId: 'b', name: 'caleb wilton', roomId: 'r2', provenanceRoots: ['s2'] })
    expect(shouldLinkSameAs(a, b)).toBe(true)
  })
})

describe('shouldLinkSameAs — THE KEEL: false cross-room links are DECLINED', () => {
  it('different TYPE never links (a person is not an org of the same name)', () => {
    const a = ent({ nodeId: 'a', name: 'Apex', type: 'person', roomId: 'r1', provenanceRoots: ['s1'] })
    const b = ent({ nodeId: 'b', name: 'Apex', type: 'organization', roomId: 'r2', provenanceRoots: ['s2'] })
    expect(shouldLinkSameAs(a, b)).toBe(false)
  })

  it('a bare first-name does NOT confidently match a fuller name (unknowable which)', () => {
    const a = ent({ nodeId: 'a', name: 'Michael', roomId: 'r1', provenanceRoots: ['s1'] })
    const b = ent({ nodeId: 'b', name: 'Michael Dean', roomId: 'r2', provenanceRoots: ['s2'] })
    expect(shouldLinkSameAs(a, b)).toBe(false)
  })

  it('SAME room never cross-room-links (that is P2 within-scope, not P3)', () => {
    const a = ent({ nodeId: 'a', name: 'Caleb Wilton', roomId: 'room-1', provenanceRoots: ['s1'] })
    const b = ent({ nodeId: 'b', name: 'Caleb Wilton', roomId: 'room-1', provenanceRoots: ['s2'] })
    expect(shouldLinkSameAs(a, b)).toBe(false)
  })

  it('two null-room (org-visible) entities are the SAME scope → no cross-room link', () => {
    const a = ent({ nodeId: 'a', name: 'Caleb Wilton', roomId: null, provenanceRoots: ['s1'] })
    const b = ent({ nodeId: 'b', name: 'Caleb Wilton', roomId: null, provenanceRoots: ['s2'] })
    expect(shouldLinkSameAs(a, b)).toBe(false)
  })

  it('a pure ECHO (one root, subset of the other) does NOT link (no manufactured identity)', () => {
    // b's only root is also a's root → b is an echo of a, not independent corroboration.
    const a = ent({ nodeId: 'a', name: 'Caleb Wilton', roomId: 'r1', provenanceRoots: ['shared-root'] })
    const b = ent({ nodeId: 'b', name: 'Caleb Wilton', roomId: 'r2', provenanceRoots: ['shared-root'] })
    expect(shouldLinkSameAs(a, b)).toBe(false)
  })

  it('never links a node to itself', () => {
    const a = ent({ nodeId: 'same', name: 'Caleb Wilton', roomId: 'r1' })
    expect(shouldLinkSameAs(a, a)).toBe(false)
  })
})

describe('provenanceIndependent — echoes never corroborate (DEC-011 §D Amend 1)', () => {
  it('distinct roots on each side → independent', () => {
    expect(provenanceIndependent(['a'], ['b'])).toBe(true)
    expect(provenanceIndependent(['a', 'x'], ['b', 'x'])).toBe(true) // each has its own
  })
  it('one side subset of the other (echo) → NOT independent', () => {
    expect(provenanceIndependent(['x'], ['x'])).toBe(false)
    expect(provenanceIndependent(['x'], ['x', 'y'])).toBe(false) // left is a pure echo
  })
  it('empty roots → conservative NO', () => {
    expect(provenanceIndependent([], ['b'])).toBe(false)
    expect(provenanceIndependent(['a'], [])).toBe(false)
  })
})

describe('resolveCrossRoomSameAs — the batch resolver over a whole graph', () => {
  it('links one entity recurring across 3 rooms into a connected chain (2 edges, not 3)', () => {
    // Caleb in rooms 1/2/3, each provenance-independent → a connected chain of 2 edges
    // (1-2, 2-3 or 1-2, 1-3) that a recall walk traverses fully. Not n² edges.
    const entities: SameAsEntity[] = [
      ent({ nodeId: 'c1', name: 'Caleb Wilton', roomId: 'r1', provenanceRoots: ['s1'] }),
      ent({ nodeId: 'c2', name: 'Caleb Wilton', roomId: 'r2', provenanceRoots: ['s2'] }),
      ent({ nodeId: 'c3', name: 'Caleb Wilton', roomId: 'r3', provenanceRoots: ['s3'] })
    ]
    const links = resolveCrossRoomSameAs(entities)
    expect(links).toHaveLength(2)
    // Every link is between two of the three Caleb nodes.
    for (const l of links) {
      expect(['c1', 'c2', 'c3']).toContain(l.aNodeId)
      expect(['c1', 'c2', 'c3']).toContain(l.bNodeId)
      expect(l.name).toBe('Caleb Wilton')
    }
  })

  it('does NOT link unrelated same-named entities that fail a gate', () => {
    const entities: SameAsEntity[] = [
      ent({ nodeId: 'p', name: 'Apex', type: 'person', roomId: 'r1', provenanceRoots: ['s1'] }),
      ent({ nodeId: 'o', name: 'Apex', type: 'organization', roomId: 'r2', provenanceRoots: ['s2'] }),
      ent({ nodeId: 'echo1', name: 'Grok', roomId: 'r1', provenanceRoots: ['shared'] }),
      ent({ nodeId: 'echo2', name: 'Grok', roomId: 'r2', provenanceRoots: ['shared'] }) // echo
    ]
    expect(resolveCrossRoomSameAs(entities)).toHaveLength(0)
  })

  it('distinct names never cross-link', () => {
    const entities: SameAsEntity[] = [
      ent({ nodeId: 'a', name: 'Caleb Wilton', roomId: 'r1', provenanceRoots: ['s1'] }),
      ent({ nodeId: 'b', name: 'Michael Dean', roomId: 'r2', provenanceRoots: ['s2'] })
    ]
    expect(resolveCrossRoomSameAs(entities)).toHaveLength(0)
  })
})
