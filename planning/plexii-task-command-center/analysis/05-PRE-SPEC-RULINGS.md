# Pre-Spec Rulings Docket

Response to the five rulings requested by the spec-drafting session (2026-08-24), grounded
in repo verification at `a92b30cb`, not recollection. Format per the Crossroads Protocol:
evidence → options → recommendation → what's lockable now vs. provisional. **Rulings 1–4
carry recommendations; the operator decides. Ruling 5 is the operator's alone.**

Confidence: 0.88 overall · why_not_higher: sync-server extensibility (can new columns/item
types ride the existing loop end-to-end?) is inferred from client code, not proven against
the server — that proof is Phase 2's job.

---

## New evidence that reshapes the questions (verified this session)

**E1 — Plans already exist as a first-class concept.** `isPlan` on folder nodes ("Promote a
Room to a Plan or demote it back", `src/shared/types.ts:193,217-219,242`),
`src/main/db/projectPlan.ts` (21KB), `fb_task_deps` (pred/succ FS deps, 6 uses),
`PlexiProjectsView.tsx`. The spec-session's Q4 premise ("no plan object exists") is false.

**E2 — The sync substrate is real, server-mediated, and CRDT-based.** `src/main/db/workspaceSync.ts`:
renderer owns the network (signal URL + token), main owns SQLite; per-row `sync_rev` +
`needs_sync` set by DB triggers; **synced-table whitelist: `nodes`, `widgets`, `time_blocks`,
`documents`, `fb_tables`, `fb_rows`, `fb_files`**; scope = whole-org / team / per-desk ACL.
CRDT convergence primitives shared between renderer and main (`src/shared/crdt.ts`).

**E3 — The person-to-person layer already exists.** Renderer stores: `messaging`, `presence`,
`knock`, `call`, `meetings`/`meetingRoom`, `mail` (real IMAP/SMTP in main), `org` (directory),
`shares` (multi-person, live-document sharing per the 4.0.16 release notes).

**E4 — A-003 upgraded.** "The sync/org layer can carry shared task state": 0.55 → **0.85**.
Residual unknown (Phase 2 must prove): whether the server passes through new node columns
opaquely and/or accepts new item types — i.e., extensibility, not existence.

**E5 — Naming collisions checked.** `work_item`/`workItem`/`WorkItem`: zero hits — clean.
"Attention": no surface owns it — clean as a concept. **"Flow" is taken** (`PlexiFlowView`,
Flows module). "Inbox" is crowded (a real `mail` store exists). `task`/`taskId` = desk,
`CommandCenter` = ⌘K palette — both permanently off-limits for new meanings.

---

## Ruling 1 — Schema fork: widen the `nodes` CHECK vs. new `task_items` table

**Recommendation: widen the CHECK (extend `nodes`) — now with a decisive argument the
earlier analysis didn't have: `nodes` is a SYNCED table.** A work-item stored as a node
inherits, for free: multi-device/org/team/desk-ACL sync (E2), the share system, org scoping,
spatial parenting (desk/room), the `nodes:*` IPC + store + views, relations, archival. A new
table starts with none of that — and extending the sync whitelist almost certainly requires
**server-side changes we cannot make from the fork branch**. The harvested migration
(`fd12cc2f`) is schema-derived, idempotent, and test-pinned; additive-first is law.
Routing/attention metadata that must replicate lives as node columns; purely local state
(read cursors, snooze timers, notification delivery) lives in satellite local tables — that
hybrid keeps the synced core lean.
**Lockable now:** as the provisional default the spec can assume behaviorally.
**Ratified at:** G4, after Phase 2 proves new-column passthrough on the sync loop (the one
scenario that flips this to "new table + server work" is the server schema-validating node
bodies strictly).

## Ruling 2 — Routing scope for v1

**Recommendation: spec BOTH; build self-routing as P0, person-to-person as P1 — staged by
build-order prudence, not feasibility doubt.** The spec-session's fear ("routing is blocked
on A-003") is now largely resolved: transport, org directory, presence, messaging, ACL-scoped
sync all exist (E2/E3). Self-routing first still wins as sequence — it exercises the entire
intent→object→terminal-state model with zero multi-user variables, and closed loops get
proven against yourself before they're social. But person-to-person should be specced fully
now (sender clarification, receiver queues, acknowledgment) so the P0 data model is born
routing-shaped — receiver/state fields present from day one, even while the only receiver
is you. **Lockable now.** Phase 2 verifies ACL semantics before P1 architecture.

## Ruling 3 — Calendar

**Recommendation: keep the engine, license the surface, defer the integration.** The
`time_blocks` engine is good (real recurrence materialization, meeting support) and — new
fact — **`time_blocks` is on the sync whitelist**, so tentative holds can be collaborative.
Feature 17's holds/approval = additive states on time_blocks (ADDITIVE tier). The Calendar
*UI* (unused tab, A-006) gets a rebuild license if the spec's UX needs it (RESHAPE tier,
formal crossroads: rebuild surface — yes/no). External calendar (Google/CalDAV) = P2
roadmap. **Lockable now** except the surface-rebuild yes/no, which is the operator's
crossroads call once Feature 17's UX is specced.

## Ruling 4 — Plans/projects (premise corrected)

Rooms are NOT the only container and a plan object DOES exist (E1). The real question:
**how do work-items relate to the existing Plan system** (Plan-rooms + `fb_task_deps`
Gantt dependencies at desk level)? **Recommendation for v1: work-items parent to desks/rooms
— including Plan-rooms — and do not touch `fb_task_deps`;** deep integration (work-items as
Gantt nodes, dependency links) is P1/P2. The spec must include a section positioning the new
entity against Plans explicitly — extend later, never collide now. **Lockable now.**

## Ruling 5 — Vocabulary (operator's alone; counsel only)

Constraints (E5): never `task`/`taskId` (= desk, forever), never "command center" alone
(⌘K palette), avoid "Flow" (taken) and "Inbox" (mail exists). `work_item` / `WorkItem` is
verified clean at the code level and reads well in schema (`work_items` satellite naming
stays coherent: `work_item_routes`, etc.). For the surface: "Attention" is clean as a
concept; the rendering surface is Home's widget registry either way, so the name labels the
*system* (queues + nudges + closed loops), not a new tab. Whatever is chosen: the schema
name is permanent — pick once, and the spec's §1 defines the full vocabulary (per the
spec-session's correct demand).

---

## What happens with the operator's answers

Each ruling → a DEC-NNN in DECISIONS-LOG (alternatives + rationale preserved). A-003 and
GAP-008 updated with E2–E4 (done). The spec-session then writes the intake spec with the
vocabulary section and pre-applied P0/P1/P2 triage; intake runs per SPEC-INTAKE.md — the
verbatim capture, SPEC-NNN inventory, and adversarial gap verification still run in full
(pre-triage is a proposal to verify, not a bypass).
