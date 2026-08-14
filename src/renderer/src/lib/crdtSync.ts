import { plexiId } from '@shared/plexiId'
import { lwwMerge, type LWWRegister } from '@shared/crdt'
import {
  geomRegisterOf,
  resolvedSection,
  registerOf,
  type ChangeEvent,
  type CrdtField,
  type CrdtDataClass,
  type WidgetGeom,
  type GeomPayload,
  type MembersPayload,
  type RegisterPayload,
  type CellPayload,
  type AttrPayload,
  type CreatePayload,
  type DeletePayload
} from '@shared/crdtWidgetMerge'
import { useAccountStore } from '../stores/account'
import { useWidgetStore } from '../stores/widgets'
import { useNodeStore } from '../stores/nodes'
import { useTablesStore } from '../stores/tables'
import { useTimeBlockStore } from '../stores/timeBlocks'
import { useFileManagerStore } from '../stores/fileManager'
import { useDocumentsStore } from '../stores/documents'
import {
  sendSocketMessage,
  setCrdtSocketHandler,
  setCrdtOpenHandler,
  type CrdtSocketEvent
} from './messagingSocket'
import { registerCrdtEmit } from './crdtBridge'
import {
  crdtWidgetsEnabled,
  crdtNodesEnabled,
  crdtTablesEnabled,
  crdtTimeBlocksEnabled,
  crdtFilesEnabled,
  crdtDocumentsEnabled,
  deviceId,
  widgetPartition,
  nodePartition,
  rowPartition,
  timeBlockPartition,
  filePartition,
  documentPartition
} from './syncFlags'
import type { Widget, FbNode, TimeBlock, FbDocument } from '@shared/types'
import type { FbRow, FbTable, FileEntry } from '@shared/fields'

// The node scalar attributes carried as generic 'attr' registers. title + parent
// have their own fields/apply (parent uses move()); ordering (sortOrder) and the
// resume text stay on the poll (ordering + text-class are separate design steps).
const NODE_ATTR_KEYS = [
  'description',
  'status',
  'priority',
  'interest',
  'importance',
  'dueDate',
  'estimateMinutes',
  'isPlan',
  // Ordering as an LWW-per-item register (not a fractional index). A single
  // reparent/reorder converges on the moved item's rank deterministically; a full
  // concurrent list reshuffle may interleave before the poll reconciles siblings.
  'sortOrder',
  'extensionsMinutes',
  // Resume/standup markdown is a plain scalar field (LWW is fine; it is not a
  // collaborative rich-text body — those go through the Yjs text class).
  'resumeMarkdown',
  'resumeUpdatedAt'
] as const

// WS01 sync substrate — the client sync engine.
//
// Every migrated type routes through the one CRDT change log: a local edit becomes
// a ChangeEvent, persisted to the local log (the offline queue) and sent over the
// existing websocket; incoming events are merged and applied. Widgets were first
// (geometry as an LWW register, section membership as an OR-Set); nodes are second
// (title + parent as LWW registers). Each type has its own flag and its own
// partition, and runs ALONGSIDE the twenty-second poll, so nothing regresses while
// a flag is off and the poll stays the safety net for a dropped frame. The merge
// algebra lives in @shared/crdtWidgetMerge and @shared/crdtNodeMerge and is proven
// directly by the convergence tests.

let widgetPart: string | null = null
let nodePart: string | null = null
let rowPart: string | null = null
let tbPart: string | null = null
let filePart: string | null = null
let docPart: string | null = null
let actor = ''
let started = false

// Widget in-memory state: the current geometry LWW register per widget, and the
// section-membership OR-Set (add tags + remove tombstones) per widget.
const geomRegs = new Map<string, LWWRegister<WidgetGeom>>()
interface MemberState {
  adds: Map<string, string> // tag -> section
  removes: Set<string>
}
const memberStates = new Map<string, MemberState>()
function memberState(id: string): MemberState {
  let st = memberStates.get(id)
  if (!st) {
    st = { adds: new Map(), removes: new Set() }
    memberStates.set(id, st)
  }
  return st
}
function liveSections(st: MemberState): string[] {
  const live = new Set<string>()
  for (const [tag, section] of st.adds) if (!st.removes.has(tag)) live.add(section)
  return [...live]
}

// Node in-memory state: one LWW register per (field, node), keyed `${field}:${id}`.
const nodeRegs = new Map<string, LWWRegister<unknown>>()
// Generic per-attribute registers, keyed `${objectType}:${id}:${attr}`.
const attrRegs = new Map<string, LWWRegister<unknown>>()

// Row in-memory state: one LWW register per (row, column), keyed `${rowId}:${column}`.
const rowRegs = new Map<string, LWWRegister<unknown>>()

// Widget scalar-field registers (content/title/color/status), keyed `${field}:${id}`.
const widgetFieldRegs = new Map<string, LWWRegister<unknown>>()
// Lifecycle tombstones: object ids that have seen a delete event. Remove-wins, so a
// create is never applied for a tombstoned id (no resurrection). Spans all types
// (ids are globally unique UUIDs).
const tombstoned = new Set<string>()

// Timeblock + file in-memory state: one LWW register per (field, id), keyed
// `${field}:${id}` (ids are UUIDs so there is no cross-type collision).
const tbRegs = new Map<string, LWWRegister<unknown>>()
const fileRegs = new Map<string, LWWRegister<unknown>>()

function geomOf(w: Widget): WidgetGeom {
  return { x: w.x, y: w.y, width: w.width, height: w.height }
}

function mkEvent(
  partitionKey: string,
  objectType: 'widget' | 'node' | 'row' | 'table' | 'timeblock' | 'file' | 'document',
  objectId: string,
  field: CrdtField,
  dataClass: CrdtDataClass,
  payload:
    | GeomPayload
    | MembersPayload
    | RegisterPayload
    | CellPayload
    | AttrPayload
    | CreatePayload
    | DeletePayload
): ChangeEvent {
  return {
    id: plexiId(),
    ts: new Date().toISOString(),
    partitionKey,
    objectType,
    objectId,
    field: field as CrdtField,
    dataClass,
    actor,
    payload: payload as ChangeEvent['payload']
  }
}

