import { describe, it, expect } from 'vitest'
import { fuseCandidates, DEFAULT_RRF_K, type FusionCandidate } from '../../src/shared/rrf'

// Red-then-green unit lock for the pure RRF fusion core (I1). Every assertion below was
// written against the required behaviour and watched to FAIL on a stub that returns the
// candidates ungated/undeduped, before the real fuseCandidates existed — per agent-os
// verification-and-quality.md §1a ("a lock that never failed is theatre").

// A terse candidate builder — defaults are "real admissible text, neutral tie-breaks".
function cand(id: string, over: Partial<FusionCandidate> = {}): FusionCandidate {
  return {
    id,
    sourceKey: over.sourceKey ?? `src:${id}`,
    dupKey: over.dupKey ?? `hash:${id}`,
    text: over.text ?? 'a genuinely admissible chunk with plenty of signal words',
    recency: over.recency ?? 0.5,
    importance: over.importance ?? 0.5
  }
}

describe('rrf — fusion math', () => {
  it('sums 1/(k+rank) across the legs an id appears in', () => {
    const cs = [cand('a'), cand('b'), cand('c')]
    // a: vector rank1 + fts rank1; b: vector rank2 only; c: fts rank2 only
    const out = fuseCandidates(cs, { vector: ['a', 'b'], fts: ['a', 'c'] })
    const byId = new Map(out.map((r) => [r.id, r.rrf]))
    expect(byId.get('a')).toBeCloseTo(1 / 61 + 1 / 61, 10)
    expect(byId.get('b')).toBeCloseTo(1 / 62, 10)
    expect(byId.get('c')).toBeCloseTo(1 / 62, 10)
    // two-leg consensus (a) ranks first
    expect(out[0].id).toBe('a')
  })

  it('the narrow band: two-leg agreement at mid rank beats a single-leg rank-1 (F-4 keep)', () => {
    // graph-only rank1 = 1/61 ≈ 0.01639; two legs both at rank 15 = 2/75 ≈ 0.02667
    const cs = [cand('graphOnly'), cand('consensus')]
    const legVector = Array.from({ length: 15 }, (_, i) => (i === 14 ? 'consensus' : `pad-v-${i}`))
    const legFts = Array.from({ length: 15 }, (_, i) => (i === 14 ? 'consensus' : `pad-f-${i}`))
    const out = fuseCandidates(cs, { graph: ['graphOnly'], vector: legVector, fts: legFts })
    expect(out[0].id).toBe('consensus')
    // but a single-leg rank1 DOES beat a single-leg rank>=2 (bounded, additive)
    const out2 = fuseCandidates([cand('r1'), cand('r2')], { g: ['r1'], v: ['pad', 'r2'] })
    expect(out2[0].id).toBe('r1')
  })

  it('respects k', () => {
    const out10 = fuseCandidates([cand('a')], { v: ['a'] }, { k: 10 })
    expect(out10[0].rrf).toBeCloseTo(1 / 11, 10)
    expect(DEFAULT_RRF_K).toBe(60)
  })

  it('honours per-leg weights, and a weight-0 leg is inert (graph ships at 0 — F-5)', () => {
    // graph leg would put 'x' at rank1, but at weight 0 it contributes nothing → x drops out
    const out = fuseCandidates([cand('x'), cand('y')], { graph: ['x'], vector: ['y'] }, { legWeights: { graph: 0 } })
    expect(out.map((r) => r.id)).toEqual(['y'])
    // a down-weighted leg still counts, just less
    const w = fuseCandidates([cand('p'), cand('q')], { a: ['p'], b: ['q'] }, { legWeights: { a: 0.1, b: 1 } })
    expect(w[0].id).toBe('q')
  })
})

describe('rrf — the admission gate (I3 — subsumes I1s length proxy)', () => {
  it('drops a short filler that BM25 short-doc bias ranks #1, promoting the real answer', () => {
    // The exact F02 shape: the 4-char filler "test" is rank 1 in the lexical leg; the real
    // checklist is rank 2. Without the gate the filler wins; with it, it is gone.
    const cs = [
      cand('filler', { text: 'test' }),
      cand('checklist', { text: 'Dev testing checklist — renew Apple developer certificates before they expire' })
    ]
    const out = fuseCandidates(cs, { fts: ['filler', 'checklist'], vector: ['filler', 'checklist'] })
    expect(out.map((r) => r.id)).toEqual(['checklist'])
    expect(out.find((r) => r.id === 'filler')).toBeUndefined()
  })

  it('gating re-densifies ranks (the real answer inherits rank 1, not rank 2)', () => {
    const cs = [cand('filler', { text: 'New desk' }), cand('real', { text: 'the real answer with substance' })]
    const out = fuseCandidates(cs, { fts: ['filler', 'real'] })
    // 'real' was rank2 (1/62) but with 'filler' gated it is the only eligible id at rank1
    expect(out[0].rrf).toBeCloseTo(1 / 61, 10)
  })

  it('SUBSUMES the length proxy: a LONG blank-grid (no distinctive token) is dropped', () => {
    // The whole reason I3 replaced the 15-char length proxy: this grid is well past 15 chars
    // and a length-only gate would keep it. 13 such chunks are in the live index from V2 blank
    // sheets. GUARDS a regression back to length-only.
    const grid = 'A | B | C | D | E | F | G | H | I | J | K | L | M'
    const cs = [cand('grid', { text: grid }), cand('real', { text: 'a substantive answer chunk' })]
    const out = fuseCandidates(cs, { fts: ['grid', 'real'], vector: ['grid', 'real'] })
    expect(out.map((r) => r.id)).toEqual(['real'])
  })

  it('keeps a genuinely short answer above the floor (17-char "Q3 Product Launch" survives)', () => {
    const out = fuseCandidates([cand('q3', { text: 'Q3 Product Launch' })], { v: ['q3'] })
    expect(out.map((r) => r.id)).toEqual(['q3'])
  })

  it('the gate always applies now (a 1-char stub is dropped — no off mode)', () => {
    const out = fuseCandidates([cand('tiny', { text: 'x' })], { v: ['tiny'] })
    expect(out).toEqual([])
  })
})

