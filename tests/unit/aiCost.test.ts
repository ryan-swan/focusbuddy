import { describe, it, expect } from 'vitest'
import { estimateCostMicros, rateFor, DEFAULT_RATE } from '../../src/main/ai/aiCost'

describe('rateFor', () => {
  it('matches model families', () => {
    expect(rateFor('claude-opus-4-8').inPerM).toBe(15)
    expect(rateFor('claude-sonnet-5').inPerM).toBe(3)
    expect(rateFor('claude-haiku-4-5-20251001').outPerM).toBe(4)
    expect(rateFor('claude-fable-5').inPerM).toBe(1)
  })
  it('falls back to the default rate for an unknown model', () => {
    expect(rateFor('some-unknown-model')).toEqual(DEFAULT_RATE)
  })
})

describe('estimateCostMicros', () => {
  it('computes cost from real token counts (opus: 1M in + 1M out = $90)', () => {
    // 15 + 75 = 90 USD → 90_000_000 micros
    expect(estimateCostMicros('claude-opus-4-8', 1_000_000, 1_000_000)).toBe(90_000_000)
  })
  it('scales linearly for partial tokens (sonnet 10k in, 2k out)', () => {
    // (10000/1e6)*3 + (2000/1e6)*15 = 0.03 + 0.03 = 0.06 USD → 60_000 micros
    expect(estimateCostMicros('claude-sonnet-5', 10_000, 2_000)).toBe(60_000)
  })
  it('is zero for zero tokens and clamps negatives', () => {
    expect(estimateCostMicros('claude-opus-4-8', 0, 0)).toBe(0)
    expect(estimateCostMicros('claude-opus-4-8', -100, -100)).toBe(0)
  })
})