// Persist an emitted/received event to the local change log. `synced` false for a
// locally-originated edit (it must flush), true for one received from the server.
function recordLocal(ev: ChangeEvent, synced: boolean): void {
  void window.api.crdt.record({
    id: ev.id,
    partitionKey: ev.partitionKey,
    ts: ev.ts,
    objectType: ev.objectType,
    objectId: ev.objectId,
    field: ev.field,
    dataClass: ev.dataClass,
    actor: ev.actor,
    payload: ev.payload,
    synced,
    seq: ev.seq ?? null
  })
}

function send(ev: ChangeEvent): void {
  sendSocketMessage({ type: 'crdtEvent', payload: { event: ev } })
}

// ── Emit (local edits) ───────────────────────────────────────────────────────

function emitGeom(w: Widget): void {
  if (!widgetPart) return
  const geom = geomOf(w)
  const at = Date.now()
  geomRegs.set(w.id, { value: geom, timestamp: at, actor })
  const ev = mkEvent(widgetPart, 'widget', w.id, 'geom', 'register', { geom, at })
  recordLocal(ev, false)
  send(ev)
}

function emitMembership(widgetId: string, from: string | null, to: string | null): void {
  if (!widgetPart) return
  const st = memberState(widgetId)
  const events: ChangeEvent[] = []
  if (from) {
    // Remove the live tags that currently place this widget in `from`. Tags added
    // before the substrate was on aren't tracked here, so a first move off a
    // pre-existing section emits an empty remove — harmless, and correct once the
    // add for that section has also flowed through the log.
    const tags = [...st.adds].filter(([t, s]) => s === from && !st.removes.has(t)).map(([t]) => t)
    for (const t of tags) st.removes.add(t)
    events.push(mkEvent(widgetPart, 'widget', widgetId, 'members', 'set', { op: 'remove', section: from, tags }))
  }
  if (to) {
    const tag = plexiId()
    st.adds.set(tag, to)
    events.push(mkEvent(widgetPart, 'widget', widgetId, 'members', 'set', { op: 'add', section: to, tags: [tag] }))
  }
  for (const ev of events) {
    recordLocal(ev, false)
    send(ev)
  }
}

function emitWidgetCreate(w: Widget): void {
  if (!widgetPart) return
  const at = Date.now()
  const snapshot: Record<string, unknown> = {
    id: w.id,
    taskId: w.taskId,
    kind: w.kind,
    title: w.title,
    content: w.content,
    x: w.x,
    y: w.y,
    width: w.width,
    height: w.height,
    color: w.color ?? null,
    // Create-time metadata that must survive materialisation on another device: a
    // connected-app binding, a duplicate sync-group, launcher/mirror mode, and pin
    // state. Omitting these made a connected-app or linked widget materialise wrong.
    sourceAppId: w.sourceAppId ?? null,
    syncGroupId: w.syncGroupId ?? null,
    mode: w.mode ?? null,
    pinned: w.pinned,
    pinnedZone: w.pinnedZone ?? null
  }
  const ev = mkEvent(widgetPart, 'widget', w.id, 'create', 'set', { snapshot, at })
  recordLocal(ev, false)
  send(ev)
}

function emitWidgetDelete(widgetId: string): void {
  if (!widgetPart) return
  tombstoned.add(widgetId)
  const ev = mkEvent(widgetPart, 'widget', widgetId, 'delete', 'set', { at: Date.now() })
  recordLocal(ev, false)
  send(ev)
}

function emitWidgetFields(
  widgetId: string,
  patch: { content?: string; title?: string; color?: string | null; status?: string | null; zIndex?: number }
): void {
  if (!widgetPart) return
  const at = Date.now()
  const fields: Array<[CrdtField, unknown]> = []
  if (patch.content !== undefined) fields.push(['content', patch.content])
  if (patch.title !== undefined) fields.push(['title', patch.title])
  if (patch.color !== undefined) fields.push(['color', patch.color])
  if (patch.status !== undefined) fields.push(['status', patch.status])
  // zIndex is stacking order — an LWW-per-item register, like sortOrder elsewhere.
  if (patch.zIndex !== undefined) fields.push(['order', patch.zIndex])
  for (const [field, value] of fields) {
    widgetFieldRegs.set(`${field}:${widgetId}`, { value, timestamp: at, actor })
    const ev = mkEvent(widgetPart, 'widget', widgetId, field, 'register', { value, at })
    recordLocal(ev, false)
    send(ev)
  }
}

function emitNodeRegister(nodeId: string, field: 'title' | 'parent', value: unknown): void {
  if (!nodePart) return
  const at = Date.now()
  nodeRegs.set(`${field}:${nodeId}`, { value, timestamp: at, actor })
  const ev = mkEvent(nodePart, 'node', nodeId, field, 'register', { value, at })
  recordLocal(ev, false)
  send(ev)
}

function emitNodeTitle(nodeId: string, title: string): void {
  emitNodeRegister(nodeId, 'title', title)
}
function emitNodeParent(nodeId: string, parentId: string | null): void {
  emitNodeRegister(nodeId, 'parent', parentId)
}

function emitNodeCreate(node: FbNode): void {
  if (!nodePart) return
  const snapshot: Record<string, unknown> = {
    id: node.id,
    parentId: node.parentId,
    kind: node.kind,
    title: node.title,
    description: node.description,
    priority: node.priority,
    interest: node.interest,
    importance: node.importance,
    estimateMinutes: node.estimateMinutes,
    dueDate: node.dueDate,
    isPlan: node.isPlan
  }
  const ev = mkEvent(nodePart, 'node', node.id, 'create', 'set', { snapshot, at: Date.now() })
  recordLocal(ev, false)
  send(ev)
}

function emitNodeDelete(nodeIds: string[]): void {
  if (!nodePart) return
  for (const id of nodeIds) {
    tombstoned.add(id)
    const ev = mkEvent(nodePart, 'node', id, 'delete', 'set', { at: Date.now() })
    recordLocal(ev, false)
    send(ev)
  }
}

