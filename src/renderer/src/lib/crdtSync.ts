import { plexiId } from '@shared/plexiId'
import { lwwMerge, type LWWRegister } from '@shared/crdt'
import {
  geomRegisterOf,
  resolvedSection,
  type ChangeEvent,
  type CrdtField,
  type CrdtDataClass,
  type WidgetGeom,
  type GeomPayload,
  type MembersPayload
} from '@shared/crdtWidgetMerge'
import { useAccountStore } from '../stores/account'
import { useWidgetStore } from '../stores/widgets'
import {
  sendSocketMessage,
  setCrdtSocketHandler,
  setCrdtOpenHandler,
  type CrdtSocketEvent
} from './messagingSocket'
import { registerCrdtEmit } from './crdtBridge'
import { crdtWidgetsEnabled, deviceId, widgetPartition } from './syncFlags'
import type { Widget } from '@shared/types'

// WS01 sync substrate — the client sync engine for widgets.
//
// This is the first type routed through the one CRDT change log. A local widget edit
// becomes a ChangeEvent: geometry (position + size) as an LWW register, section
// membership as an OR-Set. Each event is persisted to the local change log (the
// offline queue) and sent over the existing websocket; incoming events are merged
// and applied. It runs ALONGSIDE the twenty-second workspace poll, not instead of
// it, so nothing regresses while the flag is off and the poll stays the safety net
// for a dropped frame. The merge logic itself lives in @shared/crdtWidgetMerge and
// is exercised directly by the convergence test.

let partition: string | null = null
let actor = ''
let started = false

// In-memory converged state, seeded lazily. Geometry: the current LWW register per
// widget. Membership: the OR-Set add tags and remove tombstones per widget.
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

function geomOf(w: Widget): WidgetGeom {
  return { x: w.x, y: w.y, width: w.width, height: w.height }
}

function mkEvent(
  objectId: string,
  field: CrdtField,
  dataClass: CrdtDataClass,
  payload: GeomPayload | MembersPayload
): ChangeEvent {
  return {
    id: plexiId(),
    ts: new Date().toISOString(),
    partitionKey: partition ?? '',
    objectType: 'widget',
    objectId,
    field,
    dataClass,
    actor,
    payload
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
  if (!partition) return
  const geom = geomOf(w)
  const at = Date.now()
  geomRegs.set(w.id, { value: geom, timestamp: at, actor })
  const ev = mkEvent(w.id, 'geom', 'register', { geom, at })
  recordLocal(ev, false)
  send(ev)
}

function emitMembership(widgetId: string, from: string | null, to: string | null): void {
  if (!partition) return
  const st = memberState(widgetId)
  const events: ChangeEvent[] = []
  if (from) {
    // Remove the live tags that currently place this widget in `from`. Tags added
    // before the substrate was on aren't tracked here, so a first move off a
    // pre-existing section emits an empty remove — harmless, and correct once the
    // add for that section has also flowed through the log.
    const tags = [...st.adds].filter(([t, s]) => s === from && !st.removes.has(t)).map(([t]) => t)
    for (const t of tags) st.removes.add(t)
    events.push(mkEvent(widgetId, 'members', 'set', { op: 'remove', section: from, tags }))
  }
  if (to) {
    const tag = plexiId()
    st.adds.set(tag, to)
    events.push(mkEvent(widgetId, 'members', 'set', { op: 'add', section: to, tags: [tag] }))
  }
  for (const ev of events) {
    recordLocal(ev, false)
    send(ev)
  }
}

// ── Apply (remote events) ─────────────────────────────────────────────────────

// Persist a remotely-won geometry and reflect it in the store WITHOUT going through
// the store's update() (which would re-emit and loop). window.api.widgets.update
// writes the base row (and marks it for the poll — the intended dual-write);
// setState updates the open canvas in place.
async function applyGeomToWidget(id: string, geom: WidgetGeom): Promise<void> {
  try {
    await window.api.widgets.update(id, geom)
  } catch {
    /* the widget may not be on this device's open task; the base write still lands */
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

function applyEvent(ev: ChangeEvent): void {
  if (ev.objectType !== 'widget') return
  // Record it locally (idempotent) so a reload can re-fold and it survives offline.
  recordLocal(ev, true)
  if (ev.field === 'geom' && (ev.payload as GeomPayload).geom !== undefined) {
    const remote = geomRegisterOf(ev)
    const local = geomRegs.get(ev.objectId) ?? null
    const merged = local ? lwwMerge(local, remote) : remote
    geomRegs.set(ev.objectId, merged)
    // merged === remote means the remote won (or it's the first we've seen) — adopt
    // it. If local won, merged === local and there is nothing to write.
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
  if (!partition) return
  // Join first (the server relays only to joined sockets), then flush the queue.
  sendSocketMessage({ type: 'crdtJoin', payload: { partitionKey: partition } })
  void flushUnsynced()
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
        objectType: e.objectType as 'widget',
        objectId: e.objectId,
        field: e.field as CrdtField,
        dataClass: e.dataClass as CrdtDataClass,
        actor: e.actor,
        payload: e.payload as GeomPayload | MembersPayload,
        seq: e.seq ?? undefined
      })
    }
    // Optimistic mark: the frames went out over an open socket, the server dedupes
    // by id, and the base geometry also rides the workspace poll — so marking these
    // synced now cannot lose data even if a frame drops (at worst the log entry
    // reappears on the next join replay). It stops us re-flushing the same queue
    // forever.
    await window.api.crdt.markSynced(pending.map((e) => ({ id: e.id })))
  } catch {
    /* best effort — the poll remains the safety net */
  }
}

// Start the engine for the signed-in account. Idempotent. No-op (and unregisters
// any prior wiring) when the flag is off, so toggling the flag off and reloading
// returns the app to pure-poll behaviour.
export function initCrdtSync(): void {
  if (!crdtWidgetsEnabled()) {
    stopCrdtSync()
    return
  }
  const acct = useAccountStore.getState().account
  if (!acct) return // called again by App once signed in
  actor = `${acct.id}:${deviceId()}`
  partition = widgetPartition(acct.id)
  if (!started) {
    setCrdtSocketHandler(onCrdt)
    setCrdtOpenHandler(onReauth)
    registerCrdtEmit({ geom: emitGeom, membership: emitMembership })
    started = true
  }
  // If the socket is already authenticated, onReauth won't fire again on its own —
  // join now. If it isn't, the join is idempotent when onReauth fires on connect.
  onReauth()
}

export function stopCrdtSync(): void {
  if (partition) sendSocketMessage({ type: 'crdtLeave', payload: { partitionKey: partition } })
  registerCrdtEmit(null)
  setCrdtSocketHandler(null)
  setCrdtOpenHandler(null)
  geomRegs.clear()
  memberStates.clear()
  partition = null
  actor = ''
  started = false
}
