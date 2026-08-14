// WS01 sync substrate — the widget data model expressed in CRDT terms.
//
// This is the pure, dependency-free core the client sync engine (lib/crdtSync.ts)
// and the convergence test both run, so what ships is exactly what is proven. Every
// mutation to a widget becomes a ChangeEvent in the append-only change log. Two
// field families are modelled here, matching the WS01 first slice:
//
//   - geometry (position + size) is a last-write-wins register. Two people dragging
//     the same widget converge on one place deterministically, and no other edit is
//     lost (SYN-003).
//   - section membership is an observed-remove set, so a concurrent "add to section"
//     and "remove from section" converge without a lost member (SYN-001).
//
// Folding a widget's whole event list is order-independent: the same events in any
// delivery order (or with duplicates, after an offline reconnect) yield the same
// state. That property is the convergence guarantee, and the test asserts it.

import { lwwMerge, type LWWRegister } from './crdt'

export interface WidgetGeom {
  x: number
  y: number
  width: number
  height: number
}

export type CrdtField = 'geom' | 'members'
// 'register' is the LWW class used for geometry; 'set' is the OR-Set class used for
// membership. Both are deterministic — neither ever surfaces a manual conflict.
export type CrdtDataClass = 'register' | 'set'

export interface ChangeEvent {
  id: string // client-generated UUIDv7, never renumbered (SYN-010)
  ts: string // ISO occurrence time, preserved on ingestion (SYN-011)
  partitionKey: string // the room this object syncs in, e.g. `w:acct:<accountId>`
  objectType: 'widget'
  objectId: string
  field: CrdtField
  dataClass: CrdtDataClass
  actor: string // device/account id — the LWW tiebreak, deterministic
  payload: GeomPayload | MembersPayload
  // Server-assigned authoritative sequence, present once the event is on the log.
  // Consumers order catch-up by this, never by wall-clock (SYN-011). Absent on a
  // freshly-minted local event before it has been appended.
  seq?: number
}

export interface GeomPayload {
  geom: WidgetGeom
  at: number // occurrence time in ms — the LWW register timestamp
}

export interface MembersPayload {
  op: 'add' | 'remove'
  section: string
  // The OR-Set tags this delta touches. An add introduces one fresh tag; a remove
  // carries the exact tags it tombstones (known at emit time), so replay converges
  // regardless of whether the remove is delivered before or after its add.
  tags: string[]
}

export function isGeomPayload(p: ChangeEvent['payload']): p is GeomPayload {
  return (p as GeomPayload).geom !== undefined
}
export function isMembersPayload(p: ChangeEvent['payload']): p is MembersPayload {
  return (p as MembersPayload).op !== undefined
}

// The LWW register a single geometry event represents.
export function geomRegisterOf(ev: ChangeEvent): LWWRegister<WidgetGeom> {
  if (!isGeomPayload(ev.payload)) throw new Error('geomRegisterOf: not a geometry event')
  return { value: ev.payload.geom, timestamp: ev.payload.at, actor: ev.actor }
}

export interface WidgetState {
  // The converged geometry register, or null if no geometry event has been seen.
  geom: LWWRegister<WidgetGeom> | null
  // The live section memberships (OR-Set values). Normally zero or one entry; more
  // than one only transiently while a concurrent move is converging.
  sections: string[]
}

// Fold one widget's events into its converged state. Pure and order-independent:
// geometry folds by lwwMerge (commutative up to the deterministic tiebreak), and
// membership folds by unioning add tags and remove tags then taking the live set —
// exactly an OR-Set merge, which is commutative, associative and idempotent.
export function foldWidget(events: Iterable<ChangeEvent>): WidgetState {
  let geom: LWWRegister<WidgetGeom> | null = null
  const adds = new Map<string, string>() // tag -> section
  const removes = new Set<string>()
  for (const ev of events) {
    if (ev.field === 'geom' && isGeomPayload(ev.payload)) {
      const reg = geomRegisterOf(ev)
      geom = geom ? lwwMerge(geom, reg) : reg
    } else if (ev.field === 'members' && isMembersPayload(ev.payload)) {
      const { op, section, tags } = ev.payload
      if (op === 'add') {
        for (const t of tags) adds.set(t, section)
      } else {
        for (const t of tags) removes.add(t)
      }
    }
  }
  const live = new Set<string>()
  for (const [tag, section] of adds) if (!removes.has(tag)) live.add(section)
  return { geom, sections: [...live] }
}

// The single live section for a widget (the app model allows one parent section),
// or null. When a concurrent move leaves two live memberships mid-convergence, the
// tiebreak is deterministic (lowest id) so every replica picks the same one until
// the losing remove propagates.
export function resolvedSection(state: WidgetState): string | null {
  if (state.sections.length === 0) return null
  if (state.sections.length === 1) return state.sections[0]
  return [...state.sections].sort()[0]
}