// Emit the node's scalar attributes present in a patch as generic 'attr' registers.
function emitNodeAttrs(nodeId: string, patch: Record<string, unknown>): void {
  if (!nodePart) return
  const at = Date.now()
  for (const attr of NODE_ATTR_KEYS) {
    if (!(attr in patch)) continue
    const value = patch[attr]
    attrRegs.set(`node:${nodeId}:${attr}`, { value, timestamp: at, actor })
    const ev = mkEvent(nodePart, 'node', nodeId, 'attr', 'register', { attr, value, at })
    recordLocal(ev, false)
    send(ev)
  }
}

function emitRowCells(rowId: string, cells: Record<string, unknown>): void {
  if (!rowPart) return
  const at = Date.now()
  for (const [column, value] of Object.entries(cells)) {
    rowRegs.set(`${rowId}:${column}`, { value, timestamp: at, actor })
    const ev = mkEvent(rowPart, 'row', rowId, 'cell', 'register', { column, value, at })
    recordLocal(ev, false)
    send(ev)
  }
}

function emitRowOrder(rowId: string, sortOrder: number): void {
  if (!rowPart) return
  const at = Date.now()
  attrRegs.set(`row:${rowId}:sortOrder`, { value: sortOrder, timestamp: at, actor })
  const ev = mkEvent(rowPart, 'row', rowId, 'attr', 'register', { attr: 'sortOrder', value: sortOrder, at })
  recordLocal(ev, false)
  send(ev)
}

function emitRowCreate(row: FbRow): void {
  if (!rowPart) return
  const snapshot: Record<string, unknown> = { id: row.id, tableId: row.tableId, cells: row.cells }
  const ev = mkEvent(rowPart, 'row', row.id, 'create', 'set', { snapshot, at: Date.now() })
  recordLocal(ev, false)
  send(ev)
}
function emitRowDelete(rowId: string): void {
  if (!rowPart) return
  tombstoned.add(rowId)
  const ev = mkEvent(rowPart, 'row', rowId, 'delete', 'set', { at: Date.now() })
  recordLocal(ev, false)
  send(ev)
}
function emitTableCreate(table: FbTable): void {
  if (!rowPart) return
  const snapshot: Record<string, unknown> = {
    id: table.id,
    taskId: table.taskId,
    title: table.title,
    schema: table.schema
  }
  const ev = mkEvent(rowPart, 'table', table.id, 'create', 'set', { snapshot, at: Date.now() })
  recordLocal(ev, false)
  send(ev)
}
function emitTableDelete(tableId: string): void {
  if (!rowPart) return
  tombstoned.add(tableId)
  const ev = mkEvent(rowPart, 'table', tableId, 'delete', 'set', { at: Date.now() })
  recordLocal(ev, false)
  send(ev)
}
function emitTableAttrs(tableId: string, attrs: Record<string, unknown>): void {
  if (!rowPart) return
  const at = Date.now()
  for (const attr of ['title', 'schema'] as const) {
    if (!(attr in attrs)) continue
    const value = attrs[attr]
    attrRegs.set(`table:${tableId}:${attr}`, { value, timestamp: at, actor })
    const ev = mkEvent(rowPart, 'table', tableId, 'attr', 'register', { attr, value, at })
    recordLocal(ev, false)
    send(ev)
  }
}

function emitTimeBlock(
  blockId: string,
  patch: { startMs?: number; durationMin?: number; title?: string; status?: string }
): void {
  if (!tbPart) return
  const at = Date.now()
  const fields: Array<[CrdtField, unknown]> = []
  if (patch.startMs !== undefined) fields.push(['start', patch.startMs])
  if (patch.durationMin !== undefined) fields.push(['duration', patch.durationMin])
  if (patch.title !== undefined) fields.push(['title', patch.title])
  if (patch.status !== undefined) fields.push(['status', patch.status])
  for (const [field, value] of fields) {
    tbRegs.set(`${field}:${blockId}`, { value, timestamp: at, actor })
    const ev = mkEvent(tbPart, 'timeblock', blockId, field, 'register', { value, at })
    recordLocal(ev, false)
    send(ev)
  }
}

function emitFileRegister(entryId: string, field: 'name' | 'parent', value: unknown): void {
  if (!filePart) return
  const at = Date.now()
  fileRegs.set(`${field}:${entryId}`, { value, timestamp: at, actor })
  const ev = mkEvent(filePart, 'file', entryId, field, 'register', { value, at })
  recordLocal(ev, false)
  send(ev)
}
function emitFileName(entryId: string, name: string): void {
  emitFileRegister(entryId, 'name', name)
}
function emitFileParent(entryId: string, parentId: string | null): void {
  emitFileRegister(entryId, 'parent', parentId)
}

function emitTimeBlockCreate(block: TimeBlock): void {
  if (!tbPart) return
  // A single occurrence; a recurring series' expansion stays on the poll.
  const snapshot: Record<string, unknown> = {
    id: block.id,
    taskId: block.taskId,
    title: block.title,
    startMs: block.startMs,
    durationMin: block.durationMin
  }
  const ev = mkEvent(tbPart, 'timeblock', block.id, 'create', 'set', { snapshot, at: Date.now() })
  recordLocal(ev, false)
  send(ev)
}
function emitTimeBlockDelete(blockId: string): void {
  if (!tbPart) return
  tombstoned.add(blockId)
  const ev = mkEvent(tbPart, 'timeblock', blockId, 'delete', 'set', { at: Date.now() })
  recordLocal(ev, false)
  send(ev)
}

function emitFileCreate(entry: FileEntry): void {
  if (!filePart) return
  // Folders are pure metadata; file-blob entries' bytes ride the poll + blob sync,
  // so only the folder create is emitted here (name/parent still sync for all).
  if (entry.kind !== 'folder') return
  const snapshot: Record<string, unknown> = { id: entry.id, parentId: entry.parentId, name: entry.name }
  const ev = mkEvent(filePart, 'file', entry.id, 'create', 'set', { snapshot, at: Date.now() })
  recordLocal(ev, false)
  send(ev)
}
function emitFileDelete(entryId: string): void {
  if (!filePart) return
  tombstoned.add(entryId)
  const ev = mkEvent(filePart, 'file', entryId, 'delete', 'set', { at: Date.now() })
  recordLocal(ev, false)
  send(ev)
}

