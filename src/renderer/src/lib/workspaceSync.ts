import { signalConfig } from './signalConfig'
import { initPreviewGuard, previewSyncBlocked } from './previewGuard'
import { useSyncStatus } from '../stores/syncStatus'
import { useAccountStore } from '../stores/account'
import { useNodeStore } from '../stores/nodes'
import { useWidgetStore } from '../stores/widgets'
import { useTimeBlockStore } from '../stores/timeBlocks'
import { useDocumentsStore } from '../stores/documents'
import { useTablesStore } from '../stores/tables'
import { useOrgStore, PERSONAL_ORG_ID } from '../stores/org'

// Every item type carried over the sync transport. The personal loop has always
// carried node and widget; rung 2 added document, table and row alongside the
// rung-1 timeblock, and rung 3 routes node and widget down the org loop too. The
// transport is type-agnostic (a JSON body plus this discriminator), so the union
// already covers every type either loop sends.
type SyncItemType = 'node' | 'widget' | 'timeblock' | 'document' | 'table' | 'row'

// Renderer half of multi-device workspace sync. It owns the network (it has the
// signal URL + session token); the main process owns the local SQLite and exposes
// it over window.api.workspace. Each cycle pushes locally-changed rows, then pulls
// everything changed on the server since our cursor and applies it, then refreshes
// the stores so the UI reflects the merged state.
//
// Model mirrors cloud-documents: per-item monotonic rev with last-write-wins
// (server wins on a conflict), tombstones for deletes, an updated_at cursor.
// Default-on for any signed-in account; a flag lets it be turned off.

const FLAG_KEY = 'fb.workspace.sync'
const SYNC_INTERVAL_MS = 20_000

function enabled(): boolean {
  if (previewSyncBlocked()) return false
  return localStorage.getItem(FLAG_KEY) !== '0'
}
export function setWorkspaceSyncEnabled(on: boolean): void {
  localStorage.setItem(FLAG_KEY, on ? '1' : '0')
}

function urlFor(path: string): string {
  return signalConfig.httpUrl.replace(/\/+$/, '') + path
}

interface ServerItem {
  id: string
  itemType: SyncItemType
  body: Record<string, unknown> | null
  rev: number
  deleted: boolean
}

async function pullChanges(token: string, since: number): Promise<{ items: ServerItem[]; now: number } | null> {
  try {
    const res = await fetch(urlFor(`/workspace/sync?since=${since}`), {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) {
      noteServerError()
      return null
    }
    const json = (await res.json()) as { ok: boolean; items?: ServerItem[]; now?: number }
    if (!json.ok) {
      noteServerError()
      return null
    }
    return { items: json.items ?? [], now: json.now ?? since }
  } catch {
    noteOffline()
    return null
  }
}

type PutResult =
  | { ok: true; rev: number }
  | { ok: false; conflict: true; item: ServerItem }
  | { ok: false; conflict: false }

async function putItem(
  token: string,
  id: string,
  itemType: SyncItemType,
  body: Record<string, unknown>,
  baseRev: number
): Promise<PutResult> {
  try {
    const res = await fetch(urlFor(`/workspace/items/${id}`), {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemType, body, baseRev: baseRev || undefined })
    })
    if (res.status === 409) {
      const json = (await res.json()) as { item?: ServerItem }
      if (json.item) return { ok: false, conflict: true, item: json.item }
      return { ok: false, conflict: false }
    }
    if (!res.ok) {
      noteServerError()
      return { ok: false, conflict: false }
    }
    const json = (await res.json()) as { ok: boolean; item?: { rev: number } }
    return json.ok && json.item ? { ok: true, rev: json.item.rev } : { ok: false, conflict: false }
  } catch {
    noteOffline()
    return { ok: false, conflict: false }
  }
}