describe('rrf — dedup before the slice', () => {
  it('collapses byte-identical twins across sources to one (content-hash dedup)', () => {
    const cs = [
      cand('twinA', { sourceKey: 'src:A', dupKey: 'H' }),
      cand('twinB', { sourceKey: 'src:B', dupKey: 'H' })
    ]
    const out = fuseCandidates(cs, { v: ['twinA', 'twinB'] })
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('twinA') // the better-ranked survivor is kept
  })

  it('collapses twin sources even when each surfaces via a DIFFERENT chunk index (the D02 fix)', () => {
    // The real bug: twin sources A and B are byte-identical, but fusion picks A's chunk 0 and
    // B's chunk 1 as their representatives. A per-CHUNK hash sees two different hashes and keeps
    // both; a per-SOURCE dupKey (shared by all of a source's chunks) collapses them to one.
    const cs = [
      cand('a0', { sourceKey: 'src:A', dupKey: 'SIG' }),
      cand('a1', { sourceKey: 'src:A', dupKey: 'SIG' }),
      cand('b0', { sourceKey: 'src:B', dupKey: 'SIG' }),
      cand('b1', { sourceKey: 'src:B', dupKey: 'SIG' })
    ]
    // A represented by chunk 0, B by chunk 1 (different indices) — the failing shape.
    const out = fuseCandidates(cs, { vector: ['a0', 'b1'], fts: ['b1', 'a0'] })
    expect(out).toHaveLength(1)
  })

  it('keeps one chunk per source (a long doc cannot fill every slot)', () => {
    const cs = [
      cand('c0', { sourceKey: 'doc:1', dupKey: 'h0' }),
      cand('c1', { sourceKey: 'doc:1', dupKey: 'h1' })
    ]
    const out = fuseCandidates(cs, { v: ['c0', 'c1'] })
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('c0')
  })

  it('D01 shape: 6 sources / 2 distinct hashes collapse to exactly 2 (≤1 wasted slot)', () => {
    // 4 copies of hash A across 4 sources, 2 copies of hash B across 2 sources.
    const cs = [
      cand('a1', { sourceKey: 'src:1', dupKey: 'A' }),
      cand('a2', { sourceKey: 'src:2', dupKey: 'A' }),
      cand('a3', { sourceKey: 'src:3', dupKey: 'A' }),
      cand('a4', { sourceKey: 'src:4', dupKey: 'A' }),
      cand('b1', { sourceKey: 'src:5', dupKey: 'B' }),
      cand('b2', { sourceKey: 'src:6', dupKey: 'B' })
    ]
    const out = fuseCandidates(cs, { v: ['a1', 'a2', 'a3', 'a4', 'b1', 'b2'] })
    expect(out).toHaveLength(2)
    const hashes = new Set(out.map((r) => (r.id.startsWith('a') ? 'A' : 'B')))
    expect(hashes).toEqual(new Set(['A', 'B']))
  })
})

describe('rrf — tie-breaks + determinism', () => {
  it('breaks an exact RRF tie by recency, then importance (F-6: recency is a tie-break only)', () => {
    const cs = [
      cand('old', { recency: 0.1, importance: 0.9, dupKey: 'ho', sourceKey: 'so' }),
      cand('new', { recency: 0.9, importance: 0.1, dupKey: 'hn', sourceKey: 'sn' })
    ]
    // identical rank-1 in two different legs → identical RRF → recency decides
    const out = fuseCandidates(cs, { a: ['old'], b: ['new'] })
    expect(out.map((r) => r.id)).toEqual(['new', 'old'])
  })

  it('is deterministic across calls (final id tie-break)', () => {
    const cs = [cand('z', { recency: 0.5, importance: 0.5 }), cand('a', { recency: 0.5, importance: 0.5 })]
    const legs = { x: ['z'], y: ['a'] } // both rank1 in separate legs, equal tie-breaks
    const r1 = fuseCandidates(cs, legs).map((r) => r.id)
    const r2 = fuseCandidates(cs, legs).map((r) => r.id)
    expect(r1).toEqual(r2)
    expect(r1).toEqual(['a', 'z']) // id ascending is the final, stable tiebreak
  })

  it('empty inputs → empty output; an all-gated set → empty', () => {
    expect(fuseCandidates([], {})).toEqual([])
    expect(fuseCandidates([cand('a')], {})).toEqual([]) // in no leg → no rrf
    expect(fuseCandidates([cand('t', { text: 'xx' })], { v: ['t'] })).toEqual([]) // gated by admission
  })
})
