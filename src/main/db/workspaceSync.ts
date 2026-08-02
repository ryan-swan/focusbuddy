import { getDb } from './database'
import { PERSONAL_ORG_ID } from './activeOrg'

// Main-process half of multi-device workspace sync. The renderer owns the network
// (it has the signal URL + token); this layer owns the local SQLite. It collects
// rows that have local changes to push (needs_sync = 1), applies rows pulled from
// the server, and tracks the pull cursor. Per-row server rev lives in sync_rev;
// dirty state in needs_sync (set by the DB triggers in database.ts on any content
// write, cleared here after a push or an applied pull).

type SyncTable = 'nodes' | 'widgets' | 'time_blocks' | 'documents' | 'fb_tables' | 'fb_rows' | 'fb_files'
type ItemType = 'node' | 'widget' | 'timeblock' | 'document' | 'table' | 'row' | 'file'
const TABLE: Record<ItemType, SyncTable> = {
  node: 'nodes',
  widget: 'widgets',
  timeblock: 'time_blocks',
  document: 'documents',
  table: 'fb_tables',
  row: 'fb_rows',
  file: 'fb_files'
}

// fb_files rows that are pointers to internal documents (kind 'doc') are NOT
// synced here — the document itself already travels as a 'document' item, and
// syncing the pointer would race the document and churn the Drive tree. Only real
// files and folders cross members over the org loop.
const SYNCED_FILE_KINDS = "('file','folder')"

export interface PendingUpsert {
  id: string
  itemType: ItemType
  body: Record<string, unknown>
  baseRev: number
  // Group scope carried alongside the body (not inside it): null/undefined = whole
  // org, a team id = that group only. widgets/rows inherit their parent's team.
  teamId?: string | null
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
  teamId?: string | null
}

// Columns we never round-trip through the server body (local-only sync bookkeeping,
// plus team_id which travels as its own scope field, and the __team_id alias the
// widget/row joins use to carry the parent's team).
const SYNC_COLS = new Set(['sync_rev', 'needs_sync', 'team_id', '__team_id'])

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

  const pushRow = (row: Record<string, unknown>, itemType: ItemType): void => {
    const id = String(row.id)
    const baseRev = Number(row.sync_rev) || 0
    if (row.trashed_at != null) deletes.push({ id, itemType, baseRev })
    else upserts.push({ id, itemType, body: bodyFromRow(row), baseRev })
  }

  // Anti-double-sync leak guard. Nodes and time blocks each carry org_id, so the
  // personal loop must take ONLY the rows scoped to the personal org. Now that
  // nodes can belong to a real org (and sync down the org endpoint), pushing them
  // here unscoped would double-push an org node to both the per-account store and
  // the org store — leaking org content into the owner's personal per-account
  // data and syncing it twice. Filtering by org_id = 'personal' keeps genuinely
  // personal content byte-for-byte as before while excluding org content entirely.
  // Tables joined the personal loop when the mobile web app learned to render
  // table and chart widgets: their data must reach the server to be drawable on
  // another device. fb_tables carries org_id directly, same as nodes.
  for (const itemType of ['node', 'timeblock', 'table'] as ItemType[]) {
    const table = TABLE[itemType]
    const rows = db
      .prepare(`SELECT * FROM ${table} WHERE needs_sync = 1 AND org_id = ?`)
      .all(PERSONAL_ORG_ID) as Array<Record<string, unknown>>
    for (const row of rows) pushRow(row, itemType)
  }

  // Widgets have no org_id of their own; a widget derives its scope from its
  // parent node (the established precedent). So the personal loop takes only the
  // widgets whose parent node is personal, joining widgets to nodes on task_id.
  // A widget on an org node is excluded here and picked up by collectPendingOrg
  // instead, which is the mirror of the node filter above.
  const widgetRows = db
    .prepare(
      `SELECT w.* FROM widgets w
       JOIN nodes n ON w.task_id = n.id
       WHERE w.needs_sync = 1 AND n.org_id = ?`
    )
    .all(PERSONAL_ORG_ID) as Array<Record<string, unknown>>
  for (const row of widgetRows) pushRow(row, 'widget')

  // Rows scope through their parent table, mirroring the org loop's join.
  const rowRows = db
    .prepare(
      `SELECT r.* FROM fb_rows r
       JOIN fb_tables t ON r.table_id = t.id
       WHERE r.needs_sync = 1 AND t.org_id = ?`
    )
    .all(PERSONAL_ORG_ID) as Array<Record<string, unknown>>
  for (const row of rowRows) pushRow(row, 'row')

  return { upserts, deletes }
}

