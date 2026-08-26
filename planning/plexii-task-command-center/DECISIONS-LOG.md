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

<!-- Append below; increment DEC-NNN. -->
