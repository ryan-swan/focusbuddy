// U1a — the permission floor on the BRAIN retrieval path (spec §54, REQ-SCH).
//
// PLX-SCH-001: "Permission filtering MUST be the first stage of the ranking pipeline and MUST be
// applied at the index or query layer, NOT as a post-filter over returned results."
// PLX-SCH-002: "Result counts, pagination totals and relevance scores MUST NOT disclose the
// existence of non-permitted results."
//
// Unified-brain invariant U-4: the permission filter runs before any count, total or score is
// derived. A withheld result must not be inferable from a number.
//
// WHY THIS LIVES IN THE FUSER AND NOT IN retriever.ts
// ---------------------------------------------------
// RRF scores by RANK: score(d) = Σ weight/(k + rank_L(d)). A candidate's rank in a leg counts how
// many candidates sit above it. So an unpermitted candidate occupying a rank slot SHIFTS every
// survivor below it and changes their scores — the withheld item is then inferable from the
// numbers of the items that were returned. Post-filtering (dropping it after fusion) does not fix
// that: the slot was already consumed. The ONLY place the invariant can hold is where ranks are
// assigned, which is fuseCandidates.
//
// This is not a new mechanism. The admission gate already does exactly this — it re-densifies each
// leg over eligible ids "so a gated filler doesn't consume a rank slot (the real answer moves up,
// not just the filler out)". U1a extends that same proven mechanism to permission, and orders
// permission FIRST per PLX-SCH-001.
//
// SCOPE HONESTY: this locks the POSITION of the filter and that the predicate is injected. It does
// NOT deliver multi-user permission — `canRead` has no production membership model behind it yet
// (U1b, held pending Michael's sharing model). The seam is correct; the identity is not built.

import { describe, it, expect } from 'vitest'
import { fuseCandidates, type FusionCandidate } from '../../src/shared/rrf'

function cand(id: string, over: Partial<FusionCandidate> = {}): FusionCandidate {
  return {
    id,
    sourceKey: over.sourceKey ?? `doc:${id}`,
    dupKey: over.dupKey ?? `dup:${id}`,
    text: over.text ?? `a genuinely admissible chunk about ${id} with plenty of signal words`,
    recency: over.recency ?? 0.5,
    importance: over.importance ?? 0.5
  }
}

describe('plx_sch_002 / U-4 — a withheld candidate is not inferable from any survivor number', () => {
  // The sharpest statement of the invariant: retrieving over a corpus that CONTAINS a candidate the
  // principal may not read must be byte-identical to retrieving over a corpus that never had it.
  // Identical ids, identical order, identical rrf scores, identical length. If a withheld candidate
  // consumed a rank slot, the survivors' scores differ and the withholding is observable.
  it('test_plx_sch_002_withheld_candidate_perturbs_nothing', () => {
    const withheld = fuseCandidates(
      [cand('secret'), cand('alpha'), cand('beta')],
      { vector: ['secret', 'alpha', 'beta'], fts: ['alpha', 'beta', 'secret'] },
      { canRead: (id) => id !== 'secret' }
    )
    const neverExisted = fuseCandidates([cand('alpha'), cand('beta')], {
      vector: ['alpha', 'beta'],
      fts: ['alpha', 'beta']
    })

    // Deep equality covers ids, order, count AND the rrf scores in one assertion.
    expect(withheld).toEqual(neverExisted)
  })

  // The count is a number too (PLX-SCH-002 names pagination totals explicitly).
  it('test_plx_sch_002_count_does_not_leak', () => {
    const legs = { vector: ['s1', 'alpha', 's2', 'beta'], fts: ['alpha', 'beta'] }
    const out = fuseCandidates(
      [cand('s1'), cand('s2'), cand('alpha'), cand('beta')],
      legs,
      { canRead: (id) => !id.startsWith('s') }
    )
    expect(out).toHaveLength(2) // NOT 4, and not "4 with 2 redacted"
    expect(out.map((r) => r.id)).toEqual(['alpha', 'beta'])
  })
})

