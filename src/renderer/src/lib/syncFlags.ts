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
