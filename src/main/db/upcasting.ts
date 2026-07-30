// Event schema upcasting (spec §64, PLX-EVT-035/044, DOM-012; ADR-0004). Events are
// immutable and read forever, so an Event written under an old schema is upcast to
// the current shape AT READ TIME. Upcasters are pure functions from version N to
// N+1, registered once per type and never redefined, chained on read. Absence is
// never fabricated: an upcaster that adds a field old Events never had exposes that
// absence rather than inventing a value (the no-fakery rule, applied to time).

import type { PlexiEvent } from '../../shared/events'

// A pure transform from one schema version to the next for a given Event type. It
// receives the Event's data payload (currentState) and returns the next-version
// payload. It MUST NOT invent a value for a field whose historical value is
// unknown; surface null/absence instead.
export type Upcaster = (data: Record<string, unknown>) => Record<string, unknown>

interface Registration {
  fromVersion: number
  fn: Upcaster
}

const registry = new Map<string, Registration[]>()

// Register an upcaster from `fromVersion` to `fromVersion + 1` for an Event type.
// Registering a second upcaster for the same (type, fromVersion) is rejected: an
// existing version is never redefined in place (PLX-EVT-044).
export function registerUpcaster(eventType: string, fromVersion: number, fn: Upcaster): void {
  const chain = registry.get(eventType) ?? []
  if (chain.some((r) => r.fromVersion === fromVersion)) {
    throw new Error(`An upcaster for ${eventType} v${fromVersion} already exists; a version is never redefined (PLX-EVT-044).`)
  }
  chain.push({ fromVersion, fn })
  chain.sort((a, b) => a.fromVersion - b.fromVersion)
  registry.set(eventType, chain)
}

// The current (latest) schema version for a type: one past the highest registered
// upcaster, or 1 if none are registered (the type has only ever had one shape).
export function currentSchemaVersion(eventType: string): number {
  const chain = registry.get(eventType)
  if (!chain || chain.length === 0) return 1
  return chain[chain.length - 1].fromVersion + 1
}

// Upcast a data payload from `fromVersion` to `targetVersion` (default: current),
// applying the chain step by step. Throws if a step is missing, because a gap
// would mean an old Event silently cannot be read (the exact RSK-02 failure).
export function upcastData(
  eventType: string,
  data: Record<string, unknown>,
  fromVersion: number,
  targetVersion = currentSchemaVersion(eventType)
): Record<string, unknown> {
  const chain = registry.get(eventType) ?? []
  let v = fromVersion
  let out = data
  while (v < targetVersion) {
    const step = chain.find((r) => r.fromVersion === v)
    if (!step) throw new Error(`No upcaster for ${eventType} v${v} -> v${v + 1}; old Events would be unreadable (PLX-EVT-035).`)
    out = step.fn(out)
    v += 1
  }
  return out
}

// Upcast a whole Event's payload to the current schema version. The stored Event is
// never mutated (INV-05); this returns a read-time view with `schemaVersion` set to
// the version the payload now conforms to.
export function upcastEvent(event: PlexiEvent, targetVersion = currentSchemaVersion(event.eventType)): PlexiEvent {
  const from = event.schemaVersion ?? 1
  if (from >= targetVersion) return event
  const currentState = event.currentState
    ? (upcastData(event.eventType, event.currentState as Record<string, unknown>, from, targetVersion) as PlexiEvent['currentState'])
    : event.currentState
  return { ...event, currentState, schemaVersion: targetVersion }
}

// Test/inspection helper: clear registrations for one type (used by fixture tests
// so registrations do not leak between cases).
export function _clearUpcasters(eventType?: string): void {
  if (eventType) registry.delete(eventType)
  else registry.clear()
}
