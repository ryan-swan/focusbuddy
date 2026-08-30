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

## GAP-015 — The CRDT live path's field allowlists would silently drop routing columns
**Severity:** HIGH · **Closes in:** Phase 4 design + the SPEC-002 build stage · **Status:** OPEN
The live transport (path A) emits node fields through two explicit allowlists:
`NODE_ATTR_KEYS` (`renderer/lib/crdtSync.ts:57-75`) and the `emitNodeCreate` snapshot
(`:404-416`). Neither would carry SPEC-002's new columns — a routed work_item would arrive
on the live path with **blank routing fields**, self-correcting only when the 20s poll
catches up: the worst failure shape for acknowledgment/loop-closure. The SPEC-002 stage
must add every replicating work_item column to BOTH lists (and the stage's adversarial test
must prove a live-path arrival carries them). Related: personal scope has NO receiver wake
(`personalWorkspaceChanged` doesn't exist) — second-device self-routing worst-cases at 20s
on the poll unless the fields ride the live path. (Found by the reliability agent,
analysis/15 §6; allowlists spot-verified.)

## GAP-016 — SPEC-002's three G2-found design inputs (person-field, permissions, sharing)
**Severity:** HIGH · **Closes in:** Phase 3/4 (architecture) + SPEC-002 stage · **Status:** OPEN
Found by the G2 adversarial pass: (1) **`nodes.assignee` already exists and already syncs**
(database.ts:618; read by projectPlan) — SPEC-002 must explicitly reconcile plan-assignment
(`assignee`) vs. routing (`recipientId`) or the two person-fields drift; (2) **per-desk
grants carry view/edit tiers with NO local write gate** (deskShareClient; collectPendingShared
pushes a view-only grantee's edits, refusal is server-side only) — the write-permission
contract must be stated for SPEC-013 reclassification and SPEC-028 acknowledgment writes;
(3) **the token-link sharing mechanism** (`share_links`/`shared_with_me`, `ShareableKind`
includes `'task'`) needs a work_item disposition (shareable? what snapshot?). Also carried:
SPEC-041 write-guards (addDependency/patchPlanTask) added to GAP-011's must-touch set.

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

## GAP-017 — "Respond" may want to be "Messages", but the messaging surface is unmapped
**Severity:** MEDIUM · **Closes in:** a designated investigation, then a ruling · **Status:** OPEN (logged 2026-08-28, operator)

The operator, ruling on Meet-as-invite (DEC-062), raised the sibling question and
**explicitly deferred it**: "before making any changes to the 'Respond' items, we will
need to do a designated investigation into the current messaging features, so just log
this as something to come back to."

**The thought, recorded verbatim in substance:** `to_respond` items read as tasks, the
same defect Meet has. They might instead read as MESSAGES — rename the queue to
"Messages" so it can carry actual messages from Plexii's own messaging capability, and
let the user reply **directly from the attention queue**, or jump to the real thread.

**Why it is not actionable yet.** Nobody has mapped what Plexii's messaging actually is
today. A first look found `src/renderer/src/components/views/MessagesView.tsx` and a
`mail/` stack (IMAP + app-specific passwords, `mailAccount.ts`) — so there is at least
one message surface and one mail transport, but their model, storage, threading and
identity story are unexamined. Ruling on a rename before that is known would be
deciding the shape of a thing we have not looked at.

**What the investigation must answer before any ruling:**
1. What message sources exist (in-app messaging? IMAP mail? Slack via webview?), and
   which of them have a durable local model versus a rendered-only view.
2. Whether a thread has a stable id an attention item could point at — the same
   question `source_url` answers for other queues.
3. Whether replying can be done in-place without owning the composer for every source,
   or whether "open the thread" is the honest affordance for some sources.
4. Whether "Messages" is the right NAME for a queue that must also hold non-message
   responses (a form to fill, a comment to answer) — or whether those belong elsewhere.
5. The DEC-062 precedent: Meet earns its invite treatment because a meeting has an
   agreed shape (when / where / who / join). Does a "response" have an equivalent one?

**Do not** rename the queue, change `to_respond` semantics, or touch the taxonomy until
this is investigated and ruled. The eight primaries are a migrated, spec-traced
vocabulary (DEC-029a); renaming one is a schema and migration event, not a label edit.


## GAP-018 — `rgba(var(--accent),…)` arbitrary values are INVALID CSS and paint nothing
**Severity:** MEDIUM (visual, app-wide, invisible to tests) · **Closes in:** one mechanical sweep round · **Status:** OPEN (found 2026-08-30, DEC-078 verification)

`--accent` is a space-separated triplet (`124 58 237`), so
`rgba(var(--accent),0.14)` substitutes to `rgba(124 58 237,0.14)` — invalid
(space-separated components with a comma alpha). Chrome rejects it at
computed-value time: backgrounds render transparent, rings/shadows compute
`none`. Proven live: a resting `bg-[rgba(var(--accent),0.14)]` element
measured `backgroundColor: rgba(0,0,0,0)`; DEC-053's today ring never
painted. Every accent wash/ring/inset written this way has been silently
absent since it shipped, and the suite stayed green because source-pins pin
strings, not paint.

**The fix pattern (sanctioned, already in the config):**
`accent: 'rgb(var(--accent) / <alpha-value>)'` → `bg-accent/10`,
`ring-accent/35`, `bg-accent/[0.14]`; inside arbitrary shadows use
`rgb(var(--accent)/0.3)`. DEC-078 converted the nine occurrences in
WeekTimeGrid + CalendarView and pinned `not.toContain('rgba(var(--accent)')`
for that file.

**Remaining census (2026-08-30):** occurrences in ~10 files —
TagMentionInput, AttentionConfirmCard, ChatPanel, MissedTriagePrompt,
assistant/MentionList, TrashView, attentionWidgets, RoomsDesksIndex,
AttentionView (+ WidgetFrame via the 077 round). Some are PINNED by tests
(attentionItemEditor.test.ts:408, dec077Refinements.test.ts:76/88,
workItemsCapture.test.ts:246) — the sweep must rewrite those pins to the
superseding truth, never delete them. Also check `--accent-hover` for the
same pattern. Verify-command:
`grep -rn "rgba(var(--accent)" src/renderer/src --include="*.tsx"`.
