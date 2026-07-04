import { getDb } from './database'
import { PERSONAL_ORG_ID } from './activeOrg'

// Main-process half of multi-device workspace sync. The renderer owns the network
// (it has the signal URL + token); this layer owns the local SQLite. It collects
// rows that have local changes to push (needs_sync = 1), applies rows pulled from
// the server, and tracks the pull cursor. Per-row server rev lives in sync_rev;
// dirty state in needs_sync (set by the DB triggers in database.ts on any content
// write, cleared here after a push or an applied pull).

type SyncTable = 'nodes' | 'widgets' | 'time_blocks'
type ItemType = 'node' | 'widget' | 'timeblock'
const TABLE: Record<ItemType, SyncTable> = { node: 'nodes', widget: 'widgets', timeblock: 'time_blocks' }

export interface PendingUpsert {
  id: string
  itemType: ItemType
  body: Record<string, unknown>
  baseRev: number
}
export interface PendingDelete {
  id: string
  itemType: ItemType
  baseRev: number
}
export interface RemoteItem {
  id: string
  itemType: ItemType
  body: Record<string, unknown> | null
  rev: number
  deleted: boolean
}

// Columns we never round-trip through the server body (local-only sync bookkeeping).
const SYNC_COLS = new Set(['sync_rev', 'needs_sync'])

function tableCols(table: SyncTable): string[] {
  const db = getDb()
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((c) => c.name)
}

function bodyFromRow(row: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) if (!SYNC_COLS.has(k)) body[k] = v
  return body
}

// ── Cursor ───────────────────────────────────────────────────────────────────
// Personal (per-account) cursor stays on its own key so the org path can never
// disturb it. Each org gets its own cursor under `workspace_cursor:<orgId>`.
const CURSOR_KEY = 'workspace_cursor'

function cursorKeyForOrg(orgId: string): string {
  return `${CURSOR_KEY}:${orgId}`
}

