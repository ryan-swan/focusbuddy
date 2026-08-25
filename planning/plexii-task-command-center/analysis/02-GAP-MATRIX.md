# Gap Matrix — SPEC-001..044 vs. Verified Current State

Phase 2 deliverable (G2). Every SPEC item classified **EXISTS / PARTIAL / MISSING /
CONFLICTS-RULED** against the live repo (`a92b30cb`) and live DB, with evidence pointers
into the analysis library. Drafted 2026-08-24 night; adversarial re-verification (≥30%
sample + all EXISTS/CONFLICTS claims) runs as the G2 dual-validation pass — its verdict is
appended at the end.

Confidence: 0.9 overall · why_not_higher: pending the adversarial pass and the sync
reliability report (agent in flight — affects SPEC-027/029 deltas only).
Legend: **E** exists · **P** partial (substrate exists, named delta) · **M** missing
(greenfield; seams named) · **CR** conflicts-ruled (collision existed; operator ruling
resolves it). Evidence keys: MAP=Command-Center Map · 10=consumer classification ·
11=vocab audit · 12=sync proof · 14=ACL · L=legacy harvest (analysis/03) · DB=live-DB
inspection (GAP-014).

## Foundation (P0)

| ID | Class | Evidence + delta |
|---|---|---|
| SPEC-001 CHECK widening | **P** | Migration exists, test-pinned (L §2). Delta: dual-start-state redesign — live DBs may already read `('folder','task','task-item')` (DB/GAP-014); guard must key on absence of `'work_item'`; second test fixture required. Blocked on SPEC-004 dispositions per gate condition — evidence complete (10). |
| SPEC-002 work_item columns | **P** | Substrate proven: nodes sync opaquely incl. new columns (12; kind acceptance DB-evidenced). Delta: the column set with A-02's `work_item_state` + derived `status` projection (+ mapping table; `dismissed`/`reclassified` never → `done`), A-03 reference integrity vs. the verified trashNode sweep + CASCADE (10 §3.1), scope-visibility contract (14 §finding 1), shared-desk auto-share decision (14 §finding 3). |
| SPEC-003 satellite tables | **M** | No such tables; house pattern trivial (org-scoped local tables ubiquitous, MAP §5). |
| SPEC-004 consumer classification | **P (evidence done)** | Full classification delivered + spot-verified: 223 true sites, 44 must-touch, blast-radius ranked, census-invisible forms found (10). Delta: B/C dispositions → reviewable diffs at build; live verification with work_items present. |
| SPEC-005 workItems:* IPC | **M** | Namespace clean; wiring order + reference shapes named (MAP §5); `fb:command-new-task` event identified as the natural creation seam (10 §7.3). |
| SPEC-006 notification substrate | **M** | Greenfield triple-confirmed: no table/IPC/inbox; renderer `setInterval` engine dies with app; decoy module zero callers (MAP §2, 11); CR-03(a) ruled: build in main, re-point callers, retire decoy. |

## Capture & routing (P0)

| ID | Class | Evidence + delta |
|---|---|---|
| SPEC-007 assistant console | **P** | Assistant + ⌘K + voice capture + @mention resolution exist (11: voiceNote, mentionResolver — the two files that already say "desk" correctly). Delta: Routed/Unrouted/Expand modes, `#room`, attach flows. Expand = formalize existing chat→desk promotion, not invent. |
| SPEC-008 intent classification | **M** | Engine new; standup pattern + `AIPurpose` routing seam exist (MAP §4). **Blocked by SPEC-044** (ruled; evidence complete in 11 — riskiest-5 must clear first, esp. anthropic.ts:5140/:402/:410). |
| SPEC-009 clarification | **M** | Q1 concrete proposal returned for ruling (16). |
| SPEC-010 opt-in cleanup | **M** | Adjacent patterns: proposal-preview approve-before-apply flow exists (11 §e). |
| SPEC-011 routed object creation | **M** | Rides SPEC-002's columns; reason-field = SPEC-018 honesty standard. |
| SPEC-012 self-routing closure | **M** | Rides SPEC-006. Push latency evidenced ~3s via nudge (12) — the self-loop will feel instant. |
| SPEC-013 reclassification | **M** | Feeds SPEC-025 suppression; receiver's-right contract is pure new UI + a synced column change. |

