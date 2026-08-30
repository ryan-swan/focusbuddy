# Decisions Log

<!-- APPEND-ONLY and immutable: never edit a past entry — supersede with a new one that links
     back. The value is the "alternatives considered" line. -->

## DEC-001 — Develop on a fork branch, not the shared repo

**Date:** 2026-08-24
**Decision:** All command-center work happens on branch `ryan-command-center`, cut from
origin/main @ `a92b30cb` (v4.1.0), pushed to fork `ryan-swan/focusbuddy`; updates from Caleb
keep flowing in from `origin`.
**Context:** `ryan-swan` has pull-only access to `saasmouth/focusbuddy` (403 on push; the old
PAT is gone from the keychain), and the operator wants full isolation because the feature may
not ship.
**Alternatives:** Push branch to origin — blocked by permissions and weaker isolation;
ask Caleb/Michael to re-add collaborator first — 30-second fix but blocks on another person,
and doesn't isolate. (Getting re-added stays open as a nice-to-have; one push moves the
branch to origin if wanted.)
**Outcome:** Triangular workflow: fetch origin, push fork. Maximum separation at zero cost.
**Made by:** Claude (operator-directed isolation requirement)

## DEC-002 — Mission-control lives in-repo at `planning/`, untracked until asked

**Date:** 2026-08-24
**Decision:** This folder (`planning/plexii-task-command-center/`) sits inside the Plexii
repo per the start-a-new-initiative convention (`<parent_project>/planning/`), left
untracked; committing it to the branch is the operator's call.
**Context:** Feature-scope initiative; the plan should live next to the code it governs.
**Alternatives:** `~/AI/Plexii/` (marketing-repo) — splits plan from code; agent-os
`initiatives/` — that's for system initiatives, and the IP-boundary constraint discourages
cross-tree coupling; committing immediately — operator hasn't asked for commits.
**Outcome:** In-repo, untracked, one `git add planning/` away from versioned.
**Made by:** Claude (convention from the playbook; flagged for operator confirmation)

## DEC-003 — Agent-OS is the governing methodology, not the runtime

**Date:** 2026-08-24
**Decision:** This initiative runs the start-a-new-initiative playbook, phased-build
discipline, quality gates G1–G6 (adapted in QUALITY-FRAMEWORK.md), confidence scoring with
the 0.65 critical-path block, assumption + decision + gap registers — as documents and
dispatch discipline, without wiring agent-os's hook runtime or JSONL meta-logs.
**Context:** Operator: "reference the agent OS file and framework … as starting point and
guide." The agent-os repo's own watchdog logged a FAIL (hook-behavior tests) on 2026-08-24 —
its documentation layer is unaffected; its runtime wasn't going to be wired here anyway.
**Alternatives:** Full runtime symlink into this repo — heavy, entangles Plexii with the
unresolved agent-os IP-boundary constraint, and the hook layer is currently red;
no framework (ad-hoc rigor) — exactly what the operator asked to avoid.
**Outcome:** Methodology + gates + registers here; agent-os tree untouched.
**Made by:** Claude (operator-directed)

## DEC-004 — Analysis before build, spec as the authority

**Date:** 2026-08-24
**Decision:** No code, no schema, no UI until: spec intake (G1) → verified gap matrix (G2) →
approved strategy (G3) → logic-audited architecture (G4) → operator-approved staged roadmap
(G5). Enhancement ideas beyond the spec are proposed and priced, never silently added.
**Context:** Operator: "Don't build anything yet… get the structure and foundation solidly in
place." House rule from agent-os dev pipeline: architecture passes Logic Auditor before code.
**Alternatives:** Start schema work now on the known gaps (GAP-001..003) — tempting, but the
spec decides the task model's shape; building first inverts the authority.
**Outcome:** The pipeline above, with pressure tests at G3, G4, and every Phase 6 stage.
**Made by:** Both (operator framing; Claude formalization)

## DEC-005 — Legacy task branch is reference-only until Phase 4/5 authorizes reuse

**Date:** 2026-08-24
**Decision:** `ryan-task-system-port` (`fd12cc2f`, the distilled task-item slice of
`Ryan-structural-changes`) is harvested as knowledge —
[analysis/03-LEGACY-TASK-BRANCH.md](analysis/03-LEGACY-TASK-BRANCH.md) — but nothing from it
is merged, cherry-picked, or copied into the build until the Phase 4 schema decision and
Phase 5 roadmap explicitly authorize specific artifacts. If reuse is authorized, it happens
by hand-reviewed re-apply from `fd12cc2f`, never a mechanical merge (base is 3.9.8).
**Context:** Operator: "go research that branch… use its knowledge for reference. And
potential to accelerate coding… if it's directly applicable… but do not incorporate anything
yet." Research found the transplant surface is small (10 files; targets drifted ≤210 lines;
zero new deps) and the migration is production-grade with a pinning test.
**Alternatives:** Rebase/merge the branch now — mechanically impossible cleanly (3.9.8 base)
and violates DEC-004's analysis-first order; ignore it — wastes a verified migration and a
polished UX foundation.
**Outcome:** Reference doc written; GAP-001 now carries the branch as exhibit A for the
extend-nodes path; acceleration potential quantified for Phase 5 estimation.
**Made by:** Operator (directive) + Claude (formalization)

## DEC-006 — Preservation & Rebuild Doctrine adopted

**Date:** 2026-08-24
**Decision:** All phases operate under [PRESERVATION-DOCTRINE.md](PRESERVATION-DOCTRINE.md):
(1) Plexii's core critical functionality and UI/UX is inviolable; (2) existing features MAY
be rebuilt when the primary objective needs it, but only via the Crossroads Protocol —
options priced, recommendation given, **operator decides**; (3) foundational changes (schema,
information routing/storage, sync, brain/memory) carry the strictest tier: additive-first,
reversible, dual-validated, regression-guarded. Every SPEC-NNN is triaged P0-core /
P1-supporting / P2-roadmap-later against the operator-confirmed primary objective; the cut
line is operator-approved at Phase 3.
**Context:** Operator pre-spec directive, 2026-08-24: the spec is huge and cross-cutting
(tasks, plans, desks, tools, widgets, command palette, AI/brain, calendar, homepage); triage
matters; current Plexii is excellent and its core must survive; rebuilds are sometimes right
(calendar named as example) but the call is the operator's at each crossroads.
**Alternatives:** Treat every conflict case-by-case without doctrine — exactly the ambient
drift this mission-control exists to prevent; hard "never touch existing code" rule —
contradicts the operator's explicit rebuild license.
**Outcome:** Doctrine doc written; threaded into SPEC-INTAKE (area taxonomy + tier fields +
primary-objective extraction), ROADMAP gates (crossroads docket at G2, cut line at G3,
dual-validated FOUNDATIONAL at G4, regression guard per stage), QUALITY-FRAMEWORK (preservation
rubric dimension), ASSUMPTIONS (A-006 calendar usage).
**Made by:** Operator (directive) + Claude (codification)

## DEC-007 — Schema: widen the `nodes` CHECK; work items are nodes

**Date:** 2026-08-24 · **Made by:** Operator (approving analysis/05-PRE-SPEC-RULINGS.md R1)
**Decision:** The new entity extends the `nodes` table (CHECK widened via a migration modeled
on the harvested, test-pinned `migrateNodesKindCheck`). Replicating metadata = node columns;
purely local state (read cursors, snoozes, delivery records) = satellite local tables.
**Alternatives:** dedicated `work_items` table — rejected: loses free ride on the synced-table
whitelist (`nodes` syncs; a new table needs server-side changes unreachable from the fork),
re-implements org scoping/sharing/IPC/stores.
**Status:** Provisional default the spec may assume behaviorally; **ratified at G4** after
Phase 2 proves new-column passthrough on the sync loop (A-003 residual). If passthrough
fails, this flips to new-table + server coordination and comes back as a crossroads.

## DEC-008 — Routing: spec both scopes; build self-routing P0, person-to-person P1

**Date:** 2026-08-24 · **Made by:** Operator (approving R2)
**Decision:** The spec covers the full routing model (sender clarification, receiver queues,
acknowledgment, closed loops). Build order: self-routing first (P0 — the whole
intent→object→terminal-state model against yourself, zero multi-user variables), then
person-to-person (P1), gated on Phase 2's ACL-semantics verification. The P0 data model is
born routing-shaped: receiver/state fields exist from day one.
**Alternatives:** P2P in P0 — rejected as build-order risk, not feasibility (substrate
verified: messaging/presence/org/ACL-scoped sync all exist); descoping P2P from the spec —
rejected: the data model must be born routing-shaped.

## DEC-009 — Calendar: keep the engine, license the surface, defer the integration

**Date:** 2026-08-24 · **Made by:** Operator (approving R3)
**Decision:** `time_blocks` stays the scheduling engine (it's synced — holds can be
collaborative); Feature-17-style holds/approval land as additive states on it. The Calendar
UI surface carries an operator-granted rebuild license — the specific rebuild-vs-restyle
ruling fires as a crossroads once the specced UX is known. External calendar (Google/CalDAV)
= P2 roadmap.
**Alternatives:** full calendar rebuild incl. data layer — rejected: the engine is good and
synced; external integration now — rejected as P2.

## DEC-010 — Plans: work items parent to desks/rooms; `fb_task_deps` untouched in v1

**Date:** 2026-08-24 · **Made by:** Operator (approving R4)
**Decision:** V1 work items parent to desks and rooms — including Plan-rooms (`isPlan`) —
and do not touch the existing Gantt dependency system (`fb_task_deps` / `projectPlan.ts`).
Deep plan integration (work items as dependency nodes) is P1/P2. The spec includes an
explicit section positioning `work_item` against the existing Plan concept.
**Alternatives:** integrate with fb_task_deps now — rejected: collides with a live system
for a P1/P2 payoff; pretend plans don't exist — rejected: they do (R4 evidence E1).

## DEC-011 — Vocabulary: the entity is `work_item`, permanently

**Date:** 2026-08-24 · **Made by:** Operator ("go with work_item")
**Decision:** Schema/code name: `work_item` / `WorkItem` / `workItemId` (verified
collision-free at a92b30cb). Never `task`/`taskId` (= desk, forever), never "command center"
bare (= ⌘K palette), avoid "Flow" (taken) and "Inbox" (mail exists). New modules refer to
desks as `deskId` in their own signatures, translating to legacy `taskId` only at old-API
boundaries. The spec's §1 defines the full vocabulary. User-facing surface/system naming
(e.g., "Attention") remains open for the spec to propose; the schema name is the forever one
and is now locked.
**Alternatives:** reuse `task-item` from the legacy branch — rejected: still reads as "task,"
and the desk collision zone must shrink, not blur.

## DEC-012 — The surface is "Attention"

**Date:** 2026-08-24 · **Made by:** Operator
**Decision:** The user-facing system/surface name is **Attention** (the Attention Layer) —
rendering as Home widgets, the top-bar collapsed count, and the assistant's conversational
entry. Names the system by what it does, not where it renders.
**Context:** Verified convergence, not collision: `src/shared/context.ts` already defines
`AttentionItem` (evidence-backed, risk-leveled things needing the user: blocked /
review-needed / decision-risk / dependency-changed / stale-context) inside the per-desk
`ContextObject` — alongside `pendingWorkIds` — and `src/main/meta/metrics.ts` measures
`attentionPrecision()`. The new layer is the person-scoped extension of Caleb's desk-scoped
concept; the spec's §1 vocabulary must define that layering explicitly.
**Alternatives:** "Signal" — eliminated: the sync transport is literally "the signal server"
in both `workspaceSync` halves; "Queue" — reserved for the individual queues (using it twice
flattens the hierarchy); location-tied names (dashboard/center) — wrong in two of the three
render surfaces.
**Editorial bonus:** anything that doesn't earn a person's attention doesn't belong in it —
the name is its own feature-creep counterweight.

## DEC-013 — The memory contract's shape (Q5 direction)

**Date:** 2026-08-24 (night) · **Made by:** Operator (direction; detailed design lands at
SPEC-042/043 within the CR-07 lifecycle track)
**Decision:** (1) **Archive is first-class and must ship** — visual cleanup with memory
intact; the default "get this out of my way" action. (2) **Deletion presents an explicit
memory choice**: "preserve this desk's information in your memory" vs. "delete all
information permanently" — the user decides, per desk. (3) **The choice applies to personal
desks.** Shared desks are protected: unilateral deletion is off the table — either all
participants approve, or shared desks cannot be hard-deleted (v1 default pending design;
archive-for-me / leave-share remain available either way).
**Context:** Michael's position — never delete, memory is the value — vs. operator's:
memory value is real AND users need cleanup + genuine deletion agency. The choice dialog
honors both. Repo verification (analysis/09): archive flag + live consumers exist;
trash/restore exists and is already separate from memory; `PERSONAL_ORG_ID` makes the
personal/shared scoping expressible; shared-delete guards don't exist yet and building them
also closes the SPEC-043 trashNode danger for shared desks; memory-purge is new brain-layer
machinery.
**Alternatives:** Michael's never-delete — rejected as sole policy: users without deletion
agency distrust the memory layer ("deletion did not really delete," bug synthesis §3);
always-purge-on-delete — rejected: silently destroys valuable context.
**Note:** this sets the CONTRACT'S SHAPE. Copy, exact flows, purge semantics (what "all
information" includes — brain entries, document content, summaries), and the shared-desk
v1 default are SPEC-042/043 design work, presented for approval before build.

## DEC-014 — G1 batch ruling: crossroads CR-01..07, objective confirmed, IQ-1 resolved

**Date:** 2026-08-24 (night) · **Made by:** Operator ("take your strongest recommendation")
**Decision — all standing recommendations approved:**
- **CR-01 (a):** calendar engine stays; holds render in Attention at v1; surface revisited
  after SPEC-032 ships.