function emitDocumentCreate(doc: FbDocument): void {
  if (!docPart) return
  // Metadata only — the body is carried by Yjs (org) / the poll (personal) until
  // the text-class fold. A create materialises an empty doc of the right type; the
  // body then flows through its own channel.
  const snapshot: Record<string, unknown> = { id: doc.id, docType: doc.docType, title: doc.title }
  const ev = mkEvent(docPart, 'document', doc.id, 'create', 'set', { snapshot, at: Date.now() })
  recordLocal(ev, false)
  send(ev)
}
function emitDocumentDelete(docId: string): void {
  if (!docPart) return
  tombstoned.add(docId)
  const ev = mkEvent(docPart, 'document', docId, 'delete', 'set', { at: Date.now() })
  recordLocal(ev, false)
  send(ev)
}
function emitDocumentAttrs(docId: string, attrs: Record<string, unknown>): void {
  if (!docPart) return
  const at = Date.now()
  for (const attr of ['title', 'archived'] as const) {
    if (!(attr in attrs)) continue
    const value = attrs[attr]
    attrRegs.set(`document:${docId}:${attr}`, { value, timestamp: at, actor })
    const ev = mkEvent(docPart, 'document', docId, 'attr', 'register', { attr, value, at })
    recordLocal(ev, false)
    send(ev)
  }
}

// ── Apply (remote events) ─────────────────────────────────────────────────────

// ── Cross-type create ordering: pending-create buffer ─────────────────────────
// A create event can arrive before the parent it references exists locally — a
// widget before its task's node, a row before its table, a subtask before its
// parent — because each type syncs in its own partition and events race. The
// window.api.*.create then fails a FOREIGN KEY check. Dropping the create there
// (the old `catch { return }`) was silent data loss; instead we buffer the attempt
// and retry it: immediately when any create succeeds (a freshly-arrived parent may
// unblock a dependent) and on a short backstop timer (covers a parent that lands
// via the poll rather than the log). Attempts are idempotent (create-if-missing)
// and bounded, and the poll remains the ultimate safety net.
interface PendingCreate {
  attempt: () => Promise<boolean> // resolves true when it succeeded (or is moot)
  tries: number
}
const pendingCreates = new Map<string, PendingCreate>()
let drainTimer: ReturnType<typeof setTimeout> | null = null

function armDrain(): void {
  if (drainTimer || pendingCreates.size === 0) return
  drainTimer = setTimeout(() => {
    drainTimer = null
    void drainPending()
  }, 1500)
}
async function drainPending(): Promise<void> {
  for (const [key, p] of [...pendingCreates.entries()]) {
    const ok = await p.attempt().catch(() => false)
    if (ok) pendingCreates.delete(key)
    else if (++p.tries >= 40) pendingCreates.delete(key) // ~60s; give up, the poll backstops
  }
  if (pendingCreates.size) armDrain()
}
// Run a create attempt; on failure buffer it for retry so it is never dropped. On
// success, poke the buffer in case the new object unblocks a waiting dependent.
function applyCreateGuarded(key: string, attempt: () => Promise<boolean>): void {
  void attempt().then((ok) => {
    if (ok) {
      if (pendingCreates.size) void drainPending()
    } else if (!pendingCreates.has(key)) {
      pendingCreates.set(key, { attempt, tries: 0 })
      armDrain()
    }
  })
}

// Persist a remotely-won value and reflect it in the store WITHOUT going through
// the store's own mutation (which would re-emit and loop). The window.api.* write
// hits the base row (and marks it for the poll — the intended dual-write); setState
// updates the open view in place.
async function applyGeomToWidget(id: string, geom: WidgetGeom): Promise<void> {
  try {
    await window.api.widgets.update(id, geom)
  } catch {
    /* not on this device's open task; the base write still lands */
  }
  useWidgetStore.setState((s) => ({
    widgets: s.widgets.map((w) => (w.id === id ? { ...w, ...geom } : w))
  }))
}

function applyWidgetCreate(snapshot: Record<string, unknown>): void {
  const id = snapshot.id as string
  if (!id || tombstoned.has(id)) return
  applyCreateGuarded(`widget:${id}`, () => tryCreateWidget(snapshot))
}
async function tryCreateWidget(snapshot: Record<string, unknown>): Promise<boolean> {
  const id = snapshot.id as string
  if (tombstoned.has(id)) return true // deleted meanwhile — nothing to create
  let created: Widget | null = null
  try {
    // create-if-missing by id (main honours the provided id + returns the existing
    // row if it is already there), so a replayed/echoed create never duplicates.
    created = await window.api.widgets.create(snapshot as never)
  } catch {
    return false // parent task not present locally yet — keep buffered, retry
  }
  if (!created) return false
  // Reflect only if the widget's task is already loaded in the store (its desk is
  // open); otherwise it materialises when that desk is next opened. The base write
  // above is what makes it durable regardless.
  const st = useWidgetStore.getState()
  if (st.widgets.some((w) => w.taskId === created!.taskId) && !st.widgets.some((w) => w.id === created!.id)) {
    useWidgetStore.setState({ widgets: [...st.widgets, created] })
  }
  return true
}

async function applyWidgetDelete(id: string): Promise<void> {
  tombstoned.add(id)
  try {
    await window.api.widgets.delete(id) // soft-delete (recoverable), matches local remove()
  } catch {
    /* not present locally — the tombstone still guards against a later create */
  }
  useWidgetStore.setState((s) => ({ widgets: s.widgets.filter((w) => w.id !== id) }))
}

async function applyWidgetField(id: string, field: CrdtField, value: unknown): Promise<void> {
  const patch: Record<string, unknown> = {}
  if (field === 'content') patch.content = value
  else if (field === 'title') patch.title = value
  else if (field === 'color') patch.color = value
  else if (field === 'status') patch.status = value
  else if (field === 'order') patch.zIndex = value
  try {
    await window.api.widgets.update(id, patch)
  } catch {
    /* not on this device's open task; base write still lands */
  }
  useWidgetStore.setState((s) => ({
    widgets: s.widgets.map((w) => (w.id === id ? { ...w, ...patch } : w))
  }))
}

