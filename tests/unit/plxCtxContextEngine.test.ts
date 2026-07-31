// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { createEventStore, type SqlDb } from '../../src/main/db/eventStore'
import {
  scoreMateriality,
  weightsRetunedEvent,
  DEFAULT_WEIGHTS,
  MATERIALITY_FN_VERSION,
  type MaterialityInput
} from '../../src/main/context/materiality'
import {
  declaredField,
  inferredField,
  absentField,
  confidence,
  isDisplayableAsAssertion,
  PLATFORM_CONFIDENCE_THRESHOLD
} from '../../src/shared/context'

// Context Engine keystone (spec §12, §38, §51/§80). Deterministic materiality
// scoring + the inferred-context provenance discipline.

const input: MaterialityInput = {
  affectedObjectCount: 4,
  decisionImpact: 'high',
  relationshipDepth: 1,
  organisationalReach: 'team',
  userRole: 'owner',
  workflowStage: 'review',
  historicalSignificance: 0.5
}

describe('plx_ctx_010 / plx_ctx_011 / plx_ctx_020 — deterministic, pure, no AI', () => {
  it('test_plx_ctx_010_deterministic: identical inputs give an identical score', () => {
    const a = scoreMateriality(input)
    const b = scoreMateriality({ ...input })
    expect(a.score).toBe(b.score)
    expect(a.band).toBe(b.band)
  })
  it('test_plx_ctx_011_no_model_call: scoring is synchronous and pure', () => {
    // A pure function returns a value, not a promise, and never varies run to run.
    const r = scoreMateriality(input)
    expect(typeof r.score).toBe('number')
    expect(r instanceof Promise).toBe(false)
    const many = Array.from({ length: 1000 }, () => scoreMateriality(input).score)
    expect(new Set(many).size).toBe(1)
  })
  it('test_plx_ctx_020_pure_of_declared_inputs: different inputs move the score', () => {
    const low = scoreMateriality({ ...input, decisionImpact: 'none', organisationalReach: 'self', workflowStage: 'draft', userRole: 'viewer', affectedObjectCount: 0 })
    const high = scoreMateriality({ ...input, decisionImpact: 'high', organisationalReach: 'org', workflowStage: 'final', userRole: 'admin', affectedObjectCount: 30 })
    expect(high.score).toBeGreaterThan(low.score)
    expect(high.band).toBe('high')
    expect(low.band === 'none' || low.band === 'low').toBe(true)
  })
})

describe('plx_ctx_021 — versioned function and weights', () => {
  it('test_plx_ctx_021_records_versions', () => {
    const r = scoreMateriality(input)
    expect(r.functionVersion).toBe(MATERIALITY_FN_VERSION)
    expect(r.weightsVersion).toBe(DEFAULT_WEIGHTS.version)
  })
})

describe('plx_ctx_022 — tenant-tunable weights + auditable retune event', () => {
  it('test_plx_ctx_022_tunable_without_deploy', () => {
    const tuned = { ...DEFAULT_WEIGHTS, version: 'weights-tenant-x', decision: 0.6, reach: 0.3 }
    const base = scoreMateriality(input)
    const custom = scoreMateriality(input, tuned)
    expect(custom.weightsVersion).toBe('weights-tenant-x')
    expect(custom.score).not.toBe(base.score)
  })
  it('test_plx_ctx_022_retune_emits_event', () => {
    const d = new DatabaseSync(':memory:')
    const adapter: SqlDb = {
      exec: (sql) => d.exec(sql),
      prepare: (sql) => {
        const s = d.prepare(sql)
        return { run: (...a) => s.run(...(a as never[])), get: (...a) => s.get(...(a as never[])), all: (...a) => s.all(...(a as never[])) as unknown[] }
      },
      transaction: (fn) => () => {
        d.exec('BEGIN')
        try {
          const r = fn()
          d.exec('COMMIT')
          return r
        } catch (e) {
          d.exec('ROLLBACK')
          throw e
        }
      }
    }
    const store = createEventStore(adapter)
    const tuned = { ...DEFAULT_WEIGHTS, version: 'weights-2.0.0', decision: 0.5 }
    const evt = store.append(weightsRetunedEvent('org-1', 'admin:1', DEFAULT_WEIGHTS, tuned))
    expect(evt.eventType).toBe('MaterialityWeightsRetuned')
    expect(evt.category).toBe('administrative')
    expect((evt.currentState as { version: string }).version).toBe('weights-2.0.0')
    expect(adapter.prepare('SELECT COUNT(*) AS n FROM events').get()).toEqual({ n: 1 })
  })
})

describe('plx_ctx_002 / plx_prd_020 / plx_prd_021 / plx_prd_022 — inferred context provenance', () => {
  it('test_plx_prd_020_acquisition_method_labelled', () => {
    expect(declaredField('Ship v4').source).toBe('declared')
    expect(absentField().source).toBe('absent')
    expect(inferredField('Likely blocked on legal', confidence(0.8), [{ eventId: 'e1' }]).source).toBe('inferred')
  })
  it('test_plx_ctx_002_inferred_requires_confidence_and_evidence', () => {
    expect(() => inferredField('x', confidence(0.9), [])).toThrow(/evidence/i)
    // @ts-expect-error deliberately missing confidence
    expect(() => inferredField('x', null, [{ eventId: 'e1' }])).toThrow(/confidence/i)
  })
  it('test_plx_prd_021_inferred_carries_confidence', () => {
    const f = inferredField('Pricing at risk', confidence(0.82), [{ objectId: 'o1' }])
    expect(f.confidence?.score).toBeCloseTo(0.82)
    expect(f.confidence?.level).toBe('high')
  })
  it('test_plx_prd_022_below_threshold_not_asserted', () => {
    const weak = inferredField('Maybe stale', confidence(PLATFORM_CONFIDENCE_THRESHOLD - 0.1), [{ eventId: 'e1' }])
    const strong = inferredField('Definitely changed', confidence(PLATFORM_CONFIDENCE_THRESHOLD + 0.2), [{ eventId: 'e2' }])
    expect(isDisplayableAsAssertion(weak)).toBe(false) // must be offered as a question instead
    expect(isDisplayableAsAssertion(strong)).toBe(true)
    expect(isDisplayableAsAssertion(declaredField('User said so'))).toBe(true)
  })
})
