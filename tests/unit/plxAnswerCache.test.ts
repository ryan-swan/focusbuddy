import { describe, it, expect, beforeEach } from 'vitest'
import {
  lookupAnswer,
  storeAnswer,
  bumpAnswerCacheVersion,
  _resetAnswerCache
} from '../../src/main/ai/answerCache'

// Pure tests for the semantic answer cache: similarity match, version + TTL
// invalidation, dimension guard.
const NOW = 1_800_000_000_000

beforeEach(() => _resetAnswerCache())

describe('answerCache', () => {
  it('returns a cached answer for a near-identical question', () => {
    storeAnswer([1, 0, 0], 'The answer', ['d1'], NOW)
    const hit = lookupAnswer([0.99, 0.08, 0], NOW)
    expect(hit).toEqual({ answer: 'The answer', citedDocIds: ['d1'] })
  })

  it('misses a dissimilar question (below threshold)', () => {
    storeAnswer([1, 0, 0], 'A', [], NOW)
    expect(lookupAnswer([0.5, 0.87, 0], NOW)).toBeNull()
  })

  it('invalidates on a version bump (a workspace mutation)', () => {
    storeAnswer([1, 0, 0], 'A', [], NOW)
    bumpAnswerCacheVersion()
    expect(lookupAnswer([1, 0, 0], NOW)).toBeNull()
  })

  it('expires after the TTL', () => {
    storeAnswer([1, 0, 0], 'A', [], NOW)
    expect(lookupAnswer([1, 0, 0], NOW + 31 * 60 * 1000)).toBeNull()
    expect(lookupAnswer([1, 0, 0], NOW + 5 * 60 * 1000)).not.toBeNull()
  })

  it('guards against a dimension mismatch', () => {
    storeAnswer([1, 0, 0], 'A', [], NOW)
    expect(lookupAnswer([1, 0], NOW)).toBeNull()
  })

  it('does not store an empty answer or empty vector', () => {
    storeAnswer([1, 0, 0], '   ', ['d'], NOW)
    storeAnswer([], 'x', [], NOW)
    expect(lookupAnswer([1, 0, 0], NOW)).toBeNull()
  })
})