function readCursor(key: string): number {
  const db = getDb()
  const row = db.prepare('SELECT value FROM sync_meta WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row ? Number(row.value) || 0 : 0
}

function writeCursor(key: string, n: number): void {
  const db = getDb()
  db.prepare('INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?').run(
    key,
    String(n),
    String(n)
  )
}

export function getSyncCursor(): number {
  return readCursor(CURSOR_KEY)
}

export function setSyncCursor(n: number): void {
  writeCursor(CURSOR_KEY, n)
}

// Per-org pull cursor. Independent of the personal cursor so switching scopes
// never re-pulls or skips.
export function getSyncCursorOrg(orgId: string): number {
  return readCursor(cursorKeyForOrg(orgId))
}

export function setSyncCursorOrg(orgId: string, n: number): void {
  writeCursor(cursorKeyForOrg(orgId), n)
}

// ── Collect local changes to push ────────────────────────────────────────────
// A dirty row that is trashed becomes a delete (tombstone); otherwise an upsert.
export function collectPending(): { upserts: PendingUpsert[]; deletes: PendingDelete[] } {
  const db = getDb()
  const upserts: PendingUpsert[] = []
  const deletes: PendingDelete[] = []
  for (const itemType of ['node', 'widget', 'timeblock'] as ItemType[]) {
    const table = TABLE[itemType]
    // Leak guard: time blocks are the only org-shared type in this slice, so the
    // personal loop must never push a block that belongs to a real org up the
    // per-account endpoint. Nodes/widgets stay personal-only this slice and are
    // collected unscoped, exactly as before.
    const rows =
      itemType === 'timeblock'
        ? (db
            .prepare(`SELECT * FROM ${table} WHERE needs_sync = 1 AND org_id = ?`)
            .all(PERSONAL_ORG_ID) as Array<Record<string, unknown>>)
        : (db.prepare(`SELECT * FROM ${table} WHERE needs_sync = 1`).all() as Array<
            Record<string, unknown>
          >)
    for (const row of rows) {
      const id = String(row.id)
      const baseRev = Number(row.sync_rev) || 0
      if (row.trashed_at != null) deletes.push({ id, itemType, baseRev })
      else upserts.push({ id, itemType, body: bodyFromRow(row), baseRev })
    }
  }
  return { upserts, deletes }
}

// Org-scoped collect: only the time blocks that belong to the given real org and
// need syncing. The mirror-image of the personal leak guard — an org block is
// never pushed up the personal endpoint, and a personal block is never pushed up
// the org endpoint. Nodes/widgets/documents are deferred to a later rung, so only
// 'timeblock' is collected here.
export function collectPendingOrg(orgId: string): {
  upserts: PendingUpsert[]
  deletes: PendingDelete[]
} {
  const db = getDb()
  const upserts: PendingUpsert[] = []
  const deletes: PendingDelete[] = []
  if (!orgId || orgId === PERSONAL_ORG_ID) return { upserts, deletes }
  const table = TABLE.timeblock
  const rows = db
    .prepare(`SELECT * FROM ${table} WHERE needs_sync = 1 AND org_id = ?`)
    .all(orgId) as Array<Record<string, unknown>>
  for (const row of rows) {
    const id = String(row.id)
    const baseRev = Number(row.sync_rev) || 0
    if (row.trashed_at != null) deletes.push({ id, itemType: 'timeblock', baseRev })
    else upserts.push({ id, itemType: 'timeblock', body: bodyFromRow(row), baseRev })
  }
  return { upserts, deletes }
}

// Clear the dirty flag and record the server rev after a successful push. Updating
// sync_rev means the dirty trigger does not re-fire (it guards on sync cols).
export function markPushed(itemType: ItemType, id: string, rev: number): void {
  const db = getDb()
  db.prepare(`UPDATE ${TABLE[itemType]} SET sync_rev = ?, needs_sync = 0 WHERE id = ?`).run(rev, id)
}

// ── Apply rows pulled from the server ────────────────────────────────────────
// Nodes are applied before widgets so a widget's task always exists first.
export function applyRemote(items: RemoteItem[]): { applied: number } {
  const db = getDb()
  // Nodes first: widgets and time blocks may reference them by foreign key.
  const rank = (t: ItemType): number => (t === 'node' ? 0 : 1)
  const ordered = [...items].sort((a, b) => rank(a.itemType) - rank(b.itemType))
  let applied = 0
  const tx = db.transaction(() => {
    for (const item of ordered) {
      const table = TABLE[item.itemType]
      // Forward compatibility: an item type this build does not know is
      // skipped, never a crash (a newer device may sync richer types).
      if (!table) continue
      if (item.deleted) {
        // Soft-delete locally if the row exists; keep an existing trash timestamp.
        const exists = db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(item.id)
        if (exists) {
          db.prepare(
            `UPDATE ${table} SET trashed_at = COALESCE(trashed_at, ?), sync_rev = ?, needs_sync = 0 WHERE id = ?`
          ).run(Date.now(), item.rev, item.id)
          applied++
        }
        continue
      }
      if (!item.body || typeof item.body !== 'object') continue
      // Echo/stale suppression: the pull window includes items this device just
      // pushed (the cursor only advances after the pull). Re-applying an echo is
      // what made the whole desk visibly reload every sync cycle, so skip any
      // item whose rev we already have locally.
      const local = db.prepare(`SELECT sync_rev FROM ${table} WHERE id = ?`).get(item.id) as
        | { sync_rev: number | null }
        | undefined
      if (local && (local.sync_rev ?? -1) >= item.rev) continue
      // Upsert every column present in both the body and the table; set the sync
      // bookkeeping to "clean at this rev" so we never re-push what we just pulled.
      const cols = tableCols(table)
      const present = cols.filter((c) => !SYNC_COLS.has(c) && c in item.body!)
      if (!present.includes('id')) continue
      const params: Record<string, unknown> = {}
      for (const c of present) params[c] = (item.body as Record<string, unknown>)[c]
      params.sync_rev = item.rev
      params.needs_sync = 0
      const allCols = [...present, 'sync_rev', 'needs_sync']
      const insertList = allCols.join(', ')
      const valueList = allCols.map((c) => `@${c}`).join(', ')
      const updateList = allCols.filter((c) => c !== 'id').map((c) => `${c} = @${c}`).join(', ')
      try {
        db.prepare(
          `INSERT INTO ${table} (${insertList}) VALUES (${valueList}) ON CONFLICT(id) DO UPDATE SET ${updateList}`
        ).run(params)
        applied++
      } catch {
        // One bad row (e.g. a foreign key whose parent has not synced yet)
        // must not abort the whole batch; the next cycle retries it.
      }
    }
  })
  tx()
  return { applied }
}

// Apply rows pulled from the ORG endpoint. Mirror of applyRemote, restricted to
// the one org-shared type in this slice (timeblock) and stamping the active org's
// id onto every applied row so a pulled block always lands in the correct org
// bucket regardless of what its serialized body carried. Kept separate from
// applyRemote so the personal path stays byte-for-byte unchanged.
export function applyRemoteOrg(items: RemoteItem[], orgId: string): { applied: number } {
  const db = getDb()
  if (!orgId || orgId === PERSONAL_ORG_ID) return { applied: 0 }
  const table = TABLE.timeblock
  let applied = 0
  const tx = db.transaction(() => {
    for (const item of items) {
      // Only time blocks are org-shared this slice; ignore anything else.
      if (item.itemType !== 'timeblock') continue
      if (item.deleted) {
        const exists = db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(item.id)
        if (exists) {
          db.prepare(
            `UPDATE ${table} SET trashed_at = COALESCE(trashed_at, ?), sync_rev = ?, needs_sync = 0 WHERE id = ?`
          ).run(Date.now(), item.rev, item.id)
          applied++
        }
        continue
      }
      if (!item.body || typeof item.body !== 'object') continue
      // Echo/stale suppression: skip any item whose rev we already have locally.
      const local = db.prepare(`SELECT sync_rev FROM ${table} WHERE id = ?`).get(item.id) as
        | { sync_rev: number | null }
        | undefined
      if (local && (local.sync_rev ?? -1) >= item.rev) continue
      const cols = tableCols(table)
      const present = cols.filter((c) => !SYNC_COLS.has(c) && c in item.body!)
      if (!present.includes('id')) continue
      const params: Record<string, unknown> = {}
      for (const c of present) params[c] = (item.body as Record<string, unknown>)[c]
      // Stamp the active org so the row always lands in the right bucket, and set
      // the sync bookkeeping to "clean at this rev" so we never re-push a pull.
      params.org_id = orgId
      params.sync_rev = item.rev
      params.needs_sync = 0
      const allCols = present.includes('org_id')
        ? [...present, 'sync_rev', 'needs_sync']
        : [...present, 'org_id', 'sync_rev', 'needs_sync']
      const insertList = allCols.join(', ')
      const valueList = allCols.map((c) => `@${c}`).join(', ')
      const updateList = allCols.filter((c) => c !== 'id').map((c) => `${c} = @${c}`).join(', ')
      try {
        db.prepare(
          `INSERT INTO ${table} (${insertList}) VALUES (${valueList}) ON CONFLICT(id) DO UPDATE SET ${updateList}`
        ).run(params)
        applied++
      } catch {
        // A single bad row must not abort the batch; the next cycle retries it.
      }
    }
  })
  tx()
  return { applied }
}
