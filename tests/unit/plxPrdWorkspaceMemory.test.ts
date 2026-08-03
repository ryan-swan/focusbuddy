// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { memSqlDb } from './_memdb'
import { createEventStore } from '../../src/main/db/eventStore'
import * as memory from '../../src/main/context/workspaceMemory'
import {
  CAPTURE_MODE,
  shouldSnapshot,
  SNAPSHOT_INTERVAL_MS,
  compress,
  expand,
  applyRetentionPolicyEvent,
  embeddingStatus,
  declareIntent,
  INTENT_REQUIRED
} from '../../src/main/context/workspaceMemory'
import { effectivePermissions } from '../../src/shared/desk'

// Workspace Memory (spec §13, §66).

describe('plx_prd_030 — capture is automatic; there is no save-context action', () => {
  it('test_plx_prd_030_no_manual_save', () => {
    expect(CAPTURE_MODE).toBe('automatic')
    // The MUST-NOT is enforced by absence: no save/saveContext affordance exists.
    const banned = /save|persistContext|commitContext/i
    expect(Object.keys(memory).filter((k) => banned.test(k))).toEqual([])
  })
})

describe('plx_prd_031 — session snapshots on exit, timeout, and <=60s intervals', () => {
  it('test_plx_prd_031_snapshot_triggers', () => {
    expect(SNAPSHOT_INTERVAL_MS).toBeLessThanOrEqual(60_000)
    expect(shouldSnapshot('desk-exit')).toBe(true)
    expect(shouldSnapshot('session-timeout')).toBe(true)
    expect(shouldSnapshot('interval', 59_000)).toBe(false)
    expect(shouldSnapshot('interval', 60_000)).toBe(true)
  })
})

describe('plx_prd_032 / plx_prd_033 — compression is non-destructive and expandable', () => {
  it('test_plx_prd_032_033_summary_references_and_expands', () => {
    const summary = compress(['e1', 'e2', 'e3'], 'Three edits to the pricing model')
    expect(summary.derived).toBe(true)
    expect(summary.sourceEventIds).toEqual(['e1', 'e2', 'e3'])
    expect(expand(summary)).toEqual(['e1', 'e2', 'e3']) // always expandable to the Events
    expect(() => compress([], 'x')).toThrow(/PLX-PRD-032/)
  })
})

describe('plx_prd_034 — retention policy emits an auditable Event, never prunes Events', () => {
  it('test_plx_prd_034_policy_event_and_protected_targets', () => {
    const es = createEventStore(memSqlDb())
    const evt = es.append(applyRetentionPolicyEvent('org', 'admin', { layer: 'working', target: 'stale-drafts', maxAgeDays: 30 }))
    expect(evt.eventType).toBe('RetentionPolicyApplied')
    // A policy can never target the Event log or Decision alternatives (DATA-012).
    expect(() => applyRetentionPolicyEvent('org', 'admin', { layer: 'x', target: 'events', maxAgeDays: 1 })).toThrow(/PLX-DATA-012/)
  })
})

describe('plx_prd_014 — every Object is indexed or explicitly excluded', () => {
  it('test_plx_prd_014_no_silent_skip', () => {
    expect(embeddingStatus(true)).toEqual({ indexed: true })
    expect(embeddingStatus(false, 'binary blob')).toEqual({ indexed: false, exclusionReason: 'binary blob' })
    expect(() => embeddingStatus(false)).toThrow(/PLX-PRD-014/) // silent skip refused
  })
})

describe('plx_prd_023 — declaring intent is low-friction and optional', () => {
  it('test_plx_prd_023_optional_intent', () => {
    expect(INTENT_REQUIRED).toBe(false)
    expect(declareIntent()).toEqual({ currentQuestion: null, expectedNextAction: null })
    expect(declareIntent('why is this stale?', 'reopen the proposal')).toEqual({ currentQuestion: 'why is this stale?', expectedNextAction: 'reopen the proposal' })
  })
})

describe('plx_dom_031 — DeskPresence effective permissions are the intersection', () => {
  it('test_plx_dom_031_most_restrictive_intersection', () => {
    // The owning Desk grants read+write; the presenting Desk grants only read.
    expect(effectivePermissions(['read', 'write'], [{ deskId: 'B', syncMode: 'linked', addedBy: 'u', permissions: ['read'] }])).toEqual(['read'])
  })
})
