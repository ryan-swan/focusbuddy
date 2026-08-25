// work_item data model — columns, projection, satellites, remote apply
// (Attention layer S2; ARCHITECTURE §2.2–§2.4, §3).
//
// One code path (F008): every work_item write — user, AI, or sync arrival —
// lands in this module. `work_item_state` is the single source of truth; the
// legacy `status` column is a derived coarse projection computed HERE at every
// write and recomputed at every sync apply, so cross-version mapping drift can
// never produce divergent projections (F012). Dismissed/reclassified project to
// 'parked', NEVER 'done' (A-02).
//
// The column manifest is THE export the CRDT allowlists, the emit snapshot,
// ensureColumns, the arrival router, and the CI parity test all consume — one
// source, drift impossible.
//
// Handle-taking core + thin getDb wrappers, same testability pattern as
// nodeLifecycle.ts.

import { randomUUID } from 'crypto'
import { getDb } from './database'
import { getActiveOrgId, PERSONAL_ORG_ID } from './activeOrg'
import { nodesTableAcceptsWorkItems } from './migrateNodesKind'
import { isWorkItemsEnabled } from '../workItemsPref'
import { mapNodeRow, type NodeRow } from './nodes'
import type { FbNode } from '@shared/types'
import type { LifecycleDb } from './nodeLifecycle'
import {
  WORK_ITEM_COLUMNS,
  WORK_ITEM_SCHEMA_EPOCH,
  WORK_ITEM_STATES,
  statusForWorkItemState,
  type WorkItemState
} from '@shared/workItems'

export { WORK_ITEM_COLUMNS, WORK_ITEM_SCHEMA_EPOCH, WORK_ITEM_STATES, statusForWorkItemState }
export type { WorkItemState }

// ── Schema (columns + satellites §2.4) ──────────────────────────────────────

export function ensureWorkItemSchema(d: LifecycleDb & { exec(sql: string): void }): void {
  const cols = d.prepare('PRAGMA table_info(nodes)').all() as Array<{ name: string }>
  const have = new Set(cols.map((c) => c.name))
  for (const def of WORK_ITEM_COLUMNS) {
    if (!have.has(def.column)) d.exec(`ALTER TABLE nodes ADD COLUMN ${def.column} ${def.ddl}`)
  }
  // Satellites: org-scoped, never synced, never in sync bodies (§2.4).
  // detached_from_id lives HERE, not on nodes (F-M6″): it names a row
  // hard-deleted on THE PURGING DEVICE — a device-local fact whose replication
  // would show peers an un-honorable re-attach.
  d.exec(`
    CREATE TABLE IF NOT EXISTS wi_local (
      item_id TEXT PRIMARY KEY,
      snooze_until INTEGER,
      read_at INTEGER,
      local_flags TEXT,
      detached_from_id TEXT
    );
    CREATE TABLE IF NOT EXISTS wi_deliveries (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      dedupe_key TEXT UNIQUE,
      delivered_at INTEGER
    );
  `)
  // Orphan reconciliation (R017): satellite rows whose item is gone are swept
  // at startup — satellites carry no FK (nodes hard-deletes must not cascade
  // into device-local bookkeeping mid-lifecycle; the sweep is the contract).
  d.exec('DELETE FROM wi_local WHERE item_id NOT IN (SELECT id FROM nodes)')
  d.exec('DELETE FROM wi_deliveries WHERE item_id NOT IN (SELECT id FROM nodes)')
}

// ── wi_local helpers + the detach hook (§2.5.3 seam, wired at S2) ───────────

export function setDetachedFrom(d: LifecycleDb, itemId: string, fromId: string | null): void {
  d.prepare(
    `INSERT INTO wi_local (item_id, detached_from_id) VALUES (?, ?)
     ON CONFLICT(item_id) DO UPDATE SET detached_from_id = excluded.detached_from_id`
  ).run(itemId, fromId)
}

/** The DetachHook nodes.ts / workspaceSync pass into the lifecycle module so a
 *  lifecycle detach records where the item came from (the Detached surface's
 *  context + the re-attach predicate, F-M8″). */
