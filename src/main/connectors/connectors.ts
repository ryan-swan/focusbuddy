// Connector contracts (spec §56, REQ-CON). A Connector declares the capabilities it
// implements and consumers query those rather than assume (CON-001); it maps external
// permissions into the Plexi model and never over-grants (CON-002), defaulting to the
// most restrictive when it cannot faithfully represent an external model (CON-003);
// synchronisation is resumable from a durable cursor and idempotent (CON-005);
// removing a Connector never deletes what it imported (CON-006); and it backs off on
// rate limits (CON-007).

// ── CON-001 — declared capabilities ──────────────────────────────────────────
export interface ConnectorCapabilities {
  read: boolean
  write: boolean
  webhooks: boolean
  incrementalSync: boolean
}
export function connectorImplements(caps: ConnectorCapabilities, capability: keyof ConnectorCapabilities): boolean {
  return caps[capability] === true
}

// ── CON-002 / CON-003 — permission mapping, most-restrictive default ──────────
export type PlexiPermission = 'none' | 'read' | 'write'
// Map an external permission into the Plexi model. An unrecognised or
// unrepresentable external permission defaults to the most restrictive (none),
// never widening access (CON-002/003).
export function mapExternalPermission(external: string, faithful = true): PlexiPermission {
  if (!faithful) return 'none' // cannot faithfully represent -> most restrictive (CON-003)
  switch (external) {
    case 'viewer':
    case 'read':
      return 'read'
    case 'editor':
    case 'write':
      return 'write'
    default:
      return 'none' // unknown -> most restrictive (CON-002)
  }
}

// ── CON-005 — resumable, idempotent sync ─────────────────────────────────────
export interface SyncState {
  cursor: string // durable resume point
  importedIds: Set<string>
}
export function newSyncState(cursor = ''): SyncState {
  return { cursor, importedIds: new Set() }
}
// Apply a batch idempotently: an id already imported is not imported again, so
// re-running a sync never duplicates (CON-005). The cursor advances durably.
export function applySyncBatch(state: SyncState, batch: Array<{ id: string; cursor: string }>): { imported: string[]; state: SyncState } {
  const imported: string[] = []
  let cursor = state.cursor
  for (const item of batch) {
    if (!state.importedIds.has(item.id)) {
      state.importedIds.add(item.id)
      imported.push(item.id)
    }
    cursor = item.cursor // advance the durable resume point
  }
  return { imported, state: { cursor, importedIds: state.importedIds } }
}

// ── CON-006 — removal preserves imported data ────────────────────────────────
// Removing a Connector never deletes the Objects/Relationships/Events it imported
// (CON-006, PRIN-002). This returns the retained set unchanged.
export function removeConnectorPreserves<T>(imported: T[]): T[] {
  return imported
}
export const CONNECTOR_REMOVAL_DELETES_DATA = false

// ── CON-007 — backoff on rate limits ─────────────────────────────────────────
// Exponential backoff with a cap, so a rate-limited external system is retried
// politely rather than hammered (CON-007).
export function backoffMs(attempt: number, baseMs = 500, capMs = 30_000): number {
  return Math.min(capMs, baseMs * 2 ** Math.max(0, attempt))
}
