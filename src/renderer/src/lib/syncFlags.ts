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

// Time blocks (calendar). Syncs a block's start / duration / title / status as LWW
// registers, so moving or retitling a block converges live. Creation/deletion +
// recurrence series stay on the poll. Default OFF.
export function crdtTimeBlocksEnabled(): boolean {
  try {
    return localStorage.getItem('fb.sync.crdt.timeblocks') === '1'
  } catch {
    return false
  }
}

// Files/folders (the Drive manager entries). Syncs an entry's name and parent as
// LWW registers, so a rename or a move converges live. Ingest/creation/deletion and
// the file bytes stay on the poll + blob sync. Default OFF.
export function crdtFilesEnabled(): boolean {
  try {
    return localStorage.getItem('fb.sync.crdt.files') === '1'
  } catch {
    return false
  }
}

// Document METADATA (title / archived / create / delete). The document BODY is not
// carried here: org-shared bodies live on Yjs, and personal bodies still ride the
// poll until the Yjs text-class fold moves them. Default OFF.
export function crdtDocumentsEnabled(): boolean {
  try {
    return localStorage.getItem('fb.sync.crdt.documents') === '1'
  } catch {
    return false
  }
}

// Widget LINKS (the connector wires between widgets on a desk). Syncs a wire's
// existence (create / delete) and its behaviour fields (type / verb / enabled) as
// LWW registers, routed with the wire's task node — so a SHARED DESK's wires
// converge alongside its widgets (previously wires never synced across grantees).
// Run-state (lastRunAt / lastError) is local engine output and stays off the log.
// Default OFF. Meaningful together with the widgets flag (wires need their widgets).
export function crdtLinksEnabled(): boolean {
  try {
    return localStorage.getItem('fb.sync.crdt.links') === '1'
  } catch {
    return false
  }
}

// LIVE FOLDERS (the shared, collaborative folder tree — LiveFolderView). Each tree
// entry (folder / file / inlined doc) becomes a CRDT object: create carries the
// entry snapshot, delete tombstones it, name + parent are LWW registers, so two
// people reorganising the same shared folder converge WITHOUT the check-out lock.
// The folder's body_json stays the frozen baseline; the change log carries the
// deltas on top. Default OFF (the lock path is unchanged while this is off). This
// is the first of the two migrations that let the check-out lock be retired.
export function crdtLiveFoldersEnabled(): boolean {
  try {
    return localStorage.getItem('fb.sync.crdt.livefolders') === '1'
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

// The sync partition for an account's time blocks.
export function timeBlockPartition(accountId: string): string {
  return `t:acct:${accountId}`
}

// The sync partition for an account's file/folder entries.
export function filePartition(accountId: string): string {
  return `f:acct:${accountId}`
}

// The sync partition for an account's document metadata.
export function documentPartition(accountId: string): string {
  return `d:acct:${accountId}`
}

// The sync partition for an account's widget links (wires).
export function linkPartition(accountId: string): string {
  return `l:acct:${accountId}`
}

// The sync partition (room) for a LIVE folder's tree entries. A live folder is its
// OWN room keyed by the live-folder id, NOT by the viewer's active scope — every
// member converges regardless of which org they are in, exactly like the folder's
// membership-based REST access. The server authorises this `folder:` scope by
// live-doc membership (liveDocs.isMember), the same rule its REST endpoints use.
export function liveFolderPartition(folderId: string): string {
  return `lfe:folder:${folderId}`
}

// The partition SCOPE suffix for the currently-active workspace. The renderer is
// single-org-at-a-time, so this alone routes every object correctly: a real active
// org → `org:<orgId>` (all members converge), otherwise the account's own devices →
// `acct:<accountId>`. Pure + unit-tested; the engine prepends the per-type prefix.
// 'personal' mirrors PERSONAL_ORG_ID in stores/org (kept literal to avoid importing
// the zustand store into this pure module).
export function crdtScopeSuffix(activeOrgId: string | null | undefined, accountId: string): string {
  return activeOrgId && activeOrgId !== 'personal' ? `org:${activeOrgId}` : `acct:${accountId}`
}

// Per-OBJECT partition scope, with shared-desk taking precedence. An object under a
// desk shared with named individuals carries a shared_root_id; it must route to that
// desk's partition so every grantee (across accounts) converges, REGARDLESS of whose
// account or which org it is being viewed in — otherwise a shared-desk edit would be
// stranded in the editor's personal/org scope and never reach the other grantees.
// With no shared root it falls back to the active-workspace scope (org or account).
// This precedence (desk > org > account) is the contract that keeps a shared object
// on the shared channel and a private object off it.
export function crdtObjectScope(
  sharedRootId: string | null | undefined,
  activeOrgId: string | null | undefined,
  accountId: string
): string {
  if (sharedRootId) return `desk:${sharedRootId}`
  return crdtScopeSuffix(activeOrgId, accountId)
}