async function deleteItem(token: string, id: string): Promise<{ ok: boolean; rev: number }> {
  try {
    const res = await fetch(urlFor(`/workspace/items/${id}`), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    })
    if (res.status === 404) return { ok: true, rev: 0 } // server never had it; treat as done
    if (!res.ok) {
      noteServerError()
      return { ok: false, rev: 0 }
    }
    const json = (await res.json()) as { ok: boolean; item?: { rev: number } }
    return { ok: !!json.ok, rev: json.item?.rev ?? 0 }
  } catch {
    noteOffline()
    return { ok: false, rev: 0 }
  }
}

// ── Org-shared transport (cross-member time blocks) ──────────────────────────
// Same fetch shapes as the personal helpers above, but against /workspace/org/*
// and carrying the active org in x-plexi-org. The global signal-header
// interceptor also stamps this header; setting it explicitly keeps these calls
// correct even if that interceptor is not installed (tests, early boot). The
// server independently re-checks membership, so the header can only narrow scope.
function orgHeaders(token: string, orgId: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, 'x-plexi-org': orgId }
}

async function pullChangesOrg(
  token: string,
  orgId: string,
  since: number
): Promise<{ items: ServerItem[]; now: number } | null> {
  try {
    const res = await fetch(urlFor(`/workspace/org/sync?since=${since}`), {
      headers: orgHeaders(token, orgId)
    })
    if (!res.ok) {
      noteServerError()
      return null
    }
    const json = (await res.json()) as { ok: boolean; items?: ServerItem[]; now?: number }
    if (!json.ok) {
      noteServerError()
      return null
    }
    return { items: json.items ?? [], now: json.now ?? since }
  } catch {
    noteOffline()
    return null
  }
}

async function putItemOrg(
  token: string,
  orgId: string,
  id: string,
  itemType: SyncItemType,
  body: Record<string, unknown>,
  baseRev: number
): Promise<PutResult> {
  try {
    const res = await fetch(urlFor(`/workspace/org/items/${id}`), {
      method: 'PUT',
      headers: { ...orgHeaders(token, orgId), 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemType, body, baseRev: baseRev || undefined })
    })
    if (res.status === 409) {
      const json = (await res.json()) as { item?: ServerItem }
      if (json.item) return { ok: false, conflict: true, item: json.item }
      return { ok: false, conflict: false }
    }
    if (!res.ok) {
      noteServerError()
      return { ok: false, conflict: false }
    }
    const json = (await res.json()) as { ok: boolean; item?: { rev: number } }
    return json.ok && json.item ? { ok: true, rev: json.item.rev } : { ok: false, conflict: false }
  } catch {
    noteOffline()
    return { ok: false, conflict: false }
  }
}

async function deleteItemOrg(
  token: string,
  orgId: string,
  id: string
): Promise<{ ok: boolean; rev: number }> {
  try {
    const res = await fetch(urlFor(`/workspace/org/items/${id}`), {
      method: 'DELETE',
      headers: orgHeaders(token, orgId)
    })
    if (res.status === 404) return { ok: true, rev: 0 } // server never had it; treat as done
    if (!res.ok) {
      noteServerError()
      return { ok: false, rev: 0 }
    }
    const json = (await res.json()) as { ok: boolean; item?: { rev: number } }
    return { ok: !!json.ok, rev: json.item?.rev ?? 0 }
  } catch {
    noteOffline()
    return { ok: false, rev: 0 }
  }
}