export function workItemDetachHook(d: LifecycleDb): { onDetached(id: string, from: string | null): void } {
  return {
    onDetached: (id, from) => {
      try {
        setDetachedFrom(d, id, from)
      } catch (err) {
        // Bookkeeping must never break the detach itself (F-m3).
        // eslint-disable-next-line no-console
        console.warn('[workItems] detach bookkeeping failed:', err)
      }
    }
  }
}

// ── Creation + state writes (the ONE code path, F008) ───────────────────────

export interface WorkItemDraft {
  id?: string
  title: string
  notes?: string
  parentId?: string | null
  intentClass?: string
  dueAt?: string | null
  wiUrgency?: string | null
  sourceRef?: string | null
  sourceType?: string | null
  confidence?: number | null
  approvalState?: string
  reasonCode?: string | null
  wiOrigin?: 'human' | 'ai' | 'system'
  originatorId?: string | null
  recipientId?: string | null
}

/** DEC-018 A-1 (Dispatch D4 seam): who performed a write — a person, an agent
 *  acting for one, or the system. v1 threads and logs it; persistent storage
 *  (columns vs event log) is a D4-time DEC. Reserved NOW because these cores
 *  are the only write path (F008): a parameter today, a caller sweep later. */
export interface WorkItemActor {
  kind: 'human' | 'agent' | 'system'
  agentRef?: string
  missionRef?: string
}

function logActor(op: string, id: string, actor?: WorkItemActor): void {
  if (!actor || actor.kind === 'human') return
  // eslint-disable-next-line no-console
  console.info(
    `[workItems] ${op} ${id} by ${actor.kind}${actor.agentRef ? ` agent=${actor.agentRef}` : ''}${actor.missionRef ? ` mission=${actor.missionRef}` : ''}`
  )
}

export class WorkItemWriteRefusedError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
    this.name = 'WorkItemWriteRefusedError'
  }
}

function assertWritable(d: LifecycleDb): void {
  if (!isWorkItemsEnabled())
    throw new WorkItemWriteRefusedError('WORK_ITEMS_DISABLED', 'Work items are not enabled.')
  if (!nodesTableAcceptsWorkItems(d as never))
    throw new WorkItemWriteRefusedError(
      'WORK_ITEMS_NOT_MIGRATED',
      'This device has not migrated for work items yet.'
    )
}

