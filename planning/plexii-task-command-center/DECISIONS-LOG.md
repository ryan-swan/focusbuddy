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

<!-- Append below; increment DEC-NNN. -->
