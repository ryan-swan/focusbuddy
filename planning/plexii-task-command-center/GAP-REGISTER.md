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
**CLASSIFIED 2026-08-24 night (analysis/10, spot-verified 6/6):** true census **223 sites /
82 files** (29% of raw hits were unrelated `kind` unions) → **44 must-touch** (26 Class B
binary-dispatch + 18 Class C unfiltered enumeration); all 16 literal negations proved
"skip"-polarity safe. **No TypeScript safety net exists** (union already 3-wide, zero
switches on NodeKind) — the census is the only defence. Census-invisible forms found and
added (agentHistory.ts:319 ref-parse hard delete; boolean aliases). Method **validated by
ground truth**: the shared-tab bug (BUG-C1-03) diagnosed as exactly a Class-C-shaped
two-source enumeration miss with metadata intact (analysis/10 §6); its fix shape is a small
product call queued for the G2 docket. Remaining: adversarial re-verification of B/C
dispositions at G2; must-touch list becomes the SPEC-004 build stage.

## GAP-012 — `status` semantics collision on the shared nodes row
**Severity:** HIGH · **Closes in:** Phase 4 (SPEC-002 design) · **Status:** OPEN
Work_items inherit `nodes.status` (`TaskStatus`: open/in_progress/done/parked, ~53 renderer
comparison sites, no DB CHECK) but spec §1.5 defines a richer state machine the column can't
hold. Recommended shape (analysis/09 V1): `status` stays a coarse mapped projection for
legacy consumers; new `work_item_state` column carries the fine machine; mapping table is
part of SPEC-002. (Raised by the spec session; verified + shaped by this session.)
**Ruled constraint (DEC-014):** the projection is DERIVED — `work_item_state` is the single
source of truth, `status` computed at write, never independently writable (drift = phantom
completions in Pulse/lenses). Mapping table explicit in SPEC-002; `dismissed`/`reclassified`
never project to `done`.

## GAP-013 — Cross-version sync hazard: un-migrated peers silently reject work_items
**Severity:** HIGH · **Closes in:** Phase 4 (migration strategy) + first Phase 6 schema stage · **Status:** OPEN
`applyRemoteShared` inserts arriving rows and swallows ALL exceptions
(`workspaceSync.ts:844-851`, bare catch commented "FK not present yet — retry next cycle").
A peer running the old schema receives a `kind='work_item'` row, the CHECK constraint
rejects it, and the failure is **silent, permanent, and infinitely retried** — no error
surfaced anywhere. Closing = ship the CHECK-widening migration ahead of any work_item
reaching the sync path, AND/OR add an explicit unknown-kind branch + migration gate at the
apply site. (Found by the classification agent, analysis/10 §3.6/§5; spot-verified.)

## GAP-014 — Live-DB schema drift: the harvested migration's guard won't fire here
**Severity:** HIGH · **Closes in:** Phase 4 (migration design) + first Phase 6 schema stage · **Status:** OPEN
Discovered 2026-08-24 night (read-only DB inspection): the primary dev machine's live DB
already has `CHECK (kind IN ('folder','task','task-item'))` with the quoted-`"nodes"`
rebuild fingerprint — the legacy branch's `migrateNodesKindCheck` ran against this userData
on ~Aug 3 and persisted. **14 `task-item` rows exist** (demo-mode seed residue; 9 already
trashed; server `sync_rev` up to 4527 — which incidentally proves the server accepts
unfamiliar kinds, closing the A-003 kind residual). Consequences for the Phase 4 migration:
(1) the harvested guard (`sql.includes("'task-item'") → return`) would skip this DB and
never admit `work_item` — the new migration must key on the ABSENCE of `'work_item'` and
handle BOTH starting states; (2) CR-05(a) (delete the dead TS declaration) gains a data
dimension — legacy `task-item` ROWS exist in at least one real DB, so the new CHECK should
tolerate `'task-item'` (recommend: CHECK admits all four kinds; the TS union carries only
`work_item`, so no new task-items can be created; existing rows are inert residue,
optionally cleaned later); (3) the migration's pinning test needs a second fixture: the
already-widened legacy-migrated DB shape.

## Open questions

### GAP-008 — What can the sync/org layer carry for shared collaboration?
**Severity:** HIGH → MEDIUM (module-level map done 2026-08-24) · **Closes in:** Phase 2
(remaining proof) · **Status:** IN_PROGRESS
Mapped: server-mediated CRDT sync, whitelist (`nodes`, `widgets`, `time_blocks`, `documents`,
tables/rows/files), org/team/per-desk ACL scopes, triggers-set dirty flags, full social layer
(messaging/presence/knock/org/shares) → analysis/05-PRE-SPEC-RULINGS.md E2–E3.
**Remaining to close:** ~~prove new-node-column passthrough end-to-end~~ **DONE 2026-08-24
23:21 — live round-trip PASS** (analysis/12; A-003 VALIDATED at 0.97). Only remaining:
document ACL semantics precisely enough to architect receiver queues on them.

### GAP-009 — The product spec itself
**Severity:** HIGH · **Closes in:** Phase 1 · **Status:** CLOSED (2026-08-24)
Spec received: 44 SPEC items + amendments 042–044 → analysis/00-SPEC-RAW.md, with companion
bug synthesis (06) and conflict register (07). Intake verification: 08. Remaining Phase 1
work: completeness re-read, operator confirmation of the primary objective, batched
crossroads ruling CR-01..07, IQ-1 (missing bug-report sections 7/8/13/14/17).

## How gaps close

1. Each gap names the phase that closes it.
2. When the closing work ships + its gate passes, mark CLOSED (keep the entry).
3. New gaps discovered during execution → append, increment GAP-NNN.
4. A phase isn't done until its assigned gaps are CLOSED.