export function createWorkItemCore(
  d: LifecycleDb,
  draft: WorkItemDraft,
  orgId: string,
  actor?: WorkItemActor
): { id: string } {
  assertWritable(d)
  if (orgId !== PERSONAL_ORG_ID)
    throw new WorkItemWriteRefusedError(
      'WORK_ITEMS_PERSONAL_ONLY',
      'Work items are personal-scope only while the sharing switch is off.'
    )
  // Leaf invariant: a work_item parent must be a desk/room, never a work_item.
  if (draft.parentId) {
    const parent = d.prepare('SELECT kind FROM nodes WHERE id = ?').get(draft.parentId) as
      | { kind: string }
      | undefined
    if (parent?.kind === 'work_item')
      throw new WorkItemWriteRefusedError('WORK_ITEM_PARENT_REFUSED', 'Nothing nests under a work item.')
  }
  const id = draft.id ?? randomUUID()
  const state: WorkItemState = draft.approvalState === 'suggested' ? 'suggested' : 'open'
  const now = Date.now()
  d.prepare(
    `INSERT INTO nodes (
       id, parent_id, kind, title, description, status,
       priority, interest, importance, sort_order, created_at, updated_at,
       org_id, work_item_state, intent_class, originator_id, recipient_id,
       due_at, wi_urgency, source_ref, source_type, confidence, approval_state,
       reason_code, wi_origin, schema_epoch
     ) VALUES (?, ?, 'work_item', ?, ?, ?, 3, 3, 3, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    draft.parentId ?? null,
    draft.title,
    draft.notes ?? '',
    statusForWorkItemState(state),
    now,
    now,
    orgId,
    state,
    draft.intentClass ?? 'action',
    draft.originatorId ?? null,
    draft.recipientId ?? draft.originatorId ?? null,
    draft.dueAt ?? null,
    draft.wiUrgency ?? null,
    draft.sourceRef ?? null,
    draft.sourceType ?? null,
    draft.confidence ?? null,
    draft.approvalState ?? 'auto',
    draft.reasonCode ?? null,
    draft.wiOrigin ?? 'human',
    WORK_ITEM_SCHEMA_EPOCH
  )
  logActor('create', id, actor)
  return { id }
}

export function setWorkItemStateCore(
  d: LifecycleDb,
  id: string,
  state: WorkItemState,
  actor?: WorkItemActor
): boolean {
  if (!(WORK_ITEM_STATES as readonly string[]).includes(state)) return false
  const row = d.prepare('SELECT kind FROM nodes WHERE id = ?').get(id) as
    | { kind: string }
    | undefined
  if (row?.kind !== 'work_item') return false
  d.prepare(
    'UPDATE nodes SET work_item_state = ?, status = ?, updated_at = ? WHERE id = ?'
  ).run(state, statusForWorkItemState(state), Date.now(), id)
  logActor(`setState:${state}`, id, actor)
  return true
}

// ── Sync-side apply (§2.1 branches + §2.3 F012 + §3 D1) ─────────────────────

export type RemoteWorkItemVerdict = 'applied' | 'parked-epoch' | 'not-work-item'

/**
 * Post-apply normalization for a work_item row that just arrived by ANY
 * transport: recompute the status projection locally from work_item_state
 * (cross-version drift cannot produce divergent projections — F012), enforce
 * the leaf invariant on replicated parent_ids (F-M3″: detach rather than
 * accept a child under a work_item), and park rows from a NEWER schema epoch.
 * Parking here = revert to un-materialized is impossible post-upsert on the
 * poll path, so the epoch guard normalizes conservatively: state untouched,
 * flagged via return for the caller to surface.
 */
export function normalizeAppliedWorkItem(d: LifecycleDb, id: string): RemoteWorkItemVerdict {
  const row = d
    .prepare('SELECT kind, parent_id, work_item_state, schema_epoch FROM nodes WHERE id = ?')
    .get(id) as
    | { kind: string; parent_id: string | null; work_item_state: string | null; schema_epoch: number | null }
    | undefined
  if (row?.kind !== 'work_item') return 'not-work-item'
  if ((row.schema_epoch ?? 0) > WORK_ITEM_SCHEMA_EPOCH) {
    // Newer writer: leave the row as-delivered, surface to the caller.
    return 'parked-epoch'
  }
  // Projection recompute — local mapping wins over whatever status rode the body.
  const state = row.work_item_state ?? 'open'
  d.prepare('UPDATE nodes SET status = ? WHERE id = ? AND status != ?').run(
    statusForWorkItemState(state),
    id,
    statusForWorkItemState(state)
  )
  // Leaf invariant on the replicated parent chain.
  if (row.parent_id) {
    const parent = d.prepare('SELECT kind FROM nodes WHERE id = ?').get(row.parent_id) as
      | { kind: string }
      | undefined
    if (parent?.kind === 'work_item') {
      d.prepare('UPDATE nodes SET parent_id = NULL WHERE id = ?').run(id)
    }
  }
  return 'applied'
}

// ── getDb-bound wrappers ────────────────────────────────────────────────────

export function createWorkItem(draft: WorkItemDraft, actor?: WorkItemActor): FbNode {
  const { id } = createWorkItemCore(getDb(), draft, getActiveOrgId(), actor)
  const item = getWorkItem(id)
  if (!item) throw new Error('work_item creation failed post-insert')
  return item
}

export function setWorkItemState(id: string, state: WorkItemState, actor?: WorkItemActor): boolean {
  return setWorkItemStateCore(getDb(), id, state, actor)
}

export function listWorkItems(): FbNode[] {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT * FROM nodes WHERE kind = 'work_item' AND trashed_at IS NULL AND org_id = ?
       ORDER BY created_at DESC`
    )
    .all(getActiveOrgId()) as NodeRow[]
  return rows.map(mapNodeRow)
}

export function getWorkItem(id: string): FbNode | null {
  const db = getDb()
  const row = db.prepare(`SELECT * FROM nodes WHERE id = ? AND kind = 'work_item'`).get(id) as
    | NodeRow
    | undefined
  return row ? mapNodeRow(row) : null
}

