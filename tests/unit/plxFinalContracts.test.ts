import { describe, it, expect } from 'vitest'
import { memSqlDb } from './_memdb'
import { createEventStore } from '../../src/main/db/eventStore'
import { layoutIsComplete, restoreLayout, type DeskLayout } from '../../src/shared/deskLayout'
import { applyPresence, healthWithPresence, type ObjectSurfaceState } from '../../src/shared/presenceOverlay'
import { generateResume, renderResumeForViewer } from '../../src/main/resume/resume'
import { teamAwarenessAggregationAllowed, assertTeamAwarenessAggregation } from '../../src/shared/permissionPropagation'
import { capabilityGaReady, metricsBlockingGa, deploymentAllowed, docsBlockingDeployment } from '../../src/main/meta/governance'

// The final contract batch (spec §21, §20.3, §23, §8, §73).

describe('plx_prd_002 — a Desk persists and restores its complete visual layout', () => {
  it('test_plx_prd_002_layout_complete_and_restorable', () => {
    const saved: DeskLayout = {
      userId: 'u', deskId: 'd', deviceClass: 'desktop', scroll: { x: 5, y: 9 }, selectedObjectIds: ['a'], zoom: 1.25,
      objects: [{ objectId: 'a', x: 1, y: 2, width: 3, height: 4, zIndex: 2 }]
    }
    expect(layoutIsComplete(saved)).toBe(true) // positions, z-order, scroll, selection, zoom all present
    // A layout missing zoom is not complete.
    expect(layoutIsComplete({ ...saved, zoom: undefined as unknown as number })).toBe(false)
    // Restore returns the placed objects on reopen.
    expect(restoreLayout(saved, () => true).restored[0].zIndex).toBe(2)
  })
})

describe('plx_ux_023 — Live Activity is orthogonal to Context Health', () => {
  it('test_plx_ux_023_presence_never_overwrites_attention', () => {
    const s: ObjectSurfaceState = { health: 'attention-required', livePresent: false }
    const withPresence = applyPresence(s, true)
    expect(withPresence.livePresent).toBe(true)
    expect(withPresence.health).toBe('attention-required') // presence did not overwrite it
    expect(healthWithPresence(withPresence)).toBe('attention-required')
    // Same for decision-risk.
    expect(applyPresence({ health: 'decision-risk', livePresent: false }, true).health).toBe('decision-risk')
  })
})

describe('plx_ux_085 — collaborative resume filtered per viewer at render', () => {
  it('test_plx_ux_085_render_filter', () => {
    const db = memSqlDb()
    const es = createEventStore(db)
    es.append({ eventType: 'DeskUpdated', category: 'user', actor: 'u', organisationId: 'org', objectId: 'pub', changeSummary: 'a' })
    es.append({ eventType: 'DeskUpdated', category: 'user', actor: 'u', organisationId: 'org', objectId: 'secret', changeSummary: 'b' })
    const collab = generateResume(db, { deskId: 'd', forUserId: null, objectIds: ['pub', 'secret'], sinceCursor: -1 })
    const rendered = renderResumeForViewer(collab, (id) => id !== 'secret')
    expect(rendered.groups.map((g) => g.objectId)).toEqual(['pub'])
  })
})

describe('plx_ux_086 — team awareness not aggregated into individual reports without consent', () => {
  it('test_plx_ux_086_aggregation_guard', () => {
    expect(teamAwarenessAggregationAllowed(false)).toBe(true) // team-level is fine
    expect(teamAwarenessAggregationAllowed(true)).toBe(false) // into an individual report, no consent
    expect(teamAwarenessAggregationAllowed(true, true)).toBe(true) // explicit tenant config
    expect(() => assertTeamAwarenessAggregation(true)).toThrow(/PLX-UX-086/)
  })
})

describe('plx_met_012 — metrics instrumented before GA', () => {
  it('test_plx_met_012_ga_gate', () => {
    expect(capabilityGaReady([{ name: 'resume-accuracy', instrumented: true }])).toBe(true)
    expect(capabilityGaReady([{ name: 'resume-accuracy', instrumented: false }])).toBe(false)
    expect(metricsBlockingGa([{ name: 'attention-precision', instrumented: false }])).toEqual(['attention-precision'])
  })
})

describe('plx_eng_016 — service docs before production deployment', () => {
  it('test_plx_eng_016_docs_gate', () => {
    const required = ['runbook', 'failure-modes', 'slo']
    expect(deploymentAllowed(required, ['runbook', 'failure-modes', 'slo'])).toBe(true)
    expect(deploymentAllowed(required, ['runbook'])).toBe(false)
    expect(docsBlockingDeployment(required, ['runbook'])).toEqual(['failure-modes', 'slo'])
  })
})
