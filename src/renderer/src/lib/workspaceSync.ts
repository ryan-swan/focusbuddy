import { signalConfig } from './signalConfig'
import { useAccountStore } from '../stores/account'
import { useNodeStore } from '../stores/nodes'
import { useWidgetStore } from '../stores/widgets'

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
  itemType: 'node' | 'widget'
  body: Record<string, unknown> | null
  rev: number
  deleted: boolean
}

async function pullChanges(token: string, since: number): Promise<{ items: ServerItem[]; now: number } | null> {
  try {
    const res = await fetch(urlFor(`/workspace/sync?since=${since}`), {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) return null
    const json = (await res.json()) as { ok: boolean; items?: ServerItem[]; now?: number }
    if (!json.ok) return null
    return { items: json.items ?? [], now: json.now ?? since }
  } catch {
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
  itemType: 'node' | 'widget',
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
    if (!res.ok) return { ok: false, conflict: false }
    const json = (await res.json()) as { ok: boolean; item?: { rev: number } }
    return json.ok && json.item ? { ok: true, rev: json.item.rev } : { ok: false, conflict: false }
  } catch {
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
    if (!res.ok) return { ok: false, rev: 0 }
    const json = (await res.json()) as { ok: boolean; item?: { rev: number } }
    return { ok: !!json.ok, rev: json.item?.rev ?? 0 }
  } catch {
    return { ok: false, rev: 0 }
  }
}

let running = false

// One full push+pull cycle. Returns the number of remote items applied locally.
export async function syncWorkspaceOnce(): Promise<number> {
  const token = useAccountStore.getState().sessionToken
  if (!enabled() || !token || running) return 0
  running = true
  try {
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
    if (!pulled) return 0
    let applied = 0
    if (pulled.items.length > 0) {
      const r = await window.api.workspaceSync.applyRemote(pulled.items)
      applied = r.applied
    }
    await window.api.workspaceSync.setCursor(pulled.now)

    // Refresh the UI from the merged local DB if anything changed.
    if (applied > 0) {
      await useNodeStore.getState().refresh()
      const activeTaskId = useNodeStore.getState().activeTaskId
      if (activeTaskId) await useWidgetStore.getState().loadForTask(activeTaskId, { refresh: true })
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
  if (timer != null) return
  void syncWorkspaceOnce()
  timer = window.setInterval(() => void syncWorkspaceOnce(), SYNC_INTERVAL_MS)
}

export function stopWorkspaceSync(): void {
  if (timer != null) {
    window.clearInterval(timer)
    timer = null
  }
}