export function updateWorkItemFields(
  id: string,
  patch: Record<string, unknown>,
  actor?: WorkItemActor
): FbNode | null {
  if (!updateWorkItemFieldsCore(getDb(), id, patch, actor)) return null
  return getWorkItem(id)
}

/** §5's badge model: per-intent-class counts of NON-TERMINAL items derived
 *  from work_item_state exclusively (never status — F013), plus a headline
 *  total that excludes wi_origin='system' (DEC-016). */
export function attentionBadgeCounts(): { headline: number; byIntent: Record<string, number> } {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT intent_class AS intent, wi_origin AS origin, COUNT(*) AS n FROM nodes
       WHERE kind = 'work_item' AND trashed_at IS NULL AND org_id = ?
         AND work_item_state IN ('open','in_progress','waiting','needs_review','needs_approval','delegated','blocked','suggested','stale')
       GROUP BY intent_class, wi_origin`
    )
    .all(getActiveOrgId()) as Array<{ intent: string | null; origin: string | null; n: number }>
  const byIntent: Record<string, number> = {}
  let headline = 0
  for (const r of rows) {
    const key = r.intent ?? 'action'
    byIntent[key] = (byIntent[key] ?? 0) + r.n
    if (r.origin !== 'system') headline += r.n
  }
  return { headline, byIntent }
}

export function reclassifyWorkItem(id: string, intentClass: string): FbNode | null {
  if (!reclassifyWorkItemCore(getDb(), id, intentClass)) return null
  return getWorkItem(id)
}

export function snoozeWorkItem(id: string, until: number | null): void {
  snoozeWorkItemCore(getDb(), id, until)
}

export function markWorkItemRead(id: string): void {
  markWorkItemReadCore(getDb(), id)
}

export function workItemCounts(): Record<string, number> {
  return workItemCountsCore(getDb(), getActiveOrgId())
}

/** The arrival router's server side (§3 D1): materialize or update an inbound
 *  work_item event from the LIVE path through the one code path — never
 *  through nodes:create/tryCreateNode (which force status='open' and refuse
 *  the kind at the protocol boundary). */
export function applyRemoteWorkItemSnapshot(snapshot: Record<string, unknown>): RemoteWorkItemVerdict {
  const db = getDb()
  const id = String(snapshot.id ?? '')
  if (!id) return 'not-work-item'
  const exists = db.prepare('SELECT 1 FROM nodes WHERE id = ?').get(id)
  if (!exists) {
    const cols = [
      'id',
      'parent_id',
      'kind',
      'title',
      'description',
      'status',
      'priority',
      'interest',
      'importance',
      'sort_order',
      'created_at',
      'updated_at',
      'org_id',
      ...WORK_ITEM_COLUMNS.map((c) => c.column)
    ]
    const now = Date.now()
    const vals: Record<string, unknown> = {
      id,
      parent_id: (snapshot.parentId as string | null) ?? null,
      kind: 'work_item',
      title: String(snapshot.title ?? ''),
      description: String(snapshot.description ?? ''),
      status: 'open',
      priority: 3,
      interest: 3,
      importance: 3,
      sort_order: 0,
      created_at: now,
      updated_at: now,
      org_id: PERSONAL_ORG_ID
    }
    for (const def of WORK_ITEM_COLUMNS) vals[def.column] = (snapshot[def.attr] as never) ?? null
    db.prepare(
      `INSERT INTO nodes (${cols.join(', ')}) VALUES (${cols.map((c) => `@${c}`).join(', ')})`
    ).run(vals)
  } else {
    const sets: string[] = []
    const params: Record<string, unknown> = { id }
    for (const def of WORK_ITEM_COLUMNS) {
      if (def.attr in snapshot) {
        sets.push(`${def.column} = @${def.column}`)
        params[def.column] = snapshot[def.attr] as never
      }
    }
    if (typeof snapshot.title === 'string') {
      sets.push('title = @title')
      params.title = snapshot.title
    }
    if (sets.length) db.prepare(`UPDATE nodes SET ${sets.join(', ')} WHERE id = @id`).run(params)
  }
  return normalizeAppliedWorkItem(db, id)
}

/** The live path's inbound attr write for a work_item (router branch of
 *  applyNodeAttr): manifest attrs land on their columns; a bare 'status' attr
 *  is IGNORED (the projection is derived, never written from the wire). */
export function applyRemoteWorkItemAttr(id: string, attr: string, value: unknown): RemoteWorkItemVerdict {
  const db = getDb()
  const def = WORK_ITEM_COLUMNS.find((c) => c.attr === attr)
  if (def) {
    db.prepare(`UPDATE nodes SET ${def.column} = ? WHERE id = ? AND kind = 'work_item'`).run(
      value as never,
      id
    )
  } else if (attr === 'title' || attr === 'description') {
    db.prepare(`UPDATE nodes SET ${attr} = ? WHERE id = ? AND kind = 'work_item'`).run(
      value as never,
      id
    )
  }
  return normalizeAppliedWorkItem(db, id)
}

/** Sync-propagated trash/restore of a work_item (its desk was trashed on the
 *  origin device — §2.5.1's device-scoped semantics arriving over the wire).
 *  Distinct from the C2-guarded USER delete path on purpose. */
export function applyRemoteWorkItemTrash(id: string, trashed: boolean): void {
  const db = getDb()
  db.prepare(
    `UPDATE nodes SET trashed_at = ? WHERE id = ? AND kind = 'work_item'`
  ).run(trashed ? Date.now() : null, id)
}

// ── The workItems:* verb set (S3, §4) — handle-taking cores + wrappers ──────

/** Fields a caller may patch through updateFields. State changes go through
 *  setWorkItemState ONLY (the projection recompute lives there); status is
 *  never patchable (derived). */
const PATCHABLE: Record<string, string> = {
  title: 'title',
  notes: 'description',
  intentClass: 'intent_class',
  dueAt: 'due_at',
  wiUrgency: 'wi_urgency',
  reasonCode: 'reason_code',
  approvalState: 'approval_state'
}

export function updateWorkItemFieldsCore(
  d: LifecycleDb,
  id: string,
  patch: Record<string, unknown>,
  actor?: WorkItemActor
): boolean {
  const row = d.prepare('SELECT kind FROM nodes WHERE id = ?').get(id) as
    | { kind: string }
    | undefined
  if (row?.kind !== 'work_item') return false
  const sets: string[] = []
  const params: Record<string, unknown> = { id, now: Date.now() }
  for (const [key, col] of Object.entries(PATCHABLE)) {
    if (patch[key] !== undefined) {
      sets.push(`${col} = @${key}`)
      params[key] = patch[key]
    }
  }
  if (!sets.length) return true
  sets.push('updated_at = @now')
  d.prepare(`UPDATE nodes SET ${sets.join(', ')} WHERE id = @id`).run(params)
  logActor('updateFields', id, actor)
  return true
}

/** Reclassify = re-bin the item's intent (it stays active). The terminal
 *  'reclassified' STATE is a separate outcome (an item superseded by its
 *  replacement) and goes through setWorkItemState. */
export function reclassifyWorkItemCore(d: LifecycleDb, id: string, intentClass: string): boolean {
  return updateWorkItemFieldsCore(d, id, { intentClass })
}

export function snoozeWorkItemCore(d: LifecycleDb, id: string, until: number | null): void {
  d.prepare(
    `INSERT INTO wi_local (item_id, snooze_until) VALUES (?, ?)
     ON CONFLICT(item_id) DO UPDATE SET snooze_until = excluded.snooze_until`
  ).run(id, until)
}

export function markWorkItemReadCore(d: LifecycleDb, id: string): void {
  d.prepare(
    `INSERT INTO wi_local (item_id, read_at) VALUES (?, ?)
     ON CONFLICT(item_id) DO UPDATE SET read_at = excluded.read_at`
  ).run(id, Date.now())
}

export function workItemCountsCore(d: LifecycleDb, orgId: string): Record<string, number> {
  const rows = d
    .prepare(
      `SELECT work_item_state AS state, COUNT(*) AS n FROM nodes
       WHERE kind = 'work_item' AND trashed_at IS NULL AND org_id = ?
       GROUP BY work_item_state`
    )
    .all(orgId) as Array<{ state: string | null; n: number }>
  const out: Record<string, number> = {}
  for (const r of rows) out[r.state ?? 'open'] = r.n
  return out
}
