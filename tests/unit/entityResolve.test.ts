import { describe, it, expect } from 'vitest'
import {
  resolvePersonWithinScope,
  extractPersonName,
  cleanName,
  type PersonCandidate
} from '@shared/entityResolve'

// Unit lock for the PURE within-scope entity resolver (plexi-brain P2 — the sharpest
// edge). The §10 risk this guards: a FALSE MERGE silently corrupts the graph (two
// different people collapse into one, and every fact about either is now mis-attributed).
// The safe-asymmetry rule (DEC-011 §D): merge ONLY when confident; the failure direction
// is "mint a harmless duplicate", NEVER "merge the wrong two". These tests are the
// red-green lock — the merge-when-ambiguous cases are the ones that break trust.

const person = (nodeId: string, name: string): PersonCandidate => ({ nodeId, name })

describe('entityResolve — safe-asymmetry (mint when unsure, never wrong-merge)', () => {
  it('links to an existing person on an EXACT name match (the one safe merge)', () => {
    const r = resolvePersonWithinScope('Sarah', [person('p-sarah', 'Sarah')])
    expect(r.action).toBe('link')
    expect(r.matchedNodeId).toBe('p-sarah')
  })

  it('mints when there is NO candidate (a fresh person)', () => {
    const r = resolvePersonWithinScope('Sarah', [])
    expect(r.action).toBe('mint')
    expect(r.matchedNodeId).toBeNull()
    expect(r.normalizedName).toBe('Sarah')
  })

  // ── THE FALSE-MERGE LOCKS (planted-red-then-green) ───────────────────────────
  // Each of these, if the resolver were sloppy, would MERGE two different people.
  // They MUST mint. This is the class the whole safe-asymmetry rule exists to prevent.

  it('does NOT merge a bare first name into a fuller name (ambiguous → mint)', () => {
    // "Sarah" could be Sarah Chen or Sarah Jones — unknowable from a first name alone.
    const r = resolvePersonWithinScope('Sarah', [person('p1', 'Sarah Chen')])
    expect(r.action).toBe('mint') // NOT 'link' — a wrong merge is the failure to prevent
    expect(r.matchedNodeId).toBeNull()
  })

  it('does NOT merge when TWO people share the exact name in scope (genuine ambiguity)', () => {
    const r = resolvePersonWithinScope('Sarah', [person('p1', 'Sarah'), person('p2', 'Sarah')])
    expect(r.action).toBe('mint') // never guess WHICH Sarah
    expect(r.matchedNodeId).toBeNull()
    expect(r.why).toContain('minting')
  })

  it('does NOT merge two genuinely different people (Sarah Chen vs Sarah Jones)', () => {
    const r = resolvePersonWithinScope('Sarah Jones', [person('p1', 'Sarah Chen')])
    expect(r.action).toBe('mint')
    expect(r.matchedNodeId).toBeNull()
  })

  it('does NOT merge on a degenerate/empty name', () => {
    expect(resolvePersonWithinScope('', [person('p1', 'Sarah')]).action).toBe('mint')
    expect(resolvePersonWithinScope('S', [person('p1', 'Sarah')]).action).toBe('mint')
  })

  it('matches case-insensitively + tolerant of punctuation/whitespace (a SAFE exact match)', () => {
    const r = resolvePersonWithinScope('  sarah, ', [person('p-sarah', 'Sarah')])
    expect(r.action).toBe('link')
    expect(r.matchedNodeId).toBe('p-sarah')
  })

  it('a full-name exact match links (Sarah Chen === Sarah Chen)', () => {
    const r = resolvePersonWithinScope('Sarah Chen', [person('p1', 'Sarah Chen'), person('p2', 'Sarah Jones')])
    expect(r.action).toBe('link')
    expect(r.matchedNodeId).toBe('p1')
  })
})

describe('entityResolve — extractPersonName (conservative, no false persons)', () => {
  it('extracts a name after an address verb', () => {
    expect(extractPersonName('email Sarah the Q3 deck by Friday')).toBe('Sarah')
    expect(extractPersonName('tell John the meeting moved')).toBe('John')
    expect(extractPersonName('remind Sarah Chen about the invoice')).toBe('Sarah Chen')
  })

  it('returns null when there is no clear person (no false person edge)', () => {
    expect(extractPersonName('buy milk on the way home')).toBeNull()
    expect(extractPersonName('finish the Q3 deck')).toBeNull()
    expect(extractPersonName('')).toBeNull()
  })

  it('does not mistake a weekday for a person', () => {
    // "email Monday's notes" — Monday is not a person.
    expect(extractPersonName('email Monday the recap')).toBeNull()
  })

  it('cleanName trims + collapses whitespace, preserves case', () => {
    expect(cleanName('  Sarah   Chen ')).toBe('Sarah Chen')
  })
})
