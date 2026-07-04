import { getDb } from './database'
import { PERSONAL_ORG_ID } from './activeOrg'

// Main-process half of multi-device workspace sync. The renderer owns the network
// (it has the signal URL + token); this layer owns the local SQLite. It collects
// rows that have local changes to push (needs_sync = 1), applies rows pulled from
// the server, and tracks the pull cursor. Per-row server rev lives in sync_rev;
// dirty state in needs_sync (set by the DB triggers in database.ts on any content
// write, cleared here after a push or an applied pull).

type SyncTable = 'nodes' | 'widgets' | 'time_blocks' | 'documents' | 'fb_tables' | 'fb_rows'
type ItemType = 'node' | 'widget' | 'timeblock' | 'document' | 'table' | 'row'
const TABLE: Record<ItemType, SyncTable> = {
  node: 'nodes',
  widget: 'widgets',
  timeblock: 'time_blocks',
  document: 'documents',
  table: 'fb_tables',
  row: 'fb_rows'
}

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

// Org-scoped collect: every org-shared row that belongs to the given real org and
// needs syncing. The mirror-image of the personal leak guard — an org row is
// never pushed up the personal endpoint, and a personal row is never pushed up
// the org endpoint. Rung 2 widens this beyond time blocks to documents, tables
// and table rows.
//
// time_blocks, documents and fb_tables each carry their own org_id, so they are
// filtered directly. fb_rows deliberately has NO org_id — a row derives its org
// scope from its parent fb_tables.org_id (the widget-from-node precedent), so
// rows are joined to their table and filtered by the table's org. A row body
// already carries table_id, so the row can be reattached to its table on the
// other device.
export function collectPendingOrg(orgId: string): {
  upserts: PendingUpsert[]
  deletes: PendingDelete[]
} {
  const db = getDb()
  const upserts: PendingUpsert[] = []
  const deletes: PendingDelete[] = []
  if (!orgId || orgId === PERSONAL_ORG_ID) return { upserts, deletes }

  const pushRow = (row: Record<string, unknown>, itemType: ItemType): void => {
    const id = String(row.id)
    const baseRev = Number(row.sync_rev) || 0
    if (row.trashed_at != null) deletes.push({ id, itemType, baseRev })
    else upserts.push({ id, itemType, body: bodyFromRow(row), baseRev })
  }

  // Types that carry org_id directly: filter by the column.
  const directTypes: Array<[ItemType, SyncTable]> = [
    ['timeblock', TABLE.timeblock],
    ['document', TABLE.document],
    ['table', TABLE.table]
  ]
  for (const [itemType, table] of directTypes) {
    const rows = db
      .prepare(`SELECT * FROM ${table} WHERE needs_sync = 1 AND org_id = ?`)
      .all(orgId) as Array<Record<string, unknown>>
    for (const row of rows) pushRow(row, itemType)
  }

  // Rows: no org_id of their own, so join to the parent table and filter by the
  // table's org. The row body still includes table_id for reattachment.
  const rows = db
    .prepare(
      `SELECT r.* FROM fb_rows r
       JOIN fb_tables t ON r.table_id = t.id
       WHERE r.needs_sync = 1 AND t.org_id = ?`
    )
    .all(orgId) as Array<Record<string, unknown>>
  for (const row of rows) pushRow(row, 'row')

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

// Apply rows pulled from the ORG endpoint. Mirror of applyRemote, widened in
// rung 2 to time blocks, documents, tables and table rows. Two rules keep it
// correct across types:
//
//   1. Ordering: tables are applied before rows, because a row's foreign key to
//      fb_tables needs the parent table present first (the same reason applyRemote
//      applies nodes before widgets). Other types are order-independent.
//   2. org_id stamping: the active org's id is stamped onto any applied row whose
//      table actually has an org_id column (time blocks, documents, tables), so a
//      pulled row always lands in the correct org bucket regardless of what its
//      serialized body carried. fb_rows has no org_id column (its scope derives
//      from the parent table), so it is never stamped.
//
// Kept separate from applyRemote so the personal path stays byte-for-byte
// unchanged. Each row is applied under its own try/catch so one bad foreign key
// (e.g. a row whose table has not synced yet) never aborts the batch.
export function applyRemoteOrg(items: RemoteItem[], orgId: string): { applied: number } {
  const db = getDb()
  if (!orgId || orgId === PERSONAL_ORG_ID) return { applied: 0 }
  // Tables before rows; everything else keeps its relative order.
  const rank = (t: ItemType): number => (t === 'table' ? 0 : t === 'row' ? 1 : 0)
  const ordered = [...items].sort((a, b) => rank(a.itemType) - rank(b.itemType))
  let applied = 0
  const tx = db.transaction(() => {
    for (const item of ordered) {
      const table = TABLE[item.itemType]
      // Forward compatibility: an item type this build does not know is skipped,
      // never a crash (a newer device may sync richer types).
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
      // Stamp the active org only on types that actually have an org_id column, so
      // the row lands in the right bucket. fb_rows has no org_id, so skip it.
      const hasOrgIdCol = cols.includes('org_id')
      if (hasOrgIdCol) params.org_id = orgId
      params.sync_rev = item.rev
      params.needs_sync = 0
      const allCols = [...present]
      if (hasOrgIdCol && !allCols.includes('org_id')) allCols.push('org_id')
      allCols.push('sync_rev', 'needs_sync')
      const insertList = allCols.join(', ')
      const valueList = allCols.map((c) => `@${c}`).join(', ')
      const updateList = allCols.filter((c) => c !== 'id').map((c) => `${c} = @${c}`).join(', ')
      try {
        db.prepare(
          `INSERT INTO ${table} (${insertList}) VALUES (${valueList}) ON CONFLICT(id) DO UPDATE SET ${updateList}`
        ).run(params)
        applied++
      } catch {
        // A single bad row (e.g. a foreign key whose parent table has not synced
        // yet) must not abort the batch; the next cycle retries it.
      }
    }
  })
  tx()
  return { applied }
}
