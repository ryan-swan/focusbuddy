import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  spineFactor,
  passesGates,
  applySpineRerank,
  type CandidateSpine,
  type SpineCandidate,
  type SpineContext
} from '@shared/spineRerank'

// Unit lock for the PURE spine re-rank/gate layer (plexi-brain P1 — the payoff: the
// graph changes what retrieval returns). Locks the DECISIVE-query behaviors plain RAG
// structurally can't do: current-truth (drop superseded), aperture (room gate),
// privacy (sensitivity gate), and BOUNDED re-rank (recall leads, spine tunes).

const spine = (over: Partial<CandidateSpine> = {}): CandidateSpine => ({
  importance: over.importance ?? 0.5,
  confidence: over.confidence ?? 'typed',
  lifecycle: over.lifecycle ?? 'active',
  roomId: over.roomId ?? null,
  sensitivity: over.sensitivity ?? 'normal',
  crossRoomLinked: over.crossRoomLinked,
  disagrees: over.disagrees
})
const cand = (id: string, recallScore: number, s: CandidateSpine | null): SpineCandidate<string> => ({
  item: id,
  recallScore,
  spine: s
})
const ctx = (over: Partial<SpineContext> = {}): SpineContext => ({
  roomId: over.roomId ?? null,
  allowRestricted: over.allowRestricted ?? false
})

describe('spine gates — remove WRONG answers (the decisive win)', () => {
  it('GATE current-truth: a superseded node is gated OUT (its successor answers instead)', () => {
    expect(passesGates(cand('x', 1, spine({ lifecycle: 'superseded' })), ctx())).toBe(false)
    expect(passesGates(cand('x', 1, spine({ lifecycle: 'active' })), ctx())).toBe(true)
  })

  it('GATE sensitivity: restricted is withheld unless explicitly permitted', () => {
    expect(passesGates(cand('x', 1, spine({ sensitivity: 'restricted' })), ctx({ allowRestricted: false }))).toBe(false)
    expect(passesGates(cand('x', 1, spine({ sensitivity: 'restricted' })), ctx({ allowRestricted: true }))).toBe(true)
    expect(passesGates(cand('x', 1, spine({ sensitivity: 'private' })), ctx())).toBe(true) // private is not restricted
  })

  it('GATE aperture: with a room scope, a different room is out; the scoped room + room-agnostic pass', () => {
    expect(passesGates(cand('x', 1, spine({ roomId: 'room-a' })), ctx({ roomId: 'room-b' }))).toBe(false)
    expect(passesGates(cand('x', 1, spine({ roomId: 'room-a' })), ctx({ roomId: 'room-a' }))).toBe(true)
    expect(passesGates(cand('x', 1, spine({ roomId: null })), ctx({ roomId: 'room-a' }))).toBe(true) // room-agnostic
    expect(passesGates(cand('x', 1, spine({ roomId: 'room-a' })), ctx({ roomId: null }))).toBe(true) // no scope = all
  })

  it('P3 GATE-3 override: a same-as CROSS-ROOM-LINKED candidate survives a mismatched room', () => {
    // "one Caleb across every room": a candidate in room-a, active aperture room-b, is
    // normally gated out — but if its entity is same-as-linked into room-b it survives.
    expect(passesGates(cand('x', 1, spine({ roomId: 'room-a', crossRoomLinked: false })), ctx({ roomId: 'room-b' }))).toBe(false)
    expect(passesGates(cand('x', 1, spine({ roomId: 'room-a', crossRoomLinked: true })), ctx({ roomId: 'room-b' }))).toBe(true)
  })

  it('P3 disagrees flag does NOT affect gating (I4: marked, not hidden)', () => {
    // A contradicted candidate is still eligible — the flag annotates, it never drops.
    expect(passesGates(cand('x', 1, spine({ disagrees: true })), ctx())).toBe(true)
    expect(passesGates(cand('x', 1, spine({ disagrees: true, lifecycle: 'superseded' })), ctx())).toBe(false) // other gates still apply
  })

  it('a null-spine candidate (un-typed / brand-new) is NEVER gated out (store-anyway floor, I3)', () => {
    expect(passesGates(cand('x', 1, null), ctx({ roomId: 'room-a', allowRestricted: false }))).toBe(true)
  })
})

