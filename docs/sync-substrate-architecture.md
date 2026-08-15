# The sync substrate — as built (WS01)

This describes what PlexiDesk's synchronisation infrastructure actually became over
the WS01 work: what the substrate is, the pieces it is made of, how a single edit
travels from one device to another, and what guarantees hold. It is the "as built"
companion to `sync-substrate-design.md`, which was the plan.

## The problem it replaced

Before this work, collaboration in PlexiDesk was solved three separate times, and
that divergence was where the "did my teammate actually see my change?" doubt lived.

The first model was a **twenty-second poll**. A renderer loop asked the server, once
per cycle, for everything that had changed since a cursor, pushed anything dirty
locally, and applied the delta. Conflict resolution was last-write-wins with the
server winning. It worked, but a poll is not real time, and whole-object last-write-
wins silently drops one side of a genuinely concurrent edit: if two people change
different cells of the same row inside the same cycle, one edit vanishes.

The second model was a **check-out lock** for live objects (shared docs, folders,
canvases). One person holds an edit lock with a heartbeat; others queue a takeover.
Safe, but it is the opposite of real-time co-presence — only one person edits at a
time.

The third model was **Yjs**, a real text CRDT with live cursors, used only for the
inside of a document body.

Three models, three mental models, three failure modes. The substrate replaces the
*general* case with one engine, keeps Yjs as the text-class implementation inside
it, and leaves the poll running underneath as a safety net during migration.

## What the substrate is, in one paragraph

Every change to any workspace object becomes an **event on a per-object, append-only
change log**. Each event names the object, the one field it touches, the CRDT *data
class* of that field, a client-generated time-ordered id, an occurrence timestamp,
and the partition (room) the object syncs in. Events are delivered live over the
websocket the app already had, appended to a per-partition log on the server with a
monotonic sequence, and fanned out to everyone else in the room, who merge them into
their own copy. Because every field is a CRDT, the merge is deterministic and needs
no coordinating authority: the same events in any order converge to the same state.
The old poll still runs beside it, dual-writing, so nothing regresses while each
object type is migrated one at a time behind its own flag.

## The data model

The unit is the **ChangeEvent** (`src/shared/crdtWidgetMerge.ts`):

```
id            client-generated UUIDv7 (time-ordered, never renumbered)
ts            ISO occurrence time
partitionKey  the room: <type>:<scope>:<id>  (see Partitions below)
objectType    widget | node | row | table | timeblock | file | document
objectId      the object this event mutates
field         which field: geom | members | title | parent | cell | attr |
              start | duration | status | name | content | color | order |
              create | delete
dataClass     register | set   (the merge policy)
actor         accountId:deviceId  (the deterministic tiebreak)
payload       the field-specific data
seq           server-assigned per-partition sequence (added on append)
```

Each field is modelled as one of a small set of **CRDT data classes**, and the class
is what determines how two concurrent writes reconcile:

- **LWW register** — a single value that resolves by highest timestamp, ties broken
  deterministically by `actor`. Used for widget geometry, a node's title and parent,
  a timeblock's start/duration/title/status, a file's name/parent, and — as generic
  keyed registers — every other scalar attribute (`attr`) and each table cell
  (`cell`). Two people dragging the same widget converge on one position; neither
  loses their *other* edits.
- **OR-Set (observed-remove set)** — a set where a concurrent add and remove
  converge without a lost member. Used for widget↔section membership: a delta carries
  the exact tags it adds or tombstones, so replay converges regardless of delivery
  order.
- **Lifecycle (remove-wins existence)** — `create` carries a full snapshot to
  materialise the object elsewhere; `delete` is a permanent tombstone. A delete is
  never undone by a late-arriving create, in any order.

The primitives themselves (`lwwMerge`, the OR-Set ops, offline reconciliation,
conflict surfacing) live in `src/shared/crdt.ts`, shared by both processes. The
merge is pure and order-independent, which is the whole point: `foldWidget`,
`foldNode`, `foldRow`, `foldAttrs`, `foldLifecycle` each take an object's events in
any order and return the same converged state.

