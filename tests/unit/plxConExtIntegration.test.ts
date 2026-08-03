import { describe, it, expect } from 'vitest'
import {
  connectorImplements,
  mapExternalPermission,
  newSyncState,
  applySyncBatch,
  removeConnectorPreserves,
  CONNECTOR_REMOVAL_DELETES_DATA,
  backoffMs
} from '../../src/main/connectors/connectors'
import {
  extensionHasCapability,
  assertCapabilityGranted,
  usesPublicInterfaceOnly,
  extensionActionEvent,
  assertExtensionWithinPrincipal,
  assertExtensionTypeRegistered,
  assertEgressDeclared,
  extensionWithinCeiling,
  sdkCompatible,
  sdkNextVersion,
  type Extension
} from '../../src/main/ext/extensions'
import { registerObjectType } from '../../src/shared/object'

// Connector (spec §56) + Extension (spec §83) contracts.

describe('plx_con_001 — declared capabilities', () => {
  it('test_plx_con_001', () => {
    const caps = { read: true, write: false, webhooks: false, incrementalSync: true }
    expect(connectorImplements(caps, 'read')).toBe(true)
    expect(connectorImplements(caps, 'write')).toBe(false)
  })
})

describe('plx_con_002 / plx_con_003 — permission mapping, most-restrictive default', () => {
  it('test_plx_con_002_003', () => {
    expect(mapExternalPermission('viewer')).toBe('read')
    expect(mapExternalPermission('editor')).toBe('write')
    expect(mapExternalPermission('mystery')).toBe('none') // unknown -> most restrictive
    expect(mapExternalPermission('editor', false)).toBe('none') // unfaithful representation -> none
  })
})

describe('plx_con_005 — resumable, idempotent sync', () => {
  it('test_plx_con_005', () => {
    let state = newSyncState()
    const batch = [{ id: 'x', cursor: 'c1' }, { id: 'y', cursor: 'c2' }]
    let r = applySyncBatch(state, batch)
    expect(r.imported.sort()).toEqual(['x', 'y'])
    expect(r.state.cursor).toBe('c2') // durable cursor advanced
    // Re-running the same batch imports nothing new (idempotent).
    r = applySyncBatch(r.state, batch)
    expect(r.imported).toEqual([])
  })
})

describe('plx_con_006 / plx_con_007 — removal preserves data; backoff', () => {
  it('test_plx_con_006_007', () => {
    expect(CONNECTOR_REMOVAL_DELETES_DATA).toBe(false)
    expect(removeConnectorPreserves([{ id: 'o1' }, { id: 'o2' }])).toHaveLength(2)
    // Exponential backoff grows and is capped.
    expect(backoffMs(0)).toBe(500)
    expect(backoffMs(1)).toBe(1000)
    expect(backoffMs(20)).toBe(30_000) // capped
  })
})

const ext: Extension = { id: 'ext-1', grantedCapabilities: ['read-objects', 'create-note'], authorisingPrincipal: 'user:alice', declaredEgress: ['api.partner.com'] }

describe('plx_ext_001 / plx_ext_004 — sandbox grants + principal bound', () => {
  it('test_plx_ext_001_004', () => {
    expect(extensionHasCapability(ext, 'read-objects')).toBe(true)
    expect(() => assertCapabilityGranted(ext, 'delete-desk')).toThrow(/PLX-EXT-001/)
    expect(() => assertExtensionWithinPrincipal(['read-objects', 'admin'], ['read-objects'])).toThrow(/PLX-EXT-004/)
  })
})

describe('plx_ext_002 / plx_ext_003 — public interface only, attributed events', () => {
  it('test_plx_ext_002_003', () => {
    expect(usesPublicInterfaceOnly(['objects.list'], ['objects.list', 'objects.create'])).toBe(true)
    expect(usesPublicInterfaceOnly(['internal.raw'], ['objects.list'])).toBe(false)
    const evt = extensionActionEvent(ext, 'org', 'NoteCreatedByExtension', 'c1')
    expect(evt.actor).toBe('extension:ext-1')
    expect((evt.currentState as { onBehalfOf: string }).onBehalfOf).toBe('user:alice')
  })
})

describe('plx_ext_005 / plx_ext_006 / plx_ext_007 — registry, egress, cost', () => {
  it('test_plx_ext_005_006_007', () => {
    registerObjectType({ id: 'partner-widget' })
    expect(() => assertExtensionTypeRegistered('partner-widget')).not.toThrow()
    expect(() => assertExtensionTypeRegistered('unregistered-type')).toThrow(/PLX-EXT-005/)
    expect(() => assertEgressDeclared(ext, 'api.partner.com')).not.toThrow()
    expect(() => assertEgressDeclared(ext, 'evil.example.com')).toThrow(/PLX-EXT-006/)
    expect(extensionWithinCeiling(2, { scope: 'organisation', scopeId: 'org', ceilingUsd: 5 })).toBe(true)
  })
})

describe('plx_ext_010 / plx_ext_011 — SDK versioning', () => {
  it('test_plx_ext_010_011', () => {
    expect(sdkCompatible(2, 2)).toBe(true)
    expect(sdkCompatible(1, 2)).toBe(false) // different major -> not compatible
    expect(sdkNextVersion({ major: 1, minor: 3 }, 'additive')).toEqual({ major: 1, minor: 4 })
    expect(sdkNextVersion({ major: 1, minor: 3 }, 'breaking')).toEqual({ major: 2, minor: 0 })
  })
})
