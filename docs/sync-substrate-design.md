# One sync substrate — technical design (WS01)

This is the design for the roadmap's foundational bet: every object in the
workspace should flow through one offline-first, conflict-free, presence-aware
sync engine, instead of the three separate models that exist today. It is
written to be built against the current code, and it ends with a first slice
small enough to ship behind a flag without disturbing anything live.

## Where we are now

Collaboration in PlexiDesk is solved three times over, once per feature area, and
that divergence is where the "did my teammate see it" doubt lives.

The first model is **multi-device workspace sync**. `lib/workspaceSync.ts` on the
renderer and `db/workspaceSync.ts` in main run a twenty-second poll: each cycle
pushes locally changed rows, pulls everything changed on the server since an
`updated_at` cursor, and applies it. The conflict rule is last-write-wins with the
server winning, plus tombstones for deletes. It carries seven types today, node,
widget, timeblock, document, table, row and file. It works, but a poll is not
real time, and last-write-wins silently drops one side of a genuinely concurrent
edit.

The second model is **check-out collaboration** for live objects. `stores/docCollab.ts`
with `lib/docCollabClient.ts` holds a lock with a heartbeat and a takeover queue,
so one person edits at a time and others request the baton. Safe, but it is the
opposite of real-time co-presence.

The third model is **Yjs** for document bodies, a real CRDT with cursors
(CollaborationCaret) and reconnect. This is the one model that is actually
conflict-free and live, and it only covers the inside of a document.

There is also a fourth thing that matters more than any of them. `src/main/sync/crdt.ts`
already implements the hard parts of a convergent engine and is not yet wired
into the real sync path. It has an observed-remove set, a last-write-wins register
with deterministic tie-breaking, a data-class conflict policy that keeps AI out of
deterministic classes, offline reconciliation with client-generated UUIDv7 ids
that are never renumbered and are de-duplicated on reconnect, and explicit
surfacing of a genuinely unmergeable conflict with both versions intact. The
convergence primitives exist. The substrate is mostly the work of routing every
object type through them.

## The target

One engine. Every mutation to any object becomes an event in a per-object,
append-only change log. Events carry a client-generated UUIDv7 id, an occurrence
timestamp, a partition key and a sequence, exactly the `OfflineEvent` shape
`crdt.ts` already defines. Each object type declares a data class per field, so
the merge is deterministic where it can be (position, membership, counters, text)
and surfaced to the user only where it genuinely cannot be (a workflow or decision
conflict). The log is delivered live over the websocket the app already has, and
the twenty-second poll survives only as the reconnect catch-up path, not the
steady state. Presence rides the same channel as one awareness layer, so cursors,
selections and "who is here" are one feature rather than three.

## The model, concretely

Every object type maps its fields to a data class from `crdt.ts`:

- A widget's position and size are a last-write-wins register. Two people dragging
  the same widget converge on one place deterministically, and neither client's
  other edits are lost.
- Section membership, tags, and any "set of children" are observed-remove sets, so
  concurrent add and remove converge without a lost member.
- A document body stays a text CRDT, which is what Yjs already gives us. Yjs
  becomes the text-class implementation inside the same substrate rather than a
  parallel system.
- Counters (reactions, counts) are counter class.
- A workflow step or an approval decision is a non-deterministic class. When two
  people conflict there, the engine surfaces both versions intact for a human to
  resolve, using `surfaceConflict`, and never lets AI silently pick.

The change log is the source of truth for sync. Local SQLite remains the local
store and the offline queue; on reconnect, `reconcileOffline` ingests the client's
queued events, keeps their ids, drops the ones the server already has, and orders
by sequence rather than wall clock.

## Transport and the server

The live path is the existing websocket in `lib/messagingSocket.ts`, which already
carries document events and org and shared workspace-changed notifications. The
substrate turns those notifications into a real event stream: append to the log,
fan out to the room, apply on receipt. The poll in `workspaceSync.ts` is retained
only to catch up a client that was offline or missed frames, so a dropped socket
degrades to eventual consistency instead of a stall.

On the server, the log is partitioned by room, which lines up with the reliability
workstream's requirement that one organisation's sync load never touches another's.
Room-based sharding is what lets the single Fly instance stop being a single point
of contention, and it is a prerequisite for the load test in WS05.

## Migration order

The rule is that nothing live breaks and each type moves on its own, behind a flag,
with the poll as the fallback until the type is proven.

1. Stand up the change-log table and the append-and-subscribe server endpoint, and
   wire `crdt.ts` into a client sync engine that dual-writes: it emits events to
   the log while the twenty-second poll keeps running untouched. No behaviour
   changes yet.
2. Migrate widgets first. They are high-churn, have a simple shape, and are the
   most visible win for live co-editing on a desk. Position becomes an LWW
   register, membership becomes an OR-Set, everything flows over the socket, and
   the poll for widgets becomes catch-up only.
3. Migrate nodes and desks, then tables and rows, then timeblocks and files, one
   type per increment, each gated and each with its own convergence test.
4. Fold document bodies in as the text class, so Yjs lives inside the substrate
   rather than beside it.
5. Retire the check-out lock and takeover model, and retire the poll as a primary
   path. This is last because it is the most entangled and the least urgent once
   everything else converges live.

## Reliability and presence, folded in

The automated two-client convergence test belongs to this workstream and the
reliability one at once. It boots two real clients, edits the same object on both
across a simulated partition, and asserts no lost writes and identical end state.
It gates every type's migration and every release thereafter, which is how the
manual two-account pass stops being manual. Presence unifies onto the same
awareness channel as the substrate lands, so the People Map and editor cursors
read from one source.

## Risks and coordination

The largest risk is dual-write drift during migration, a type that is half on the
log and half on the poll. The mitigation is the per-type flag and the convergence
test as the gate to flip it, so a type is never trusted to the log until it
provably converges, and the poll is the safety net until then.

A concurrent effort is currently editing `lib/messagingSocket.ts`, `stores/chat.ts`
and the main AI files for assistant narration. The substrate also needs
`messagingSocket.ts` for its live transport, so the transport change must be
coordinated with that work rather than landed on top of it. The Yjs document work
is adjacent and should be folded in, not competed with.

## First implementable slice

Small enough to ship behind a flag with the poll untouched, and it exercises the
whole spine end to end for one type.

1. A `change_log` table in the local and server stores: append-only, one row per
   event, carrying the UUIDv7 id, occurrence timestamp, partition (room) key,
   sequence, object id, field, data class and payload.
2. A server endpoint to append an event and subscribe a room to its stream, fanned
   out over the existing websocket.
3. A client sync engine that routes widget mutations through `crdt.ts`, position as
   an LWW register and section membership as an OR-Set, emitting events to the log
   and applying incoming ones, behind a `fb.sync.crdt.widgets` flag, dual-written
   alongside the existing poll so nothing regresses when the flag is off.
4. A Playwright two-client convergence test that drags the same widget on two
   instances across a simulated socket drop and asserts one deterministic position
   and zero lost edits.

When that slice is green with the flag on for widgets, the same shape repeats for
every other type, and the roadmap's foundation is real rather than aspirational.