## The layers

The substrate is four cooperating pieces:

**1. The shared merge core** (`src/shared/crdt.ts`, `crdtWidgetMerge.ts`,
`crdtNodeMerge.ts`, `crdtRowMerge.ts`). Pure TypeScript, no I/O, imported by both the
renderer and the (tests of the) server. This is where "what does it mean for two
edits to converge" is defined and unit-tested, independent of any transport.

**2. The server** (`focusbuddy-signal`). A `change_log` table (append-only, one row
per event, indexed by partition + sequence) plus `changeLog.ts`, which appends an
event assigning the next monotonic sequence for its partition and de-duplicates by
the client id (so replaying a queued offline event is a no-op, never a duplicate).
The websocket gained `crdtJoin` / `crdtLeave` / `crdtEvent`, mirroring the existing
Yjs room relay generalised to any object type: on join it replays the partition's
log so the joiner converges to current state; on an event it appends and fans out to
the rest of the room. A single authoriser, `authorizeCrdtPartition`, gates every
join and emit by the partition's scope (below).

**3. The local change log** (`src/main/db/changeLog.ts`). The same `change_log`
shape in the desktop's SQLite. It is both the durable record of applied events and
the **offline queue**: an event emitted while the socket is down is stored
`synced = 0` and flushed on reconnect. Exposed to the renderer over a small `crdt:*`
IPC namespace.

**4. The client engine** (`src/renderer/src/lib/crdtSync.ts`). The heart. It holds
the in-memory converged state per object (the LWW registers, the OR-Set tags), turns
local store mutations into events, sends them, and applies incoming ones back into
the stores. The stores talk to it through a tiny registry (`crdtBridge.ts`) so
neither imports the other in a cycle; a store just calls `crdtEmitGeom(widget)` and
the engine — registered only when a flag is on — does the rest.

## Partitions and scope

A partition key is `<type>:<scope>:<id>` and is the room an object's events flow
through. There are three scopes, each authorised differently on the server:

- `:acct:<accountId>` — a single account's own devices. Owner-only.
- `:org:<orgId>` — an organisation; every member converges. Authorised by
  `orgs.isMember`.
- `:desk:<deskId>` — a desk shared with named individuals; every grantee converges.
  Authorised by the desk's resource ACL (`acls.authorize`).

The client decides an object's scope with a pure resolver. The renderer is
**single-org-at-a-time** — the local database scopes every read by the active org,
and widgets/rows inherit their scope from their parent — so the *active workspace*
alone routes objects with no per-object lookup: a real active org routes to
`:org:`, otherwise to `:acct:` (`crdtScopeSuffix`). Shared desks are the one
exception, because a personal workspace can contain both private objects and objects
under a shared desk side by side; those objects carry a `shared_root_id`, and
`crdtObjectScope` gives it precedence — a shared object goes to its `:desk:`
partition regardless of who is looking at it, everything else falls back to the
active-workspace scope. On an org switch the engine leaves the old rooms, clears the
scope-bound in-memory state, and joins the new scope's rooms.

## How one edit travels

Take a widget drag with the flag on:

1. The user drags; the widgets store's `update()` runs as it always did — optimistic
   local set, write to SQLite, nudge the poll.
2. Then it calls `crdtEmitGeom(server)`. The engine stamps an LWW register
   `{value, timestamp, actor}`, writes a `geom` ChangeEvent to the local change log
   (`synced = 0`), and sends it over the socket.
3. The server authorises the partition, appends the event with the next sequence,
   and relays it to every other socket in the room.
4. On the other device the engine receives the event, merges its register against
   the local one with `lwwMerge`. If the remote wins it writes the geometry to that
   device's SQLite and updates the open canvas in place — without going back through
   `update()`, so there is no echo loop.
5. If the socket was down at step 2, the event simply stays `synced = 0`; on
   reconnect the engine joins the partition and flushes the queue, and the server's
   id-dedup means a double-send is harmless.