## Attention surface (P0)

| ID | Class | Evidence + delta |
|---|---|---|
| SPEC-014 Home widgets | **M** | Registry contract fully mapped (MAP §3: defs → components → render switch); design law in force (DESIGN-FIDELITY). Q7 ruling adds a `System` widget (16). |
| SPEC-015 top-bar count | **M** | Top bar exists; Q7 proposal excludes system events from the headline count (16). |
| SPEC-016 queue/terminal rendering | **M** | StatusPill + tokens + status-color semantics ready (DESIGN-FIDELITY); "least-developed area" flag stands for Phase 3 design attention. |
| SPEC-017 cross-desk view | **P** | AllTasksView exists but lists DESKS (CR-04(b): renamed honestly at v1); legacy branch holds a working mixed-list + filters implementation as reference (L §2). Delta: work_item-native view + saved lenses. |
| SPEC-018 surfaced rationale | **M** | Standup honesty pattern is the verified template (MAP §4). |
| SPEC-019 priority model | **P** | `attentionPrecision()` exists and is the mandated instrument (context.ts/metrics.ts verified); model itself new, deliberately thin. |
| SPEC-020 ⌘K actions | **M** | Palette registration seam exists (CommandCenter.tsx; also a Class-C/B fix site — 10 §2.1/2.2, same file gets its guard in the same stage). |
| SPEC-021 universal conversion | **CR→P** | Conversion FLOWS exist but all create desks (MakeTaskDialog, EmailTaskDialog, MessagesView pulse→create-task, MindMap — 11 §e). Ruled: labels say "desk" (CR-04(b)/A-01); new work_item conversions added alongside; Q4 thresholds open (due Phase 5 planning). |

## Intelligence (P0-light / P1)