async function applyMemberToWidget(id: string, section: string | null): Promise<void> {
  try {
    await window.api.widgets.update(id, { parentSectionId: section })
  } catch {
    /* not on the open task; base write still lands */
  }
  useWidgetStore.setState((s) => ({
    widgets: s.widgets.map((w) => (w.id === id ? { ...w, parentSectionId: section } : w))
  }))
}

async function applyNodeTitle(id: string, title: string): Promise<void> {
  try {
    await window.api.nodes.update(id, { title })
  } catch {
    /* best effort; the poll remains the safety net */
  }
  useNodeStore.setState((s) => ({ nodes: s.nodes.map((n) => (n.id === id ? { ...n, title } : n)) }))
}

async function applyNodeParent(id: string, parentId: string | null): Promise<void> {
  try {
    // move() is the validated reparent path (rejects cycles); beforeId null appends
    // at the end since sibling ordering isn't part of this slice.
    await window.api.nodes.move(id, parentId, null)
  } catch {
    /* rejected (cycle/missing) or not present locally — leave state as is */
  }
  useNodeStore.setState((s) => ({ nodes: s.nodes.map((n) => (n.id === id ? { ...n, parentId } : n)) }))
}

function applyNodeCreate(snapshot: Record<string, unknown>): void {
  const id = snapshot.id as string
  if (!id || tombstoned.has(id)) return
  applyCreateGuarded(`node:${id}`, () => tryCreateNode(snapshot))
}
async function tryCreateNode(snapshot: Record<string, unknown>): Promise<boolean> {
  const id = snapshot.id as string
  if (tombstoned.has(id)) return true
  let created: FbNode | null = null
  try {
    created = await window.api.nodes.create(snapshot as never)
  } catch {
    return false // parent node not present yet — keep buffered
  }
  if (!created) return false
  const st = useNodeStore.getState()
  if (!st.nodes.some((n) => n.id === created!.id)) {
    useNodeStore.setState({ nodes: [...st.nodes, created] })
  }
  return true
}

async function applyNodeDelete(id: string): Promise<void> {
  tombstoned.add(id)
  let removed: string[] = [id]
  try {
    removed = (await window.api.nodes.delete(id)) ?? [id]
  } catch {
    /* not present locally — tombstone still guards a later create */
  }
  for (const r of removed) tombstoned.add(r)
  useNodeStore.setState((s) => ({ nodes: s.nodes.filter((n) => !removed.includes(n.id)) }))
}

async function applyNodeAttr(id: string, attr: string, value: unknown): Promise<void> {
  try {
    await window.api.nodes.update(id, { [attr]: value } as never)
  } catch {
    /* not present locally — the poll reconciles it */
  }
  useNodeStore.setState((s) => ({
    nodes: s.nodes.map((n) => (n.id === id ? ({ ...n, [attr]: value } as typeof n) : n))
  }))
}

async function applyCellToRow(rowId: string, column: string, value: unknown): Promise<void> {
  try {
    await window.api.tables.updateRow(rowId, { cells: { [column]: value } })
  } catch {
    /* the row may not exist on this device yet (creation rides the poll) — the base
       write is skipped and the poll reconciles it; no data is lost */
  }
  const rows = useTablesStore.getState().rows
  let changed = false
  const next: Record<string, FbRow[]> = {}
  for (const [tableId, list] of Object.entries(rows)) {
    const idx = list.findIndex((r) => r.id === rowId)
    if (idx === -1) {
      next[tableId] = list
      continue
    }
    const copy = [...list]
    copy[idx] = { ...copy[idx], cells: { ...copy[idx].cells, [column]: value } }
    next[tableId] = copy
    changed = true
  }
  if (changed) useTablesStore.setState({ rows: next })
}

function applyRowCreate(snapshot: Record<string, unknown>): void {
  const id = snapshot.id as string
  if (!id || tombstoned.has(id)) return
  applyCreateGuarded(`row:${id}`, () => tryCreateRow(snapshot))
}
async function tryCreateRow(snapshot: Record<string, unknown>): Promise<boolean> {
  const id = snapshot.id as string
  const tableId = snapshot.tableId as string
  if (tombstoned.has(id)) return true
  let created: FbRow | null = null
  try {
    created = await window.api.tables.createRow(snapshot as never)
  } catch {
    return false // parent table not present yet — keep buffered
  }
  if (!created) return false
  // Reflect only if that table's rows are already loaded in the store.
  const rows = useTablesStore.getState().rows
  if (rows[tableId] && !rows[tableId].some((r) => r.id === id)) {
    useTablesStore.setState({ rows: { ...rows, [tableId]: [...rows[tableId], created] } })
  }
  return true
}

async function applyRowAttr(id: string, attr: string, value: unknown): Promise<void> {
  try {
    await window.api.tables.updateRow(id, { [attr]: value } as never)
  } catch {
    /* not present locally — the poll reconciles it */
  }
  const rows = useTablesStore.getState().rows
  const next: Record<string, FbRow[]> = {}
  let changed = false
  for (const [tid, list] of Object.entries(rows)) {
    const idx = list.findIndex((r) => r.id === id)
    if (idx === -1) {
      next[tid] = list
      continue
    }
    const copy = [...list]
    copy[idx] = { ...copy[idx], [attr]: value } as FbRow
    next[tid] = copy
    changed = true
  }
  if (changed) useTablesStore.setState({ rows: next })
}

async function applyRowDelete(id: string): Promise<void> {
  tombstoned.add(id)
  try {
    await window.api.tables.deleteRow(id)
  } catch {
    /* not present locally — tombstone still guards a later create */
  }
  const rows = useTablesStore.getState().rows
  const next: Record<string, FbRow[]> = {}
  let changed = false
  for (const [tid, list] of Object.entries(rows)) {
    const filtered = list.filter((r) => r.id !== id)
    next[tid] = filtered
    if (filtered.length !== list.length) changed = true
  }
  if (changed) useTablesStore.setState({ rows: next })
}