Creation and deletion ride the same rails: a `create` event carries the object's
snapshot and a client-preserved id (the create APIs became create-if-missing by
primary key), so the object materialises on the other device with the *same* id; a
`delete` event tombstones it.

## Convergence guarantees, and the bug the guarantees missed

The unit tests prove the algebra: for each type, any permutation of a small event
set (including duplicates) folds to the same state; LWW ties break deterministically;
OR-Set add/remove converge in any order; lifecycle is remove-wins.

But algebra is not the whole story, and the two-window live harness caught what the
unit tests could not. Objects sync in **per-type partitions**, so a widget's
`create` event can arrive on another device *before* the `create` for the task node
it belongs to — and the widget insert then fails a foreign-key check. The original
code swallowed that error and dropped the widget forever. The fix is a
**pending-create buffer**: a create that fails because its parent is not present yet
is retried — immediately whenever any other create lands (a freshly-arrived parent
unblocks its dependents) and on a short backstop timer — instead of being lost. That
class of cross-partition ordering bug is exactly why the live proof exists.

## Dual-write, flags, and the poll

Every type is migrated behind its own flag (`fb.sync.crdt.widgets`,
`.nodes`, `.tables`, `.timeblocks`, `.files`, `.documents`), all **off by default**.
With a flag off the engine registers nothing and the app is byte-for-byte the old
poll-only behaviour. With a flag on, the type is **dual-written**: the CRDT carries
it live and the poll still carries it as a slower backstop. The poll only becomes
retireable for a scope once everything that scope carries is proven on the substrate;
until then it is the safety net, exactly as designed. This is why turning the
substrate on is safe to roll out incrementally and why a half-migrated type can
never strand data.

## What is migrated

All seven object types the poll carried now flow through the substrate: **widgets**
(geometry, section membership, content, title, colour, status, stacking order),
**nodes** (title, parent, and scalar attributes — status, priority, due date,
description, ordering, and so on), **table rows** (per-cell, so concurrent edits to
different cells both survive) and **tables** (title, schema), **timeblocks**
(start, duration, title, status), **files/folders** (name, parent), and **document
metadata** (title, archived). Each also carries create and delete. A few genuinely
harder fields deliberately stay on their own channels: document *bodies* ride the
existing cloud-docs channel (and org co-editing rides Yjs), file *bytes* ride the
blob channel, and a small tail of rare fields (e.g. a timeblock's meeting object)
still ride the poll.

## What is proven, and what remains

Proven live, across two real windows over the real (proxied) socket, for **all three
partition scopes**: **per-account** multi-device convergence for every type;
**cross-account same-org** convergence (two different accounts in one org, via the
`:org:` partition, `orgs.isMember`); and **shared-desk** convergence (two accounts, a
desk shared by name, via the `:desk:` partition, gated by the desk's resource ACL).
Every one landed in single-digit-to-low-tens of milliseconds over the socket. The
signal server is **deployed** with the change-log handlers and all three partition-
auth scopes live. Everything ships flag-off, so production behaviour is unchanged
until the flags are turned on — a safe, proven, incremental rollout decision.

Shared-desk routing is per-object: the four types the share stamp covers — nodes,
widgets, tables, rows — resolve their shared root (a node directly, a widget from its
task node, a table from its task node, a row from its table) and route to the
`:desk:` partition, while grantees join `n:/w:/r:desk:<root>` as the shared desk's
nodes load. Timeblocks, files, and documents are never part of a shared desk, so they
correctly stay on their active-scope partition.

What remains is a short, sequenced consolidation rather than open questions: sweeping
the last rare poll-only fields (e.g. a timeblock's meeting object); demoting the
poll's cross-account cycles from primary to reconnect-catch-up once every field a
scope carries is on the substrate; and, last, migrating the live folder and canvas
surfaces onto the substrate so the check-out lock can be retired — those surfaces
still rely on the lock for single-writer safety today, so it cannot come off before
they converge on the substrate.
