import { describe, it, expect } from 'vitest'
import {
  layoutKey,
  layoutChangeAllowed,
  assertLayoutChange,
  restoreLayout,
  type DeskLayout
} from '../../src/shared/deskLayout'
import { recordNotification, canSuppress, effectiveDelivery, notEscalatedDigest, type Notification } from '../../src/main/notifications/notifications'
import {
  visiblePresence,
  communicateChange,
  recommendationDisplayable,
  assertRecommendationDisplayable,
  registerCapability,
  capabilitiesMissingFromApi,
  storeIsTenantIsolated,
  retentionAppliedEvent,
  analysisModeFor,
  onSynchronousPath,
  deskBiasedScore
} from '../../src/shared/platformSurface'
import { rankSearch } from '../../src/main/search/ranking'
import type { Principal } from '../../src/shared/permission'

// Desk layout, notifications, and platform-surface contracts (spec §17/§21/§24/§25/§54/§61).

describe('plx_ux_030 / plx_ux_032 — layout persistence per user/desk/device, no silent reflow', () => {
  it('test_plx_ux_030_032', () => {
    expect(layoutKey('u', 'd', 'desktop')).not.toBe(layoutKey('u', 'd', 'mobile')) // per device class
    expect(layoutChangeAllowed('user-action')).toBe(true)
    expect(layoutChangeAllowed('viewport-change')).toBe(true)
    expect(layoutChangeAllowed('automated')).toBe(false)
    expect(() => assertLayoutChange('automated')).toThrow(/PLX-UX-030/)
  })
})

describe('plx_ux_031 / plx_ux_033 — restore what can be restored, report the rest', () => {
  it('test_plx_ux_031_033', () => {
    const saved: DeskLayout = {
      userId: 'u', deskId: 'd', deviceClass: 'desktop', scroll: { x: 0, y: 0 }, selectedObjectIds: [],
      objects: [{ objectId: 'a', x: 0, y: 0, width: 10, height: 10, zIndex: 1 }, { objectId: 'gone', x: 0, y: 0, width: 10, height: 10, zIndex: 1 }]
    }
    const r = restoreLayout(saved, (id) => id !== 'gone')
    expect(r.restored.map((o) => o.objectId)).toEqual(['a'])
    expect(r.unrestorable).toEqual(['gone']) // reported, not silently dropped
    expect(r.degradedGracefully).toBe(true)
  })
})

describe('plx_ux_040 — active Desk biases ranking', () => {
  it('test_plx_ux_040', () => {
    // Same base score, different active desk -> different result.
    expect(deskBiasedScore(1, 'desk-A', 'desk-A')).toBeGreaterThan(deskBiasedScore(1, 'desk-A', 'desk-B'))
  })
})

describe('plx_ux_041 — search permission filter first (shared with SCH-001)', () => {
  it('test_plx_ux_041', () => {
    const r = rankSearch([{ id: 'ok', keywordScore: 1, semanticScore: 1, embeddingStale: false }, { id: 'no', keywordScore: 9, semanticScore: 9, embeddingStale: false }], (id) => id === 'ok')
    expect(r.total).toBe(1) // withheld result never counted
    expect(r.results.map((x) => x.id)).toEqual(['ok'])
  })
})

describe('plx_ux_043 / plx_ux_044 / plx_ux_045 — notifications', () => {
  it('test_plx_ux_043_records_layer_and_trigger', () => {
    const n = recordNotification({ id: 'n1', category: 'attention', layer: 'inbox', trigger: 'materiality>0.7', escalated: true })
    expect(n.layer).toBe('inbox')
    expect(() => recordNotification({ id: 'n2', category: 'attention', layer: 'inbox', trigger: '', escalated: true })).toThrow(/PLX-UX-043/)
  })
  it('test_plx_ux_044_security_never_suppressible', () => {
    expect(canSuppress('security')).toBe(false)
    expect(canSuppress('activity')).toBe(true)
    expect(effectiveDelivery('security', true)).toBe('delivered') // cannot be suppressed
    expect(effectiveDelivery('activity', true)).toBe('suppressed')
  })
  it('test_plx_ux_045_not_escalated_digest', () => {
    const all: Notification[] = [
      { id: 'a', category: 'activity', layer: 'ambient', trigger: 't', escalated: false },
      { id: 'b', category: 'attention', layer: 'inbox', trigger: 't', escalated: true }
    ]
    expect(notEscalatedDigest(all).map((n) => n.id)).toEqual(['a']) // what the user did NOT get
  })
})

describe('plx_ux_060 — AI recommendation carries all eight fields', () => {
  it('test_plx_ux_060', () => {
    const full = { statement: 's', rationale: 'r', evidenceEventIds: ['e1'], confidence: 0.8, materiality: 0.6, suggestedAction: 'do', alternativesConsidered: ['x'], provenance: 'ai_generated' as const }
    expect(recommendationDisplayable(full)).toBe(true)
    expect(recommendationDisplayable({ ...full, evidenceEventIds: [] })).toBe(false) // missing evidence
    expect(() => assertRecommendationDisplayable({ statement: 's' })).toThrow(/PLX-UX-060/)
  })
})

describe('plx_ux_070 / plx_ux_071 — presence scoped, change as consequence', () => {
  const viewer: Principal = { id: 'u', organisationId: 'org' }
  it('test_plx_ux_070_presence_permission_scoped', () => {
    const signals = [{ userId: 'a', objectId: 'ok' }, { userId: 'b', objectId: 'secret' }]
    expect(visiblePresence(signals, viewer, (id) => id !== 'secret').map((s) => s.objectId)).toEqual(['ok'])
  })
  it('test_plx_ux_071_consequence_first', () => {
    expect(communicateChange('price changed', 'your proposal may be underpriced')).toBe('your proposal may be underpriced')
    expect(communicateChange('price changed', null)).toBe('price changed') // falls back to fact
  })
})

describe('plx_ux_091 / plx_api_001 — every capability reachable via the API', () => {
  it('test_plx_ux_091', () => {
    registerCapability('approve-decision', { primaryInterface: true, publicApi: true })
    expect(capabilitiesMissingFromApi()).not.toContain('approve-decision')
    registerCapability('ui-only-thing', { primaryInterface: true, publicApi: false })
    expect(capabilitiesMissingFromApi()).toContain('ui-only-thing') // flagged as a gap
  })
})

describe('plx_data_004 / plx_data_010 — storage isolation + auditable retention', () => {
  it('test_plx_data_004_010', () => {
    expect(storeIsTenantIsolated({ organisationId: 'org' })).toBe(true)
    expect(storeIsTenantIsolated({ organisationId: null })).toBe(false)
    expect(retentionAppliedEvent('working').auditable).toBe(true)
  })
})

describe('plx_gph_013 — heavy graph analysis runs off the synchronous path', () => {
  it('test_plx_gph_013', () => {
    expect(analysisModeFor('community-detection')).toBe('asynchronous')
    expect(onSynchronousPath(analysisModeFor('duplicate-detection'))).toBe(false)
  })
})