function applyTableCreate(snapshot: Record<string, unknown>): void {
  const id = snapshot.id as string
  if (!id || tombstoned.has(id)) return
  applyCreateGuarded(`table:${id}`, () => tryCreateTable(snapshot))
}
async function tryCreateTable(snapshot: Record<string, unknown>): Promise<boolean> {
  if (tombstoned.has(snapshot.id as string)) return true
  try {
    const created = await window.api.tables.create(snapshot as never)
    if (!created) return false
    useTablesStore.setState((s) => ({ tables: { ...s.tables, [created.id]: created } }))
    return true
  } catch {
    return false // parent task not present yet — keep buffered
  }
}

async function applyTableDelete(id: string): Promise<void> {
  tombstoned.add(id)
  try {
    await window.api.tables.delete(id)
  } catch {
    /* not present locally / no-op */
  }
  useTablesStore.setState((s) => {
    const tables = { ...s.tables }
    delete tables[id]
    const rows = { ...s.rows }
    delete rows[id]
    return { tables, rows }
  })
}

async function applyTableAttr(id: string, attr: string, value: unknown): Promise<void> {
  try {
    await window.api.tables.update(id, { [attr]: value } as never)
  } catch {
    /* not present locally — the poll reconciles it */
  }
  useTablesStore.setState((s) => {
    const t = s.tables[id]
    if (!t) return {}
    return { tables: { ...s.tables, [id]: { ...t, [attr]: value } as typeof t } }
  })
}

async function applyTimeBlock(id: string, field: CrdtField, value: unknown): Promise<void> {
  const patch: Record<string, unknown> = {}
  if (field === 'start') patch.startMs = value
  else if (field === 'duration') patch.durationMin = value
  else if (field === 'title') patch.title = value
  else if (field === 'status') patch.status = value
  try {
    await window.api.timeBlocks.update(id, patch)
  } catch {
    /* not present locally — the poll reconciles it */
  }
  // Reload the visible range so a moved/retitled block reflects; low-frequency
  // (remote edits only), so a full range reload is fine.
  void useTimeBlockStore.getState().reload()
}

async function applyFile(id: string, field: CrdtField, value: unknown): Promise<void> {
  try {
    if (field === 'name') await window.api.fileManager.rename(id, value as string)
    else await window.api.fileManager.move(id, value as string | null)
  } catch {
    /* rejected or not present locally — the poll reconciles it */
  }
  void useFileManagerStore.getState().refresh()
}

function applyTimeBlockCreate(snapshot: Record<string, unknown>): void {
  const id = snapshot.id as string
  if (!id || tombstoned.has(id)) return
  applyCreateGuarded(`timeblock:${id}`, () => tryCreateTimeBlock(snapshot))
}
async function tryCreateTimeBlock(snapshot: Record<string, unknown>): Promise<boolean> {
  if (tombstoned.has(snapshot.id as string)) return true
  try {
    await window.api.timeBlocks.create(snapshot as never)
  } catch {
    return false // linked task not present yet — keep buffered
  }
  void useTimeBlockStore.getState().reload()
  return true
}
async function applyTimeBlockDelete(id: string): Promise<void> {
  tombstoned.add(id)
  try {
    await window.api.timeBlocks.delete(id, 'one')
  } catch {
    /* not present locally — tombstone still guards a later create */
  }
  void useTimeBlockStore.getState().reload()
}

function applyFileCreate(snapshot: Record<string, unknown>): void {
  const id = snapshot.id as string
  if (!id || tombstoned.has(id)) return
  applyCreateGuarded(`file:${id}`, () => tryCreateFile(snapshot))
}
async function tryCreateFile(snapshot: Record<string, unknown>): Promise<boolean> {
  if (tombstoned.has(snapshot.id as string)) return true
  try {
    await window.api.fileManager.createFolder(
      (snapshot.parentId as string | null) ?? null,
      snapshot.name as string,
      snapshot.id as string
    )
  } catch {
    return false // parent folder not present yet — keep buffered
  }
  void useFileManagerStore.getState().refresh()
  return true
}
async function applyFileDelete(id: string): Promise<void> {
  tombstoned.add(id)
  try {
    await window.api.fileManager.delete(id)
  } catch {
    /* not present locally — tombstone still guards a later create */
  }
  void useFileManagerStore.getState().refresh()
}

function applyDocumentCreate(snapshot: Record<string, unknown>): void {
  const id = snapshot.id as string
  if (!id || tombstoned.has(id)) return
  applyCreateGuarded(`document:${id}`, () => tryCreateDocument(snapshot))
}
async function tryCreateDocument(snapshot: Record<string, unknown>): Promise<boolean> {
  if (tombstoned.has(snapshot.id as string)) return true
  try {
    await window.api.documents.create(snapshot as never)
  } catch {
    return false
  }
  void useDocumentsStore.getState().refresh()
  return true
}
async function applyDocumentDelete(id: string): Promise<void> {
  tombstoned.add(id)
  try {
    await window.api.documents.delete(id)
  } catch {
    /* not present locally — tombstone still guards a later create */
  }
  void useDocumentsStore.getState().refresh()
}
async function applyDocumentAttr(id: string, attr: string, value: unknown): Promise<void> {
  try {
    await window.api.documents.update(id, { [attr]: value } as never)
  } catch {
    /* not present locally — the poll reconciles it */
  }
  void useDocumentsStore.getState().refresh()
}

