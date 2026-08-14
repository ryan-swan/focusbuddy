import { plexiId } from '@shared/plexiId'

// WS01 sync substrate — per-type migration flags.
//
// Each object type moves onto the CRDT change log behind its own flag, with the
// twenty-second workspace poll kept as the fallback until that type is proven, so a
// half-migrated type never breaks live use (the design's dual-write rule). Default
// OFF: with no flag set the app behaves exactly as it does today and the engine
// registers nothing.

export function crdtWidgetsEnabled(): boolean {
  try {
    return localStorage.getItem('fb.sync.crdt.widgets') === '1'
  } catch {
    return false
  }
}

// Nodes (tasks / folders / desks). This slice syncs the node's title and its
// parent as LWW registers; ordering (sortOrder / beforeId) stays on the poll until
// a fractional-index ordering CRDT lands, so a reparent converges live while
// sibling order still reconciles via the poll. Default OFF.
export function crdtNodesEnabled(): boolean {
  try {
    return localStorage.getItem('fb.sync.crdt.nodes') === '1'
  } catch {
    return false
  }
}

// Table rows. This slice syncs row CELLS, each an LWW register keyed by column, so
// two people editing different cells of the same row both survive (today the poll's
// whole-row last-write-wins loses one). Row creation/deletion + schema stay on the
// poll. Default OFF.
export function crdtTablesEnabled(): boolean {
  try {
    return localStorage.getItem('fb.sync.crdt.tables') === '1'
  } catch {
    return false
  }
}

// A stable per-install id, minted once and reused. It is the LWW tiebreak actor, so
// it MUST be distinct per device: two devices of the same account editing at the
// same millisecond would otherwise share an actor and could diverge. Combined with
// the account id when emitting, so the actor is unique across the whole system.
export function deviceId(): string {
  try {
    let id = localStorage.getItem('fb.sync.deviceId')
    if (!id) {
      id = plexiId()
      localStorage.setItem('fb.sync.deviceId', id)
    }
    return id
  } catch {
    // No storage (should not happen in the renderer) — fall back to an ephemeral id
    // so LWW still has a distinct actor for this session.
    return plexiId()
  }
}

// The sync partition (room) for an account's widgets. The first slice scopes
// widgets to the owning account, so it is multi-device convergence for one user;
// shared-desk partitions come with their own access check in a later step.
export function widgetPartition(accountId: string): string {
  return `w:acct:${accountId}`
}

// The sync partition for an account's nodes. Separate from widgets so each type's
// log and catch-up are independent (the server sequences each partition on its own).
export function nodePartition(accountId: string): string {
  return `n:acct:${accountId}`
}

// The sync partition for an account's table rows.
export function rowPartition(accountId: string): string {
  return `r:acct:${accountId}`
}
