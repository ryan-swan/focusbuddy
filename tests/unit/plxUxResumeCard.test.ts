import { describe, it, expect } from 'vitest'
import { memSqlDb } from './_memdb'
import { createEventStore } from '../../src/main/db/eventStore'
import {
  disclosurePath,
  drillDown,
  orderByMateriality,
  orderByChronology,
  suggestedNextAction,
  evidenceFor,
  assertDisplayableConfidence,
  assertNoPresentationState,
  CONFIDENCE_MEANING,
  type OrderableChange
} from '../../src/shared/resumeCard'
import { generateResume, signalStatement } from '../../src/main/resume/resume'
import { aiProposedChangeEvent } from '../../src/main/ai/resumeSummary'
import { isAiGenerated, markAiGenerated } from '../../src/shared/aiProvenance'
import { deriveHealthSnapshot, ensureReviewSchema } from '../../src/main/context/health'

// Resume Card + presentation-logic contracts (spec §23, §24, §27).

const changes: OrderableChange[] = [
  { id: 'a', materialityScore: 0.2, at: '2026-07-30T03:00:00Z' },
  { id: 'b', materialityScore: 0.9, at: '2026-07-30T01:00:00Z' },
  { id: 'c', materialityScore: 0.5, at: '2026-07-30T02:00:00Z' }
]

describe('plx_ux_013 — changes ordered by materiality, chronology available', () => {
  it('test_plx_ux_013_material_default_chrono_alternative', () => {
    expect(orderByMateriality(changes).map((c) => c.id)).toEqual(['b', 'c', 'a']) // by score: 0.9, 0.5, 0.2
    expect(orderByChronology(changes).map((c) => c.id)).toEqual(['b', 'c', 'a']) // by time: b(01:00), c(02:00), a(03:00)
  })
})

describe('plx_ux_051 — the disclosure path is complete and navigable', () => {
  it('test_plx_ux_051_summary_to_raw_events', () => {
    expect(disclosurePath()).toEqual(['summary', 'details', 'evidence', 'history', 'raw-events'])
    expect(drillDown('summary')).toBe('details')
    expect(drillDown('evidence')).toBe('history')
    expect(drillDown('raw-events')).toBeNull() // deepest level
  })
})

describe('plx_ux_014 — suggested next action derived from evidence or explicit none', () => {
  it('test_plx_ux_014_no_action_without_evidence', () => {
    expect(suggestedNextAction(null, [])).toEqual({ kind: 'none', reason: 'No action recommended right now.' })
    expect(suggestedNextAction('Reopen the proposal', ['e1']).kind).toBe('action')
    expect(() => suggestedNextAction('Do a thing', [])).toThrow(/PLX-UX-014/) // action without evidence refused
  })
})

describe('plx_ux_015 — every assertion exposes its evidence', () => {
  it('test_plx_ux_015_evidence_reachable', () => {
    expect(evidenceFor({ assertion: 'pricing changed', evidenceEventIds: ['e1', 'e2'] })).toEqual(['e1', 'e2'])
    expect(() => evidenceFor({ assertion: 'unsupported claim', evidenceEventIds: [] })).toThrow(/PLX-UX-015/)
  })
})

describe('plx_ux_052 / plx_ux_063 — confidence is documented and calibrated', () => {
  it('test_plx_ux_052_063_no_raw_self_report', () => {
    expect(CONFIDENCE_MEANING.length).toBeGreaterThan(40) // documented in plain language
    expect(() => assertDisplayableConfidence({ score: 0.8, source: 'deterministic' })).not.toThrow()
    expect(() => assertDisplayableConfidence({ score: 0.8, source: 'calibrated-model' })).not.toThrow()
    expect(() => assertDisplayableConfidence({ score: 0.8, source: 'model-self-report' })).toThrow(/PLX-UX-063/)
  })
})

describe('plx_ux_090 — semantic state carries no presentation fields', () => {
  it('test_plx_ux_090_separation', () => {
    expect(() => assertNoPresentationState({ objectId: 'o', state: 'attention-required' })).not.toThrow()
    expect(() => assertNoPresentationState({ objectId: 'o', x: 10, zoom: 1.5 })).toThrow(/PLX-UX-090/)
  })
})

describe('plx_ux_050 — Desk open presents a Resume Card, empty stated explicitly', () => {
  it('test_plx_ux_050_no_changes_stated', () => {
    const db = memSqlDb()
    createEventStore(db)
    const empty = generateResume(db, { deskId: 'd1', forUserId: 'sam', objectIds: ['d1'], sinceCursor: -1 })
    expect(signalStatement(empty)).toMatch(/not enough|nothing/i) // explicit, not an empty card
  })
})

describe('plx_ux_061 — AI confirms before mutating', () => {
  it('test_plx_ux_061_mutation_requires_confirmation', () => {
    const evt = aiProposedChangeEvent({ organisationId: 'org', agent: 'agent:plexi', objectId: 'o', proposal: { setStatus: 'done' }, sourceEventIds: ['e1'], model: 'm', promptVersion: 'p' })
    expect((evt.currentState as { requiresConfirmation: boolean }).requiresConfirmation).toBe(true)
  })
})

describe('plx_ux_062 — AI content programmatically distinguishable', () => {
  it('test_plx_ux_062_ai_marked', () => {
    const meta = markAiGenerated({ model: 'm', promptVersion: 'p', generatedAt: 't', sourceEventIds: ['e1'] })
    expect(isAiGenerated(meta)).toBe(true)
  })
})

describe('plx_ux_012 — changes since last review available on desk open', () => {
  it('test_plx_ux_012_changes_on_open_no_investigation', () => {
    const db = memSqlDb()
    const es = createEventStore(db)
    ensureReviewSchema(db)
    es.append({ eventType: 'DeskUpdated', category: 'user', actor: 'u', organisationId: 'org', objectId: 'd1', changeSummary: 'x' })
    // On open, the changed-since-review count is available directly, no investigative action.
    const snap = deriveHealthSnapshot(db, 'sam', 'd1', { affectedObjectCount: 1, decisionImpact: 'low', relationshipDepth: 0, organisationalReach: 'desk', userRole: 'owner', workflowStage: 'active', historicalSignificance: 0.2 }, [])
    expect(snap.changedEventCount).toBe(1)
  })
})
