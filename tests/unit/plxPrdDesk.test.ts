import { describe, it, expect } from 'vitest'
import {
  applyDeskTransition,
  archivePreservesMemory,
  changeArchetypeEvent,
  objectiveNeedsPrompt,
  proposeDraftObjective,
  shareIntoDesk,
  effectivePermissions,
  visibleSyncMode,
  changeFederatedOwners,
  isDeskArchetype,
  type SharedObject
} from '../../src/shared/desk'

// Desk domain model (spec §10, §16).

describe('plx_prd_004 — desk lifecycle state machine rejects invalid transitions', () => {
  it('test_plx_prd_004_valid_and_invalid_transitions', () => {
    expect(applyDeskTransition('draft', 'activate')).toEqual({ ok: true, to: 'active' })
    expect(applyDeskTransition('active', 'archive')).toEqual({ ok: true, to: 'archived' })
    expect(applyDeskTransition('archived', 'reactivate')).toEqual({ ok: true, to: 'active' })
    // Invalid transition -> machine-readable error naming attempted + permitted.
    const bad = applyDeskTransition('historical', 'reactivate')
    expect(bad.ok).toBe(false)
    if (!bad.ok) {
      expect(bad.error.code).toBe('INVALID_TRANSITION')
      expect(bad.error.attempted).toBe('reactivate')
      expect(bad.error.permitted).toEqual([]) // historical is terminal
    }
    const bad2 = applyDeskTransition('draft', 'archive')
    if (!bad2.ok) expect(bad2.error.permitted).toContain('activate')
  })
})

describe('plx_prd_005 — archive/historical preserves memory', () => {
  it('test_plx_prd_005_archive_and_retain_preserve', () => {
    expect(archivePreservesMemory('archive')).toBe(true)
    expect(archivePreservesMemory('retain')).toBe(true)
    expect(archivePreservesMemory('activate')).toBe(false)
  })
})

describe('plx_prd_003 — archetype is a mutable template, not a type', () => {
  it('test_plx_prd_003_change_emits_event_no_migration_no_ownership_change', () => {
    expect(isDeskArchetype('client')).toBe(true)
    expect(isDeskArchetype('nonsense')).toBe(false)
    const evt = changeArchetypeEvent('org', 'desk-1', 'user:1', 'project', 'client')
    expect(evt.eventType).toBe('DeskArchetypeChanged')
    expect((evt.currentState as { migrationRequired: boolean }).migrationRequired).toBe(false)
    expect((evt.currentState as { ownershipUnchanged: boolean }).ownershipUnchanged).toBe(true)
    expect(() => changeArchetypeEvent('org', 'd', 'u', 'project', 'bogus' as never)).toThrow(/PLX-PRD-003/)
  })
})

describe('plx_prd_006 — desk carries an editable Current Objective', () => {
  it('test_plx_prd_006_prompt_when_absent_or_unconfirmed_draft', () => {
    expect(objectiveNeedsPrompt(null)).toBe(true)
    const draft = proposeDraftObjective('Ship the launch')
    expect(draft.source).toBe('inferred')
    expect(draft.accepted).toBe(false)
    expect(objectiveNeedsPrompt(draft)).toBe(true) // unconfirmed draft still needs the user
    expect(objectiveNeedsPrompt({ statement: 'x', source: 'declared', accepted: true })).toBe(false)
  })
})

describe('plx_prd_060 / plx_prd_061 / dom_031 — sharing keeps ownership; most-restrictive governs', () => {
  const base: SharedObject = { objectId: 'obj-1', owningDeskId: 'desk-A', presentIn: [], owners: ['user:1'] }
  it('test_plx_prd_060_share_does_not_change_owning_desk', () => {
    const shared = shareIntoDesk(base, { deskId: 'desk-B', syncMode: 'linked', addedBy: 'user:1', permissions: ['read'] })
    expect(shared.owningDeskId).toBe('desk-A') // unchanged
    expect(shared.presentIn.map((p) => p.deskId)).toEqual(['desk-B'])
  })
  it('test_plx_prd_061_effective_permissions_are_the_intersection', () => {
    // Owning desk grants read+write+share; presenting desk grants only read.
    const eff = effectivePermissions(
      ['read', 'write', 'share'],
      [{ deskId: 'desk-B', syncMode: 'linked', addedBy: 'u', permissions: ['read', 'write'] }, { deskId: 'desk-C', syncMode: 'snapshot', addedBy: 'u', permissions: ['read'] }]
    )
    expect(eff.sort()).toEqual(['read']) // the most restrictive wins
  })
})

describe('plx_prd_062 — the sync mode of a shared Object is visible', () => {
  it('test_plx_prd_062_sync_mode_exposed', () => {
    const shared = shareIntoDesk({ objectId: 'o', owningDeskId: 'A', presentIn: [], owners: ['u'] }, { deskId: 'B', syncMode: 'snapshot', addedBy: 'u', permissions: ['read'] })
    expect(visibleSyncMode(shared, 'B')).toBe('snapshot') // a user cannot edit a Snapshot thinking it is Live
    expect(visibleSyncMode(shared, 'Z')).toBeNull()
  })
})

describe('plx_prd_063 — federated owner-set change emits Event + needs approval', () => {
  it('test_plx_prd_063_owner_change_requires_existing_owner_approval', () => {
    const obj: SharedObject = { objectId: 'o', owningDeskId: 'A', presentIn: [], owners: ['user:1', 'user:2'] }
    const change = changeFederatedOwners('org', obj, 'user:1', ['user:1', 'user:2', 'user:3'])
    expect(change.event.eventType).toBe('FederatedOwnersChanged')
    expect(change.requiresApprovalFrom).toEqual(['user:1', 'user:2']) // the existing owners
  })
})
