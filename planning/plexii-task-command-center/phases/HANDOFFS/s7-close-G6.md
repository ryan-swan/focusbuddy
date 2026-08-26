# S7 Close + G6 — The Build's Honest Ledger

**Date:** 2026-08-25 · **Final commit:** `607ace78` · **Suite:** 2,745 tests / 272 files,
all green (baseline was 2,610 — 135 added) · **Typecheck clean · app live on the S7
build.** One day, S0→S7 + L1/L3 + DEC-018/019, every stage closed with live verification.

## G6 verdict: **MET, with the deferrals named below.**

## SHIPPED (the spine, all live on the dev app)
- **S0** vocabulary quarantine; `create-work-item` reserved end-to-end; flag machinery.
- **S1** `migrateNodesKindCheckV2` — fired on the LIVE DB, 112/112 rows, all §2.1
  assertions; closed three-site hard-delete enumeration + detach-and-revive; C2 + leaf
  invariant; listNodes exclusion; park-inbound (GAP-013); CI delete-lock.
- **S2** column manifest (one source) · status projection (never-done, apply-recompute
  ×3) · satellites + orphan sweep · ARRIVAL ROUTER · allowlist/emit parity · **409 fix
  proven live** (the perma-dirty rows cured).
- **S3** `workItems:*` namespace (F008 one path) · store as live-path producer · seam.
- **S4** notification substrate: durable, deduped, per-queue caps + summary collapse,
  mark-then-show; block reminders restart-proof; decoy retired w/ PLX-UX ports;
  DEC-018 actor seam + mission queues reserved.
- **S5** capture console (Routed/Unrouted/Expand) · deterministic-first classifier ·
  Q1 machinery · closed loops through the substrate · Δ3 decay · **flag ON** · AI
  proposes work items (chat/meeting/voice).
- **L1+L3** lifecycle: Trash view + lossless restore · archive shelves · lifecycle
  menus on five surfaces (one shared definition) · computed stale desks.
- **S6** Attention page (queues, per-class closing verbs, snooze, reclassify,
  Detached+MOVE) · lenses (Queue/Due/Origin + Recently closed) · top-bar count ·
  ranker v1 + attentionPrecision (MET-006) wired · CR-04(b) renames (GAP-006 closed).
- **DEC-019** unified @attention capture (⌘K prefix→prefilled console; ALWAYS-confirm
  classification with pre-highlighted pick; chat mention rule) · the ONE Attention
  widget (seven retired via registry flag).
- **S7** feeders ("From your desks": due + stale signals, muting, one-directional) ·
  Δ10 suppression both halves · the single deadline-proximity nudge ·
  the operator's three QA fixes.

## PARTIAL (works, more designed than built)
- Multi-intent captures: primary files; secondary suggestions ride only the chat
  multi-card path. — V2
- Opt-in cleanup rewrite (Δ6): title extraction ships; propose-and-approve rewrite
  not built. — V2
- Scheduling: class + due captured; tentative-hold creation rides the existing
  proposal flow (by design, Δ5); the chat schedule-event **year-off startMs bug is
  Caleb's** (registered, reproduced live).
- Chat @attention: prompt-rule enforced (imperative), but the composer's mention
  TYPEAHEAD doesn't know "attention" as an entity — deterministic composer-side
  interception is a V2 item on Caleb's mentions machinery.

## DEFERRED / OWED (named, where)
- **P1 live checklist:** sync-side kind round-trip via disposable account (R010) ·
  GAP-015 two-device emit/arrival + detach-reaches-device-B live tests · routed-trash
  recipient retention rule (before SPEC-027 freezes) · shared-refresh widening ·
  `nodeSharedRoot` partition fix · migrated-peer confirmation before the org switch ·
  the demo-row periodic re-toucher hunt.
- **Operator rulings open:** D1 (shared-desk delete default) · D2 (purge semantics) ·
  R008 (delete contract; v1 no-hard-delete stands) · R012 (moot — lifecycle shipped) ·
  **CR-08(b) — see below.**
- V2 register: anomaly detection · living table · full invisible tasks · desk
  meta-brain · FYI deadline backstop · work_item archival flag · existing-artifact
  check (full) · Settings toggle for `workItems.enabled`.

## CR-08(b) — THE NAV RETIREMENT — **EXECUTED as DEC-020 (2026-08-25)**
Operator ruled: "Retire the tabs and add plan due dates to the feeders first." Landed
in that order: (1) `plan-due` feeder kind — plan roots with due dates open the plan
dashboard, due desks inside plans carry the plan's name and open the desk; distinct
kind ⇒ independent mutes/Δ10 offers. (2) "Desks (flat)", Plans, and Calendar left the
sidebar, both rail states. Views stay ⌘K-reachable (a "Plans" palette entry was added
— the palette had no direct opener); MainPane routes and the calendar ENGINE are
untouched (DEC-009). Full record: DECISIONS-LOG DEC-020.

## Merge-readiness preconditions (for the eventual PR to Caleb — §8 R016 + DEC-018 A-6)
1. Fleet migration first: every device carries S1's migration before any org exposure;
   `schema_epoch` guard live; else `workItems.enabled` ships opt-in-only.
2. The defensive apply branches (park-inbound) land upstream and are observed firing.
3. **The one-code-path doctrine:** agents, missions, and external MCP clients write
   work items ONLY through the workItems module — a parallel write path silently
   breaks projection/leaf/scope/C2/CI-locks.
4. [PLEXI-UPSTREAM] flagged diffs: wake-coalescer, park-inbound, 409 fix, prune core.
5. Known-Caleb leads: schedule-event year-off startMs; `agentDispatcher.ts` vs
   "Dispatch" naming; capability-gates ipc/index.ts merge overlap (2-commit drift);
   **P1-F1 initial-pull truncation gap** (fresh-device pulls silently drop the
   truncated tail forever — evidence + mechanism in p1-live-pass.md §2a);
   webview nav-persistence churn (one push per sync cycle under auto-refreshing
   embedded pages; his stated no-debounce choice, registered not overridden).
6. **DEC-020 nav change on a shared surface:** the Calendar (and Plans/all-tasks)
   sidebar rows are hidden on this branch — the calendar ENGINE is untouched, but an
   upstream merge must either carry the retirement or consciously re-add the rows;
   views remain palette-reachable either way.

## The operator's standing QA loop
Live notes → registered here → fixed in-stage or explicitly scheduled. Current cycle
closed; next notes welcome any time.