describe('spine factor — bounded re-rank (recall leads, spine tunes)', () => {
  it('a null spine yields factor 1.0 (recall order preserved exactly)', () => {
    expect(spineFactor(null)).toBe(1.0)
  })

  it('the factor is always bounded to [0.6, 1.4] (Call B: recall is tuned, never overridden)', () => {
    const extremeHigh = spineFactor(spine({ importance: 1, confidence: 'typed', lifecycle: 'fresh' }))
    const extremeLow = spineFactor(spine({ importance: 0, confidence: 'ambiguous', lifecycle: 'stale' }))
    expect(extremeHigh).toBeLessThanOrEqual(1.4)
    expect(extremeLow).toBeGreaterThanOrEqual(0.6)
    expect(extremeHigh).toBeGreaterThan(extremeLow)
  })

  it('higher DERIVED importance → higher factor (DEC-014 importance drives the boost)', () => {
    expect(spineFactor(spine({ importance: 0.9 }))).toBeGreaterThan(spineFactor(spine({ importance: 0.1 })))
  })

  it('ambiguous confidence is softly DEMOTED, not dropped (I4: marked, never hidden)', () => {
    expect(spineFactor(spine({ confidence: 'ambiguous' }))).toBeLessThan(spineFactor(spine({ confidence: 'typed' })))
  })
})

describe('applySpineRerank — the whole layer', () => {
  it('drops superseded from the result even if recall ranked it #1 (current-truth wins)', () => {
    const out = applySpineRerank(
      [
        cand('superseded-but-top-recall', 1.0, spine({ lifecycle: 'superseded' })),
        cand('current', 0.8, spine({ lifecycle: 'active' }))
      ],
      ctx()
    )
    expect(out).toEqual(['current']) // the superseded top hit is gone; the current fact answers
  })

  it('a high-importance node can be PROMOTED above a slightly-higher recall hit (bounded)', () => {
    // recall: A(0.80) > B(0.75). B is a fresh high-importance landmark; A is a stale
    // low-importance note. The bounded re-rank lets B overtake A.
    const out = applySpineRerank(
      [
        cand('A-stale-note', 0.8, spine({ importance: 0.1, lifecycle: 'stale', confidence: 'inferred' })),
        cand('B-fresh-landmark', 0.75, spine({ importance: 1, lifecycle: 'fresh', confidence: 'typed' }))
      ],
      ctx()
    )
    expect(out[0]).toBe('B-fresh-landmark')
  })

  it('but a POOR recall match cannot leap to #1 on spine alone (recall still leads — Call B)', () => {
    // A has strong recall (0.9); C has a weak recall (0.2) but max spine. Bounded factor
    // (≤1.4) means C's best is 0.2·1.4=0.28 < A's worst 0.9·0.6=0.54 → A stays on top.
    const out = applySpineRerank(
      [
        cand('A-strong-recall', 0.9, spine({ importance: 0, lifecycle: 'stale', confidence: 'ambiguous' })),
        cand('C-weak-recall', 0.2, spine({ importance: 1, lifecycle: 'fresh', confidence: 'typed' }))
      ],
      ctx()
    )
    expect(out[0]).toBe('A-strong-recall')
  })

  it('null-spine candidates keep their recall order (no boost, no drop)', () => {
    const out = applySpineRerank(
      [cand('a', 0.9, null), cand('b', 0.7, null), cand('c', 0.5, null)],
      ctx()
    )
    expect(out).toEqual(['a', 'b', 'c'])
  })

  it('empty graph (all null spines, no gates) → identical to recall order (layering, no tear-out)', () => {
    const recallOrder = [cand('x', 0.9, null), cand('y', 0.6, null)]
    expect(applySpineRerank(recallOrder, ctx())).toEqual(['x', 'y'])
  })
})

// ── DEC-014 grep-lock #4: the spine layer carries no domain vocabulary. It ranks by
// DERIVED importance + structural spine (confidence/lifecycle/room), never a domain.
describe('DEC-014 grep-lock — no domain vocabulary in the spine layer', () => {
  it('spineRerank.ts code contains no domain word', () => {
    const src = readFileSync(resolve(__dirname, '../../src/shared/spineRerank.ts'), 'utf-8')
    const code = src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n').toLowerCase()
    for (const w of ['engineering', 'marketing', 'sales', 'finance', 'department', 'health', 'fitness']) {
      expect(code, `spine code must not contain domain word "${w}"`).not.toContain(w)
    }
  })
})
