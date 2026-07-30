// Permission propagation to derived stores + presence-telemetry protection (spec
// §69, REQ-SEC). A permission change must reach the derived stores (search, vector,
// graph, materialised Context Health) within the propagation budget, and until it
// has, evaluation FAILS CLOSED — stale permission state denies rather than allows
// (SEC-023). Presence, focus and dwell telemetry is presence-class and must not be
// repurposed for performance management without explicit separate consent (SEC-033).

// The PLX-PERF-021 propagation budget within which a permission change must reach
// derived stores.
export const PERMISSION_PROPAGATION_BUDGET_MS = 500

// Permission state is stale if the derived store has not yet applied a change made
// after its last propagation point.
export function isPermissionStateStale(lastPropagatedAtMs: number, permissionChangedAtMs: number): boolean {
  return permissionChangedAtMs > lastPropagatedAtMs
}

// Evaluate access against a derived store, failing closed while stale: if the store
// has not yet caught up to the latest permission change, deny regardless of the
// cached decision (SEC-023). Only a fresh store may grant on its cached allow.
export function evaluateFailClosed(input: { stale: boolean; cachedAllow: boolean }): boolean {
  if (input.stale) return false // fail closed
  return input.cachedAllow
}

// ── Presence telemetry protection (SEC-033) ──────────────────────────────────

export type TelemetryPurpose = 'context-health' | 'presence-display' | 'performance-management' | 'monitoring'
export const PRESENCE_RETENTION_CLASS = 'presence' as const

// Presence/focus/dwell telemetry may drive context and presence display, but may
// NOT be repurposed for performance management or monitoring unless the tenant has
// explicitly and separately consented (SEC-033).
export function presenceTelemetryAllowed(purpose: TelemetryPurpose, tenantExplicitlyConsented = false): boolean {
  if (purpose === 'performance-management' || purpose === 'monitoring') return tenantExplicitlyConsented
  return true
}
export function assertPresenceTelemetryPurpose(purpose: TelemetryPurpose, tenantExplicitlyConsented = false): void {
  if (!presenceTelemetryAllowed(purpose, tenantExplicitlyConsented)) {
    throw new Error(`Presence telemetry MUST NOT be repurposed for ${purpose} without explicit tenant consent (PLX-SEC-033).`)
  }
}