// One full push+pull cycle against the ORG endpoint for the active shared org.
// Mirrors the personal cycle. As of rung 3 the org-shared set is nodes, widgets,
// time blocks, documents, tables and rows, so every surface the personal loop
// refreshes is refreshed here too when a pull lands.
async function syncOrgWorkspaceOnce(token: string, orgId: string): Promise<number> {
  // ── Push local changes ──
  const pending = await window.api.workspaceSync.pendingOrg(orgId)
  for (const u of pending.upserts) {
    const res = await putItemOrg(token, orgId, u.id, u.itemType, u.body, u.baseRev)
    if (res.ok) await window.api.workspaceSync.markPushed(u.itemType, u.id, res.rev)
    else if (res.conflict) {
      // Server is newer: take its copy (last-write-wins, server wins).
      await window.api.workspaceSync.applyRemoteOrg(
        [
          {
            id: res.item.id,
            itemType: res.item.itemType,
            body: res.item.body,
            rev: res.item.rev,
            deleted: res.item.deleted
          }
        ],
        orgId
      )
    }
  }
  for (const d of pending.deletes) {
    const res = await deleteItemOrg(token, orgId, d.id)
    if (res.ok) await window.api.workspaceSync.markPushed(d.itemType, d.id, res.rev || d.baseRev)
  }

  // ── Pull remote changes ──
  const since = await window.api.workspaceSync.getCursorOrg(orgId)
  const pulled = await pullChangesOrg(token, orgId, since)
  if (!pulled) {
    if (currentCycleFailure() === 'server') useSyncStatus.getState().setError('The server rejected a sync request.')
    else useSyncStatus.getState().setOffline()
    return 0
  }
  let applied = 0
  if (pulled.items.length > 0) {
    const r = await window.api.workspaceSync.applyRemoteOrg(pulled.items, orgId)
    applied = r.applied
  }
  await window.api.workspaceSync.setCursorOrg(orgId, pulled.now)

  const verdict = currentCycleFailure()
  if (verdict === 'server') useSyncStatus.getState().setError('The server rejected a sync request.')
  else if (verdict === 'offline') useSyncStatus.getState().setOffline()
  else useSyncStatus.getState().setOk()

  // Rung 3 shares nodes and widgets on top of time blocks, documents and tables
  // (with rows), so refresh each affected surface when anything landed. Nodes and
  // widgets are refreshed exactly as the personal loop does: reload the node tree
  // and, if a task is open, its widgets. applyRemoteOrg writes tables/rows straight
  // to the DB (bypassing the notifyRowsChanged event the store listens for), so the
  // cached tables/rows are re-fetched here explicitly.
  if (applied > 0) {
    await useNodeStore.getState().refresh()
    const activeTaskId = useNodeStore.getState().activeTaskId
    if (activeTaskId) await useWidgetStore.getState().loadForTask(activeTaskId, { refresh: true })
    await useTimeBlockStore.getState().reload()
    await useDocumentsStore.getState().refresh().catch(() => {})
    await refreshCachedTables()
  }
  return applied
}

// Re-fetch whatever the tables store currently has cached (tables + their rows),
// so pulled org changes to tables and rows show without an app restart. A table
// that has been tombstoned locally now reads as null and is dropped from cache.
async function refreshCachedTables(): Promise<void> {
  const ts = useTablesStore.getState()
  for (const id of Object.keys(ts.tables)) {
    const t = await window.api.tables.get(id)
    const cur = useTablesStore.getState().tables
    if (t) useTablesStore.setState({ tables: { ...cur, [id]: t } })
    else {
      const next = { ...cur }
      delete next[id]
      useTablesStore.setState({ tables: next })
    }
  }
  for (const tableId of Object.keys(ts.rows)) {
    const rows = await window.api.tables.listRows(tableId)
    useTablesStore.setState({ rows: { ...useTablesStore.getState().rows, [tableId]: rows } })
  }
}

let running = false

// Per-cycle transport outcome, so the status store can tell "could not reach
// the server" (offline, transient, keep retrying quietly) from "the server
// rejected us" (a real error worth surfacing). Reset at the top of each cycle;
// the fetch helpers set 'offline' on a thrown fetch and 'server' on a non-ok
// HTTP status.
let cycleFailure: 'none' | 'offline' | 'server' = 'none'
function noteOffline(): void {
  if (cycleFailure === 'none') cycleFailure = 'offline'
}
function noteServerError(): void {
  cycleFailure = 'server' // server errors outrank offline for the cycle verdict
}
// Read through a function so TS control-flow analysis does not narrow the
// module-level let to its last literal assignment (the fetch helpers mutate it
// asynchronously, which TS cannot see).
function currentCycleFailure(): 'none' | 'offline' | 'server' {
  return cycleFailure
}

