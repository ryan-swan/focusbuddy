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
  type CellPayload
} from '@shared/crdtWidgetMerge'
import { useAccountStore } from '../stores/account'
import { useWidgetStore } from '../stores/widgets'
import { useNodeStore } from '../stores/nodes'
import { useTablesStore } from '../stores/tables'
import { useTimeBlockStore } from '../stores/timeBlocks'
import { useFileManagerStore } from '../stores/fileManager'
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
  deviceId,
  widgetPartition,
  nodePartition,
  rowPartition,
  timeBlockPartition,
  filePartition
} from './syncFlags'
import type { Widget } from '@shared/types'
import type { FbRow } from '@shared/fields'

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

// Row in-memory state: one LWW register per (row, column), keyed `${rowId}:${column}`.
const rowRegs = new Map<string, LWWRegister<unknown>>()

// Timeblock + file in-memory state: one LWW register per (field, id), keyed
// `${field}:${id}` (ids are UUIDs so there is no cross-type collision).
const tbRegs = new Map<string, LWWRegister<unknown>>()
const fileRegs = new Map<string, LWWRegister<unknown>>()

function geomOf(w: Widget): WidgetGeom {
  return { x: w.x, y: w.y, width: w.width, height: w.height }
}

function mkEvent(
  partitionKey: string,
  objectType: 'widget' | 'node' | 'row' | 'timeblock' | 'file',
  objectId: string,
  field: CrdtField,
  dataClass: CrdtDataClass,
  payload: GeomPayload | MembersPayload | RegisterPayload | CellPayload
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

// ── Apply (remote events) ─────────────────────────────────────────────────────

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

function applyEvent(ev: ChangeEvent): void {
  // Record it locally (idempotent) so a reload can re-fold and it survives offline.
  recordLocal(ev, true)
  if (ev.objectType === 'widget') {
    if (ev.field === 'geom' && (ev.payload as GeomPayload).geom !== undefined) {
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
    if ((ev.field === 'title' || ev.field === 'parent') && (ev.payload as RegisterPayload).at !== undefined) {
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
    const p = ev.payload as CellPayload
    if (ev.field === 'cell' && typeof p.column === 'string' && p.at !== undefined) {
      const remote = registerOf(ev)
      const key = `${ev.objectId}:${p.column}`
      const local = rowRegs.get(key) ?? null
      const merged = local ? lwwMerge(local, remote) : remote
      rowRegs.set(key, merged)
      if (merged === remote) void applyCellToRow(ev.objectId, p.column, remote.value)
    }
  } else if (ev.objectType === 'timeblock') {
    const f = ev.field
    if (
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
    if ((f === 'name' || f === 'parent') && (ev.payload as RegisterPayload).at !== undefined) {
      const remote = registerOf(ev)
      const key = `${f}:${ev.objectId}`
      const local = fileRegs.get(key) ?? null
      const merged = local ? lwwMerge(local, remote) : remote
      fileRegs.set(key, merged)
      if (merged === remote) void applyFile(ev.objectId, f, remote.value)
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
  const parts = [widgetPart, nodePart, rowPart, tbPart, filePart]
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
        objectType: e.objectType as 'widget' | 'node' | 'row' | 'timeblock' | 'file',
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
  if (!wEnabled && !nEnabled && !tEnabled && !tbEnabled && !fEnabled) {
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
  if (!started) {
    setCrdtSocketHandler(onCrdt)
    setCrdtOpenHandler(onReauth)
    registerCrdtEmit({
      geom: emitGeom,
      membership: emitMembership,
      nodeTitle: emitNodeTitle,
      nodeParent: emitNodeParent,
      rowCells: emitRowCells,
      timeBlock: emitTimeBlock,
      fileName: emitFileName,
      fileParent: emitFileParent
    })
    started = true
  }
  // If the socket is already authenticated, onReauth won't fire again on its own —
  // join now. If it isn't, the join is idempotent when onReauth fires on connect.
  onReauth()
}

export function stopCrdtSync(): void {
  for (const pk of [widgetPart, nodePart, rowPart, tbPart, filePart]) {
    if (pk) sendSocketMessage({ type: 'crdtLeave', payload: { partitionKey: pk } })
  }
  registerCrdtEmit(null)
  setCrdtSocketHandler(null)
  setCrdtOpenHandler(null)
  geomRegs.clear()
  memberStates.clear()
  nodeRegs.clear()
  rowRegs.clear()
  tbRegs.clear()
  fileRegs.clear()
  widgetPart = null
  nodePart = null
  rowPart = null
  tbPart = null
  filePart = null
  actor = ''
  started = false
}