function applyEvent(ev: ChangeEvent): void {
  // Record it locally (idempotent) so a reload can re-fold and it survives offline.
  recordLocal(ev, true)
  if (ev.objectType === 'widget') {
    if (ev.field === 'create') {
      void applyWidgetCreate((ev.payload as CreatePayload).snapshot)
    } else if (ev.field === 'delete') {
      void applyWidgetDelete(ev.objectId)
    } else if (
      ev.field === 'content' ||
      ev.field === 'title' ||
      ev.field === 'color' ||
      ev.field === 'status' ||
      ev.field === 'order'
    ) {
      const remote = registerOf(ev)
      const key = `${ev.field}:${ev.objectId}`
      const local = widgetFieldRegs.get(key) ?? null
      const merged = local ? lwwMerge(local, remote) : remote
      widgetFieldRegs.set(key, merged)
      if (merged === remote) void applyWidgetField(ev.objectId, ev.field, remote.value)
    } else if (ev.field === 'geom' && (ev.payload as GeomPayload).geom !== undefined) {
      const remote = geomRegisterOf(ev)
      const local = geomRegs.get(ev.objectId) ?? null
      const merged = local ? lwwMerge(local, remote) : remote
      geomRegs.set(ev.objectId, merged)
      if (merged === remote) void applyGeomToWidget(ev.objectId, remote.value)
    } else if (ev.field === 'members' && (ev.payload as MembersPayload).op !== undefined) {
      const p = ev.payload as MembersPayload
      const st = memberState(ev.objectId)
      if (p.op === 'add') {
        for (const t of p.tags) st.adds.set(t, p.section)
      } else {
        for (const t of p.tags) st.removes.add(t)
      }
      const next = resolvedSection({ geom: null, sections: liveSections(st) })
      const cur = useWidgetStore.getState().widgets.find((w) => w.id === ev.objectId)?.parentSectionId ?? null
      if (next !== cur) void applyMemberToWidget(ev.objectId, next)
    }
  } else if (ev.objectType === 'node') {
    if (ev.field === 'create') {
      void applyNodeCreate((ev.payload as CreatePayload).snapshot)
    } else if (ev.field === 'delete') {
      void applyNodeDelete(ev.objectId)
    } else if (ev.field === 'attr' && (ev.payload as AttrPayload).at !== undefined) {
      const p = ev.payload as AttrPayload
      const remote = registerOf(ev)
      const key = `node:${ev.objectId}:${p.attr}`
      const local = attrRegs.get(key) ?? null
      const merged = local ? lwwMerge(local, remote) : remote
      attrRegs.set(key, merged)
      if (merged === remote) void applyNodeAttr(ev.objectId, p.attr, remote.value)
    } else if ((ev.field === 'title' || ev.field === 'parent') && (ev.payload as RegisterPayload).at !== undefined) {
      const remote = registerOf(ev)
      const key = `${ev.field}:${ev.objectId}`
      const local = nodeRegs.get(key) ?? null
      const merged = local ? lwwMerge(local, remote) : remote
      nodeRegs.set(key, merged)
      if (merged === remote) {
        if (ev.field === 'title') void applyNodeTitle(ev.objectId, remote.value as string)
        else void applyNodeParent(ev.objectId, remote.value as string | null)
      }
    }
  } else if (ev.objectType === 'row') {
    if (ev.field === 'create') {
      void applyRowCreate((ev.payload as CreatePayload).snapshot)
    } else if (ev.field === 'delete') {
      void applyRowDelete(ev.objectId)
    } else if (ev.field === 'cell' && typeof (ev.payload as CellPayload).column === 'string' && (ev.payload as CellPayload).at !== undefined) {
      const p = ev.payload as CellPayload
      const remote = registerOf(ev)
      const key = `${ev.objectId}:${p.column}`
      const local = rowRegs.get(key) ?? null
      const merged = local ? lwwMerge(local, remote) : remote
      rowRegs.set(key, merged)
      if (merged === remote) void applyCellToRow(ev.objectId, p.column, remote.value)
    } else if (ev.field === 'attr' && (ev.payload as AttrPayload).at !== undefined) {
      const p = ev.payload as AttrPayload
      const remote = registerOf(ev)
      const key = `row:${ev.objectId}:${p.attr}`
      const local = attrRegs.get(key) ?? null
      const merged = local ? lwwMerge(local, remote) : remote
      attrRegs.set(key, merged)
      if (merged === remote) void applyRowAttr(ev.objectId, p.attr, remote.value)
    }
  } else if (ev.objectType === 'table') {
    if (ev.field === 'create') {
      void applyTableCreate((ev.payload as CreatePayload).snapshot)
    } else if (ev.field === 'delete') {
      void applyTableDelete(ev.objectId)
    } else if (ev.field === 'attr' && (ev.payload as AttrPayload).at !== undefined) {
      const p = ev.payload as AttrPayload
      const remote = registerOf(ev)
      const key = `table:${ev.objectId}:${p.attr}`
      const local = attrRegs.get(key) ?? null
      const merged = local ? lwwMerge(local, remote) : remote
      attrRegs.set(key, merged)
      if (merged === remote) void applyTableAttr(ev.objectId, p.attr, remote.value)
    }
  } else if (ev.objectType === 'timeblock') {
    const f = ev.field
    if (f === 'create') {
      void applyTimeBlockCreate((ev.payload as CreatePayload).snapshot)
    } else if (f === 'delete') {
      void applyTimeBlockDelete(ev.objectId)
    } else if (
      (f === 'start' || f === 'duration' || f === 'title' || f === 'status') &&
      (ev.payload as RegisterPayload).at !== undefined
    ) {
      const remote = registerOf(ev)
      const key = `${f}:${ev.objectId}`
      const local = tbRegs.get(key) ?? null
      const merged = local ? lwwMerge(local, remote) : remote
      tbRegs.set(key, merged)
      if (merged === remote) void applyTimeBlock(ev.objectId, f, remote.value)
    }
  } else if (ev.objectType === 'file') {
    const f = ev.field
    if (f === 'create') {
      void applyFileCreate((ev.payload as CreatePayload).snapshot)
    } else if (f === 'delete') {
      void applyFileDelete(ev.objectId)
    } else if ((f === 'name' || f === 'parent') && (ev.payload as RegisterPayload).at !== undefined) {
      const remote = registerOf(ev)
      const key = `${f}:${ev.objectId}`
      const local = fileRegs.get(key) ?? null
      const merged = local ? lwwMerge(local, remote) : remote
      fileRegs.set(key, merged)
      if (merged === remote) void applyFile(ev.objectId, f, remote.value)
    }
  } else if (ev.objectType === 'document') {
    if (ev.field === 'create') {
      void applyDocumentCreate((ev.payload as CreatePayload).snapshot)
    } else if (ev.field === 'delete') {
      void applyDocumentDelete(ev.objectId)
    } else if (ev.field === 'attr' && (ev.payload as AttrPayload).at !== undefined) {
      const p = ev.payload as AttrPayload
      const remote = registerOf(ev)
      const key = `document:${ev.objectId}:${p.attr}`
      const local = attrRegs.get(key) ?? null
      const merged = local ? lwwMerge(local, remote) : remote
      attrRegs.set(key, merged)
      if (merged === remote) void applyDocumentAttr(ev.objectId, p.attr, remote.value)
    }
  }
}

