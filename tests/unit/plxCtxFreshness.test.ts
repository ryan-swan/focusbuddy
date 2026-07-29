import { describe, it, expect } from 'vitest'
import { memSqlDb } from './_memdb'
import { createEventStore } from '../../src/main/db/eventStore'
import * as freshnessMod from '../../src/main/context/freshness'
import { computeFreshness, freshnessFor, meaningfulChangesSince } from '../../src/main/context/freshness'
import { scoreMateriality, materialityScoredEvent, DEFAULT_THRESHOLDS, type MaterialityInput } from '../../src/main/context/materiality'

// Context freshness (spec §20, §80.3) + materiality threshold recording (§80.1).

const material: MaterialityInput = {
  affectedObjectCount: 8, decisionImpact: 'high', relationshipDepth: 1,
  organisationalReach: 'org', userRole: 'owner', workflowStage: 'final', historicalSignificance: 0.7
}

describe('plx_ctx_030 — freshness decays with meaningful change, not elapsed time', () => {
  it('test_plx_ctx_030_decays_with_change_and_ignores_time', () => {
    // More meaningful change -> lower freshness, monotonically.
    expect(freshnessFor(0)).toBe(1)
    expect(freshnessFor(1)).toBeLessThan(freshnessFor(0))
    expect(freshnessFor(5)).toBeLessThan(freshnessFor(1))
    // Time is not an input: the function's only argument is a change count, so the
    // same count always yields the same freshness regardless of when it is called.
    expect(freshnessFor(3)).toBe(freshnessFor(3))
    expect(freshnessMod.freshnessFor.length).toBe(1) // arity is (meaningfulChanges) only
  })
  it('test_plx_ctx_030_counts_meaningful_events_excluding_noise', () => {
    const db = memSqlDb()
    const es = createEventStore(db)
    es.append({ eventType: 'DeskUpdated', category: 'user', actor: 'u', organisationId: 'o', objectId: 'desk-1', changeSummary: 'x' })
    es.append({ eventType: 'ContextHealthChanged', category: 'system', actor: 'u', organisationId: 'o', objectId: 'desk-1', changeSummary: 'noise' })
    es.append({ eventType: 'DeskCompleted', category: 'user', actor: 'u', organisationId: 'o', objectId: 'desk-1', changeSummary: 'y' })
    // Two meaningful changes; the ContextHealthChanged noise event is excluded.
    const n = meaningfulChangesSince(db, ['desk-1'], -1)
    expect(n).toBe(2)
    const f = computeFreshness('sam', 'desk-1', n)
    expect(f.meaningfulChanges).toBe(2)
    expect(f.basis).toBe('meaningful-change')
    expect(f.freshness).toBeCloseTo(1 / 3)
  })
})

describe('plx_ctx_031 — freshness is private, never comparative or rankable', () => {
  it('test_plx_ctx_031_no_cross_user_or_ranking_api_exists', () => {
    // The MUST NOT is enforced by absence: the module exposes only per-(user,Desk)
    // computation, no aggregate/compare/rank/export surface.
    const banned = /rank|leaderboard|compare|standings|export|allUsers|betweenUsers/i
    const offenders = Object.keys(freshnessMod).filter((k) => banned.test(k))
    expect(offenders).toEqual([])
    // A freshness result is scoped to exactly one user and one desk.
    const f = computeFreshness('sam', 'desk-1', 2)
    expect(f.userId).toBe('sam')
    expect(f.deskId).toBe('desk-1')
    expect(Array.isArray((f as unknown as { users?: unknown }).users)).toBe(false)
  })
})

describe('plx_ctx_012 — materiality thresholds configurable and recorded', () => {
  it('test_plx_ctx_012_thresholds_recorded_on_result', () => {
    const r = scoreMateriality(material)
    expect(r.thresholdsVersion).toBe(DEFAULT_THRESHOLDS.version)
    expect(r.thresholds).toEqual(DEFAULT_THRESHOLDS)
  })
  it('test_plx_ctx_012_thresholds_are_tenant_tunable', () => {
    // Lowering the 'high' cutoff moves a mid score up a band without changing the
    // score itself — and the change is recorded, so it is auditable.
    const base = scoreMateriality({ ...material, decisionImpact: 'low', organisationalReach: 'team', workflowStage: 'review' })
    const tuned = { version: 'thresholds-tenant-x', low: 0.1, medium: 0.3, high: base.score - 0.01 }
    const rescored = scoreMateriality(
      { ...material, decisionImpact: 'low', organisationalReach: 'team', workflowStage: 'review' },
      undefined,
      tuned
    )
    expect(rescored.score).toBe(base.score) // same score
    expect(rescored.band).toBe('high') // different band, purely from thresholds
    expect(rescored.thresholdsVersion).toBe('thresholds-tenant-x')
  })
  it('test_plx_ctx_012_scored_event_carries_thresholds', () => {
    const db = memSqlDb()
    const es = createEventStore(db)
    const r = scoreMateriality(material)
    const evt = es.append(materialityScoredEvent('org-1', 'system', 'desk-1', r))
    expect(evt.eventType).toBe('MaterialityScored')
    expect((evt.currentState as { thresholdsVersion: string }).thresholdsVersion).toBe(DEFAULT_THRESHOLDS.version)
  })
})