// Org-scoped collect: every org-shared row that belongs to the given real org and
// needs syncing. The mirror-image of the personal leak guard — an org row is
// never pushed up the personal endpoint, and a personal row is never pushed up
// the org endpoint. Rung 2 widens this beyond time blocks to documents, tables
// and table rows.
//
// nodes, time_blocks, documents and fb_tables each carry their own org_id, so
// they are filtered directly. fb_rows and widgets deliberately have NO org_id —
// each derives its org scope from a parent (a row from its fb_tables.org_id, a
// widget from its parent nodes.org_id, the widget-from-node precedent), so they
// are joined to that parent and filtered by the parent's org. Both bodies already
// carry the parent id (table_id / task_id), so they reattach on the other device.
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
    // Group scope: direct types carry team_id; widgets/rows inherit it from their
    // parent via the __team_id alias in the join below. Tagging every item at push
    // time means a team-shared object is never pushed org-wide first (no leak window).
    const teamId = (row.team_id ?? row.__team_id ?? null) as string | null
    if (row.trashed_at != null) deletes.push({ id, itemType, baseRev })
    else upserts.push({ id, itemType, body: bodyFromRow(row), baseRev, teamId })
  }

  // Types that carry org_id directly: filter by the column.
  const directTypes: Array<[ItemType, SyncTable]> = [
    ['node', TABLE.node],
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

  // Widgets: no org_id of their own, so join to the parent node and filter by the
  // node's org. The widget body still includes task_id for reattachment. This is
  // the mirror of the personal collectPending widget filter.
  const widgetRows = db
    .prepare(
      `SELECT w.*, n.team_id AS __team_id FROM widgets w
       JOIN nodes n ON w.task_id = n.id
       WHERE w.needs_sync = 1 AND n.org_id = ?`
    )
    .all(orgId) as Array<Record<string, unknown>>
  for (const row of widgetRows) pushRow(row, 'widget')

  // Rows: no org_id of their own, so join to the parent table and filter by the
  // table's org. The row body still includes table_id for reattachment.
  const rows = db
    .prepare(
      `SELECT r.*, t.team_id AS __team_id FROM fb_rows r
       JOIN fb_tables t ON r.table_id = t.id
       WHERE r.needs_sync = 1 AND t.org_id = ?`
    )
    .all(orgId) as Array<Record<string, unknown>>
  for (const row of rows) pushRow(row, 'row')

  // Drive files + folders (fb_files carries org_id directly). Doc-pointer rows are
  // excluded (their document syncs as a 'document'); a file's bytes are uploaded
  // separately by the renderer after its metadata pushes.
  const fileRows = db
    .prepare(`SELECT * FROM fb_files WHERE needs_sync = 1 AND org_id = ? AND kind IN ${SYNCED_FILE_KINDS}`)
    .all(orgId) as Array<Record<string, unknown>>
  for (const row of fileRows) pushRow(row, 'file')

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
//   1. Ordering: parents are applied before children. Nodes come before widgets
//      (a widget's task_id foreign key needs its node) and before rows, and tables
//      come before rows (a row's table_id foreign key needs its table). The rank
//      below encodes node < widget < row and table < row; other types are
//      order-independent.
//   2. org_id stamping: the active org's id is stamped onto any applied row whose
//      table actually has an org_id column (nodes, time blocks, documents, tables),
//      so a pulled row always lands in the correct org bucket regardless of what
//      its serialized body carried. fb_rows and widgets have no org_id column
//      (their scope derives from a parent), so they are never stamped.
//
// Kept separate from applyRemote so the personal path stays byte-for-byte
// unchanged. Each row is applied under its own try/catch so one bad foreign key
// (e.g. a row whose table has not synced yet) never aborts the batch.
// Order a pulled org batch so every parent inserts before its children in a single
// pass, which matters because the receiver applies the batch inside one FK-checked
// transaction. Two constraints stack:
//   1. Cross-type rank: node before widget (widgets.task_id -> nodes.id) and table
//      before row (fb_rows.table_id -> tables.id). Everything else is rank 0 and
//      order-independent. A stable sort preserves the server's order within a rank.
//   2. Node ancestry: nodes self-reference (parent_id REFERENCES nodes(id)), so a
//      Room and a Desk nested in it can arrive together. Rank keeps all nodes ahead
//      of widgets/rows but not in ancestry order, so the node items are additionally
//      topologically sorted: a node whose parent is also in the batch is emitted
//      only after that parent. A node whose parent is not in the batch (already in
//      the DB, or a genuine orphan the retry handles) keeps its rank position.
// Deletes carry no FK to satisfy, but ordering them costs nothing and keeps the
// function pure over the whole batch. Exported so it can be unit-tested without a DB.
export function orderOrgItemsForApply(items: RemoteItem[]): RemoteItem[] {
  const rank = (t: ItemType): number => (t === 'node' ? 0 : t === 'widget' ? 1 : t === 'row' ? 2 : 0)
  const ordered = [...items].sort((a, b) => rank(a.itemType) - rank(b.itemType))
  // Self-referential types carry a parent_id into the SAME table, so within their
  // rank slots each parent must be emitted before its children in a single pass:
  // nodes (parent_id -> nodes.id, a Room before a Desk nested in it) and Drive
  // files/folders (fb_files.parent_id -> fb_files.id, a folder before its files).
  // A file's parent is never a node, so the two groups sort independently.
  topoSortSelfReferential(ordered, 'node')
  topoSortSelfReferential(ordered, 'file')
  return ordered
}

// Reorder just the items of `itemType` so a parent (by body.parent_id, referencing
// the same table) always precedes its children, leaving every other item exactly
// where rank placed it. Pure over the batch; a node/file whose parent is not in the
// batch keeps its slot (the parent is already in the DB, or a genuine orphan the
// per-row retry handles).
function topoSortSelfReferential(ordered: RemoteItem[], itemType: ItemType): void {
  const slots: number[] = []
  const idToPos = new Map<string, number>()
  ordered.forEach((it, i) => {
    if (it.itemType !== itemType) return
    slots.push(i)
    if (typeof it.id === 'string') idToPos.set(it.id, i)
  })
  if (slots.length <= 1) return
  const parentOf = (i: number): string | null => {
    const b = ordered[i].body as Record<string, unknown> | null | undefined
    const p = b && typeof b === 'object' ? b['parent_id'] : null
    return typeof p === 'string' ? p : null
  }
  const emitted = new Set<number>()
  const out: number[] = []
  const visit = (i: number, stack: Set<number>): void => {
    if (emitted.has(i) || stack.has(i)) return
    stack.add(i)
    const p = parentOf(i)
    if (p != null) {
      const pi = idToPos.get(p)
      if (pi != null && pi !== i) visit(pi, stack)
    }
    stack.delete(i)
    if (!emitted.has(i)) {
      emitted.add(i)
      out.push(i)
    }
  }
  for (const i of slots) visit(i, new Set())
  // Snapshot the reordered items before writing so an overwritten slot is never read back.
  const reordered = out.map((i) => ordered[i])
  slots.forEach((slot, k) => {
    ordered[slot] = reordered[k]
  })
}

export function applyRemoteOrg(items: RemoteItem[], orgId: string): { applied: number } {
  const db = getDb()
  if (!orgId || orgId === PERSONAL_ORG_ID) return { applied: 0 }
  const ordered = orderOrgItemsForApply(items)
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
      // Stamp the group scope on types that have a team_id column (nodes/documents/
      // files/tables), so a receiver who later edits the object re-pushes it under
      // the same team. widgets/rows have no column — they re-derive from their parent.
      const hasTeamIdCol = cols.includes('team_id')
      if (hasTeamIdCol) params.team_id = item.teamId ?? null
      params.sync_rev = item.rev
      params.needs_sync = 0
      const allCols = [...present]
      if (hasOrgIdCol && !allCols.includes('org_id')) allCols.push('org_id')
      if (hasTeamIdCol && !allCols.includes('team_id')) allCols.push('team_id')
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