| ID | Class | Evidence + delta |
|---|---|---|
| SPEC-022 attentionItems feeder | **P** | `ContextObject.attentionItems` + `pendingWorkIds` + `emitObjectEvent` exist (context.ts:107-142; workspaceSync imports emitObjectEvent). Delta: the one-directional promotion pipe + restraint governance. |
| SPEC-023 commitment candidates | **P** | Memory `commitment` kind with due phrases exists (types.ts:697, MAP §4). Delta: candidate generation w/ evidence discipline. |
| SPEC-024 stale nudges | **M** | Rides SPEC-006 + **external dependency: SPEC-042 lifecycle prerequisite** (stale derivation) — CR-07(B). |
| SPEC-025 AI suggestions + suppression | **M** | Shares guardrail machinery with AI-generated desks per C2-02 ruling; discoveryMode's creation-gate prompt pattern is the in-house prior art (11 §c). P1. |
| SPEC-026 meta-brain depth | **P** | ContextObject foundation exists (decisions, pendingWork, risk); deepening is P1 (spec's own framing verified accurate). |

## Person-to-person (specced P0, built P1)

| ID | Class | Evidence + delta |
|---|---|---|
| SPEC-027 cross-user routing | **P** | Substrate VALIDATED end-to-end (A-003 0.99; 12+14+DB). Model: scope-carried + client-filtered recipientId; **visibility contract must be stated** (14 §finding 1). Receiver-side wake cadence = reliability report (in flight). |
| SPEC-028 acknowledgment items | **M** | One synced column change + SPEC-016 rendering. |
| SPEC-029 loop-closure notify | **M** | Rides SPEC-006; sender-side latency ~3s proven; receiver-side latency pending reliability report. |
| SPEC-030 ACL semantics | **E (as evidence)** | Delivered: analysis/14 — three scopes, server-side membership, team no-leak tagging, per-person addressing absent, four architecture consequences. Consumed at G4. |
| SPEC-031 discussion route | **P** | Meetings store + wrapup + action-items flow exist (11 §d: fb_meetings.action_items_json). Delta: attach-to-future-meeting + closes-when-discussed. |

## Calendar

| ID | Class | Evidence + delta |
|---|---|---|
| SPEC-032 tentative holds | **P** | time_blocks synced (12-adjacent; whitelist), recurrence materialization + meeting field exist (MAP §6). Delta: hold/approval states (additive), consent-before-hard-book. |
| SPEC-033 calendar surface | **CR-ruled** | CR-01(a): keep engine, holds render in Attention at v1; RESHAPE revisited when usage is measurable. |
| SPEC-034 external calendar | **M** | P2; GAP-007 confirmed (no Google/CalDAV/ICS-import anywhere). |

## P2 (designed-around)

| ID | Class | Evidence + non-foreclosure check |
|---|---|---|
| SPEC-035 living project table | **P** | living-docs engine + fb_tables exist; auto-maintained project state new. Non-foreclosed by v1 schema. |
| SPEC-036 agent dispatch | **P** | A6 consent gate/kill switch/ledger verified live (MAP §4); work_item route new; `agentHistory` ref-parse (`task:<id>` → DELETE) is a named integration hazard for later (10 §7.2). |
| SPEC-037 archival cascade + recap | **P** | `archived` + trash/memory separation proven (A-05, 09); recap engine new; re-tier at G3 per amendment. |
| SPEC-038 guided discovery | **P** | discoveryMode.ts EXISTS with the creation gate — closer to done than specced; artifact rendering delta. |
| SPEC-039 MCP exposure | **P** | An HTTP api server exists in main (`apiServer.ts`, kind-filtered — 10 §2.4); exposure contract new. |
| SPEC-040 loose thoughts | **M** | CR-06(a): classification-only at v1; light store outside authoritative memory. |
| SPEC-041 fb_task_deps integration | **E (boundary)** | DEC-010 boundary VERIFIED free: Gantt's terminal filter excludes other kinds by construction; listing filters isPlan (10 §4). v1 schema non-foreclosing (stable id + spatial ref). One deliberate choice logged: a desk nested under a work_item would appear in the Gantt (CTE recurses through) — accept or exclude at SPEC-002. |

## Amendments (A-07)

| ID | Class | Evidence + delta |
|---|---|---|
| SPEC-042 desk lifecycle (external prerequisite) | **P-strong** | status incl. `done`, `archived` + live consumers, `trashed_at`+restore all exist (08, 09); delta = stale derivation, delete/archive UX exposure + the deletion bug fix, memory contract (DEC-013 shape), shared-desk guard. Runs on the CR-07(B) parallel track; must land before Phase 5. |
| SPEC-043 reference integrity | folded → SPEC-002 | Danger concrete & verified (trashNode sweep + CASCADE + 7-day purge chain — 10 §3.1/3.2). Shared half closes via DEC-013 guard. |
| SPEC-044 vocab audit | **E (as evidence)** | Complete audit delivered + spot-verified (11): 62 model-visible occurrences dispositioned, riskiest-5, action-vocabulary map, persistence map, label worklist. Delta: execution as a build stage (prompt definitions + `create-work-item` + label fixes), gating SPEC-008. |

## Enhancement opportunities (the spec didn't know these exist)

1. **discoveryMode's creation gate** — an in-prompt "nothing is created until the user says
   yes" pattern already shipping; SPEC-025's approval flow should reuse its language, not
   invent parallel consent phrasing (11 §c).
2. **`agent_outcomes` undo ledger** — applied/dismissed/undone per proposal with
   `created_entity_ref` — the accept/undo bookkeeping SPEC-025 needs already has a table
   shape (11 §d).
3. **Telemetry blind spot as a hook** — `telemetry.ts:137-138` counts tasks/folders and
   silently skips other kinds (10 §2.4); adding the work_item arm at build time gives
   adoption metrics from day one (feeds the G5 CR-04(a) reconsideration).
4. **Legacy components as UI reference** — the harvested TaskDetailPanel/list/modal remain
   the interaction prior art (re-skinned to current design law per DESIGN-FIDELITY).

## Hidden costs (named, priced into phases)

GAP-013 migration-leads ordering (un-migrated peers swallow unknown kinds) ·
GAP-014 dual-start-state migration + task-item row tolerance · the 44 must-touch consumer
sites (10) · SPEC-044 execution before SPEC-008 · scope-visibility statement for routed
items (14) · SPEC-042 external-track coordination before Phase 5.

## G2 adversarial pass

Verdict appended after the independent re-verification completes (sample ≥30% + every
E/CR-class claim).