- **CR-02 (a):** Home widget registry is the canonical dashboard; the orphaned portlet
  engine and `ModuleDashboard` are formally deprecated for new work; the dead
  `shared/dashboardRegistry.ts` scaffold is deleted (verified zero importers; the feared
  archived-view dependency was defused in analysis/09 V3).
- **CR-03 (a):** notification substrate lands in main; renderer callers re-pointed; the
  decoy module retired.
- **CR-04 (b):** Pulse and AllTasksView renamed to say "desks" honestly at v1; re-pointing
  at work_items reconsidered at G5.
- **CR-05 (a):** the dead `task-item` declaration is deleted; `work_item` is the only new kind.
- **CR-06 (a):** loose thoughts = classification-only at v1; decay tier P2.
- **CR-07 (B):** desk lifecycle ships as a parallel prerequisite on the fork (resized:
  fix-ratify-expose per analysis/08–09), gated to complete before Phase 5; desks own desk
  state, Attention reads it. DEC-013's memory contract designs within this track.
**Also settled at G1:**
- **Primary objective CONFIRMED as drafted** ("one honest answer to 'what needs me right
  now,' assembled from work that lives where it was created") — operator adopted the
  drafting session's every-word-load-bearing defense without amendment. All triage binds to it.
- **IQ-1 RESOLVED:** bug-synthesis sections 7/8/13/14/17 were deliberately trimmed by the
  operator as redundant — they covered the tasks/calendar/notifications pains whose solution
  IS this build's core objective. The conflict register may claim completeness.
- **GAP-012 refinement adopted (from the drafting session):** the `status` coarse projection
  is DERIVED, never independently writable — single source of truth is `work_item_state`,
  `status` computed at write; SPEC-002 carries the explicit fine→coarse mapping table,
  including that `dismissed` and `reclassified` are NOT completions (never project to `done`).
**Alternatives:** itemized per CR in 00-SPEC-RAW §7 and 07-BUG-CONFLICT-REGISTER §3.

## DEC-015 — Conditional autopilot through the foundation build; SPEC-001+A1 is the strategy baseline

**Date:** 2026-08-24 (night) · **Made by:** Operator
**Decision:** (1) The compiled SPEC-001 + amendment record A1 (analysis/00 + analysis/13)
is the operative **scope baseline** — what and why, deliberately not how; A-01 (protocol
quarantine, never rename `create-task`) and A-02 (`work_item_state` authoritative; `status`
a derived coarse projection) supersede the raw spec's §1.1/§1.5 wherever they conflict.
The actual build plan — schema DDL, IPC signatures, component decomposition, stage
breakdown with verify-commands, and the per-stage build prompts — is **Phase 3's output**,
written against this scope only after Phase 2's evidence, and the per-stage prompts are
written against *approved architecture*, never against the spec directly (operator
clarification, 2026-08-24 night). Q1 (clarification threshold) and Q7 (system
notifications) get concrete proposals returned to the operator DURING Phase 2. (2) **Conditional autopilot:** if the three
remaining Phase 2 items (ACL semantics, sync reliability, gap matrix + adversarial pass)
validate clean and meet the recommendations, proceed directly into Phase 3 (strategy +
logic-audited architecture) and Phase 4 (foundation build: SPEC-001/002/003/005) without
further per-gate operator sign-off — the G3/G5 approvals are satisfied in advance by this
mandate, conditioned on clean validation. (3) The scaffolding still wins on exceptions:
any REJECT-grade finding, new crossroads, deviation from the standing recommendations, or
FOUNDATIONAL surprise halts and presents per the Crossroads Protocol. (4) Open questions
Q1–Q4/Q6–Q8 come due at the phase that consumes them (Phase 5 capture/surface work), not
before; the shared-desk delete v1 default still returns for design approval per DEC-013.
**Context:** Operator: "if you get through these remaining three items without any issues
and things are validated and look clean and meet the recommendations and optimal outcomes
then just continue to work on what's below unless you have other clear directives based on
the scaffolding."
**Alternatives:** strict per-gate pauses — rejected by the operator's explicit instruction;
unconditional autopilot — rejected: the condition ("clean, validated, meets
recommendations") and the scaffolding's exception paths are retained deliberately.
**Made by:** Operator (directive) + Claude (formalization)

## DEC-016 — Q1 and Q7 approved as proposed

**Date:** 2026-08-25 · **Made by:** Operator ("Approved on Q1 and Q7")
**Decision:** Q1 — SPEC-009's single clarifying question fires only on (a) named-recipient
ambiguity with intent confidence < 0.70, or (b) an unanchored deadline phrase on an
actionable class; silence otherwise; hard at-most-one per send; 0.70 is a named constant
recalibrated against `attentionPrecision()` (analysis/16 §Q1 verbatim). Q7 — system events
(agent escalations, cost caps, build-complete) are a distinct **System queue inside
Attention**: same SPEC-006 substrate, own widget in SPEC-014's set (now Tasks · Reviews ·
Calendar · Awaiting Ack · Completed · Stale Desks · System), tagged `origin='system'` on
existing intent classes, **excluded from the headline top-bar count**; CRITICAL system
events may still push OS notifications (analysis/16 §Q7 verbatim).
**Alternatives:** priced in analysis/16 (over-clarifying thresholds; separate tray).
**Consumed by:** Phase 3 architecture (SPEC-009 rule, SPEC-014 widget set, SPEC-015 count
semantics).

## DEC-017 — Phase 6 green light

**Date:** 2026-08-25 · **Made by:** Operator ("Green light — start S0")
**Decision:** Build execution (ROADMAP Phase 5→6 gate) is authorized. DEC-015's autopilot
covers stage-to-stage execution S0–S7 without per-gate sign-off; new scope still stops.

## DEC-018 — Dispatch alignment: all six adoptions

**Date:** 2026-08-25 · **Made by:** Operator ("Adopt all six and continue into S4")
**Context:** analysis/19 — the Dispatch brief (A6 built / A7 planned, paused for this
build) compared against the Attention layer. Verdict: convergent; we are D4's named
critical path.
**Decision:** adopt A-1..A-6 verbatim from analysis/19 §2:
**A-1** per-change attribution reserved in the three work_item write cores (optional
`actor` param — kind/agentRef/missionRef; threaded now, storage decided at D4). This is
a v2.3 §2.3 amendment (recorded there). **A-2** S4's notification substrate is the
Dispatch rail (doc contract; queues `mission-needs-you`/`mission-done` reserved; no
"dispatch/dispatcher" naming in S4). **A-3** `source_type='mission'` reserved (S5 enum).
**A-4** "Dispatch" + "mission" join the vocabulary quarantine; S6 must not use them;
`agentDispatcher.ts` name collision noted for Caleb. **A-5** S6 ships a "By origin"
lens. **A-6** D4 integration doctrine joins the merge-readiness preconditions: agents
write work items ONLY through the workItems module.
**Alternatives:** defer all six to D-phase time — rejected: A-1 retrofit cost multiplies
with every S5+ caller; the rest are documentation-weight now.
**Conflicts registered, not resolved** (analysis/19 §3): C-1 mission-undo vs
no-hard-delete → DEC at D1; C-2 monitor/Attention composition → D1 design; C-4 pre-S6
main-diff checkpoint scheduled.

## DEC-019 — CR-08 ratified + the unified Attention capture model

**Date:** 2026-08-25 · **Made by:** Operator
**Decision (three parts):**
**(a) CR-08 phasing ADOPTED as pressure-tested** — adopt the semantics, phase the
navigation; the anti-goals (aggregate-by-reference, no second silo, restraint) stand;
S7 feeders absorb the flat Tasks tab before it retires; Calendar-tab fate = DEC with
Caleb; Plans stay (DEC-010) and feed Attention.
**(b) One capture model, "Attention" at the top of the hierarchy.** The separate
"Capture a work item" / "Open Attention" entries merge into ONE universal entry:
@attention (or the single palette action, the assistant, the page's own button)
opens the same console everywhere, with Routed/Unrouted/Expand intact. ROUTED
CHANGES: the classifier's pick is no longer silently filed — the console ALWAYS
shows the classification selection with the inferred class PRE-HIGHLIGHTED, so
Enter confirms in one keystroke and a different chip is one click/arrow away
(the deadline question joins the same screen when triggered — still one stop).
User-facing language says "Attention"; the internal work_item schema name is
unchanged (DEC-011).
**(c) One Attention widget** replaces the seven: a single home-canvas widget with a
section slider (All/Tasks/Reviews/Coming up/Acknowledgments/Completed/Stale desks/
System). The seven att-* ids retire via the registry's retired flag (stored
layouts keep loading; the gallery stops offering them).
**Alternatives:** silent-file with post-hoc reclassify (rejected by live QA: first-
touch accuracy is the trust surface); seven separate widgets (rejected: canvas
sprawl — the synthesis's own widget-bloat warning).

---

## DEC-020 — The nav retirement: plan due dates feed Attention; three tabs leave the sidebar
**Date:** 2026-08-25 · **Status:** APPROVED + IMPLEMENTED (operator, verbatim: "Retire
the tabs and add plan due dates to the feeders first")
**Decision:** Executes CR-08(b) in the order the operator chose:
**(1) Plan due dates joined the feeders FIRST.** `deskDueSignals` widened: a plan
root (`kind='folder'` + `is_plan`) with a due date emits a `plan-due` signal
("Plan due tomorrow") opening the plan dashboard; a due desk INSIDE a plan
(parent chain resolved through nested folders, 20-hop cycle guard) also emits
`plan-due` with the plan's name on the line ("Due in 2 days · Launch") opening
the desk. Plain desks stay `desk-due`. Distinct kind ⇒ independent whole-kind
mutes and Δ10 offers. Feeders stay computed, one-directional (F006), out of the
headline badge (DEC-016).
**(2) Then three sidebar tabs retired, both rail states:** "Desks (flat)" /
all-tasks, Plans, and Calendar left the sidebar (expanded NavRows + collapsed
icons). Absorption, not deletion: every view stays routable — MainPane cases
untouched, ⌘K palette carries "All tasks", "Calendar", and a NEW "Plans" entry
(the palette had no direct Plans opener; added before the tab went). Calendar
ENGINE untouched per DEC-009 — blocks, reminders, scheduling all live; only the
nav row is gone. Plans/AllTasks/Calendar views + their code: unchanged.
**Caleb note (merge precondition list updated):** the Calendar tab is a shared
surface — upstream merge must either carry this retirement or re-add the row;
flagged in the G6 ledger.
**Alternatives:** hide Plans without feeder coverage first (rejected — a due
date must never lose its surface, even for one build); delete the views
(rejected — palette reachability is the escape hatch while Attention earns
trust).

---

## DEC-021 — The delete contract: D1 + D2 + R008 adopted as proposed
**Date:** 2026-08-25 · **Status:** APPROVED (operator: "Adopt all three") + IMPLEMENTED (L2)
**D1 — shared desks are never trashed unilaterally in v1.** The lifecycle menu
offers **Archive for me** (the `archived` flag made genuinely SCOPE-LOCAL for
shared rows — stripped from shared sync in BOTH directions, or one side would
silently overwrite the other's choice) and, on received shares, **Leave share**
(self-revocation via the access API + local prune; server-decline leaves
nothing half-removed). The trash entry renders disabled with the reason; the
db layer backs it with a typed refusal (`SharedDeskTrashRefusedError`) at
`deleteNode` AND the purge. All-participants-approve deletion = P1 flow.
**D2 — the delete choice dialog.** Deleting a personal desk/room asks once:
**Move to Trash** (default — today's exact behavior, 7-day window + undo,
memory untouched, now STATED in copy) or **Delete everything permanently** —
immediate hard-delete of the whole subtree (trashed descendants included)
plus its memory: `fb_memory` facts (subject/`<type>:<id>` refs), `fb_chunks`
derivations (room- and widget-keyed) + extraction ledger, and context review
points — behind a typed-name confirmation, with a logged `[purge]` summary.
Scope is adversarially tested: exactly the subject's rows die, bystanders
bit-identical. The purge is the FOURTH sanctioned hard-delete site
(`purgeDeskPermanently`, nodeLifecycle.ts), carrying its own
detach-and-revive + CI allowlist marker; the lock's enumeration widened 3→4.
**R008 — RATIFIED: no work_item hard-delete, permanently.** Dismiss/reclassify
is the lifecycle; BOTH delete paths preserve attention items (trash sweeps
them restorably; permanent purge detaches them back to the Attention page —
the dialog says so, and a post-purge notice counts them). Re-opener: a
privacy-erasure requirement.
**Alternatives:** consent-based shared deletion at v1 (rejected — needs
infrastructure P1 builds anyway); purging work items with their desk
(rejected — R008's whole point; a routed item is not desk property).

---

## DEC-022 — Delete reshape (operator QA) + bulk selection on the indexes
**Date:** 2026-08-25 · **Status:** APPROVED (operator QA directive) + IMPLEMENTED
**(a) The D2 choice dialog is retired; placement over prompting.** Operator QA:
the delete-time two-choice dialog never appeared on the index pages (they had
NEVER adopted the shared lifecycle definition — exactly the drift it exists to
prevent) and reads as redundant. Ruling: archive ≠ trash stands (archive =
keep-but-hide forever; trash = discard, 7-day clock, memory persists), but the
CHOICE moves to where the trash lives: **"Move to Trash" is direct everywhere**
(undoable, no dialog), and **"Delete permanently" is a per-item action on the
Trash page** (OS empty-trash shape) — typed-name confirm, immediate purge +
memory erase, attention items still revive (R008). The memory contract is
stated in the Trash page's header copy. DEC-021's db layer (purge site 4/4,
memory purge, guards) is unchanged — only the affordance moved.
**(b) The index pages join the ONE lifecycle definition.** DesksView and
RoomsView now build lifecycle actions from `lifecycleIndexActions` (same
source as the card/breadcrumb menus): personal → Archive/Trash; shared →
Archive-for-me / Leave-share / the D1 reason (rooms included — same rules as
desks, as directed).
**(c) Bulk selection (both index pages, one engine).** RoomsDesksIndex gains
a selection mode: a **Select** button in the toolbar (gallery/list/table),
click-to-toggle with visible checks, Select all/none, and a selection bar
carrying the page's bulk actions — desks: **Move to room… / Archive / Move to
Trash**; rooms: **Archive / Move to Trash**. Bulk trash = ONE undo toast over
every subtree (`removeMany`); shared items are skipped from trash with an
honest count (D1); archive applies scope-local to shared rows.
**Alternatives:** per-card persistent checkboxes (rejected — noise outside
selection mode); dialog kept at delete time (rejected — operator QA, and the
Trash-page placement answers the discovery failure directly).

---

## DEC-023 — V2 first picks: capture-from-desk parenting + the Settings toggle
**Date:** 2026-08-25 · **Status:** APPROVED (operator: "do the two V2 quick wins") + IMPLEMENTED
**(a) Capture-from-desk parenting.** The capture console snapshots the view at
open time: over a live, personal desk view, the filed item is PARENTED to that
desk — a visible "on <desk>" chip with a one-✕ opt-out files standalone
instead. Conservative by construction (`lib/captureContext.ts`): only
`view.kind === 'task'`, desk live, not archived, NOT shared (§2.6 keeps work
items personal at P0). Desk surfaces stay blind to the item (quarantine
unchanged); what parenting buys: the By-origin lens, honest provenance, and
desk-trash → detach-and-revive semantics now reachable from real usage (this
also creates the parented items the last live GAP-015 arm needs).
**(b) The Settings toggle.** Settings → AI → "Attention layer":
`workItems:setEnabled` IPC over the persisted pref (attestations preserved),
honest copy (off = no capture, no AI filing; captured data stays). Applies
live — vocabulary reads the pref per call; the ⌘K entry re-probes on
`fb:workitems-toggled`; the badge rides `fb:workitems-changed`.
**Also this session:** instance B shut down + its throwaway profile removed;
the UPSTREAM-PR-PACKAGE.md deliverable produced (paste-ready PR body, flagged
diffs, findings F-1…F-6, preconditions checklist, drift status: 6 upstream
commits, no sync-engine collisions, ipc/index.ts only).

---

## DEC-024 — Polish stage 1: the FYI deadline backstop + work-item archival
**Date:** 2026-08-26 · **Status:** APPROVED (operator: "Start the polish stage") + IMPLEMENTED
**Push rule in force:** fork branch only until the operator declares Attention
fully ready; `saasmouth main` untouched (the earlier landing never executed —
confirmed and kept that way by the operator's wait-until-finished directive).
**(a) FYI deadline backstop.** A dated FYI now gets ONE quiet nudge when its
date ARRIVES — never "due soon" (FYIs aren't due), inbox layer not
interruptive, same `wi-due:{id}:{day}` dedupe and substrate caps, with a 24h
lookback so pre-feature dates stay silent. Second arm in
`postDeadlineNudgesCore`; the restraint doctrine holds (still exactly one
proactive trigger family).
**(b) Work-item archival.** New terminal state `'archived'` — "keep it, done
looking at it": projects to `parked` (never done), leaves the queues and the
Detached shelf, is NOT a loop closure (no notification — source-locked), stays
out of Recently closed, never decays or nudges, and lives on a collapsible
**Archived** shelf on the Attention page with one-click Unarchive (state →
open). Archive verb on every queue row. Rides sync via the existing
state-column manifest; un-updated peers coarsen it to 'open' until they
update (accepted, noted in the enum).
**Alternatives:** an orthogonal archived FLAG beside state (rejected —
"archive an in-progress item" is not a real need at v1 and the flag doubles
every visibility predicate); interruptive FYI nudges (rejected — restraint).

---

## DEC-025 — Multi-intent captures
**Date:** 2026-08-26 · **Status:** APPROVED (operator: "Start multi-intent") + IMPLEMENTED
**Decision:** A compound capture ("call Bob Thursday and review the deck") is
TWO loops wearing one sentence — and now files as such, still in ONE stop.
**The splitter (deterministic, `intentRules.splitCompound`):** strong
separators (newline, semicolon) always cut; weak joiners (and/then/also/plus)
cut ONLY where the right side independently trips a hard trigger — so
compound OBJECTS ("call Bob and Alice") never split, making a false secondary
structurally rarer than a missed one. **Secondaries** (≤3, rules-only, never
a model call): own class, own title, own ANCHORED date (an unanchorable
phrase files dateless — Q1 stays at-most-one and belongs to the primary,
DEC-016 intact). **The primary classifies on its own first segment** (title,
date, Q1 all from segment 1; notes keep the full capture verbatim).
**Console:** the confirm stop shows "Also caught …" as PRE-CHECKED chips —
one Enter files the primary plus every checked secondary (uncheck = opt out);
the filed toast counts them; desk-context parenting (DEC-023) applies to all.
**Alternatives:** model-driven splitting (rejected — latency + R011, and the
trigger discriminator is the honest precision boundary); a second confirm
screen per secondary (rejected — DEC-019's one-stop rule).

---

## DEC-026 — The opt-in cleanup rewrite (Δ6)
**Date:** 2026-08-26 · **Status:** APPROVED (operator: "Start cleanup rewrite") + IMPLEMENTED
**Decision:** Messy brain-dump captures get an OFFERED tidy — never a silent
rewrite. A deterministic messiness gate (`needsCleanup`, pure + tested: 30+
words, filler-dense, or an 18+-word unpunctuated run-on) decides whether the
capture even qualifies; a Haiku call (new purpose `capture_cleanup`, routed +
shown in the model picker's Auto table) extracts a crisp ≤90-char title and a
1–3-sentence gist — facts only, nothing invented, writer's language kept.
**Latency contract:** the proposal is requested async AFTER the confirm
screen is already up — a capture never waits on it; slow/failed proposals
simply never appear (null on every failure mode; a seq guard drops stale
arrivals after re-edits). **Approve-before-apply:** it renders as an offer
row ("Tidied: … — Use tidied / ✕"); using it swaps the title, adds the gist
as the notes' lead, and keeps the capture verbatim below "— as captured —";
one-click Undo before filing. The verbatim text is NEVER lost, tidied or not.
**Alternatives:** blocking tidy on the classify path (rejected — R011's
budget); silent auto-tidy above a confidence bar (rejected — first-touch
trust is the product; Δ6 said propose-and-approve and it stays that way).

---

## DEC-027 — The composer @attention typeahead + deterministic interception
**Date:** 2026-08-26 · **Status:** APPROVED (operator: "Start typeahead") + IMPLEMENTED
**Decision:** The chat composer finally knows "attention" — as a **command,
not a mention**. The @ picker offers "Attention — capture what follows"
(top row while `attention` matches, capability-gated with live re-probe);
picking it inserts the literal text `@attention ` — NEVER a chip, honoring
the mentions doctrine's own rule that a kind with no resolver must never
become a reference. On send, a **leading** `@attention` is intercepted
deterministically in `submitComposer`: the message never reaches the model —
the remainder routes through the one `fb:command-new-work-item` seam into the
capture console (DEC-019's single model: same confirm stop, chips, tidy,
desk-context parenting). Mid-sentence @attention keeps the AI proposal path;
a mode-locked Search stays literal (interception sits after the search
branch). Diffs into Caleb's mentions machinery kept additive + minimal:
one command branch, one picker row source, a widened label union.
**Alternatives:** a real 'attention' mention KIND with chips (rejected —
no resolver → lying chips, plus wire-shape churn in Caleb's shared types);
send-then-AI-files (the old path — kept as the mid-sentence fallback, but the
leading imperative now never pays model latency or model judgment).

**WITH THIS, THE GA CHECKLIST'S BUILD ITEMS ARE COMPLETE (①–⑤).** Remaining
before the reveal: the operator's ⑥ live smokes, then the landing command.

---

## DEC-028 — @attention everywhere: inline chat card, Tab-to-arm, the Slack-style pill
**Date:** 2026-08-26 · **Status:** APPROVED (operator QA directives) + IMPLEMENTED
**(a) The confirm stop is now ONE component.** `AttentionConfirmCard` extracts
DEC-019's confirm flow (classify, pre-highlighted chips, ←/→/Enter, DEC-025
secondary chips, DEC-026 tidy offer, Q1 date) — the console overlay and the
chat both render it; the flow can never fork again.
**(b) Chat files INLINE.** A leading @attention send renders the card in a
bordered box above the composer — the operator never leaves the chat. Cancel
restores the message (via fb:composer-stage) exactly as typed; filing shows a
4s confirmation line in place. deskCtx snapshots at send.
**(c) Keyboard-first on every @ surface.** Chat picker: Attention rides FIRST
while "a…" prefixes it; Tab already selected (Enter‖Tab). ⌘K: "@a…" partials
surface the entry on top; **Tab ARMS a pill** — the query then IS the capture
text, Enter files, Backspace-on-empty disarms. Home bar (StartOrAskPlexi):
same grammar — Attention row atop the @ picker, Tab/pick arms, armed Enter
routes to the card, Esc/Backspace disarms.
**(d) The Slack-style visual cue.** Chat: picking Attention inserts a REAL
mention chip (accent pill, "@attention") — visual only: onPick is skipped so
it is never a stored reference (the no-resolver doctrine holds); its title
serialises to "@attention" so the interception fires. ⌘K + home bar: an
accent "@attention" badge sits in the input while armed.
**Alternatives:** a stored 'attention' mention kind (rejected again — wire
churn + lying chips); popping the console from chat (the operator's exact
complaint — retired).

---

## DEC-029 — Taxonomy law + the groundwork split
**Date:** 2026-08-26 · **Status:** APPROVED (operator) + EXECUTED (split); law recorded
**(a) The five taxonomy tests (T-1 infinitive · T-2 single axis · T-3 life
stability · T-4 honest parent · T-5 distinct question sets) + the
anti-collision rule are adopted as STANDING LAW** for all category/vocabulary
decisions, per the operator's eight-category synthesis and analysis/22's
review. **R-06 confirmed as doctrine:** recipient-presence triggers the
mandatory-clarification lane (P1/SPEC-027); self-capture always keeps the
one-keystroke bail-out (shipped as Unrouted). Everything else in the synthesis
— the rename to the eight primaries, To Decide, the Respond consolidation,
reserved `intent_sub`, the clarification engine, R-01…R-05/R-07 — is
sequenced POST-LANDING per analysis/22 §5 (alignment stage first, engine with
SPEC-027, R-04 gets its own analysis before any ruling).
**(b) The groundwork split (operator: fixes to main now, Attention continues
on the fork):** four Attention-independent fixes were extracted onto
`groundwork-fixes` (branched from main 7be3be4c, surgical patches — not file
copies): ① chat/workspace-ask non-streaming on credits, ② mention-picker
keyboard selection (F-9), ③ room→scoped-desks routing, ④ the permanent-409
baseRev floor (F010) with the [sync-409] trail. Main's own suite green
(2,604) + typecheck clean. Branch pushed to `saasmouth/focusbuddy` and opened
as **PR #2** (https://github.com/saasmouth/focusbuddy/pull/2) — merge is one
click for any co-owner; fast-forward-clean. NOT separable (stay on the fork):
lifecycle/delete contract, bulk selection, sync widenings, park-inbound —
all entangled with the work_item schema. Known cost: when the fork branch
next merges main after PR #2 lands, the six shared files conflict textually
(branch is the semantic superset — resolve keep-branch).

---

## DEC-030 — Leave it landed; iteration continues on main's substrate
**Date:** 2026-08-26 · **Status:** RULED (operator)
**Context:** After PR #4 merged, the operator revealed "declare ready" had been
a misunderstanding — he believed he was confirming the groundwork split
(DEC-029b), not authorizing the full landing, and his standing intent had been
wait-until-finished (the fork-only rule). He asked whether reverting the
Attention layer off main was feasible without pain.
**Analysis given:** (1) a revert cannot un-reveal anything — PR #4's diff, the
shared-repo branch, and the in-repo planning corpus are permanently visible in
history; the real usage gate is `workItems.enabled` default-OFF; (2) reverting
a merged branch plants the revert-then-re-merge trap (git treats the 91 commits
as already-in-history; re-landing later requires revert-of-the-revert); (3) the
layer is dormant for Michael + Caleb until they toggle it.
**Ruling:** **"Leave it landed, let's keep working through the attention
layer."** The landing stands. Future Attention work iterates on the branch and
lands in rounds via PRs when the operator chooses — no revert, no freeze.
**Owed:** the operator sends Michael + Caleb the WIP framing note (drafted in
session: the big PR is the Attention layer, work-in-progress, off by default,
don't toggle it on yet).
**Process lesson (standing):** before any big irreversible or outward-facing
action, the assistant restates CONCRETELY what is about to happen ("this
merges 91 commits into main, visible to the team immediately") and gets fresh
explicit confirmation — never executes off a pre-agreed codeword alone.
**Numbering note:** the CR-09 brainstorm rulings (D-A…D-K, analysis/21) will
record as DEC-031+; older pointers saying "→ DEC-029/030" mean "the next DEC."



---

## DEC-031 — @attention is deterministic ANYWHERE in the message
**Date:** 2026-08-26 · **Status:** RULED (operator: "yes to all three — do them") + IMPLEMENTED
**Context:** DEC-027 made a LEADING @attention deterministic and deliberately
left mid-sentence/trailing on the AI proposal path. Operator live QA broke that
premise: "i need to create a pitch deck for cetra by friday @attention" produced
only a create-page card — the item never reached the queue. A prompt rule the
model can ignore is not a capture guarantee.
**Ruling:** the token is an ADDRESS, not a topic. Wherever it sits, the capture
happens deterministically. What position still decides is the fate of the REST
of the message: **leading** = pure capture (the model never sees it, DEC-028's
inline card); **inline** = capture AND still send the message with the token
stripped, so a "build me X @attention" gets both halves — the build action the
operator liked AND the tracking item he was missing.
**Implementation:** ONE shared grammar (`lib/attentionCommand.ts`) read by the
chat composer, ⌘K, the home bar, and the chat store — four private regexes
could not be kept honest. Two bypasses were found only by driving the real UI:
(a) ⌘K's omni rows hard-score "Ask Plexii" at 2000 and outranked the capture
entry (the operator's exact 30s path) — omni rows now yield while the token is
present; (b) ⌘K/home/voice call `chatStore.send()` DIRECTLY, bypassing the
composer where the interception lived — `send()` is now the last-mile guarantee.
The composer strips the token before calling it, so double capture is
impossible by construction.
**Alternatives:** strengthening the prompt rule only (rejected — tried first
this same session; it is a nudge, and the operator asked for a guarantee);
pure-deterministic with no message sent (rejected — it would have silently
removed the buildable half he explicitly valued).

---

## DEC-032 — desk-placed proposals carry their own target
**Date:** 2026-08-26 · **Status:** RULED (operator) + IMPLEMENTED
**Context:** operator QA: "It's making me manually select the desk even though
it already identifies the right desk." True, and structural — `create-page`
carried no desk field at all, so the card genuinely could not know; a desk named
in the model's PROSE is not machine-readable. Off a desk, every desk-kind card
dead-ended into the chooser.
**Ruling:** desk-placed proposals may name their destination. Optional `deskId`
on create-page / create-widget / create-todo-list / create-table; the model is
shown a real desk ROSTER (ids + titles, capped at 25, newest first) in both the
chat and agent-loop prompts, and is told to use an exact id and never invent
one. The card resolves id-then-title against the live node store and applies
there without asking.
**Safety rule:** an id (or title) matching nothing live resolves to null and the
normal chooser runs — a stale or hallucinated id must NEVER silently retarget a
different desk. Pure resolver in `lib/proposalDesk.ts`, unit-tested including
that refusal.
**Cost noted:** the roster rides the cached system prefix; desks change rarely
enough for that to hold, and it is capped.

---

## DEC-033 — the ask-latency trail (and what it already proved)
**Date:** 2026-08-26 · **Status:** RULED (operator) + IMPLEMENTED + MEASURED
**Context:** operator QA: a ⌘K ask "took over 30 seconds" with no visible
progress, and nothing in the app could say where the time went.
**Ruling:** instrument before optimising. `[ask-latency]` in `sendChatStream`
reports total / retrieval / time-to-first-token / generate, the system-prompt
size, token counts, cache reads, the model, and — decisively — whether the turn
actually STREAMED.
**First measurement on the operator's own setup:** `total=7350ms
retrieval=831ms ttft=6518ms generate=1ms streamed=false in=660 out=252`.
**What it proves:** retrieval is not the problem (<1s). `streamed=false` is: the
PlexiDesk-credits proxy rejects streaming outright (a known constraint, see the
credits arm in `sendChatStream`), so the ENTIRE answer is generated before a
single character reaches the screen. At ~40 output tokens/sec, the operator's
"thorough" answer was simply ~30s of generation with **zero feedback by
construction** — not a hidden inefficiency, and not something a code fix in
this repo can shorten.
**Open (needs a ruling, not yet built):** the honest levers are (a) BYOK — his
own Anthropic key streams, and the wait becomes visible progress; (b) a real
progress affordance for credits mode; (c) trimming output size for simple asks.
(a) is the only one that removes the wait rather than dressing it.



---

## DEC-034 — Capture is task + optional notes, then a PREVIEW of the finished item
**Date:** 2026-08-26 · **Status:** RULED (operator, from his own queued items 3+4) + IMPLEMENTED
**Context:** two of the operator's own captured to-dos, built as one round because
they are one flow. (3) "There should be an optional notes section on attention
items… write the task, hit tab, add some additional context, then hit enter."
(4) "instead of the button being 'Classify' it should just be 'Enter'… the next
section should be an example of the tidied up version… formatted how the final
task will look, and if the user approves all they have to do is click enter,
otherwise… 'Enter As Is' which doesn't clean up any of the title or notes."
**Ruling + implementation:** the console gains a second, optional NOTES field
(Tab into it, Enter from either field files; Shift+Enter still newlines). The
button says **Enter ↵** — "Classify" named an implementation detail and
mis-described the key. The confirm card stops ASKING what the capture will
become and instead PREVIEWS the finished item — class icon, title, notes, due
chip, target desk — laid out as it will sit in the queue.
**The tidy moved INTO the preview** (amends DEC-026's presentation, not its
principle): it used to sit beside the card as a "Use tidied" offer; it now
lands in the preview when it arrives, marked "Tidied · undo", with **Enter as
is** filing the operator's own title and notes untouched. Approve-before-apply
still holds — approval is now the Enter he was already pressing. "Enter as is"
appears ONLY when a tidy actually changed something, else both buttons file an
identical item.
**Latency contract intact (R011):** the tidy is still requested AFTER the screen
is up; a capture never waits. A slow or absent tidy means the preview shows the
operator's own words — a correct outcome, not a degraded one. The tidy now reads
the notes too, so a crisp task line with a rambling note qualifies and the note
is cleaned rather than replaced by a summary of the title.
**Preservation:** verbatim capture is never lost on any path — tidied items keep
the original under "— as captured —"; untidied ones keep BOTH the notes and the
typed text whenever the derived title dropped part of it (a stripped "fyi:", or
only the first sentence becoming the title). Letting notes win alone would have
silently discarded the rest; caught in review, pinned by test.

---

## DEC-035 — Grouping + manual order in the queue (the six-dot handle)
**Date:** 2026-08-26 · **Status:** RULED (operator, his queued item 2) + IMPLEMENTED
**Context:** "if I have 2 tasks created at different times but they end up being
related there should be that six dot icon thing next to the tasks that allow me
rearrange tasks, move them to other sections, or even attach to already existing
tasks for grouped tasks/related task or subtask."
**The architectural constraint that shaped it:** work items are LEAF nodes
(§2.5 leaf invariant — nothing nests under a work item, enforced at create AND
at sync apply), and `parent_id` already means "the desk this lives on". A
subtask via parent_id was therefore structurally unavailable.
**Ruling:** grouping is a **SIBLING reference** — `group_id` = the leading
item's id — joining the column manifest, so it syncs / is allowlisted / is
emitted without touching a transport by hand. **Exactly ONE level**, enforced
at the DB and not merely in the UI: a leader can never be grouped, self-grouping
refused, a non-item leader refused, and grouping onto a CHILD flattens to that
child's leader. A group can never become a tree, whatever writes it.
**Three gestures, one handle:** drop on a row's middle = attach; top/bottom =
reorder; on a section header = move sections (a reclassify, machinery that
already existed). Native HTML5 drag — the house pattern; there is no dnd
library in this codebase.
**Ordering:** manual placement beats the ranker ONLY where the operator placed
something (`sortOrder` 0 = never dragged → keeps its ranked position); a drop
renumbers the whole queue from 1, which keeps order stable and tie-free as items
come and go. `sort_order` is a base nodes column already in the sync body, so a
hand-ordered queue travels between devices without joining the manifest.
**The failure mode it must never have:** a child whose leader leaves the queue
(completed / reclassified / snoozed) is **PROMOTED to standing alone, never
hidden** — an item vanishing because of something that happened to a DIFFERENT
item would be unforgivable. Pinned by test.
**Scope:** Queue lens only; Due and Origin answer a different question and stay
ranked. Deferred: multi-select drag, cross-queue grouping.



---

## DEC-036 — Double-click opens the whole item for editing
**Date:** 2026-08-26 · **Status:** RULED (operator) + IMPLEMENTED
**Decision:** double-clicking a queue row opens an editor over the ENTIRE item —
title, notes, classification, due date, urgency, tags, and the desk it lives on.
Closes the oldest Layer-0 gap (analysis/21 §12 "no post-creation editing").
Only CHANGED fields are written, so editing one field can never restamp another;
the desk change is a node MOVE (the Detached-shelf recovery's own call), not a
work-item field. Guard lesson: "ignore double-clicks on buttons" blocked nearly
the whole row (the title and expander ARE buttons) — the exemption is scoped to
the action cluster only, pinned by test.

---

## DEC-037 — Context chips (derived) + tags/urgency (chosen), and the two doors
**Date:** 2026-08-26 · **Status:** RULED (operator) + IMPLEMENTED
**Decision:** every row shows what it is ABOUT, in two deliberately different
kinds. **DERIVED** (never typed, never stale): the desk it lives on, the PLAN
enclosing that desk, what it was marked from — plan chip opens the plan, desk
chip opens the desk. **CHOSEN** (never mandatory): `wi_urgency`
(low/normal/high/urgent — 'normal' renders NO chip; a badge every row wears
says nothing) and free-form `tags` (new manifest column; comma-delimited,
normalized, capped; empty = NULL). A tag bar shows the vocabulary in use with
counts; one tag filters at a time — narrowing to a thread of work, not a query
language. **The two doors (the Notion finding):** the desk button opens a
CANVAS, and what the canvas hosts does its own thing — marking a Notion tool
and pressing "desk" launched the external Notion app. "Open it here" now puts
the marked object into Focus Mode full-screen inside Plexi; the desk button
remains the whole-canvas door. Verification note for the record: a manifest
column can EXIST in the DB while main still runs pre-column code — reads come
back undefined and look like a write failure; restart first.

---

## DEC-038 — "Start it with Plexii" = a PREFILLED CHAT, staged never sent
**Date:** 2026-08-26 · **Status:** RULED (operator: "start it should open a
prefilled chat") + IMPLEMENTED
**Decision:** the bridge from a captured intent to the work itself. Each row
gains "Start it with Plexii"; a Select mode (the index pages' own bulk shape)
gains "Get started with Plexii" over a multi-selection. The prompt is composed
from what was ALREADY captured — title, notes verbatim, desk, plan, due,
urgency, tags — with a PER-CLASS ask (deciding is not doing: to_decide lays
out options and costs, to_respond drafts a reply, to_review says what to look
at first…). No model call builds it; it works with the key removed.
**The hard rule:** it is STAGED in the composer (fb:composer-stage — the same
seam Expand uses) and NEVER auto-sent; the assistant must not start acting
because the operator glanced at his queue. Pinned by test (the hand-off
contains no .send call). A single-item start navigates to the item's desk
first so the chat carries that desk's context; a multi-start lists the items
with their context and asks for sequencing, deliberately NOT inlining N
notes-paragraphs. **Verification:** prompt composer + stage-not-send are
unit/pin-tested; the live click-through was not visually confirmed — the
operator was actively using the app and driving it further would have
interrupted him.



---

## DEC-039 — Capture-time context: urgency + tags on the preview; tags become @-MENTIONS
**Date:** 2026-08-26 · **Status:** RULED (operator) + IMPLEMENTED (P0 half)
**Decision:** the confirm card's preview screen carries the chosen context —
an urgency row and ONE shared TagMentionInput — so an item can arrive in the
queue already tagged; both ride the CREATE itself, not a follow-up patch. The
same input serves the manual form and the item editor, so the @ grammar
cannot fork. Grammar: a plain word is a free-form tag; "@" opens a typeahead
over the PRIMARY GROUPINGS — people (org directory), desks, rooms, plans —
and picking one attaches a TYPED mention ({kind,id,title} in the new
`mentions` manifest column; JSON, defensively parsed — the column rides sync
and a peer could write anything; title frozen at pick time so a dangling
mention degrades to text, never a blank).
**Chips:** mention chips render on rows after tags. Desk/room/plan mentions
NAVIGATE (goTask/goRoom/goProject). A PERSON mention is stored and shown with
honest copy — "notifications arrive with routing" — because pinging them is
SPEC-027; the reference is captured NOW so nothing is re-entered when the
rails land.
**THE BIGGER PROGRAM (registered, not built):** the operator's directive —
@-mentions of people/desks/rooms/plans THROUGHOUT the app (docs, sticky
notes, messaging, any surface) to bring someone's attention to a thing. This
is the cross-reference rail (analysis/21 §13) + SPEC-027 routing converging:
mention-in-any-surface → a to_respond item in the mentioned person's queue.
The chat composer's mention machinery (tiptap MentionSuggestion) and this
input's grammar are the two seeds; unifying them + the routed-notification
half is its own initiative with Caleb's surfaces involved (docs/stickies are
core PlexiDesk). Sequenced with SPEC-027; nothing else rides it quietly.
**Session note (two sessions, one worktree):** a second Claude session was
mid-flight on tidy/auto-arrange in this SAME working tree. Its four files
(FloatingPill, autoArrange, two tidy tests) were left untouched and
uncommitted here; its two failing tests are its own WIP, not this round's.
One earlier commit (`1d0ac432`) had already swept 28 additive lines of its
autoArrange work via a broad `git add` — disclosed, harmless (suite was
green), and staging is explicit-file-list from now on.



---

## DEC-040 · DEC-041 — (parallel session) tidy geometry + widget-menu honesty
**Date:** 2026-08-26 · **Status:** IMPLEMENTED by the PARALLEL session, recorded here for continuity
A second session working this same branch shipped two rounds without log
entries: `860644fd` "tidy stops stretching widgets, and square grid picks its
own shape" (claims DEC-040) and `e846113e` "the widget menu only offers what
it can actually do" (claims DEC-041). Numbers honored as theirs by commit
order. Cross-check done here: the Attention menu row (CR-09 D-A) survived
their contextMenu changes; resolver + preset suites green after their commit.

---

## DEC-042 — Notes on EVERY capture path; the tidy always attempts on real content
**Date:** 2026-08-26 · **Status:** RULED (operator) + IMPLEMENTED
**⚠ Numbering note:** commit `bbe2c397` and its code/test comments say
"DEC-040" — written before the parallel session's commits surfaced and took
040/041. THIS log is canonical: the notes/tidy round is **DEC-042**.
**Finding 1 — "I lost the ability to add a note… in the ai chat… sometimes
I see it."** The notes stage lived on the console's textarea screen; the
chat's inline card and every prefilled console open (armed ⌘K pill,
@attention) render the confirm card DIRECTLY and never visit that stage.
**Fix:** the preview itself carries an editable notes area on every path.
Enter inside it = newline; ⌘/Ctrl+Enter files. Card-typed notes are the
operator's own words: the tidy never clobbers them (notesEdited guard) and
"Enter as is" keeps them while reverting only the AI's title rewording. The
bare manual form gains a notes field (it never had one).
**Finding 2 — "sometimes I get the tidied up version, other times I don't."**
The DEC-026 messiness gate only requested a tidy for 30+ words / filler /
run-ons; medium captures showed raw. Per the operator's restated contract
(Enter → ALWAYS the tidied version → Enter files the cleaned version),
`qualifiesForTidy` now fires on 8+ words, multi-sentence text, attached
notes, or the messiness signs; tiny fragments still skip ("call Bob
Thursday" IS its own tidy). The armed second Enter waits (4s cap) for the
in-flight tidy so it files the cleaned version. Regex lesson pinned: the
first multi-sentence probe used `[.!?;]\S` and missed normal prose — the
slice(0,-1) trick from needsCleanup is the correct test.



---

## DEC-043 — A page per class; on-brand subtle colors; drag-only reclassify; light tidy
**Date:** 2026-08-26 · **Status:** RULED (operator) + IMPLEMENTED
**(a) Tabs.** The eight classes become PAGES: a tab row (All + the eight, with
counts) above the queue. A class tab shows only that queue — no scrolling past
the others; All is the old full-list view. Tabs are DROP TARGETS, which is what
makes drag-reclassify work on a single-class page. Due/Origin lenses still show
everything. **(b) Colors from the ONE palette:** each class takes a PlexiSuite
brand-family hue (tokens.css — the product groups' own accents): To Do sky,
Review violet, Decide amber, Respond teal, Meet green, Discuss indigo, Remember
lightbulb yellow, Know neutral slate. Subtle by construction — icon tints, a
10%-alpha wash + soft underline on the active tab, never a colored panel.
**(c) The row reclassify button is REMOVED** per the ruling; the two paths are
drag (section or tab) and the editor's class chips. **(d) Tidy calibration:**
the model-tidy bar drops 8→5 words, and BELOW it a deterministic light tidy
capitalizes every derived title (first letter, standalone "i", weekdays/months
with "may" excluded, a name after a person-verb unless stopword) — "call bob
thursday" → "Call Bob Thursday" with zero model calls; only ever ADDS capitals,
idempotent, reaches secondaries.



---

## DEC-044 — A highlight IS the capture: full selection → notes, on every surface
**Date:** 2026-08-26 · **Status:** RULED (operator) + IMPLEMENTED
**Finding:** marking a highlighted passage ("Add to Attention" on a desk page)
produced a good title and EMPTY notes — the mark used the widget-level preset
and never read `ctx.selection`; the highlighted text was dropped. And the AI
chat's selection menu offered only sticky/note/copy — no attention option.
**Ruling + implementation:** `presetForSelection` — the selection's first line
titles the item ("+N more" when a list was highlighted), the FULL selection
rides the notes verbatim; one-line selections keep empty notes rather than
repeating the title; class still from the host kind. The notes travel the whole
path (menu → seam's new `notes` field → console store `initialNotes` → notes
field → card → item), pinned at every hop. The chat menu gains "Add to
Attention…" as its FIRST row, deliberately NOT desk-gated (an item files
standalone; sticky/note need a canvas). Class call worth recording: an AI-chat
selection routes to the DEFAULT to_do, not chat→to_respond — a highlighted AI
answer is something to act on; nobody awaits words back from a bot.



---

## DEC-045 — The Attention widget on any desk (CR-09 D-B, ruled)
**Date:** 2026-08-26 · **Status:** RULED (operator) + IMPLEMENTED
**Decision:** 'attention' becomes a real CANVAS widget kind — catalog entry
(Tools, 380×340), picker row, renderer case — so the home screen's
command-center face is placeable on any desk. **Scope:** defaults to THIS
desk's items; a two-chip header control (This desk · N / All) widens it, and
the choice persists per-widget in `widget.content` ({"scope":"desk"|"all"}).
**The fallback is the operator's own rule:** a desk holding no active item
shows everything with an honest "nothing here yet — showing all" line, never
a blank box beside a full queue. **One component, not a fork:** the desk
variant WRAPS the home AttentionWidget (itemsOverride + per-widget section
storageKey), so look-and-feel cannot drift. Stale-desks (a global feeder)
hides in desk scope per CR-09's own lean — a desk's widget reporting that
desk's staleness is circular. Cross-version: old builds render an unknown
kind as nothing; the row itself syncs like any widget.



---

## DEC-046 — A highlighted LIST becomes several items (pressure-tested shape); the tidy formats
**Date:** 2026-08-26 · **Status:** RULED (operator, with an explicit "decline if
problematic" bar) + IMPLEMENTED in the shape that survived the pressure test
**The pressure test, and what it killed:** rendered lists (pages, the AI chat)
usually arrive FLATTENED — the browser's selection serializer strips markers
and indentation, so header-vs-child structure is unrecoverable there. A model
could guess it, but that fails BOTH of the operator's stated bars (as fast as
today; high accuracy). Model inference was therefore rejected.
**The shape that shipped — deterministic, previewed, capped:**
- Markdown-source selections (markers + indentation survive): header bullets
  → PRIMARY items, sub-bullets → CHILDREN grouped under them via DEC-035's
  one-level sibling grouping. Numbered lists, checkboxes, continuation lines,
  and mid-list orphan children (promoted, never dropped) all handled.
- Flattened selections: 3+ short entry-like lines → SIBLINGS. Nesting is
  never guessed.
- PROSE never splits (short/punctuated-line heuristics, tested).
- Cap 12; over it falls back to one item + full notes.
- The split ALWAYS renders as the confirm card's pre-checked chips (DEC-025's
  pattern) before anything files — a wrong split costs one uncheck, not a
  wrong item. Filing preserves the previewed structure: children group under
  the item their header created; a child whose header was unchecked stands
  alone. List rows inherit the primary's class chip and the marked source.
**Formatting (the second finding):** selection notes are whitespace-normalized
deterministically (the "two or three spaces between items" complaint), and the
tidy prompt now treats FORMATTING as part of the job — multi-point notes come
back as "- " bullet lines, not a paragraph. Marked captures with substantial
prose notes (the chat-summary case) now request the tidy too, for its
formatting: the note lands as bullets, the preset title stands, and operator-
edited notes are never overwritten.



---

## DEC-047 — Desk ⇄ Attention: the derived shape (analysis/23 D-1…D-6, ruled "proceed with all")
**Date:** 2026-08-26 · **Status:** RULED (operator: "your plan is better, proceed
with all your recommendations") + IMPLEMENTED
**D-1/D-2 — desk clusters, DERIVED:** in the Queue lens, items sharing a
`parentId` render under a desk header (title · "Desk: <status>" — prefixed per
the naming caution · due · open count · click opens the desk). A desk clusters
only at ≥2 rows in a section (a single item's chips already name its desk).
Pure `clusterByDesk` over the already-ordered rows — the ranker still decides
what leads; storage untouched; the rejected stored-grouping trap is PINNED
rejected (the cluster function provably never writes groupId).
**D-3 — suggestions, never writes:** closing the LAST active item on a
still-open desk offers "mark the desk done?" once, right then; accepting uses
the same user-owned status write every desk surface uses. Plan-promotion at
accumulation stays with CR-09 D-C (its threshold is that brainstorm's DEC).
**D-4 — All-Desks reverse signal:** each desk card's meta line gains
"N open · M due" (48h window), derived with the queues' own active-set rules;
the status groups are untouched.
**D-5 — capture-time status:** items can be BORN open / in progress / waiting /
blocked (`CAPTURE_STATES` + `initialWorkItemState`, unit-pinned: terminal at
birth refused — it would skip closure notifications; 'suggested' still
approval-driven). Compact status rows on the confirm card and the manual form.
**D-6 — coordination:** desk `status` remains user-owned; nothing here
auto-writes it, and any future change to how it is WRITTEN goes to Caleb first
(core-surface field, preservation doctrine).

---

## DEC-048 — The Attention COMMAND CENTER (overhaul, operator-ruled 8-part spec)
**Date:** 2026-08-26 · **Status:** IMPLEMENTED (both parts)
**The ruling:** the Attention page becomes a personal dashboard/command center
— wide grid, widget blocks, analytics, bulk operations, real nesting — "the
most useful personalized command center possible: everything needing
attention, prioritized, most important first, including AI recommendations on
where to start."

**Part 1 — layout, blocks, analytics (commit `DEC-048 (part 1)`):**
- Two-column grid (queue column at a readable measure + 340px block rail);
  firmer row dividers (`--edge-firm`) and more row breathing room.
- ONE component per widget, `variant="compact" | "full"`
  (`attentionBlocks.tsx`): Pulse, Overdue radar, Today's agenda, Recent
  activity, Analytics, Start here. The Attention page renders full; the home
  dashboard's four cases render the SAME components compact — the legacy
  task-data-backed renderers are gone, so the surfaces cannot drift.
- `attentionAnalytics.ts`: every number derives from work_item_state +
  timestamps only (no pretend event history). Honesty rule: a claim that
  would need a real event log is NOT made. Status breakdown per class ×
  state; plain-language trends (closing streaks, week-over-week class swings,
  arrival/closure balance, oldest untouched); `startRecommendations` = the
  queues' own ranker, top-3 with reasons, one-click Start-with-Plexii.

**Part 2 — nesting + bulk (this commit). SUPERSEDES DEC-035/DEC-047's
one-level rule by explicit operator instruction:**
- **Nesting to depth 3** (`MAX_GROUP_DEPTH` in shared/workItems.ts). The db
  guard walks UP from the new parent (level + cycle refusal) and DOWN through
  the item's own subtree (it rides along): `level + height ≤ 3` or the write
  refuses — whatever writes it (drag, agent, sync replay). Dropping onto a
  child now genuinely nests (the DEC-035 flatten is gone).
- `orderWithGroups` renders the tree (depth 0/1/2, childCount, descendants);
  an absent parent PROMOTES its subtree (never hides), cycles render flat.
- **Collapsible parents:** "N subtasks" fold on every parent row, persisted;
  `visibleRows` is the pure filter. Verified live (8→7→8 rows).
- **Drop planners mirror the cap:** planDrop/planDropMulti refuse over-deep
  or cyclic drops, and the dwell affordance never ARMS an illegal nest
  (`canNestUnder`). Cross-queue drops reclassify the WHOLE subtree — children
  follow their parent, never strand.
- **Marquee selection:** Shift+drag sweeps a rectangle (Shift because bare
  drag = reorder); auto-enters Select mode; the post-sweep click is
  swallowed.
- **Bulk verbs:** Complete all (each item's OWN queue verb — honest record),
  Dismiss all, Archive all. "Delete" maps to dismiss BY DESIGN: work items
  have no hard delete; parked and recoverable.
- **Bulk drag:** dragging a selected row moves the whole selection — reorder,
  reclassify, or drop ON an item to nest them all as its subtasks (selection
  tops re-parent; internal structure rides).
- **Parent completion accounts for subtasks:** closing a parent with open
  descendants offers close-all-with-it / just-this-one / cancel — an offer,
  never a silent cascade, and closures use each child's own queue verb.

**Gates:** suite 2,963 green (attentionGrouping rewritten, 30 tests;
workItemsVerbs guard block rewritten for depth/cycle/subtree; analytics 9);
typecheck clean; live CDP smoke — zero console errors, blocks live, real
nested data rendering, collapse verified.

---

## DEC-049 — Command-center LAYOUT: KPI band, the day top-right, a short rail
**Date:** 2026-08-26 · **Status:** RULED (operator, on the DEC-048 build:
"way too many widgets along the right-hand column… you have to scroll down too
far… analytics should be across the top, think KPI metrics on a CRM
dashboard… top right should be today's agenda or today's calendar, underneath
the primary banner header… with analytics is where the start here section
should be — that should be the AI prompt and recommendation") + IMPLEMENTED
**The arrangement** (pinned in tests so it cannot silently drift):
- **Analytics across the top** as a `variant="band"` — six KPI tiles (Open,
  Due today, Overdue, In progress, Waiting, Closed·7d) with a closed-per-day
  sparkline and any honest trend lines beneath, plus a "Breakdown" disclosure
  that opens the per-class stacked bars two-up. Pulse is GONE from this page:
  its numbers ARE the KPI tiles, so the widget count drops instead of
  duplicating (Pulse still serves the home dashboard compact).
- **Start here sits with analytics**, directly beneath the band, and is now an
  AI strip: a prompt box ("Ask Plexii about your queue") that stages the
  question together with the ranked top-3 and their reasons, plus the three
  recommendation cards. Staged, never sent (DEC-038 holds).
- **Today, top right, under the banner** — and it is the real CALENDAR now:
  `dayTimeline` merges today's time blocks (meeting blocks marked) with the
  work due in the day. It loads today's range ONLY when the store's window
  doesn't already cover it, so the Calendar view's own range is never
  clobbered.
- **The rail is two blocks and STICKY** (Today + Overdue radar, ~180px): it
  no longer scrolls away, which is what made the old six-widget column feel
  long. Recent activity moved to the FOOT of the working column beside the
  other history shelves (Recently closed, Archived) — history belongs with
  history, live work belongs in the rail.
**KPI tiles are filters.** Pressing a tile narrows the queues; the count and
the rows come from the SAME predicate (`KPI_FILTERS`, exported and used by
both), so they can never disagree — unit-pinned. A narrowed queue always says
"Showing <what> only" with a Clear beside it. Closed·7d opens the
Recently-closed shelf instead (it is not a queue filter).
**Variant rule extended:** `BlockVariant` gains `'band'` — still ONE component
per widget, one more display branch, never a per-surface fork.
**Gates:** 2,974 green (KPI/timeline math + count-equals-filter honesty +
layout pins); typecheck clean; live CDP — 6 tiles, ask box, 3 recommendations,
rail computed `position: sticky` at 181px, tile-click filter verified against
its own count, zero console errors.

---

## DEC-050 — Item rows get real project-tool anatomy (ClickUp/Jira grammar)
**Date:** 2026-08-27 · **Status:** RULED (operator: "the items shouldn't be
stacked seamlessly together… there needs to be either a line or even a tiny
bit of spacing… it should look and feel more like a true project management
app like ClickUp or Jira — incorporate those UI/UX elements") + IMPLEMENTED
**The bug underneath the complaint.** The list DID carry
`divide-y divide-[var(--edge-firm)]` — and drew nothing. `clusterByDesk`
wraps rows in one div PER DESK, so the dividers landed between clusters; a
queue rendering a single cluster (the common case) got zero lines. Separation
was never a taste question — it was broken and invisible in review because
the class looked correct.
**Rows are now cards.** Each row is its own rounded, bordered surface with a
6px rhythm between them, a hover lift (a low-alpha accent wash — `sunken`
would read as recessed on a raised card, and no `--surface-hover` token
exists), and a 3px spine down the left edge in the QUEUE's colour, so what
kind of work a row is stays readable without reading. Nesting reads as a
26px indent per level (capped with the DEC-048 depth rule). The desk-signals
shelf and the detached shelf follow the same rhythm — one page, one grammar.
**The anatomy, borrowed deliberately:**
- **Completion circle first** (the ClickUp gesture): closes with the QUEUE's
  own verb, so one click never mislabels a Meet item as "done".
- **Subtask chevron in a fixed slot** so every title starts at the same x
  whether or not the row has children, plus a **progress bar + "2/5
  subtasks"** counted over the WHOLE subtree (`subtaskProgress`, pure and
  tested).
- **An always-visible meta rail** aligned down the right: priority flag ·
  interactive status pill · due chip · assignee avatars (initials from person
  mentions, +N overflow). Always visible — not hover-only — because a list
  you cannot scan is not a command center.
- **Status changes in place** (`ItemStatusPill`): Not started / In progress /
  Waiting / Blocked / Delegated, plus the queue's own closing verb. Colours
  come from the derived projection, so a state added later can never render
  unstyled. Picking the closing verb routes through `closeWithOffer`, so the
  desk-done offer and the open-subtask accounting fire the same as the
  circle — a status change can never bypass them.
- Hover actions (copy, open here, desk, Plexii, snooze, archive, open) stay
  where they were; the old duplicate "Done" button retired, since the circle
  and the pill both close.
**Gates:** 2,977 green (subtask progress + row-anatomy and pill pins);
typecheck clean; live CDP — 8 card rows at 6px separation with correct
indents, 8 pills, 2 progress bars, the pill menu opened with REAL mouse input
and a full round-trip verified (menu click → db write → re-render), zero
console errors.

---

## DEC-051 — Widget parity (one row renderer) + the credits streaming 400
**Date:** 2026-08-27 · **Status:** IMPLEMENTED (operator: "now do the same for
the desk and home widget versions" + "im getting this error" — a raw
`400 {"error":…"Streaming is not supported on PlexiDesk credits."}` printed
where the chat answer belongs)

### A. The streaming 400 — a race, not a config problem
Both streaming call sites already guarded against the credits proxy (which
rejects streaming outright). The guard asked POLICY:
`shouldUseCredits() && getCreditClient() === c` — and policy is re-derived
long after the client was chosen, so it drifts inside a single turn:
1. `c = getClient()` at the top of `sendChat` → the credits proxy.
2. `prepareChatCall()` runs retrieval, whose own AI calls update the credit
   cache (balance → 0 flips auto-mode to BYOK) or a settings change calls
   `invalidateCreditClient()` (breaking the `===` identity check).
3. The guard now answers "not credits" while `c` still IS the proxy → it
   streams → the proxy 400s → the raw error lands in the transcript.
**Fix:** ask the CLIENT, not policy. `isCreditClient(c)` reads the instance's
own `baseURL`, which cannot drift out from under the request it is about to
make (prefix-matched against SIGNAL_BASE, so a look-alike host cannot spoof
it). Both sites now use it. **Plus a safety net:** `isStreamingUnsupported(e)`
matches only that refusal, and the site re-runs the SAME request body
non-streamed — so any future route that reaches a streaming-refusing endpoint
answers instead of erroring. The `[ask-latency]` trail now logs what actually
happened (`streamed=${streamed}`), not what was planned — the old field would
have logged a lie through a fallback, which is part of why this stayed
invisible.
*(Unchanged and deliberate: the BYOK-vs-credits billing choice is still the
operator's. This makes credits work correctly, it does not switch modes.)*

### B. Widget parity — ONE row renderer
`ItemLines` is the row for every widget in the family (the four queue
widgets, and the big `AttentionWidget` that the DESK widget delegates to), so
upgrading it upgraded all three surfaces at once. Widget rows now carry the
DEC-050 anatomy at widget scale: a bordered card with the queue's colour as a
left spine, a working completion circle, the due date, and status — the full
`ItemStatusPill` in roomy widgets, a coloured status dot (with the same
label as its tooltip) in small ones, via a `dense` prop.
**The bug that blocked it:** `WidgetShell` wrapped the ENTIRE widget in one
`<button>`, so nothing inside could be interactive — nested buttons are
invalid and every inner click became "open Attention". The header keeps that
job; the body is now free to hold controls.
**Closing is one code path.** `useCloseWorkItem` (new) owns the DEC-047 D-3
desk-done offer and the DEC-048 open-subtask accounting; the page and both
widgets call it. Forking that logic per surface is exactly how a widget
quietly stops asking about subtasks while the page still does — so it is now
impossible by construction, and pinned.
### C. The agenda stops re-ranging the shared calendar
Found by inspection while wiring the widgets: DEC-049's AgendaBlock called
`useTimeBlockStore.loadRange()` to fetch today. That store holds ONE range for
whatever surface last asked, and `WeekTimeGrid` loads a whole WEEK into it —
so a mounted agenda widget could narrow the range to today underneath an open
calendar, blanking the rest of its week until it remounted. The block now
fetches today's blocks straight from `window.api.timeBlocks.list()` into local
state and never writes the store; it re-fetches when the calendar's block
count changes and when the day rolls over. Pinned.

**Gates:** 2,992 green (9 new credit-streaming tests incl. the drift race and
"other 400s still surface"; widget-parity, one-renderer, and read-only-agenda
pins); typecheck clean. **Live verification was not possible this round:** the
dev app opens a window and then loses it (0 windows, main process idle, CDP
unreachable) — and it reproduces with ALL of this work stashed, at the
DEC-050 commit, so it is not caused by these changes. Flagged to the operator
rather than worked around.

---

## DEC-052 — Calendar: the operator's full ruling on Analysis 24
**Date:** 2026-08-27 · **Status:** RULED (operator, in full) — build begins

**(1) Coordination overruled.** The nav row does NOT need to go through Caleb.
"We can solve whatever needs to be solved in service of this feature as long
as it doesn't ruin other critical developments that already exist." A-006
("nobody uses the calendar") is confirmed FACTUAL by the operator; the
calendars are barely usable and the user base is small and knows this is
active development. Rewiring is pre-approved; a destructive approach is also
on the table IF it serves the best outcome — but only with a clear plan laid
out first: what is lost, and the downstream effects, for the operator to
decide. Default remains rewire.

**(2) OAuth audit performed (operator asked for a double check).** Verdict:
NO reusable OAuth exists. Mail = IMAP + app-specific passwords (safeStorage);
zero token storage in main; zero provider SDKs; popupRouter's "OAuth" is
popup ROUTING so sign-ins complete inside webviews — sessions live in the
webview cookie jar, the app never holds a token, and cookies cannot
authenticate Calendar API calls. Foundation must be laid fresh.

**(3) External sync: design + foundation ONLY, no build now.** Schema fields
and the connector contract land so it layers in later; the sync itself waits.

**(4) Research consensus + Analysis 24 recommendation = the direction.**
Everything not explicitly addressed in the operator's message is approved
as written.

**(5) Calendar pollution is THE problem being solved.** Neither a calendar
chock-full of blocks nor an empty one. The model: users explicitly drag what
they WANT time-blocked; for the rest, two AI modes, both preview-first —
(a) "Let Plexii plan your day": fill empty slots by priority/urgency/due;
(b) intent-driven: describe the day in natural language ("I'm feeling
motivated to take on the CETRA project today"), the system compiles the
relevant open items, previews a schedule, the user rearranges/accepts, and it
lands as time blocks with clear deliverables.

**(6) THE most important thing: completion clears the task — with approval.**
When work is completed in Plexi, the system offers "complete this task or
leave it?" — one keystroke. NEVER auto-complete without approval; the human
stays in the loop about everything happening on their behalf. This is the
feature that removes list maintenance as a job.

**(7) Unlogged work counts.** A user who works a desk without ever logging an
attention item should still see completions in analytics — "things completed
and desks closed based on the work that was done rather than checkboxes
ticked." The attention layer watches silently; it surfaces only when needed.

**(8) The philosophy, verbatim spirit:** attention goes where the user needs
it, when they need it. The layer sits silently in the background — collecting,
watching, interpreting, ready — and stays out of the way otherwise.
Flow state is sacred: if the user is active and getting things done, even if
it isn't what the calendar intended, the system recognises that rather than
nagging about the plan. Balance freedom and organisation through
ADAPTABILITY, not forced structure. The quality bar: a perfect executive
assistant at a CEO's side. Treat with the respect that implies.

**Build order (per Analysis 24, now unblocked):** Track A (calendar tells the
truth + rail row + day column) → B1 (drag-to-schedule) → B2/C-foundation
(schema) → B3 (plan-my-day, preview-first) → D (completion loop, in-Plexi
first). D is elevated in importance by ruling (6) but still sequenced after
the surface exists.

**Build status (same day, four commits, both remotes):**
- **Foundation** `9900e80c` — scheduling+sync columns (origin/locked/
  push_policy/transparency/visibility/external_*), status → 4 states via a
  dynamic CHECK-drop rebuild (FK restated by hand; live DB migrated clean,
  backup `focusbuddy.db.bak-20260827-pre-dec052`), work_items.source_url.
- **Track A** `786530c8` — CalendarView rebuilt on work items + rankScore
  (second ranker gone); queue rail drags with `text/fb-workitem`; grid
  parameterised (days 1/3/7, compact) with the deadline band and
  drop-books-immediately; Attention rail = the same grid narrow; Calendar
  back in the sidebar (both states). A-006 → CONFIRMED.
- **Track B** `cdbe25e8` — the planner: pure engine (honesty filter: waiting/
  blocked never scheduled; 330-min ceiling; gaps; session cap; clock floor;
  momentum by desk), Plan-my-day + intent mode (Haiku select w/ stopworded
  keyword floor), dashed-ghost preview, Accept = ONE undo batch, replan-
  undone marks missed + re-proposes (never moves), 1-hour grace.
- **Track D tier 1** `5068a7d4` — the typed ledger (wi_signal +
  wi_signal_match; device-local; once-ever pairing as a DB guarantee), four
  emitters (block done, focus finished, chat message sent, desk closed),
  pure matcher, the Enter-to-complete toast through useCloseWorkItem, and
  quiet-wins analytics ("counted from the work, not the checkboxes").

Gates across the day: suite grew 2,992 → 3,041 green; typecheck clean at
every commit; live smokes on the real DB (calendar surfaces, planner ghost
preview with zero writes). Remaining under this ruling: working-hours
settings UI (engine reads them; no editor yet), Track D tiers 3a/3b (email
via IMAP, then Slack behind the shared OAuth layer), Track C itself.

---

## DEC-053 — Calendar QA round one + the premium row pass
**Date:** 2026-08-27 · **Status:** RULED (operator live QA, seven items) + IMPLEMENTED

**(1) Planner settings editor** — a gear on the plan bar opens the editor:
day start/end (12-hour options), planned-work ceiling, longest sitting,
breathing room. Writes the same persisted settings the engine reads on every
plan run.
**(2) Drag-to-create** — Google-style: press empty grid, drag a span at the
15-minute snap (live overlay shows the range), release → the composer opens
at exactly that length. A press that never travels stays a plain click.
**(3) 12-hour clock** — the gutter reads 6 AM…9 PM (compact: 6a…9p). No
military time anywhere.
**(4) Today's column** — raised surface with a purple ring, replacing the
too-faint purple wash; other days stay grayed. Ruled colour treatment.
**(5) Drag a block back to the list** — a block pointer-dragged onto the
queue rail UNSCHEDULES it (the rail lights "Drop here to unschedule" during
the drag; delete is undo-able; the item resurfaces in To-schedule by
construction). A LOCKED block refuses — the pin means what it says.
**(6) Classification dropdown + New** — a class filter (All + the eight)
that narrows the rail, the deadline band, the month lens and the planner
pool together, persisted; a New button beside it opens the capture console.
**(7) The rows** — the operator: "text isn't centered; too blocky… needs to
feel premium like ClickUp." Root cause measured, not guessed: the row was
`items-start`, so the 18px title top-aligned against 26–28px controls.
Now: vertically centred, min-h 42px, py-1.5, rounded-md, slimmer hover
actions (h-6), the desk chip suppressed inside its own desk cluster
(the header already says it), spacing kept, no dividers (per ruling).

Suite 3,047 green (six new DEC-053 pins + the DEC-050 card pin updated to
the new anatomy); typecheck clean.

---

## DEC-054 — One visual system: Attention + Calendar adopt the Home material
**Date:** 2026-08-27 · **Status:** RULED (operator: "adopt the UI, UX and design
principles of the home page… dotted texture, shadowing so widgets pop… start
to feel like a unified app") + IMPLEMENTED

**The material, shared not copied.** Home's ground is `.paper-texture` (a
dotted radial-gradient over `--surface-base`, theme-aware) and its widgets ride
`.fb-widget-tile` — a Liquid Glass fill with a four-layer depth shadow and an
inset highlight. Attention and Calendar now sit on the SAME paper, and their
cards use a new `.fb-glass-card` (plus a quieter `.fb-glass-row` for list
rows). Card and tile read the identical tokens — `--glass-pillow-fill`,
`--glass-pillow-blur`, `--shadow-inset-highlight` — so a change to the
material reaches every surface at once.
**Why a second class rather than reusing the tile:** `.fb-widget-tile > *`
forces its children into a flex column, because a widget INTERIOR must
distribute its rows. A page card owns its own layout — applying the tile
would have turned every card header into a stacked column. One material, two
jobs, no drift.

**The sidebar problem, root-caused.** The left panel reserves its width with
PADDING on `<main>`, so the window width is identical whether it is open or
closed — which means Tailwind's `xl:` breakpoints (viewport-based) fired the
same either way, and the two-column pages simply got ~260px narrower with no
layout response. That is the "clunky when the menu opens" the operator saw.
Both pages now use **container queries** (`container-type: inline-size` +
`@container`): the grid columns and the rail's visibility respond to the space
the page ACTUALLY has, at 1040/1360px for Calendar and 1080/1400px for
Attention. Verified at both sidebar states.

**Calendar toolbar breathes.** The header is two stable rows — title/actions,
then a toolbar — instead of one that reflowed. Mode buttons carry a min-width
and `whitespace-nowrap` so Day/3-Day/Week/Month can never compress; the class
filter has a min-width; nav controls sit at h-9 with real spacing.

**Legibility fixes (operator: "some things get cut off").** The hour gutter
widened (w-14 / w-8 compact) so "12 PM" cannot clip; day headers carry a full
title attribute and their own tint for today; blocks show two title lines and
the start time when tall enough and truncate cleanly when short (instead of
clipping both); ghosts and deadline chips follow the same rule; month cells
grew to 104px with larger chip text.

Suite 3,061 green (six DEC-054 pins; the DEC-049 rail pin and DEC-050 row pin
updated to the new chrome); typecheck clean for these files.

*(The React max-update-depth warning from the CRDT sync layer is being fixed
in a separate session — untouched here.)*

---

## DEC-055 — The queue box, the tight left edge, the rail panel
**Date:** 2026-08-27 · **Status:** RULED (operator live QA, five items) + IMPLEMENTED

**(1) One box around the queue, (2) rows touching with a hairline between**
— reversing DEC-050's spaced cards, and this time fixing the CAUSE rather
than working around it. The first divider attempt drew nothing because
`clusterByDesk` wrapped rows in per-desk `<div>`s: `divide-y` on the list
then only fell BETWEEN clusters, so a queue with one cluster had no lines at
all (DEC-050 shipped spacing instead). The per-desk grouping is now a
**Fragment**, so every row is a direct child of the box and the dividers
reach all of them. Rows lost their own card, gap and hover-lift; the box owns
the surface, the row owns a hover tint.

**(3) The dead space left of the checkbox** was a column reserved for a
hover-only affordance: the drag handle sat in the flex flow at all times,
even at opacity 0. It is now absolutely placed in the spine gutter, the
chevron slot narrowed to 3.5, and the row's left padding dropped — the
completion circle now sits near the edge where the eye expects it.
Nesting moved from `marginLeft` to `paddingLeft` so an indented row still
spans the full box and its divider runs edge to edge; the spine and the
floating handle step in with the indent so hierarchy still reads.

**(4) The calendar's queue rail is a solid panel** — new `.fb-glass-panel`
(the same family as the card, but sitting on `--surface-raised` at 94%
rather than a translucent fill), so a standing column of items reads as its
own surface instead of text lying on the dotted paper.

**(5) The rail filters by CLASSIFICATION, not free text.** The "Filter items…"
input is gone, replaced by a dropdown (All open items + the eight classes).
It writes the SAME `classFilter` the header control shows — one truth, two
places to reach it — so the two can never disagree, and the empty state names
the class it filtered to.

Suite 3,061 green (three DEC-055 pins; the DEC-050 card and indent pins
rewritten to the superseding truth, keeping the divider-bug history in the
comment); typecheck clean.

## DEC-072 — Plan reasons state checkable facts
**Date:** 2026-08-30 · **Status:** EXECUTED (operator: "make them say something real") · committed `d5a47571`

DEC-071 made `reason` visible, and visibility exposed it: both blocks in the
operator's test read "Top of the queue" — the fallback was doing most of the
talking, because `reasonFor` asked only two questions (due within 2 days?
momentum ≥2 on the desk?) before giving up. Most items have neither.

The rewrite (`attentionPlanner.ts`): the reason is the item's strongest
CHECKABLE fact, strongest first — deadline (now with day counts, "Overdue by
2 days", and weekday names out to 7 days) → the person's own urgency call
("You marked it urgent" — chosen outranks derived, DEC-037) → momentum
(strings deliberately unchanged — pinned since DEC-052) → already-started →
days waited → then WHY-THE-PLAN-CHOSE-IT: a replan says "Slipped earlier —
proposing a fresh slot", intent mode says "Matches your intent", and ranked
mode does the day arithmetic — "Nothing else needs today" only when no other
schedulable item is due by the planned day's end, "Everything due already has
a slot" only when each such item verifiably has one (dragged or proposed
ahead of this row). The generic tail ("Next by rank") survives only for the
mixed case none of those cover. **Found while wiring it:** both intent mode
and replan-undone pass `onlyItemIds`, so the two were indistinguishable
inside the planner — a replanned block would have claimed an intent match.
`PlanDayOptions.source` now names the mode.

Same honesty pass on the start strip (`attentionAnalytics`): its fallback
claimed "Waiting the longest" on up to three cards at once and "Top of the
queue" on cards #2–3 — superlatives only one card can hold. Now day counts
("Waiting 9 days"), and only card #1 says "Top of your queue".

Verified two ways: 15 new pins (suite 3,196 → 3,211, both typechecks clean)
and LIVE over CDP 9223 — the planner module run read-only against the real
store (107 items, 15 schedulable, 2 blocks already booked) returned seven
proposals with SIX distinct reasons and zero generic strings: "Overdue by a
day" / "Overdue by 2 days" ×2 / "Due tomorrow" / "Waiting 3 days" / "Already
started — finish it" / "Everything due already has a slot". `planDay` is
pure; the check wrote nothing.

## DEC-073…076 — The operator's four-feature build round
**Date:** 2026-08-30 · **Status:** EXECUTED (operator spec, verbatim asks) · committed `e781d7d8`

**DEC-073 — "New Desk": named, prefilled, and it OPENS.** The header button
said "New" with a tooltip claiming "New room" while creating a desk; creation
called `setActive` but never changed the VIEW, so the desk was born off-screen
and had to be found under All Desks. Now: the button says **New Desk**, the
set-up dialog pre-fills the title with the moment ("Aug 30, 12:52 PM" —
`lib/deskDefaults.ts`), the field arrives focused with the text SELECTED so
overwriting costs one keystroke, Enter files it, and creation navigates
straight in (`goTask`). The prefill rides every create-desk entry (⌘K pill,
Stage Manager) by construction — same dialog; Rooms and edits keep their text.

**DEC-074 — calendar items open and complete in place.** Double-click a queue-
rail row, a grid block, or a deadline chip → the DEC-036 item editor (centre
peek); a desk-linked block's double-click opens the desk. The rail rows grew a
visible completion circle; the grid block's check, on a work-item block, now
closes the ITEM — each queue's own verb (PRIMARY_ACTION), through the ONE
close path with its subtask and desk-complete offers — and marks the block
done only if the close actually happened (the subtask offer can be cancelled;
the store's setState refreshes the row before resolving, so re-reading it is
the authoritative test). Undo on a done block stays calendar-local: it revives
the block; the item reopens from Attention, never from here.

**DEC-075 — missed items greet the launch.** Blocks still 'planned' whose
whole span lies before today are "untriaged" — DERIVED, never stored
(`lib/missedTriage.ts`; 14-day lookback so the first run can't wall the user
with pre-feature history; a block straddling midnight is not missed — its day
is not over). One prompt per app session (`MissedTriagePrompt` at App level):
per row **Done** (item closed with its verb + block done), **Today** /
**pick-a-day** (the original flips to 'missed' — the honest record, DEC-052 B4
— and a FRESH block lands in the day's first opening, same clock time visibly
overlapping if the day is full, never dropped), selection + **Complete
selected**, **Add all back to the calendar** (first openings today→+7d, one
undo batch), and **Later**, which costs nothing and returns next launch.
Intra-day slips stay DEC-052 B4's replan flow; this owns the day boundary.

**DEC-076 — the widget bell.** Every WidgetFrame header carries a bell:
outlined = not in Attention, filled = a LIVE work item points at this widget —
DERIVED from the queue's own rows (`lib/widgetAttention.ts`: sourceType
'widget'/'widgets', comma-joined multi-marks honoured, exact-id match, newest
live mark speaks), so the operator's "two-way sync" holds by construction
rather than by events. An outlined bell runs the SAME flow as the context
menu's "Add to Attention…" (preset → confirm console → item points at the
widget; nothing files without Enter). A filled bell opens the queue.
**Interpretive choice, flagged:** the spec said only "clicking adds" — a
filled bell re-adding would duplicate, so filled-click = open the queue; say
the word to change it. The check beside it appears ONLY when there is
something to complete, and closes through the one path. Gated on
workItemsEnabled(), like the menu.

**Gates:** suite 3,211 → **3,244** (33 new: missedTriage 12, widgetAttention 7,
wiring pins 14), both typechecks clean. **Live (CDP, read-only):** "New Desk"
in the DOM; both mounted grid blocks carry the complete control; prefill
returns the real moment; **the triage prompt fired itself on the HMR remount
and found 4 genuinely-slipped Thursday blocks on the live DB** — the launch
behaviour, observed. Widget bells: no desk canvas was mounted at verify time —
23 live widget-marked items exist, so bells will light on first desk open;
pinned by tests, awaiting the operator's eyes.

## DEC-077 — The refinement round: one circle, a bell that fills, rows that drag themselves
**Date:** 2026-08-30 · **Status:** EXECUTED (operator QA on DEC-073…076) · UNCOMMITTED

**(a) The bell now actually fills.** Root cause was a brand-system collision:
`Icon`'s `filled` prop is a deliberate no-op for Plexii brand icons (they are
line SVGs; "state is carried by color at the call site") — and 'notifications'
maps to one, so the active bell only recoloured its outline. Fix: `BellIcon`
in WidgetFrame renders the SAME brand path (one source, `PLEXII_ICONS`) with
`fill: currentColor` when active. Icon itself is untouched — honoring `filled`
globally would have restyled every brand-mapped `filled` call site in the app.

**(b) ONE completion circle.** The queue's DEC-050 form factor is extracted to
`attention/CompleteCircle.tsx` and adopted by all four surfaces — the
Attention queue (byte-identical rendering), the Calendar rail, grid blocks
(now a VISIBLE 12px circle on active work-item blocks; the hover cluster's
check narrows to plain blocks + done-undo), and the widget header. The
component swallows mousedown/pointerdown/dblclick because every host is a
gesture surface — a completion click must never start a drag or open an
editor.

**(c) Bell + circle moved beside the title** in the widget header, out of the
right-side control array where they got lost — the pair reads as the widget's
attention state, not two more chrome buttons.

**(d) The six-dot handle is RETIRED from both queues; the row drags itself.**
Calendar rail: the icon was decoration (the row was already draggable).
Attention queue: the handle owned dragstart — `draggable` moved to the row,
payload contract unchanged (`text/fb-workitem` — the calendar still reads
it), DEC-048 multi-drag preserved, and DEC-035's setDragImage plumbing died
with the handle (the row IS the source, so the browser ghosts it natively).
**Boundary: an EXPANDED row does not drag** — its notes are selectable
(DEC-030 read/copy) and a draggable ancestor would eat the selection;
collapse to move. Three DEC-055/070/035 pins rewritten to this superseding
truth, histories kept in their comments.

**(e) Nesting feedback lights the WHOLE target row** — accent tint + inset
ring while the drag dwells "into", unmistakable against the before/after
placement lines. Found while wiring: the row could carry TWO bg-* utilities
at once (select-mode + into), resolved by stylesheet order, not intent — the
backgrounds now live in one ternary chain, one owner per state.

**Gates:** suite 3,244 → **3,254** (net +10; 4 superseded pins rewritten,
dec077Refinements adds 9), both typechecks clean. **Live (CDP, real DOM,
view driven and then RESTORED via the real Back button):** Attention — 15
rows, 14 draggable (the non-draggable one is expanded/detached, the designed
opt-outs), ZERO six-dot handles, 15 circles at 18×18 round; Calendar — 15
rail circles at 15×15, 10 blocks with 4 carrying the visible circle (exactly
the active work-item ones), zero handles. Bell fill awaits the operator's
desk (no canvas was mounted); the mechanics are pinned.

## DEC-078 — The calendar breathes: its own scroll window, uniform days, a real outline
**Date:** 2026-08-30 · **Status:** EXECUTED (operator QA, three verbatim asks)

**(1) Taller hours, fewer on screen.** `HOUR_PX` 44 → 56. Forty-four showed
all seventeen rows at once and every one was cramped; the scroll window owns
how many are visible now (eleven at the operator's viewport).

**(2) The hours scroll in their OWN window (Google-style).** The grid split
into a pinned band (day headers + deadline chips) over a time area that is
its own scroll container — `overflow-y-auto overscroll-contain`, bounded
`max(280px, calc(100vh − 380px))`, opening with the current hour one row
below the top edge. Hover the grid and the wheel moves through the day;
outside it, the page scrolls as before. Side effect worth naming: the
deadline band used to live INSIDE each column, so a tall chip stack pushed
its own column's canvas out of line with the others — pinned, that class of
misalignment is gone. The rail's compact mode keeps its full-height habit
(no scroller; its card owns it).

**(3) No graying; today is an outline ALONE.** Every day column is the same
raised surface now; the sunken wash that made the week read as
six-sevenths disabled is gone, and today carries a light accent outline
(`ring-accent/35`) as its only column-level differentiator.

**Found while verifying (3): DEC-053's today ring NEVER painted.** The class
was `ring-[rgba(var(--accent),0.45)]`, which substitutes to
`rgba(124 58 237,0.45)` — space-separated RGB with a comma alpha, invalid
CSS — so the ring's box-shadow computed to `none` from the day it shipped.
The suite stayed green throughout because source-pins pin strings, not
paint. Measurement over CDP caught it (the DEC-056 lesson shape again). The
sanctioned form is the CONFIGURED accent with slash opacity
(`accent: 'rgb(var(--accent) / <alpha-value>)'` → `ring-accent/35`); all
nine `rgba(var(--accent),…)` occurrences in this round's two files were
converted (rings, hover washes, the mode-switcher active state, an inset
shadow). **The same broken pattern exists in ~10 more files → GAP-018** —
registered for its own sweep, not absorbed mid-round (several sit in the
parallel session's working set).

**Verification (live, CDP, by measurement):** hour row 56.0px · scroller
`overflow-y: auto` + `overscroll-behavior: contain`, window 618px = 11.0
hours · auto-open scrollTop 334.7 vs 335 expected (clamped at max,
mid-afternoon) · commanded −150px moved the columns exactly −150px while
the header band's y held and the PAGE scroll position was unchanged ·
all day columns computed the same background (one distinct value) · today's
ring computes `rgba(124,58,237,0.35) 0 0 0 2px` — it paints. Suite 3,255
(one net new pin; the DEC-053 ring pin rewritten to the superseding truth
with its history).

**Follow-up (same day, operator): the day runs MIDNIGHT TO MIDNIGHT.**
`START_HOUR` 6 → 0, `END_HOUR` 23 → 24. The old 6am–10pm window silently
HID anything booked outside it — an early flight or a late call rendered
off-canvas with no hint it existed; the scroll window is what decides how
many of the 24 hours are visible, which is why this is safe now and wasn't
before DEC-078. Measured live: 24 gutter labels 12 AM → 11 PM, grid 1344px
(= 24×56), auto-open landed at the current hour UNCLAMPED for the first
time (704.7 vs 705.6 expected). Live bonus proof: the operator clicked a
3 PM slot mid-verification and the composer opened at exactly 3:00 PM —
the y→time math holds on the new origin. The compact rail grows to
24×30px full-height by the same constants (its card scrolls; acceptable,
revisit only if the operator flags it).

<!-- Append below; increment DEC-NNN. -->

## DEC-056…061 — The platform arc (one investigation, six landings)
**Date:** 2026-08-27 → 08-28 · **Status:** EXECUTED · **Shipped separately to `main` as PR #5**

Began as "the app won't boot" and became six defects, all one shape: **a guard
that checked the request instead of the outcome.**

- **DEC-056** (`1253aac3`) — the remote-change emitter fired one Event per
  cascade-delete descendant. 596,754 of 768,169 Events were WidgetDeleted /
  DeskDeleted that nothing can consume (a deleted object has no "changed since
  your last visit" frame to light). Deletions now emit nothing; updates emit once
  per object per pass. `pruneOutbox()` added — the outbox is delivery
  bookkeeping, not history, so capping it destroys nothing PLX-EVT-030 protects.
- **DEC-057** (`690aba29`) — `pruneActivity`/`pruneHistory` had **zero call
  sites** since the initial commit. Wired, but only after a policy change: a
  table-wide cap would have evicted 2,088 rows of real history to make room for
  telemetry. Per-kind + per-org instead (`browser_nav` 2,000/org, 90-day ceiling).
- **DEC-058** (`674ed227`) — the nav fan-in. Four webview events into one
  unguarded recorder wrote 39,762 rows in 19 hours. `navTrail.ts` dedupes.
- **DEC-059** (`4af921c1`, `7c363379`) — **the launch blocker.** `applyRemote`'s
  tombstone branch had no echo suppression though the upsert branch three lines
  below does. Re-applying a held tombstone is a no-op UPDATE, which is exactly
  what `widgets_mark_dirty` fires on → dirty → pushed → server bumps rev →
  tombstone returns. Measured at `sync_rev 7,319` on one widget and **10 server
  writes/minute, forever**. Fixed with the guard the upsert branch already had.
  Part 2: replayed writes declare `WriteOrigin`, so a replay stops minting
  "user did this" Events. Clean boot went ~2,500 → **4 Events**.
- **DEC-060** (`0bd8a77b`) — the boot hang. `emitObjectEvent → localActor() →
  loadAccountState() → safeStorage`: every Event did a synchronous macOS
  Keychain decrypt, to read `cachedEmail` — a field stored in PLAINTEXT. The
  first one blocked the main thread behind an authorization prompt with no
  visible parent. Cold boot: indefinite hang → **3s**, verified over three restarts.
- **DEC-061** (`0e5d8a4e`) — `browsing_history.visit_count` corrupt from the same
  handler (one Slack channel at 14,096 "visits", a number that is user-visible
  AND fed to the LLM). Counter gated; counts repaired from the activity log,
  which is their exact provenance (763 rows matched, zero disagreed).

**The load-bearing lesson, recorded because it recurred:** every one of these
was invisible to the test suite, which was green throughout. They were found by
*measuring the live database*, not by reasoning about the code.

---

## DEC-062…067 — Sub-item chrome: four rounds that were the wrong approach
**Date:** 2026-08-28 → 08-29 · **Status:** SUPERSEDED BY DEC-070 — kept for the lesson

Operator QA on the queue's sub-item rows. Shipped in order: a clickable expander
(the drag handle was absolutely positioned in the chevron's gutter and swallowed
its clicks); an elbow connector; desk-cluster folding; queue-coloured desk
headers; an inset block per indented row; a page-coloured gutter; the elbow
raised onto the parent/child boundary; the elbow aligned to the parent's spine.

**Each round fixed a seam and produced another.** The cause was structural and
took four rounds to see: *the hierarchy was drawn as per-row line SEGMENTS*, and
segments painted by different rows cannot be guaranteed to join. 1px offsets,
corner touches that antialias into breaks, a bend repeated once per child.
DEC-070 is the reset.

**What survived the reset:** the expander z-order fix, desk-cluster folding, and
queue-coloured desk headers. Those were real and are still in.

---

## DEC-063/064/068 — Meet items point at a meeting
**Date:** 2026-08-28 → 08-29 · **Status:** RULED (operator: "go with option 2") + EXECUTED

Operator ruling: a Meet item **points at** a meeting rather than **being** a time
block. His own case decided it — *"the RSVP if it is for responding to"* is a
meeting that is not on your calendar, so there is no block for it to be.

- **DEC-063** (`9205d56d`) — six manifest columns (start, duration, join URL,
  location, attendees, RSVP). `meet_start_at` is deliberately NOT `due_at`: a
  meeting's start is not a deadline, and collapsing them would drop every
  invitation into the overdue radar. Rows render as invitations — time, a Join
  button labelled by provider read from the link, address, attendee count, and
  the RSVP inline. Guarded by `isInvite`: a bare "meet with Sam" stays a plain row.
- **DEC-064** (`48e5f8f3`) — the capture flow, and **the manifest gap it
  uncovered**: `PATCHABLE` and `rowToNode` both hand-listed the manifest, so a
  new column got DDL, sync, CRDT allowlists and emit — but no way in or out.
  `source_url` had been **write-only since DEC-052**. Both now derive from
  `WORK_ITEM_COLUMNS`, with an explicit `NOT_PATCHABLE` refusal list that must
  state its reasons.
- **DEC-068** (`ac8dcd0c`) — the calendar link. `TimeBlock.taskId` already
  pointed at a node, so the association needed nothing new; the translation is
  `meetSchedule.ts`. Refuses rather than guesses (no start time → nothing to
  reserve), and matches "already scheduled" on the LINK, never the time.

---

## DEC-065 — The item editor fits the screen it opens on
**Date:** 2026-08-29 · **Status:** EXECUTED (`a590ce86`)

Regression from DEC-064: the dialog was pinned 14vh from the top with no height
cap, so a Meet item ran **172px past the bottom** of a 997px laptop viewport with
Save unreachable. Centring alone could not fix it — content was taller than the
screen — so Join link and Location were paired onto one row and Notes trimmed.
1029px → 924px. The max-height with internal scroll is the FLOOR beneath the
sizing, not the fix: content that cannot be reached is worse than content that
scrolls.

---

## DEC-069/070 — The re-baseline: one animated group, one dashed connector
**Date:** 2026-08-29 · **Status:** RULED (operator called the reset) + EXECUTED (`72cd7199`)

Operator, after four rounds: *"this colored vertical / horizontal line thing is
really starting to piss me off… we need to refresh and reset to get this down
right from the beginning"* — with an inspiration component supplied.

**The re-baseline.** A parent and its subtree are now ONE animated group holding
ONE dashed connector spanning it. A single element has no joins to misalign, so
the seam category is gone *by construction rather than by care*, and because the
connector lives inside the height-animated wrapper it grows and shrinks WITH the
expansion.

What it bought beyond the bug: `nestRows()` turns the flat depth list into a tree
once instead of every consumer re-deriving it; the box's `divide-y` now separates
UNITS so a hairline never cuts through a subtree; desk clusters get the same
connector language as subtasks (one grammar for "these belong together"); the
solid queue spine became a TOP-LEVEL cue only, since an indented row's colour cue
is its group's connector and having both put two vertical lines beside every
sub-item. Motion: height 0 ↔ auto, staggered children, `AnimatePresence` so a
collapse animates rather than snaps, `prefers-reduced-motion` honoured.

Also fixed the drag handle, which floated at the INDENT column — a coordinate
belonging to the previous depth — so on sub-items it hung in the parent's gutter.

**The pins now assert the ABSENCE of the segment machinery**, so nobody
reintroduces it.

**LIVE VERIFICATION 2026-08-30 (the owed photograph, done by measurement):**
the prior session shipped this pinned-and-tested but never saw it on a
multi-sub-item case — none was mounted (cause found: the one real group was
COLLAPSED, persisted in `attention.collapsed`). Verified on the operator's
live data over CDP 9223 — a real leader ("Add in-browser video streaming…")
with THREE open sub-items, expanded via its own chevron (the DEC-062
click-fix path), all geometry by getBoundingClientRect/getComputedStyle at
dpr 1.7, full-viewport screenshot only:
· ONE dashed connector per group — a single element, h=114px spanning all
  three 40px child rows; inset 14.0px (= 8 + ind·28 + 6 exact); top gap 0.0;
  bottom gap 6.0px (bottom-1.5); rgba(14,165,233,0.5) = queueTint(to_do, .5).
· Children tile the wrapper exactly (718.3→838.3, zero gaps), borderTop 0px
  on every child — no hairline cuts the subtree; the next UNIT gets the
  divide-y hairline (0.588px = 1px @ dpr 1.7). Child pads 36px (= 8+28).
· Spine is TOP-LEVEL only: leader carries the 3px sky bar (2.996px computed
  — device-pixel snap), children carry none.
· Drag handle rides its own row's depth: children 14px (= 8+28−22, ON the
  connector line by design), leader 2px. Zero stray vertical-line elements
  in the subtree — the old segment machinery is absent from the DOM, not
  just the code.
· Collapse unmounts children + wrapper (AnimatePresence exit), re-expand
  reproduces identical geometry (inset 14, h 114 both passes) — no drift.
· The DESK-CLUSTER variant (LakeDash, 3 rows) measured too: same grammar —
  one connector, h=135.3px unbroken across the run, 6px bottom inset, pads
  36px, no spines, zero strays. A 0.6px inter-row offset there is
  device-pixel rounding of fractional row heights (nothing paints in it:
  borders and margins all 0px), not a seam.
No data writes; the one state change is the group now sits EXPANDED on the
operator's screen (the toggle path updated `attention.collapsed`), which is
what the verification required. DEC-069/070's construction claim holds on
the real thing.

---

## DEC-071 — The day plan is reviewable before it is accepted
**Date:** 2026-08-29 · **Status:** EXECUTED (`4dc603de`)

Three failures in one flow, all the same shape: the plan had the information and
nowhere to put it.

The intent prompt was a single-line `<input>`, so a real sentence scrolled out of
sight while being written — now a textarea that grows and shrinks, capped at ~7
lines, Enter plans / Shift+Enter newlines. The summary line truncated, which made
it *an assurance wearing the clothes of an explanation*. And the ghosts on the
grid are not real blocks, so the plan was un-inspectable **by construction** — a
proposal you cannot examine is a prompt to trust it.

A landed plan now opens a centre-peek review (DEC-065's shape) showing the prompt
in full, the note in full, and every block grouped by day with time, duration and
**the `reason` the planner had computed all along and never displayed**. Blocks
can be dropped individually; accept takes what remains, still ONE undo batch.
Opening it books nothing — DEC-052's propose-never-apply stance holds.

Also: the note's `slice(0, 120)` was a DISPLAY limit at the DATA layer, cutting
mid-word ("…Cetra pitch deck—all high-cr"). Widened, word-boundary aware,
ellipsised, still bounded because it is model output.

---
