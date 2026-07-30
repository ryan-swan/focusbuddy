import { describe, it, expect } from 'vitest'
import { memSqlDb } from './_memdb'
import { createEventStore } from '../../src/main/db/eventStore'
import {
  catchupCalibrationError,
  duplicatesConfirmed,
  decisionLatencyMs,
  attentionPrecision,
  knowledgeReuse,
  daysToFirstContribution,
  aiRecommendationTrust,
  attentionPrecisionRegressionBlocked,
  changeJustified,
  isBannedSuccessMetric,
  assertSuccessMetricAllowed
} from '../../src/main/meta/metrics'
import { generateResume, renderResumeForViewer } from '../../src/main/resume/resume'
import { isPermissionStateStale, evaluateFailClosed, presenceTelemetryAllowed, assertPresenceTelemetryPurpose } from '../../src/shared/permissionPropagation'

// Success metrics computed from structured data + remaining security logic
// (spec §8, §69).

describe('success metrics computed from structured data', () => {
  it('test_plx_met_003_catchup_calibration', () => {
    expect(catchupCalibrationError(10, 13)).toBe(3)
    expect(catchupCalibrationError(13, 10)).toBe(3)
  })
  it('test_plx_met_004_duplicates_confirmed', () => {
    expect(duplicatesConfirmed([{ relationshipType: 'Duplicates', state: 'confirmed' }, { relationshipType: 'Duplicates', state: 'provisional' }, { relationshipType: 'RelatedTo', state: 'confirmed' }])).toBe(1)
  })
  it('test_plx_met_005_decision_latency', () => {
    expect(decisionLatencyMs('2026-07-30T00:00:00Z', '2026-07-30T01:00:00Z')).toBe(3_600_000)
  })
  it('test_plx_met_006_attention_precision', () => {
    const t = [
      { state: 'attention-required', outcome: 'acted' as const },
      { state: 'decision-risk', outcome: 'dismissed' as const },
      { state: 'attention-required', outcome: 'acted' as const },
      { state: 'changed', outcome: 'dismissed' as const } // ignored (not attention/risk)
    ]
    expect(attentionPrecision(t)).toBeCloseTo(2 / 3)
    expect(attentionPrecision([])).toBeNull()
  })
  it('test_plx_met_008_knowledge_reuse', () => {
    expect(knowledgeReuse([{ referencesExisting: true }, { referencesExisting: false }])).toBe(0.5)
    expect(knowledgeReuse([])).toBeNull()
  })
  it('test_plx_met_009_onboarding_time', () => {
    expect(daysToFirstContribution('2026-07-01T00:00:00Z', '2026-07-04T00:00:00Z')).toBe(3)
  })
  it('test_plx_met_010_ai_trust_materiality_weighted', () => {
    // An accepted high-materiality rec outweighs a dismissed low one.
    expect(aiRecommendationTrust([{ accepted: true, materiality: 0.9 }, { accepted: false, materiality: 0.1 }])).toBeCloseTo(0.9)
    expect(aiRecommendationTrust([])).toBeNull()
  })
})

describe('metric governance and gates', () => {
  it('test_plx_met_013_attention_precision_release_gate', () => {
    expect(attentionPrecisionRegressionBlocked(0.7, 0.6)).toBe(true) // beyond tolerance -> blocked
    expect(attentionPrecisionRegressionBlocked(0.7, 0.69)).toBe(false)
  })
  it('test_plx_met_020_primary_outranks_secondary', () => {
    expect(changeJustified([{ tier: 'primary', improves: true }, { tier: 'secondary', improves: false }])).toBe(true)
    expect(changeJustified([{ tier: 'primary', improves: false }, { tier: 'secondary', improves: true }])).toBe(false)
  })
  it('test_plx_met_021_no_engagement_success_metrics', () => {
    expect(isBannedSuccessMetric('time-in-product')).toBe(true)
    expect(isBannedSuccessMetric('resume-accuracy')).toBe(false)
    expect(() => assertSuccessMetricAllowed('session-length')).toThrow(/PLX-MET-021/)
  })
})

describe('plx_res_004 — collaborative Resume filtered per viewer at render', () => {
  it('test_plx_res_004_permission_filtered_render', () => {
    const db = memSqlDb()
    const es = createEventStore(db)
    es.append({ eventType: 'DeskUpdated', category: 'user', actor: 'u', organisationId: 'org', objectId: 'pub', changeSummary: 'a' })
    es.append({ eventType: 'DeskUpdated', category: 'user', actor: 'u', organisationId: 'org', objectId: 'secret', changeSummary: 'b' })
    // A collaborative resume (forUserId null) over both objects.
    const collab = generateResume(db, { deskId: 'desk', forUserId: null, objectIds: ['pub', 'secret'], sinceCursor: -1 })
    expect(collab.groups.map((g) => g.objectId).sort()).toEqual(['pub', 'secret'])
    // Rendered for a viewer who cannot read `secret` -> only `pub` remains.
    const rendered = renderResumeForViewer(collab, (id) => id !== 'secret')
    expect(rendered.groups.map((g) => g.objectId)).toEqual(['pub'])
    expect(rendered.sourceEventIds.length).toBe(1)
  })
})

describe('plx_sec_023 — permission changes propagate; stale fails closed', () => {
  it('test_plx_sec_023_fail_closed_while_stale', () => {
    // Change happened after the derived store last propagated -> stale.
    expect(isPermissionStateStale(1000, 2000)).toBe(true)
    expect(isPermissionStateStale(2000, 1000)).toBe(false)
    // While stale, even a cached allow is denied (fail closed).
    expect(evaluateFailClosed({ stale: true, cachedAllow: true })).toBe(false)
    expect(evaluateFailClosed({ stale: false, cachedAllow: true })).toBe(true)
    expect(evaluateFailClosed({ stale: false, cachedAllow: false })).toBe(false)
  })
})

describe('plx_sec_033 — presence telemetry not repurposed without consent', () => {
  it('test_plx_sec_033_presence_purpose_guard', () => {
    expect(presenceTelemetryAllowed('context-health')).toBe(true)
    expect(presenceTelemetryAllowed('presence-display')).toBe(true)
    expect(presenceTelemetryAllowed('performance-management')).toBe(false) // no consent
    expect(presenceTelemetryAllowed('performance-management', true)).toBe(true) // explicit consent
    expect(() => assertPresenceTelemetryPurpose('monitoring')).toThrow(/PLX-SEC-033/)
  })
})
