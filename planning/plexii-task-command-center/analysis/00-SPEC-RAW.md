<!-- VERBATIM CAPTURE — immutable evidence per SPEC-INTAKE.md Step 0.
     Received: 2026-08-24 (late evening), pasted by operator from the spec-drafting
     Claude session. Do not edit; all analysis links here. -->

# SPEC · Attention Layer & the `work_item` Entity
**Status:** Intake candidate — awaiting verbatim capture, adversarial gap verification, and crossroads ruling
**Target branch:** `ryan-command-center`
**Baseline:** `a92b30cb` · PlexiDesk v4.1.0
**Depends on:** DEC-011 (`work_item` locked), DEC-012 ("Attention" locked), Pre-Spec Rulings Docket 2026-08-24
**Drafted:** 2026-08-24
---
## §0 · How to read this document
This is the spec artifact that triggers `SPEC-INTAKE.md`. It arrives pre-triaged, but **pre-triage is a proposal to verify, not a bypass.** Every SPEC-NNN item below still runs the full chain: verbatim capture → inventory confirmation → verified gap matrix with adversarial second pass → strategy → logic-audited architecture → operator-approved roadmap → G1–G6.
Three things in this document are *not* proposals and should be treated as settled inputs:
1. The §1 vocabulary. It is locked by DEC-011/DEC-012 and by verified naming collisions. Downstream artifacts inherit it verbatim.
2. The §4 Plans positioning. It is a non-collision boundary, not a design choice.
3. The §7 crossroads docket. These are questions *for* the operator, batched deliberately so rulings happen once rather than per-phase.
Everything else — priorities, tiers, decomposition — is argued and may be overturned by gap verification.
**Primary objective (extracted, requires confirmation):**
> Give a person one honest answer to "what needs me right now," assembled from work that continues to live where it was created — so that a new user is helped within minutes of first use, and an existing user stops maintaining a second system to find their own work.
Every item below is triaged against that sentence. If an item does not serve it, the item is P2 or absent.
---
## §1 · Vocabulary
This section is normative. Ambiguity here propagates into every downstream artifact, and this codebase has already been burned once by a word that drifted.
### 1.1 The quarantine
| Term | Means, permanently | Never means |
|---|---|---|
| `task`, `taskId` | **A desk.** Every existing signature, every store, every IPC call. | A to-do item. Not now, not after this build. |
| `CommandCenter` / `CommandCenter.tsx` | The ⌘K command palette. | The Attention layer. The collision is known and kept distinct in all naming. |
| "Flow" | `PlexiFlowView`, the Flows module. | Anything in this build. |
| "Inbox" | The mail store (real IMAP/SMTP). | An Attention queue. Queues are named by intent, not by inbox metaphor. |
| "Signal server" | The sync transport (`workspaceSync`). | The Attention layer. |
`taskId` is **not renamed** by this build. Renaming it is a 305-site refactor with no user-facing benefit, and the mitigation — a permanently distinct new noun — costs nothing. The quarantine is the mitigation.
### 1.2 The new nouns
**`work_item`** *(schema name, locked — DEC-011)*
The atomic unit of "something needs a person." Verified clean at code level: zero hits for `work_item` / `workItem` / `WorkItem` at `a92b30cb`.
A work_item is:
- A real, canonical entity — never widget content, never a per-surface copy, never a view over something else.
- Stored as a node (`kind: 'work_item'`), inheriting sync, ACL scoping, sharing, spatial parenting, archival, and the `nodes:*` surface. See SPEC-002.
- Attached to spatial context — a desk, a room, a Plan-room. Scope is a first-class dimension, not a tag.
- Routing-shaped from birth: it carries originator, recipient, intent class, and terminal state even when the only recipient is you. See SPEC-011.
A work_item is **not** a desk, does not have a canvas, and does not appear in the desk tree as a navigable workspace. See SPEC-004 for the consequences.
**Attention** *(surface/system name, locked — DEC-012)*
The person-scoped layer that answers "what needs me right now." It is a **system**, not a destination. It renders in three places and would be misnamed by any of them individually:
1. Widgets on Home's existing registry (`homeWidgetDefs`) — the primary surface.
2. A collapsed count in the top bar.
3. A conversational entry point in the assistant.
Attention **aggregates by reference and does not own.** A work_item appears in Attention because it needs the person; it belongs to the desk, room, or Plan it came from. Attention is a lens. This is the load-bearing constraint that prevents it from becoming a fourth dashboard system.
**Queue** *(individual level only)*
A single intent-scoped list within Attention: Tasks, Reviews, Calendar, Awaiting Acknowledgment, Completed, Direct Messages. "Queue" is never used for the system as a whole.
### 1.3 The Attention layering — desk-scoped and person-scoped
**This is a convergence, not a coinage.** The codebase already grew a nascent attention concept, and the new layer must extend it rather than shadow it.
Already existing at `a92b30cb`:
- `src/shared/context.ts` defines `AttentionItem` inside the per-desk `ContextObject`: evidence-backed, risk-leveled items needing the user, typed `blocked | review-needed | decision-risk | dependency-changed | stale-context`, sitting adjacent to a field named `pendingWorkIds`.
- `src/main/meta/metrics.ts` defines `attentionPrecision()` — whether surfaced items actually get acted on.
The relationship is **strictly hierarchical, and one-directional**:
```
desk-scoped              person-scoped
ContextObject       →    Attention layer
.attentionItems          (queues, nudges, closed loops)
  [feeder]                  [aggregator]
```
- Desk-level `attentionItems` are a **feeder** into the person-level Attention layer. The context engine notices something about one desk; Attention decides whether it rises to the person.
- The person-level layer **never writes back** into a desk's `ContextObject`. The context engine owns that object.
- Not every `attentionItem` becomes a work_item. Promotion is a decision governed by SPEC-025, and the default is restraint.
- `attentionPrecision()` is the **pre-existing scoring instrument** for the new layer. Do not build a parallel metric. See SPEC-019.
The two uses layer. They do not overlap, and no artifact may use the bare word "attention" without qualifying desk-scoped or person-scoped.
### 1.4 Intent classes
The routing taxonomy. Small by design — expansion requires a decision entry.
`action` · `review` · `scheduling` · `fyi` · `acknowledgment` · `discussion` · `loose_thought` · `direct` *(unrouted)*
Questions are **not** a separate class. A question the AI cannot answer is a specific effortful item needing action; it is marked `needs_answer` internally and surfaced within `action`.
### 1.5 Terminal states
Every work_item has exactly one terminal state and a defined way its originator learns of it:
`acknowledged` · `answered` · `scheduled` · `delivered` · `reviewed` · `completed` · `discussed` · `dismissed` · `reclassified`
Non-terminal statuses stay small and explicit: `open` · `in_progress` · `waiting` · `needs_review` · `needs_approval` · `delegated` · `blocked` · `suggested` · `stale`.
---
## §2 · Change tiers
| Tier | Definition | Governance |
|---|---|---|
| **FOUNDATIONAL** | Schema, sync semantics, information routing, brain behavior | Strictest. Additive migration, documented rollback, dual validation, regression guard before stage close. |
| **RESHAPE** | Rebuilds or re-points an existing surface | Requires a crossroads ruling. Never self-granted. |
| **ADDITIVE** | New surface or capability alongside existing ones | House wiring order: DB → IPC → preload → routing → gating. |
---
## §3 · SPEC inventory
Triage proposed; verification pending. `Touches` names the existing subsystems a change lands on — the field that drives gap verification.
### 3.1 Foundation — P0
| ID | Item | Tier | Touches |
|---|---|---|---|
| **SPEC-001** | Widen the `nodes` CHECK constraint to admit `kind: 'work_item'`, using the harvested schema-derived migration (`fd12cc2f`: idempotent, rebuild-based, pinned by a 144-line test). Additive; rollback documented. | FOUNDATIONAL | `src/main/db/nodes.ts`, migrations |
| **SPEC-002** | `work_item` node columns — the replicating core. Routing-shaped from day one: `intentClass`, `originatorId`, `recipientId`, `state`, `terminalState`, `sourceRef` (desk/room/doc/message/file), `sourceType`, `dueAt` (collision-proof ISO), `urgency`, `priority`, `confidence`, `approvalState`, `reasonCode`. Purely local state does **not** live here. | FOUNDATIONAL | `src/shared/types.ts`, sync whitelist |
| **SPEC-003** | Satellite local tables for non-replicating state: snooze timers, read cursors, notification delivery receipts, dismissal history. Keeps the synced core lean. | FOUNDATIONAL | new tables, org-scoped |
| **SPEC-004** | **Node-consumer classification.** See §5. Classify all 305 kind-branching call sites across 99 files into safe-by-construction vs. must-touch. Blocking for SPEC-001 sign-off. | FOUNDATIONAL | 99 files — see GAP-011 |
| **SPEC-005** | `workItems:*` IPC namespace, typed preload, renderer store. House wiring order. Never extends `nodes:*` semantics in ways that leak work_items into desk-shaped consumers. | ADDITIVE | preload namespaces, capability gating |
| **SPEC-006** | **Notification substrate.** Persistence table, main-process scheduler (survives app restart), Electron native `Notification`, delivery dedupe, badge model. Replaces the renderer `setInterval` reminder engine. Closes GAP-002/003. | FOUNDATIONAL | main process, CR-03 |
> **Why SPEC-006 is P0 infrastructure and not a feature:** closed-loop states (SPEC-013) and nudges (SPEC-024) both silently fail without durable, main-process delivery. It is also the single largest "can't be built anywhere else" lever in the initiative.
### 3.2 Capture and routing — P0
| ID | Item | Tier | Touches |
|---|---|---|---|
| **SPEC-007** | Global assistant console. Text and voice; `@person`, `#room`; attachments and links. Three modes: **Routed** (default), **Unrouted** (sent verbatim, no classification — protects rapport), **Expand** (formalizes the existing chat-to-desk promotion path; does not invent a new one). | ADDITIVE | ⌘K palette registration, existing assistant |
| **SPEC-008** | Intent classification into §1.4 classes. Follows the **standup pattern**: pure composer → orchestrator → AI weave, deterministic fallback, ids resolve or stay null, never fabricates. | ADDITIVE | brain, model routing |
| **SPEC-009** | Sender clarification — **at most one** sharp question, and only when ambiguity or stakes justify it. Threshold is an open question (§8-Q1). | ADDITIVE | assistant console |
| **SPEC-010** | Opt-in cleanup. AI may propose a rewrite; the sender approves before send. Silent rewriting is prohibited — it changes tone and meaning. | ADDITIVE | assistant console |
| **SPEC-011** | Routed object creation. Each object carries: source, source type, spatial ref, owner, required action, due, priority, linked artifact, completion control, reclassify control, and a plain-language reason. | ADDITIVE | SPEC-002 |
| **SPEC-012** | Self-routing loop closure. Terminal states resolve and notify. Exercises the full intent→object→terminal model with zero multi-user variables. | ADDITIVE | SPEC-006 |
| **SPEC-013** | Reclassification. Every item carries a visible "this isn't right." Reclassifying is the receiver's right, not a request. Corrections feed the learning loop. | ADDITIVE | SPEC-025 |
### 3.3 The Attention surface — P0
| ID | Item | Tier | Touches |
|---|---|---|---|
| **SPEC-014** | Attention widgets registered in `homeWidgetDefs` — Tasks, Reviews, Calendar, Awaiting Ack, Completed, Stale Desks. Sizes, rails, multi-instance, persisted layout, all per the existing registry contract. **No fourth dashboard system.** | ADDITIVE | Home registry |
| **SPEC-015** | Collapsed count in the top bar. State, not substance. Counts only. | ADDITIVE | top bar |
| **SPEC-016** | Queue definitions and terminal-state rendering. Visual distinction between acknowledgment, reply, review, and deliverable states — the least-developed area in the source synthesis. | ADDITIVE | SPEC-014 |
| **SPEC-017** | Cross-desk work_item view. Grouping by room, desk, Plan, priority, due, status, source. Saved lenses rather than ad-hoc filters: daily execution, room collaboration, desk deep-work, stale work, AI-suggested. | ADDITIVE | SPEC-005 |
| **SPEC-018** | **Surfaced rationale.** Every item carries one plain-language reason ("Deadline is tomorrow", "No activity in 7 days", "Caleb asked for review"). Generated from the signals that actually drove the ranking — never narrated after the fact. This is the standup honesty standard applied to ranking. One reason per item. | ADDITIVE | SPEC-019 |
| **SPEC-019** | Priority model, deliberately thin at v1: deadline proximity, staleness, explicit human ask. Additional signals admitted only when they demonstrably improve ordering. Scored against the existing `attentionPrecision()`. | ADDITIVE | `src/main/meta/metrics.ts` |
| **SPEC-020** | ⌘K action registration — create, triage, jump-to-source, "what's on me." | ADDITIVE | `CommandCenter.tsx` |
| **SPEC-021** | Universal conversion. Any meaningful object → work_item in one or two interactions: browser session, desk, room, doc/sheet/slide, message, mail, calendar item, file, widget, note, selection. Conversion is a gesture, not data entry. **Breadth with restraint** — everything that *can* convert is not everything that *should* auto-convert (§8-Q4). | ADDITIVE | many surfaces |
### 3.4 Intelligence — P0-light, P1 depth
| ID | Item | Tier | Triage | Touches |
|---|---|---|---|---|
| **SPEC-022** | Desk `attentionItems` → Attention feeder, per §1.3. One-directional. Promotion is governed, not automatic. | ADDITIVE | P0 | `src/shared/context.ts` |
| **SPEC-023** | Memory `commitment` kind → candidate work_items. AI-noticed obligations with due phrases. Evidence required; supersede-not-delete respected. | ADDITIVE | P0-light | memory core |
| **SPEC-024** | Stale-work nudges. Start narrow: "no activity in 7 days and a deadline Friday." Restraint is the feature. | ADDITIVE | P0-light | SPEC-006 |
| **SPEC-025** | AI-suggested work_items with confidence and approval state. Accept / dismiss / merge / edit. **Suppression learning:** repeated dismissals quiet the *source type*, not just the item. | ADDITIVE | P1 | brain |
| **SPEC-026** | Desk meta-brain depth — decisions, open loops, blockers, changed-since. Foundation exists; deepening is P1. | ADDITIVE | P1 | context engine |
### 3.5 Person-to-person — specced now, built P1
Specced in full at P0 so the data model is **born routing-shaped**; built after self-routing proves the loop.
| ID | Item | Tier | Touches |
|---|---|---|---|
| **SPEC-027** | Cross-user routing over the existing sync/org substrate. Receiver queues, originator visibility. | FOUNDATIONAL | `workspaceSync`, org directory |
| **SPEC-028** | Acknowledgment-only items. One-tap "received, understood." | ADDITIVE | SPEC-016 |
| **SPEC-029** | Originator loop-closure notification. Tuned to avoid becoming its own noise. | ADDITIVE | SPEC-006 |
| **SPEC-030** | ACL semantics for work_items — org / team / per-desk. Verified in Phase 2 **before** P1 architecture. | FOUNDATIONAL | A-003 |
| **SPEC-031** | Discussion/agenda route — attach to a future 1:1 or team meeting; closes when discussed. | ADDITIVE | meetings store |
### 3.6 Calendar
| ID | Item | Tier | Triage | Touches |
|---|---|---|---|---|
| **SPEC-032** | Tentative holds + approval as additive states on `time_blocks`. Nothing hard-books without consent. `time_blocks` is on the sync whitelist, so holds can be collaborative. | ADDITIVE | P1 | `time_blocks` |
| **SPEC-033** | Calendar surface rebuild. **CR-01 — ruling required.** | RESHAPE | P1 | Calendar tab, A-006 |
| **SPEC-034** | External calendar (Google/CalDAV). Closes GAP-007. | ADDITIVE | **P2** | — |
### 3.7 P2 — logged, designed-around, not built
Designed-around means: today's schema and routing must not foreclose these.
| ID | Item | Note |
|---|---|---|
| **SPEC-035** | Living project table — auto-maintained project state |
| **SPEC-036** | Agent dispatch for work_items — routes through the existing A6 consent gate, kill switch, run ledger, cost surfacing. Never a parallel mechanism. |
| **SPEC-037** | Completion/archival cascade + recap. Depends on delete semantics (§8-Q5). |
| **SPEC-038** | Guided discovery with live artifact rendering |
| **SPEC-039** | MCP work_item exposure to external LLM clients. External writes must still produce routed objects with source, spatial ref, and done state — never bypass the model. |
| **SPEC-040** | Loose-thought decay tier. Included at v1 **only** as a classification that stores lightly and stays out of authoritative memory; decay timing and promotion rules are P2 (§8-Q6). |
| **SPEC-041** | `fb_task_deps` integration — work_items as Gantt nodes. See §4. |
### 3.8 Explicit non-goals
Rejected at spec level, not deferred:
- A fourth dashboard system.
- A ClickUp-style project-management surface, or a manual checklist app.
- A standalone task database disconnected from desks.
- A generic AI chat bolted onto a sidebar.
- An infinite message feed.
- Automatic hard-booking of calendar time.
- Indiscriminate memory capture.
- Any new meaning for `taskId`.
---
## §4 · Positioning against Plans
**The premise that no Plan object exists is false.** Verified at `a92b30cb`: `isPlan` on folder nodes (`src/shared/types.ts:193, 217-219, 242` — "Promote a Room to a Plan or demote it back"), `src/main/db/projectPlan.ts` (21KB), `fb_task_deps` (finish-start predecessor/successor dependencies, 6 uses), `PlexiProjectsView.tsx`.
**v1 boundary — extend later, never collide now:**
- work_items parent to desks and rooms, **including Plan-rooms**. A Plan-room is a room; nothing special is required.
- work_items **do not touch `fb_task_deps`**. Dependencies remain desk-level and Plan-owned.
- work_items are **not** Gantt nodes at v1 and do not appear on Plan timelines.
- The Plan system is not modified, re-pointed, or wrapped by this build.
**Why the boundary rather than integration:** `fb_task_deps` encodes scheduling semantics between desks. Admitting a second, finer-grained entity into that graph changes what a dependency means and what the Gantt renders — a FOUNDATIONAL change to a working subsystem, in service of no P0 objective. SPEC-041 holds the integration; the v1 schema must not foreclose it (work_items carry a stable id and spatial ref, which is sufficient).
**Verification obligation:** gap analysis must confirm that adding `kind: 'work_item'` does not leak into `projectPlan.ts` enumeration or `PlexiProjectsView` rendering. This is a specific instance of SPEC-004.
---
## §5 · SPEC-004 — Node-consumer classification (GAP-011)
**Census at `a92b30cb`: 305 kind-branching call sites across 99 files.** Confirmed consumers include `stores/nodes.ts`, `stores/view.ts`, `stores/presence.ts`, the sidebar tree, `CanvasBreadcrumb`, `StageManagerStrip`, `workspaceSnapshot`, `shareSnapshot`, `radar`, `velocityStats`, and streamdeck.
**This item demands classification, not rewriting.** A blanket refactor of 305 sites is disproportionate, un-reviewable, and would violate the preservation doctrine on subsystems that are working correctly.
### Risk classes
| Class | Pattern | Behavior with a third kind | Action |
|---|---|---|---|
| **A — Safe by construction** | Positive filters: `kind === 'task'`, `kind === 'folder'` | A third kind passes through untouched. Correct as written. | Classify; do not touch. |
| **B — Negation patterns** | `kind !== 'folder'` and similar | **Silently catches work_items** and treats them as desks. | Must-touch. Each site individually assessed. |
| **C — Unfiltered child enumeration** | Tree walks, breadcrumb builders, drag-reparent targets, snapshot builders | Work_items appear as **phantom children** under every desk. | Must-touch. Highest user-visible risk. |
### Deliverable
A classification table covering all 305 sites: file, line, pattern, class, verdict (`safe` / `must-touch`), and — for must-touch — the minimal change. Class B and C sites become individually reviewable diffs.
### Gate condition
SPEC-001 (CHECK widening) **does not close** until the classification exists and every Class B and C site is dispositioned. A third node kind entering a codebase with 305 unclassified branch points is exactly the foundational-change risk the doctrine exists to prevent.
**Live verification is mandatory, not optional:** the sidebar tree, breadcrumbs, Stage Manager strip, and share snapshot must each be observed in the running app with work_items present before the stage closes.
---
## §6 · Reused patterns — the seam inventory
This build should feel like Plexii always had it. What it inherits rather than invents:
| Need | Existing asset | Obligation |
|---|---|---|
| Sync, ACL, sharing, spatial parenting | `nodes` on the sync whitelist | Work_items are nodes. Free inheritance. |
| AI that never fabricates | The standup pattern | SPEC-008, SPEC-018 follow it exactly. Deterministic fallback; ids resolve or stay null. |
| AI acting on the user's behalf | A6 consent gate, kill switch, run ledger, cost surfacing | SPEC-036 routes through it. No parallel mechanism. |
| Ranking quality measurement | `attentionPrecision()` | SPEC-019 scores against it. Do not build a second metric. |
| Desk-level noticing | `ContextObject.attentionItems` | SPEC-022 feeds from it, one-directionally. |
| AI-noticed obligations | Memory `commitment` kind | SPEC-023. Evidence-backed; supersede-not-delete. |
| Dashboard surface | `homeWidgetDefs` | SPEC-014 registers into it. Never a fourth system. |
| Action surface | ⌘K palette | SPEC-020 registers into it. |
| Data model prior art | Legacy harvest `fd12cc2f` | 7-way work-type taxonomy, urgency-separate-from-priority, collision-proof ISO due dates, the CHECK migration, three polished components. Reference-only per DEC-005. |
---
## §7 · Crossroads docket — batched for one ruling pass
Each requires an operator ruling. Options priced; recommendation stated; none self-granted.
**CR-01 · Calendar surface rebuild.** The `time_blocks` engine is good (real recurrence materialization, meeting support, on the sync whitelist). The Calendar *tab* sees ~no use (A-006). SPEC-032 (holds) is additive and needs no rebuild. Options: (a) keep engine, leave surface, holds render in Attention only; (b) rebuild the Calendar surface around holds and approval — RESHAPE, cost to be priced; (c) defer both to P2. *Recommendation: (a) for v1; revisit after SPEC-032 ships and the surface's real usage is measurable.*
**CR-02 · Dashboard disposition.** Three parallel systems plus a dead scaffold: the live Home registry, an orphaned SQLite-persisted portlet engine, a declarative `ModuleDashboard`, and a dead unification scaffold. Strategy must pick one and disposition the rest. Options: (a) Home registry is canonical; formally deprecate the other two and delete the dead scaffold; (b) canonical Home registry, leave the orphans untouched and undocumented; (c) unify. *Recommendation: (a). Leaving three dashboard systems alive while adding a fourth surface to one of them is how the fourth system gets built by accident in six months.*
**CR-03 · Notification rebuild scope.** Today: scattered renderer Web-Notification calls, a renderer `setInterval` reminder engine that dies with the app with per-run dedupe, and a main-process notifications module that is a spec-conformance decoy with zero production callers. Options: (a) build the substrate in main and re-point the renderer callers, retiring the decoy; (b) build the substrate and leave existing callers alone (two notification paths); (c) extend the renderer engine. *Recommendation: (a). (c) cannot survive app restart, which makes SPEC-024 and SPEC-029 undeliverable.*
**CR-04 · Semantics of the surfaces that currently lie.** Pulse counts desks-with-due-dates as "open tasks"; `AllTasksView` lists desks. Once real work_items exist, these are actively wrong. Options: (a) re-point both at work_items — RESHAPE, changes what existing users see; (b) rename them to say "desks" and leave behavior intact; (c) leave both, accept two meanings. *Recommendation: (b) at v1, (a) considered at G5 once work_item adoption is observable. (c) is rejected — two live meanings of "task" is the exact failure this build's vocabulary section exists to prevent.*
**CR-05 · The dead `task-item` type.** Declared in types, physically rejected by the CHECK. Options: (a) delete the dead declaration, `work_item` is the only new kind; (b) rename the declaration to `work_item` and reuse it; (c) leave it dead. *Recommendation: (a) or (b) — operator's preference on diff shape; both are clean. (c) leaves a trap for the next reader.*
**CR-06 · Loose thoughts at v1.** SPEC-040 proposes classification-only at v1 with decay deferred. Options: (a) as proposed; (b) full decay tier at P0; (c) omit the class entirely at v1 and route low-stakes input to `fyi`. *Recommendation: (a). (c) pollutes authoritative memory, which is the specific failure the class exists to prevent.*
---
## §8 · Ambiguities returned as questions
Per the doctrine: ambiguity becomes a logged question, never a guess. These are **not** resolvable from the source synthesis — it identifies each as open.
**Q1 · Clarification threshold.** What concretely triggers SPEC-009's one question? A rule is required — confidence below a value, presence of a deadline phrase, multi-intent detection, named recipient. "When ambiguity or stakes justify it" is not implementable. *Risk if guessed: over-clarification makes sending heavy and users route around the system.*
**Q2 · Multi-object inputs.** One utterance may become a task, a message, and a calendar hold. Presentation, confirmation, and partial-undo are undefined. *Options to price: sequential confirmation, single grouped card, primary-object-plus-suggestions.*
**Q3 · Auto-creation vs. approval for AI-suggested work_items.** Does a high-confidence AI item enter the queue directly, or land as a suggestion? A confidence threshold is implied but unspecified.
**Q4 · Which source types earn automatic creation.** SPEC-021 settles breadth; thresholds are open. Which sources auto-create, which require approval, what confidence separates them.
**Q5 · Delete semantics.** Four distinct behaviors need names and rules: remove from active views; delete the object; delete associated memory; preserve a summarized trace. Today desks archive but do not delete because their information lives in the brain. Blocks SPEC-037.
**Q6 · Decay timing and promotion.** What counts as a reference strong enough to save a loose thought; whether promoted history enters authoritative memory.
**Q7 · System notifications.** Are agent escalations, cost caps, and build-complete events a queue inside Attention, or a separate tray? Affects SPEC-014's widget set.
**Q8 · Classification arbitration.** When originator and receiver disagree about intent class, whose classification is canonical after reclassification? Relevant only at P1, but the data model must accommodate the answer now.
---
## §9 · Sequencing proposal
Ordered by dependency, not by visibility.
| Phase | Contents | Gate |
|---|---|---|
| **1** | Intake, verified gap matrix, adversarial pass, crossroads rulings (§7), answers to §8 | G1 |
| **2** | Prove sync passthrough of new node columns and item types (A-003 residual, ratifies Ruling 1); SPEC-004 classification of all 305 sites; ACL semantics | G2 |
| **3** | Strategy + logic-audited architecture | G3 |
| **4** | SPEC-001/002/003/005 — schema, IPC, store. **SPEC-001 blocked on SPEC-004.** Ruling 1 ratified here. | G4 |
| **5** | SPEC-006 notification substrate; SPEC-007–013 capture and self-routing; SPEC-014–021 Attention surface | G5 |
| **6** | SPEC-022–024 intelligence-light; live verification across all reused surfaces; regression guard | G6 |
| **P1** | SPEC-025–033 — person-to-person, calendar holds, intelligence depth | post-G6 |
---
## §10 · Success condition
The primary objective (§0) is met when a person can open Plexii, ask "what's on me," and get an answer that is **complete** (nothing needed is missing), **honest** (each item says why it is there, and the reason is the signal that actually ranked it), and **restrained** (nothing is there that does not need them) — while every item still lives, and remains editable, exactly where the work happens.
Measured against `attentionPrecision()`, not against item volume.
---
*Prepared for intake per `SPEC-INTAKE.md`. Pre-applied triage is a proposal to verify. Verbatim capture, SPEC-NNN inventory confirmation, and adversarial gap verification run in full.*