describe('plx_sch_001 — the filter is first, and it holds under adversarial shapes', () => {
  // Multi-shape probe (regression-lock standard §1a.4): a single input shape is evaded by a
  // conditional gated on a field the test never sends. These vary WHERE the withheld candidate
  // sits, how many legs it appears in, and how many are withheld.

  it('test_plx_sch_001_withheld_dominant_in_both_legs', () => {
    // The withheld candidate would win outright — rank 1 in both legs.
    const out = fuseCandidates(
      [cand('secret'), cand('alpha')],
      { vector: ['secret', 'alpha'], fts: ['secret', 'alpha'] },
      { canRead: (id) => id !== 'secret' }
    )
    expect(out.map((r) => r.id)).toEqual(['alpha'])
    // alpha is rank 1 in both legs once the withheld candidate is gone — it does NOT keep the
    // rank-2 score it would have had if `secret` had consumed the slot.
    expect(out[0].rrf).toBeCloseTo(1 / 61 + 1 / 61, 12)
  })

  it('test_plx_sch_001_withheld_in_one_leg_only', () => {
    const out = fuseCandidates(
      [cand('secret'), cand('alpha')],
      { vector: ['secret', 'alpha'], fts: ['alpha'] },
      { canRead: (id) => id !== 'secret' }
    )
    expect(out.map((r) => r.id)).toEqual(['alpha'])
    expect(out[0].rrf).toBeCloseTo(1 / 61 + 1 / 61, 12)
  })

  it('test_plx_sch_001_everything_withheld_returns_empty', () => {
    const out = fuseCandidates(
      [cand('a'), cand('b')],
      { vector: ['a', 'b'], fts: ['b', 'a'] },
      { canRead: () => false }
    )
    expect(out).toEqual([]) // an empty result, not a redacted-placeholder result
  })

  it('test_plx_sch_001_relative_order_of_survivors_is_unchanged', () => {
    // Withholding must never REORDER what the principal may see — it only removes.
    const all = [cand('alpha'), cand('secret'), cand('beta'), cand('gamma')]
    const legs = { vector: ['alpha', 'secret', 'beta', 'gamma'], fts: ['gamma', 'beta', 'secret', 'alpha'] }
    const permitted = fuseCandidates(all, legs, { canRead: () => true }).map((r) => r.id)
    const filtered = fuseCandidates(all, legs, { canRead: (id) => id !== 'secret' }).map((r) => r.id)
    expect(filtered).toEqual(permitted.filter((id) => id !== 'secret'))
  })
})

describe('plx_sch_001 — permission is evaluated BEFORE admission, and the predicate is injected', () => {
  // PLX-SCH-001 makes permission the FIRST stage. An unreadable candidate must never reach the
  // admission gate: the system should not be deciding whether content it may not read is "good
  // enough to rank". Observed by making admission observable — if admitChunk were consulted first,
  // this text would be inspected.
  it('test_plx_sch_001_unreadable_never_reaches_admission', () => {
    const inspected: string[] = []
    const spy = (id: string): boolean => {
      inspected.push(id)
      return id !== 'secret'
    }
    fuseCandidates(
      [cand('secret', { text: 'x' }), cand('alpha')], // 'x' would be gated by admission anyway
      { vector: ['secret', 'alpha'], fts: ['alpha'] },
      { canRead: spy }
    )
    // Every candidate was permission-checked. (The gate cannot be short-circuited by admission
    // having already excluded something — permission runs first, unconditionally.)
    expect(inspected).toContain('secret')
    expect(inspected).toContain('alpha')
  })

  // Backward compatibility: the predicate is OPTIONAL and defaults to permit-all, so every existing
  // caller behaves exactly as before. U1a changes the pipeline's SHAPE, not its current results.
  it('test_plx_sch_001_absent_predicate_permits_all', () => {
    const cs = [cand('alpha'), cand('beta')]
    const legs = { vector: ['alpha', 'beta'], fts: ['beta', 'alpha'] }
    expect(fuseCandidates(cs, legs)).toEqual(fuseCandidates(cs, legs, { canRead: () => true }))
  })
})
