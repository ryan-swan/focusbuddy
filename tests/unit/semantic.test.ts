import { describe, it, expect } from 'vitest'
import { cosineSim, blendSemantic, gateSemantic, type ScoredItem } from '../../src/shared/semantic'

describe('cosineSim', () => {
  it('is 1 for identical direction', () => {
    expect(cosineSim([1, 2, 3], [1, 2, 3])).toBeCloseTo(1)
    expect(cosineSim([1, 0], [2, 0])).toBeCloseTo(1)
  })
  it('is 0 for orthogonal vectors', () => {
    expect(cosineSim([1, 0], [0, 1])).toBeCloseTo(0)
  })
  it('is -1 for opposite vectors', () => {
    expect(cosineSim([1, 1], [-1, -1])).toBeCloseTo(-1)
  })
  it('is 0 for a zero vector', () => {
    expect(cosineSim([0, 0], [1, 1])).toBe(0)
  })
  it('is 0 for mismatched lengths or empty', () => {
    expect(cosineSim([1, 2], [1, 2, 3])).toBe(0)
    expect(cosineSim([], [])).toBe(0)
  })
})

function s<T>(item: T, keyword: number, semantic: number | null): ScoredItem<T> {
  return { item, keyword, semantic }
}

describe('blendSemantic', () => {
  it('ranks a strong semantic match above a strong keyword-only match', () => {
    const out = blendSemantic([
      s('kw', 10, null), // keyword only, normalises to 1.0 -> 0.3 weight -> 0.3
      s('sem', 0, 0.9) // semantic 0.9 -> 0.7*0.9 = 0.63
    ])
    expect(out[0]).toBe('sem')
    expect(out[1]).toBe('kw')
  })

  it('lets keyword carry items that have no vector', () => {
    const out = blendSemantic([
      s('a', 5, null),
      s('b', 1, null),
      s('c', 0, null)
    ])
    // c has zero keyword -> filtered out; a (norm 1) above b (norm 0.2).
    expect(out).toEqual(['a', 'b'])
  })

  it('blends both signals when present', () => {
    const out = blendSemantic([
      s('both', 10, 0.8), // 0.7*0.8 + 0.3*1.0 = 0.86
      s('semOnly', 0, 0.85) // 0.7*0.85 = 0.595
    ])
    expect(out[0]).toBe('both')
  })

  it('treats negative cosine as no semantic signal', () => {
    const out = blendSemantic([
      s('neg', 8, -0.5), // sem clamped to 0 -> 0.3 * (8/8=1) = 0.3
      s('pos', 8, 0.2) // 0.7*0.2 + 0.3*1 = 0.44
    ])
    expect(out[0]).toBe('pos')
  })

  it('drops items below the threshold and respects the limit', () => {
    const out = blendSemantic(
      [s('a', 10, 0.9), s('b', 5, 0.5), s('c', 1, 0.1)],
      { limit: 2 }
    )
    expect(out).toHaveLength(2)
    expect(out[0]).toBe('a')
  })

  it('returns empty when nothing scores', () => {
    expect(blendSemantic([s('a', 0, null), s('b', 0, 0)])).toEqual([])
  })
})

// The #5 gate (fix-before-embeddings law): relative band + keyword
// corroboration, calibrated against the 2026-08-22 measurement on the real
// corpus — random cross-doc pairs median 0.361 / p99 0.629 / max 0.797,
// adjacent same-doc chunks median 0.680. An absolute threshold cannot
// separate those; the gate must.
describe('gateSemantic — the #5 relative-rank + corroboration gate', () => {
  it('the #5 repro: an uncorroborated cosine field admits NOTHING through the blend', () => {
    // Six unrelated documents at realistic noise similarities, zero keyword
    // overlap — exactly what blendSemantic alone injected and cited.
    const noise = [
      s('a', 0, 0.45),
      s('b', 0, 0.44),
      s('c', 0, 0.42),
      s('d', 0, 0.4),
      s('e', 0, 0.36),
      s('f', 0, 0.3)
    ]
    const gated = gateSemantic(noise)
    expect(gated.every((x) => x.semantic === null)).toBe(true)
    expect(blendSemantic(gated, { limit: 6 })).toEqual([])
  })

  it('keeps a corroborated match and lets a close paraphrase ride along', () => {
    const gated = gateSemantic([
      s('anchor', 4, 0.68), // keyword + semantic: the anchor
      s('paraphrase', 0, 0.66), // no keywords, but riding just under the anchor
      s('noise', 0, 0.44) // typical cross-doc noise
    ])
    expect(gated.find((x) => x.item === 'anchor')!.semantic).toBeCloseTo(0.68)
    expect(gated.find((x) => x.item === 'paraphrase')!.semantic).toBeCloseTo(0.66)
    expect(gated.find((x) => x.item === 'noise')!.semantic).toBeNull()
    const ranked = blendSemantic(gated, { limit: 6 })
    expect(ranked).toEqual(['anchor', 'paraphrase'])
  })

  it('an uncorroborated item inside the band still dies outside paraphrase reach of the anchor', () => {
    const gated = gateSemantic([
      s('anchor', 3, 0.68),
      // In the relative band (>= 0.68*0.85 = 0.578) but below the paraphrase
      // line (0.68*0.92 = 0.6256): plausible-looking noise, culled.
      s('drifter', 0, 0.6)
    ])
    expect(gated.find((x) => x.item === 'drifter')!.semantic).toBeNull()
  })

  it('a weak-semantic but corroborated item keeps keyword standing, loses the boost', () => {
    const gated = gateSemantic([
      s('anchor', 4, 0.68),
      s('weak', 2, 0.31) // below the band: semantic nulled, keyword survives
    ])
    const weak = gated.find((x) => x.item === 'weak')!
    expect(weak.semantic).toBeNull()
    expect(weak.keyword).toBe(2)
    // Still ranked by the blend on its keyword merit.
    expect(blendSemantic(gated, { limit: 6 })).toEqual(['anchor', 'weak'])
  })

  it('caps semantic admissions at maxKeep', () => {
    const many = Array.from({ length: 10 }, (_, i) => s(`k${i}`, 1, 0.7 - i * 0.005))
    const gated = gateSemantic(many, { maxKeep: 6 })
    expect(gated.filter((x) => x.semantic !== null)).toHaveLength(6)
  })

  it('leaves vectorless items untouched and handles an all-null pool', () => {
    const pool = [s('kw-only', 5, null), s('other', 2, null)]
    expect(gateSemantic(pool)).toEqual(pool)
  })

  it('ignores non-positive similarities entirely', () => {
    const gated = gateSemantic([s('neg', 3, -0.2), s('zero', 2, 0)])
    expect(gated.every((x) => x.semantic === null)).toBe(true)
  })
})
