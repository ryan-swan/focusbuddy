// Extension model (spec §83, REQ-EXT). Extensions run sandboxed with an explicitly
// granted capability set (EXT-001), use only the same public interfaces as
// first-party apps (EXT-002), emit attributed Events with onBehalfOf (EXT-003), never
// exceed the authorising principal's permissions with enforcement at the data-access
// layer (EXT-004), register their Object/Relationship types in the platform
// registries (EXT-005), declare their data egress (EXT-006), and are cost-metered
// against the Organisation ceiling (EXT-007). The SDK is versioned and backward
// compatible within a major version (EXT-010/011).

import type { AppendInput } from '../db/eventStore'
import { isRegisteredObjectType } from '../../shared/object'
import { withinCeiling, type CostCeiling } from '../ai/orchestrator'

export interface Extension {
  id: string
  grantedCapabilities: string[] // explicit sandbox grants (EXT-001)
  authorisingPrincipal: string
  declaredEgress: string[] // external destinations it may transmit to (EXT-006)
}

// EXT-001 — a capability is available to an extension only if explicitly granted.
export function extensionHasCapability(ext: Extension, capability: string): boolean {
  return ext.grantedCapabilities.includes(capability)
}
export function assertCapabilityGranted(ext: Extension, capability: string): void {
  if (!extensionHasCapability(ext, capability)) {
    throw new Error(`Extension ${ext.id} lacks the granted capability "${capability}" (PLX-EXT-001).`)
  }
}

// EXT-002 — extensions use the public platform interface, not private internals. A
// public-interface allow-list is the boundary.
export function usesPublicInterfaceOnly(calledInterfaces: string[], publicInterfaces: string[]): boolean {
  const pub = new Set(publicInterfaces)
  return calledInterfaces.every((i) => pub.has(i))
}

// EXT-003 — an extension action emits an Event attributed to the extension with the
// authorising principal recorded.
export function extensionActionEvent(ext: Extension, organisationId: string, eventType: string, correlationId: string): AppendInput {
  return {
    eventType,
    category: 'integration',
    actor: `extension:${ext.id}`,
    organisationId,
    correlationId,
    currentState: { onBehalfOf: ext.authorisingPrincipal },
    changeSummary: `Extension ${ext.id} acted on behalf of ${ext.authorisingPrincipal}`
  }
}

// EXT-004 — an extension never exceeds the authorising principal's permissions.
export function assertExtensionWithinPrincipal(extensionCapabilities: string[], principalPermissions: string[]): void {
  const principal = new Set(principalPermissions)
  const excess = extensionCapabilities.filter((c) => !principal.has(c))
  if (excess.length > 0) throw new Error(`Extension exceeds the authorising principal: ${excess.join(', ')} (PLX-EXT-004).`)
}

// EXT-005 — extension-registered Object types must be in the platform registry.
export function assertExtensionTypeRegistered(objectType: string): void {
  if (!isRegisteredObjectType(objectType)) {
    throw new Error(`Extension type "${objectType}" MUST be registered in the platform registry (PLX-EXT-005 / PRD-011).`)
  }
}

// EXT-006 — an extension declares its egress; transmitting to an undeclared
// destination is refused.
export function assertEgressDeclared(ext: Extension, destination: string): void {
  if (!ext.declaredEgress.includes(destination)) {
    throw new Error(`Extension ${ext.id} may not transmit to undeclared destination "${destination}" (PLX-EXT-006).`)
  }
}

// EXT-007 — extension cost is metered against the Organisation ceiling.
export function extensionWithinCeiling(spentUsd: number, orgCeiling: CostCeiling): boolean {
  return withinCeiling(spentUsd, orgCeiling)
}

// EXT-010 / EXT-011 — the SDK is versioned; a breaking change requires a major
// increment and compatibility holds within a major version.
export function sdkCompatible(consumerMajor: number, sdkMajor: number): boolean {
  return consumerMajor === sdkMajor
}
export function sdkNextVersion(current: { major: number; minor: number }, change: 'additive' | 'breaking'): { major: number; minor: number } {
  return change === 'breaking' ? { major: current.major + 1, minor: 0 } : { major: current.major, minor: current.minor + 1 }
}
