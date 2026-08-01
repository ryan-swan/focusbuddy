import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  deriveImportance,
  importanceWhy,
  TYPE_PRIOR,
  IMPORTANCE_WEIGHTS,
  type ImportanceSignals,
  type ImportanceContext
} from '@shared/importance'
import { NODE_TYPES } from '@shared/brainGraph'

// Unit lock for the PURE importance-derivation formula (plexi-brain P1 — DEC-014's
// "detect your foundational nodes" engine). These tests lock the properties that make
// it universal + honest: derived from structure (never a manual column), graph-relative
// normalization, a UNIVERSAL type-prior (no domain names), and the [0,1] contract the
// retriever/render path depends on.

const ctx = (over: Partial<ImportanceContext> = {}): ImportanceContext => ({
  maxDegree: over.maxDegree ?? 10,
  maxChange: over.maxChange ?? 5,
  now: over.now ?? 1_000_000_000_000
})
const sig = (over: Partial<ImportanceSignals> = {}): ImportanceSignals => ({
  type: over.type ?? 'note',
  degreeIn: over.degreeIn ?? 0,
  degreeOut: over.degreeOut ?? 0,
  updatedAt: over.updatedAt ?? 1_000_000_000_000,
  changeCount: over.changeCount ?? 0
})

describe('importance derivation — the formula', () => {
  it('output is always in [0,1] (the retriever/render contract)', () => {
    expect(deriveImportance(sig(), ctx())).toBeGreaterThanOrEqual(0)
    expect(deriveImportance(sig({ degreeIn: 999, changeCount: 999, type: 'goal' }), ctx())).toBeLessThanOrEqual(1)
  })

  it('a well-connected node outranks an isolated one of the SAME type', () => {
    const connected = deriveImportance(sig({ type: 'task', degreeIn: 8, degreeOut: 2 }), ctx({ maxDegree: 10 }))
    const isolated = deriveImportance(sig({ type: 'task', degreeIn: 0, degreeOut: 0 }), ctx({ maxDegree: 10 }))
    expect(connected).toBeGreaterThan(isolated)
  })

  it('a landmark type (decision) outranks a scratch note at EQUAL connectivity (structural prior)', () => {
    const decision = deriveImportance(sig({ type: 'decision', degreeIn: 3 }), ctx())
    const note = deriveImportance(sig({ type: 'note', degreeIn: 3 }), ctx())
    expect(decision).toBeGreaterThan(note)
  })

  it('a recently-updated node outranks a stale one of the same type + connectivity', () => {
    const now = 1_000_000_000_000
    const fresh = deriveImportance(sig({ updatedAt: now }), ctx({ now }))
    const stale = deriveImportance(sig({ updatedAt: now - 200 * 24 * 60 * 60 * 1000 }), ctx({ now }))
    expect(fresh).toBeGreaterThan(stale)
  })

  it('graph-relative normalization: an edgeless graph (maxDegree 0) never divides by zero', () => {
    const s = deriveImportance(sig({ degreeIn: 0, degreeOut: 0 }), ctx({ maxDegree: 0, maxChange: 0 }))
    expect(Number.isFinite(s)).toBe(true)
    expect(s).toBeGreaterThanOrEqual(0)
  })

  it('the same node scores identically on re-run (deterministic — idempotent derivation)', () => {
    const s = sig({ type: 'room', degreeIn: 5, changeCount: 2 })
    const c = ctx()
    expect(deriveImportance(s, c)).toBe(deriveImportance(s, c))
  })

  it('weights sum to 1.0 (output is a clean [0,1], not an arbitrary scale)', () => {
    const total = Object.values(IMPORTANCE_WEIGHTS).reduce((a, b) => a + b, 0)
    expect(total).toBeCloseTo(1.0, 6)
  })

  it('importanceWhy names the dominant signal legibly', () => {
    const why = importanceWhy(sig({ type: 'goal', degreeIn: 0, updatedAt: 0 }), ctx({ maxDegree: 10 }))
    expect(why).toBe('a foundational kind of thing') // type-prior dominates for an isolated goal
    const whyConnected = importanceWhy(sig({ type: 'note', degreeIn: 10 }), ctx({ maxDegree: 10 }))
    expect(whyConnected).toBe('well-connected')
  })
})

describe('importance — type-prior covers every node type', () => {
  it('every NodeType has a prior (no undefined lookups at runtime)', () => {
    for (const t of NODE_TYPES) {
      expect(typeof TYPE_PRIOR[t], `TYPE_PRIOR missing ${t}`).toBe('number')
      expect(TYPE_PRIOR[t]).toBeGreaterThan(0)
      expect(TYPE_PRIOR[t]).toBeLessThanOrEqual(1)
    }
  })

  it('landmark structural roles outrank the everyday working set (structural, not domain)', () => {
    for (const landmark of ['goal', 'decision', 'room', 'project'] as const) {
      expect(TYPE_PRIOR[landmark]).toBeGreaterThan(TYPE_PRIOR['note'])
      expect(TYPE_PRIOR[landmark]).toBeGreaterThan(TYPE_PRIOR['artifact'])
    }
  })
})

// ── DEC-014 grep-lock #3 (planted red-then-green): the derivation contains NO ─────
// domain/department/pillar name. The type-prior ranks STRUCTURE (a Decision > a Note),
// universal across a student/freelancer/business — it must never rank a DOMAIN
// ("Engineering" > "Marketing"). If a domain word ever enters this module as a code
// literal, universality is broken and this test fails.
//
// RED-GREEN evidence: this lock was validated by temporarily inserting
//   if (title.includes('Engineering')) return 1.0
// into importance.ts — the test below went RED (caught 'engineering' in the code);
// removing it went GREEN. A lock that has never failed is theater (verification-and-
// quality.md §1a); this one has been shown to catch its regression.
describe('DEC-014 grep-lock — no hardcoded domain in the importance engine', () => {
  const DOMAIN_WORDS = [
    'engineering',
    'marketing',
    'sales',
    'finance',
    'operations',
    'legal',
    'health',
    'fitness',
    'family',
    'wedding',
    'department'
  ]

  it('importance.ts code contains no domain word as a literal', () => {
    const src = readFileSync(resolve(__dirname, '../../src/shared/importance.ts'), 'utf-8')
    // Strip // comments (the guard-rail explanation names the trap on purpose).
    const code = src
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n')
      .toLowerCase()
    for (const w of DOMAIN_WORDS) {
      expect(code, `importance code must not contain domain word "${w}"`).not.toContain(w)
    }
  })

  it('TYPE_PRIOR keys are exactly the universal structural types — no domain keys', () => {
    const keys = Object.keys(TYPE_PRIOR).sort()
    expect(keys).toEqual([...NODE_TYPES].sort())
  })
})
