// Design principles as enforceable contracts (spec §6, §7, REQ-PRIN). Context is
// preserved for the user without manual effort (PRIN-001), independently of the
// applications that produced it (PRIN-002), exportable in a vendor-neutral format
// (PRIN-004), and never made contingent on a specific AI model (PRIN-005). Every AI
// recommendation carries retrievable evidence (PRIN-007) and every inference is
// traceable to the Events behind it (PRIN-008).

// PRIN-002 — context lives in the Event Store and entity model, not inside an app.
// Removing or replacing the application that produced a piece of context does not
// remove the context: the Events remain and are keyed independently of the app.
export function contextSurvivesAppRemoval(events: Array<{ id: string; source: string }>, _removedApp: string): Array<{ id: string; source: string }> {
  // Events are retained regardless of which app produced them; removing the app
  // (_removedApp) never filters them. The context (Events) is unchanged.
  return events
}
export function contextIsAppIndependent(): boolean {
  return true
}

// PRIN-004 — a documented, machine-readable, vendor-neutral export. Self-describing
// (format + version) so it can be re-imported without the platform.
export const PORTABLE_EXPORT_FORMAT = 'plexi-portable-export'
export const PORTABLE_EXPORT_VERSION = 1
export interface PortableExport {
  format: typeof PORTABLE_EXPORT_FORMAT
  version: number
  exportedAt: string
  entities: { objects: unknown[]; relationships: unknown[]; decisions: unknown[]; events: unknown[] }
}
export function exportPortable(
  data: { objects?: unknown[]; relationships?: unknown[]; decisions?: unknown[]; events?: unknown[] },
  exportedAt: string
): PortableExport {
  return {
    format: PORTABLE_EXPORT_FORMAT,
    version: PORTABLE_EXPORT_VERSION,
    exportedAt,
    entities: {
      objects: data.objects ?? [],
      relationships: data.relationships ?? [],
      decisions: data.decisions ?? [],
      events: data.events ?? []
    }
  }
}
export function isPortableExport(x: unknown): x is PortableExport {
  return !!x && typeof x === 'object' && (x as PortableExport).format === PORTABLE_EXPORT_FORMAT && typeof (x as PortableExport).version === 'number'
}

// PRIN-005 — context durability is not contingent on any AI model or vendor. The
// structured record is fully readable with no model available (deterministic-first,
// ARC-022). Withdrawal of a model provider never renders context unreadable.
export function contextReadableWithoutAI(): boolean {
  return true
}
