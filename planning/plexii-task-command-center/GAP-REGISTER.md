# Gap Register

<!-- Gaps between "designed" and "built/proven," plus open questions, and which phase closes each.
     OPEN -> IN_PROGRESS -> CLOSED; closed entries stay (audit trail). Append as discovered. -->

Seeded from the verified codebase map (`../../.claude/COMMAND-CENTER-MAP.md`, surveyed
2026-08-24 @ a92b30cb). These are the pre-spec structural gaps; the spec-driven gap matrix
(`analysis/02-GAP-MATRIX.md`) will reference and extend them.

## GAP-001 — No real task entity exists
**Severity:** HIGH · **Closes in:** Phase 4 (decision) + first Phase 6 stage (build) · **Status:** OPEN
`task` kind = Desk; `task-item` is declared but dead, and the `nodes.kind` CHECK constraint
(`src/main/db/database.ts:33`) rejects it at the SQLite level.
**Path ruled 2026-08-24 (DEC-007, provisional):** widen the CHECK — work items are nodes
(kind `work_item` per DEC-011), inheriting sync/sharing/org/spatial machinery; satellite
local tables for non-replicating state. Ratified at G4 after Phase 2 proves sync
column-passthrough. Closing = the migration shipping in the first Phase 6 stage. **Exhibit A for the widen-CHECK path:**
`migrateNodesKindCheck` on branch `ryan-task-system-port` @ `fd12cc2f` — schema-derived
rebuild, idempotent, pinned by a 144-line test against legacy-shaped DBs
(→ [analysis/03-LEGACY-TASK-BRANCH.md](analysis/03-LEGACY-TASK-BRANCH.md) §2; reference
only per DEC-005).

## GAP-002 — No notification persistence, IPC, or inbox model
**Severity:** HIGH · **Closes in:** Phase 4 (design) + Phase 6 (build) · **Status:** OPEN
The main-process notifications module is a spec-conformance decoy (unit-test-only importer);
no notification table, no `notifications:*` IPC, no badge/inbox. Greenfield.

## GAP-003 — Reminders die with the app
**Severity:** HIGH · **Closes in:** Phase 4 (design) + Phase 6 (build) · **Status:** OPEN
The only scheduler is a renderer `setInterval` (`lib/blockReminders.ts`) with per-run
`sessionStorage` dedupe; Electron's main-process `Notification` API is never used. A credible
notification feature needs a main-process scheduler + OS notifications — new ground.

## GAP-004 — `taskId` means desk in every existing signature
**Severity:** HIGH (hazard, not work) · **Closes in:** standing constraint, enforced every Phase 6 stage · **Status:** OPEN
`widgets.task_id`, `time_blocks.task_id`, `activity_log.task_id`, `focus_sessions.task_id`
FK to desks. New entities use `itemId`/`todoId`; code review rejects any new `taskId` overload.

## GAP-005 — Three dashboard systems, one unification debt
**Severity:** MEDIUM · **Closes in:** Phase 3 (strategy picks the surface) · **Status:** OPEN
Home widget registry (live), `dashboard/Dashboard.tsx` portlet engine (orphaned except
ProjectDashboard), `ModuleDashboard` (declarative). Plan of record
`docs/DASHBOARD-UNIFICATION.md`; dead scaffold `shared/dashboardRegistry.ts`. Strategy must
choose Home-registry extension (default) and explicitly disposition the other two.

## GAP-006 — Pulse counts are semantically wrong
**Severity:** MEDIUM · **Closes in:** Phase 6 stage that ships real tasks · **Status:** OPEN
Home's "open tasks / due today / overdue" (`HomeDashboard.tsx` insights memo) counts desks
with due dates. Becomes honest the moment real tasks exist and the memo reads them.

## GAP-007 — No external calendar integration
**Severity:** MEDIUM · **Closes in:** Phase 2 confirms scope; spec decides if it's in · **Status:** OPEN
Agenda = local `time_blocks` only (recurrence materialized locally); outbound `.ics` only.
If the spec assumes Google/CalDAV, that's a CONFLICTS classification with real cost.
**Rebuild signal:** operator states the Calendar tab sees ~no use (→ A-006) and has
pre-signaled openness to a ground-up calendar rebuild if the spec needs it — still goes
through the Crossroads Protocol, but expect the answer may be yes.
**Ruled 2026-08-24 (DEC-009):** engine stays (`time_blocks`, synced), holds/approval land as
additive states; UI surface carries a granted rebuild license (specific ruling when the UX
is specced); external calendar = P2.

## GAP-011 — Node-consumer audit: everything that assumes `kind ∈ {folder, task}`
**Severity:** HIGH · **Closes in:** Phase 2 (classification) + every Phase 6 stage touching a consumer · **Status:** OPEN
DEC-007 makes work items a third node kind — so every consumer that enumerates or branches
on node kind must be audited or work items appear as phantom children under desks/rooms.
**Measured census (2026-08-24 @ a92b30cb): 305 kind-branching call sites across 99 files**,
including `stores/nodes.ts`, `stores/view.ts`, `stores/presence.ts`, sidebar tree,
`CanvasBreadcrumb`, `StageManagerStrip`, `workspaceSnapshot`, `shareSnapshot`, `radar`,
`velocityStats`, streamdeck. Risk classes: (a) **negation patterns** (`kind !== 'folder'`
etc.) that silently catch a third kind, (b) **unfiltered child enumerations** (tree, breadcrumb,
drag-reparent, snapshots). Positive filters (`kind === 'task'`) are safe by construction.
Phase 2 classifies all 305 into safe-by-construction vs. must-touch; the must-touch list
becomes its own SPEC item + build stage. (Raised by the spec-drafting session; census by
this session.)

## Open questions

### GAP-008 — What can the sync/org layer carry for shared collaboration?
**Severity:** HIGH → MEDIUM (module-level map done 2026-08-24) · **Closes in:** Phase 2
(remaining proof) · **Status:** IN_PROGRESS
Mapped: server-mediated CRDT sync, whitelist (`nodes`, `widgets`, `time_blocks`, `documents`,
tables/rows/files), org/team/per-desk ACL scopes, triggers-set dirty flags, full social layer
(messaging/presence/knock/org/shares) → analysis/05-PRE-SPEC-RULINGS.md E2–E3.
**Remaining to close:** prove new-node-column passthrough end-to-end (the A-003 residual);
document ACL semantics precisely enough to architect receiver queues on them.

### GAP-009 — The product spec itself
**Severity:** HIGH · **Closes in:** Phase 1 (operator supplies; intake runs) · **Status:** OPEN
Everything downstream sharpens on arrival. Until then, phases 1+ are structure, not content.

## How gaps close

1. Each gap names the phase that closes it.
2. When the closing work ships + its gate passes, mark CLOSED (keep the entry).
3. New gaps discovered during execution → append, increment GAP-NNN.
4. A phase isn't done until its assigned gaps are CLOSED.
