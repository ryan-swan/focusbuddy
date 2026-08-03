import { describe, it, expect } from 'vitest'
import { cosineSim, blendSemantic, type ScoredItem } from '../../src/shared/semantic'

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
