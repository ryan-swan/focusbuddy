import { describe, it, expect } from 'vitest'
import { rankSearch, type SearchCandidate } from '../../src/main/search/ranking'
import {
  isBusinessIntentName,
  assertBusinessIntentName,
  responseEnvelope,
  nextApiVersion,
  newIdempotencyStore,
  idempotent,
  rateLimit,
  queryWithinBounds,
  assertQueryBounds
} from '../../src/shared/apiContract'

// Search ranking pipeline (spec §54) + public API contract (spec §63).

const candidates: SearchCandidate[] = [
  { id: 'pub', keywordScore: 2, semanticScore: 3, embeddingStale: false },
  { id: 'secret', keywordScore: 5, semanticScore: 5, embeddingStale: false },
  { id: 'stale', keywordScore: 4, semanticScore: 0, embeddingStale: true }
]

describe('plx_sch_001 / plx_sch_002 — permission filter first, no count leak', () => {
  it('test_plx_sch_001_002', () => {
    const r = rankSearch(candidates, (id) => id !== 'secret')
    expect(r.results.map((x) => x.id)).not.toContain('secret')
    expect(r.total).toBe(2) // permitted count only — the withheld result never inflates the total
  })
})

describe('plx_sch_003 — AI re-rank is optional and final; disabling keeps correctness', () => {
  it('test_plx_sch_003', () => {
    const withoutAi = rankSearch(candidates, () => true)
    // Base order by combined score: secret(10), pub(5), stale(4).
    expect(withoutAi.results.map((x) => x.id)).toEqual(['secret', 'pub', 'stale'])
    // With an AI reranker reversing order: same permitted SET, different ordering.
    const withAi = rankSearch(candidates, () => true, { aiRerank: (b) => [...b].reverse().map((x) => ({ id: x.id, score: x.base })) })
    expect(withAi.results.map((x) => x.id).sort()).toEqual(withoutAi.results.map((x) => x.id).sort()) // correctness (set) unchanged
    expect(withAi.results.map((x) => x.id)).not.toEqual(withoutAi.results.map((x) => x.id)) // ordering differs
  })
})

describe('plx_sch_005 — stale embedding still returns via keyword', () => {
  it('test_plx_sch_005', () => {
    const r = rankSearch(candidates, () => true)
    expect(r.results.map((x) => x.id)).toContain('stale') // not dropped despite stale embedding
  })
})

describe('plx_api_002 — business-intent operation names', () => {
  it('test_plx_api_002', () => {
    expect(isBusinessIntentName('approveDecision')).toBe(true)
    expect(isBusinessIntentName('updateObject')).toBe(false)
    expect(() => assertBusinessIntentName('createWidget')).toThrow(/PLX-API-002/)
  })
})

describe('plx_api_003 / plx_api_004 — response envelope + filtered flag', () => {
  it('test_plx_api_003_004', () => {
    const env = responseEnvelope({ items: [1, 2] }, 'corr-1', true)
    expect(env.correlationId).toBe('corr-1')
    expect(env.permissionContext.filtered).toBe(true) // something was withheld, without saying what
    expect(responseEnvelope({}, 'c', false).permissionContext.filtered).toBe(false)
  })
})

describe('plx_api_005 — versioning', () => {
  it('test_plx_api_005', () => {
    expect(nextApiVersion(1, 'additive')).toBe(1)
    expect(nextApiVersion(1, 'breaking')).toBe(2) // breaking -> new version
  })
})

describe('plx_api_006 — idempotency keys', () => {
  it('test_plx_api_006', () => {
    const store = newIdempotencyStore()
    let calls = 0
    const run = () => idempotent(store, 'key-1', () => { calls++; return { ok: true } })
    const first = run()
    const retry = run()
    expect(first.replayed).toBe(false)
    expect(retry.replayed).toBe(true) // same key returns the original result
    expect(calls).toBe(1) // the mutation ran once
  })
})

describe('plx_api_007 — rate limits reported', () => {
  it('test_plx_api_007', () => {
    expect(rateLimit(3, 5)).toEqual({ limit: 5, remaining: 2, allowed: true })
    expect(rateLimit(5, 5)).toEqual({ limit: 5, remaining: 0, allowed: false })
  })
})

describe('plx_api_008 — bounded query complexity', () => {
  it('test_plx_api_008', () => {
    expect(queryWithinBounds(6)).toBe(true)
    expect(queryWithinBounds(20)).toBe(false)
    expect(() => assertQueryBounds(20)).toThrow(/PLX-API-008/)
  })
})