// One full push+pull cycle. Returns the number of remote items applied locally.
export async function syncWorkspaceOnce(): Promise<number> {
  const token = useAccountStore.getState().sessionToken
  if (!enabled() || !token || running) {
    if (!token || previewSyncBlocked()) useSyncStatus.getState().setDisabled()
    return 0
  }
  running = true
  cycleFailure = 'none'
  useSyncStatus.getState().setSyncing()
  try {
    // Scope selection: the active org decides which single loop runs this cycle.
    // Personal keeps the existing per-account path exactly. A real shared org runs
    // the org loop instead (one loop per interval to avoid a double push). Read
    // from the same store the x-plexi-org interceptor uses, so the branch and the
    // header can never disagree.
    const activeOrg = useOrgStore.getState().activeOrgId || PERSONAL_ORG_ID
    if (activeOrg !== PERSONAL_ORG_ID) {
      return await syncOrgWorkspaceOnce(token, activeOrg)
    }

    // ── Push local changes ──
    const pending = await window.api.workspaceSync.pending()
    for (const u of pending.upserts) {
      const res = await putItem(token, u.id, u.itemType, u.body, u.baseRev)
      if (res.ok) await window.api.workspaceSync.markPushed(u.itemType, u.id, res.rev)
      else if (res.conflict) {
        // Server is newer: take its copy (last-write-wins, server wins).
        await window.api.workspaceSync.applyRemote([
          { id: res.item.id, itemType: res.item.itemType, body: res.item.body, rev: res.item.rev, deleted: res.item.deleted }
        ])
      }
    }
    for (const d of pending.deletes) {
      const res = await deleteItem(token, d.id)
      if (res.ok) await window.api.workspaceSync.markPushed(d.itemType, d.id, res.rev || d.baseRev)
    }

    // ── Pull remote changes ──
    const since = await window.api.workspaceSync.getCursor()
    const pulled = await pullChanges(token, since)
    if (!pulled) {
      // No pull result: report the transport verdict so a persistent failure
      // stops being invisible.
      if (currentCycleFailure() === 'server') useSyncStatus.getState().setError('The server rejected a sync request.')
      else useSyncStatus.getState().setOffline()
      return 0
    }
    let applied = 0
    if (pulled.items.length > 0) {
      const r = await window.api.workspaceSync.applyRemote(pulled.items)
      applied = r.applied
    }
    await window.api.workspaceSync.setCursor(pulled.now)

    // Cycle verdict: a push that hit a server error still lands here (the pull
    // may have succeeded), so honour any error/offline note from the push loop.
    const verdict = currentCycleFailure()
    if (verdict === 'server') useSyncStatus.getState().setError('The server rejected a sync request.')
    else if (verdict === 'offline') useSyncStatus.getState().setOffline()
    else useSyncStatus.getState().setOk()

    // Refresh the UI from the merged local DB if anything changed.
    if (applied > 0) {
      await useNodeStore.getState().refresh()
      const activeTaskId = useNodeStore.getState().activeTaskId
      if (activeTaskId) await useWidgetStore.getState().loadForTask(activeTaskId, { refresh: true })
      // Calendar blocks sync too (rung 1): refresh whatever range is loaded.
      await useTimeBlockStore.getState().reload()
    }
    return applied
  } finally {
    running = false
  }
}

let timer: number | null = null

// Start the periodic sync loop (idempotent). Runs once immediately, then on an
// interval. Safe to call on every sign-in; stops cleanly on sign-out.
export function startWorkspaceSync(): void {
  initPreviewGuard()
  if (timer != null) return
  void syncWorkspaceOnce()
  timer = window.setInterval(() => void syncWorkspaceOnce(), SYNC_INTERVAL_MS)
}

export function stopWorkspaceSync(): void {
  useSyncStatus.getState().setDisabled()
  if (timer != null) {
    window.clearInterval(timer)
    timer = null
  }
}