// ── Socket lifecycle ──────────────────────────────────────────────────────────

function onCrdt(e: CrdtSocketEvent): void {
  if (e.type === 'crdtSync') {
    const events = e.payload.events as ChangeEvent[]
    for (const ev of events) applyEvent(ev)
    // Everything in the replay is on the server, so any of our own queued events
    // present here are now synced.
    if (events.length) {
      void window.api.crdt.markSynced(events.map((ev) => ({ id: ev.id, seq: ev.seq ?? null })))
    }
  } else {
    applyEvent(e.payload.event as ChangeEvent)
  }
}

function onReauth(): void {
  // Join each enabled partition (the server relays only to joined sockets), then
  // flush the shared offline queue.
  const parts = [widgetPart, nodePart, rowPart, tbPart, filePart, docPart]
  for (const pk of parts) {
    if (pk) sendSocketMessage({ type: 'crdtJoin', payload: { partitionKey: pk } })
  }
  if (parts.some(Boolean)) void flushUnsynced()
}

async function flushUnsynced(): Promise<void> {
  try {
    const pending = await window.api.crdt.unsynced(1000)
    if (!pending.length) return
    for (const e of pending) {
      send({
        id: e.id,
        ts: e.ts,
        partitionKey: e.partitionKey,
        objectType: e.objectType as 'widget' | 'node' | 'row' | 'table' | 'timeblock' | 'file' | 'document',
        objectId: e.objectId,
        field: e.field as CrdtField,
        dataClass: e.dataClass as CrdtDataClass,
        actor: e.actor,
        payload: e.payload as GeomPayload | MembersPayload | RegisterPayload | CellPayload,
        seq: e.seq ?? undefined
      } as ChangeEvent)
    }
    // Optimistic mark: the frames went out over an open socket, the server dedupes
    // by id, and the base data also rides the workspace poll — so marking these
    // synced now cannot lose data even if a frame drops (at worst the log entry
    // reappears on the next join replay). It stops us re-flushing forever.
    await window.api.crdt.markSynced(pending.map((e) => ({ id: e.id })))
  } catch {
    /* best effort — the poll remains the safety net */
  }
}

// Start the engine for the signed-in account. Idempotent. No-op (and unregisters
// any prior wiring) when every type flag is off, so toggling the flags off and
// reloading returns the app to pure-poll behaviour.
export function initCrdtSync(): void {
  const wEnabled = crdtWidgetsEnabled()
  const nEnabled = crdtNodesEnabled()
  const tEnabled = crdtTablesEnabled()
  const tbEnabled = crdtTimeBlocksEnabled()
  const fEnabled = crdtFilesEnabled()
  const dEnabled = crdtDocumentsEnabled()
  if (!wEnabled && !nEnabled && !tEnabled && !tbEnabled && !fEnabled && !dEnabled) {
    stopCrdtSync()
    return
  }
  const acct = useAccountStore.getState().account
  if (!acct) return // called again by App once signed in
  actor = `${acct.id}:${deviceId()}`
  widgetPart = wEnabled ? widgetPartition(acct.id) : null
  nodePart = nEnabled ? nodePartition(acct.id) : null
  rowPart = tEnabled ? rowPartition(acct.id) : null
  tbPart = tbEnabled ? timeBlockPartition(acct.id) : null
  filePart = fEnabled ? filePartition(acct.id) : null
  docPart = dEnabled ? documentPartition(acct.id) : null
  if (!started) {
    setCrdtSocketHandler(onCrdt)
    setCrdtOpenHandler(onReauth)
    registerCrdtEmit({
      geom: emitGeom,
      membership: emitMembership,
      widgetCreate: emitWidgetCreate,
      widgetDelete: emitWidgetDelete,
      widgetFields: emitWidgetFields,
      nodeTitle: emitNodeTitle,
      nodeParent: emitNodeParent,
      nodeCreate: emitNodeCreate,
      nodeDelete: emitNodeDelete,
      nodeAttrs: emitNodeAttrs,
      rowCells: emitRowCells,
      rowOrder: emitRowOrder,
      rowCreate: emitRowCreate,
      rowDelete: emitRowDelete,
      tableCreate: emitTableCreate,
      tableDelete: emitTableDelete,
      tableAttrs: emitTableAttrs,
      timeBlock: emitTimeBlock,
      timeBlockCreate: emitTimeBlockCreate,
      timeBlockDelete: emitTimeBlockDelete,
      fileName: emitFileName,
      fileParent: emitFileParent,
      fileCreate: emitFileCreate,
      fileDelete: emitFileDelete,
      documentCreate: emitDocumentCreate,
      documentDelete: emitDocumentDelete,
      documentAttrs: emitDocumentAttrs
    })
    started = true
  }
  // If the socket is already authenticated, onReauth won't fire again on its own —
  // join now. If it isn't, the join is idempotent when onReauth fires on connect.
  onReauth()
}

export function stopCrdtSync(): void {
  for (const pk of [widgetPart, nodePart, rowPart, tbPart, filePart, docPart]) {
    if (pk) sendSocketMessage({ type: 'crdtLeave', payload: { partitionKey: pk } })
  }
  registerCrdtEmit(null)
  setCrdtSocketHandler(null)
  setCrdtOpenHandler(null)
  geomRegs.clear()
  memberStates.clear()
  nodeRegs.clear()
  attrRegs.clear()
  rowRegs.clear()
  tbRegs.clear()
  fileRegs.clear()
  widgetFieldRegs.clear()
  tombstoned.clear()
  pendingCreates.clear()
  if (drainTimer) {
    clearTimeout(drainTimer)
    drainTimer = null
  }
  widgetPart = null
  nodePart = null
  rowPart = null
  tbPart = null
  filePart = null
  docPart = null
  actor = ''
  started = false
}
