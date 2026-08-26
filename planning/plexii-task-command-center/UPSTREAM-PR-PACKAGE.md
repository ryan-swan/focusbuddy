# Upstream PR Package — The Attention Layer

**Prepared 2026-08-25** · branch `ryan-command-center` (fork `ryan-swan/focusbuddy`)
→ `saasmouth/focusbuddy` `main` · **59 commits · 159 files · +14,944 / −373 ·
2,750 tests green (≈140 added) · typecheck clean · DEC-001…DEC-023 recorded.**
Ryan opens the PR (never pushed from automation); everything below is paste-ready.

---

## 1. Paste-ready PR title + body

**Title:** `Attention layer: work_item entity, capture → routing → surfaces, lifecycle + delete contract, sync hardening`

**Body:**

> This lands the Attention layer end-to-end, built additively on the existing
> substrate and verified live on a real workspace plus a genuine two-device
> session against the production signal server.
>
> **What it adds**
> - `work_item`: a fourth node kind (CHECK-constraint migration with
>   harvest-before-rename + full assertion suite; ran clean on a live 112-row
>   DB). Kind is quarantined from every desk surface (`listNodes` exclusion +
>   grep-locked) — nothing existing renders differently.
> - Capture: ⌘K `@attention` prefix / palette entry / assistant proposals →
>   ONE console (deterministic rules first, Haiku fallback) that always stops
>   at a single confirm screen; files onto the open desk when there is one.
> - Attention page: queues by intent class, Due/Origin lenses, feeders
>   (desk + plan due dates, stale desks — computed, one-directional), snooze /
>   reclassify / per-class closing verbs, Detached shelf, Recently closed.
> - Notification substrate: durable rows, dedupe keys, hourly cap with
>   summary collapse, mark-then-show; the calendar block reminders now ride it
>   (restart-proof, replacing the renderer interval engine).
> - Lifecycle + the delete contract: Trash page with lossless restore,
>   archive shelves, ONE shared lifecycle menu across every surface, bulk
>   selection on the index + trash pages, and a closed FOUR-site hard-delete
>   enumeration (CI grep-locked) with detach-and-revive so a desk purge can
>   never destroy a work item. Shared desks: no unilateral trash; scope-local
>   archive; recipient Leave-share.
> - Sync hardening (all `[PLEXI-UPSTREAM]`-flagged): 409 conflict-floor fix
>   (F010), park-inbound defensive apply branches, work_item arrival router,
>   CRDT allowlist manifest with parity CI, shared-refresh widening,
>   `nodeSharedRoot` partition fallthrough, structured sync trail lines
>   (`[sync-mark]` / `[sync-409]` / `[sync-apply]`).
>
> **Proven live:** production server accepts the kind (9/9 real items, revs
> assigned, zero rejections); a second device materialized all of them with
> the status projection recomputing correctly (`dismissed→parked`, never
> `done`); a fresh capture round-tripped A→server→B in seconds; sender trash
> arrived as soft-trash per the frozen retention rule.
>
> **Bugs found in the base while building (§4 of the package, evidence
> included):** initial-pull truncation permanently skips rows on fresh-device
> login; chat schedule-event lands a year off; undebounced webview nav
> persistence pushes every sync cycle.
>
> **Merge preconditions (§5):** fleet migration ordering, defensive branches
> observed firing, and the one-code-path rule for work_item writes. Default:
> `workItems.enabled` ships OFF (Settings toggle included), so merging is
> zero-behavior-change until a device opts in.
>
> 🤖 Generated with [Claude Code](https://claude.com/claude-code)

---

## 2. What's in the branch (layer map)

| Layer | Core files | Verification |
|---|---|---|
| Migration + quarantine | `db/migrateNodesKind.ts`, `db/nodes.ts`, `ai/vocabulary.ts` | 3-fixture migration tests + trigger survival + live 112/112 run; vocab quarantine tests |
| work_item module (one code path) | `db/workItems.ts`, `shared/workItems.ts` (column manifest) | projection pins (never-done ×3 apply arms), allowlist/emit parity CI |
| Arrival router + sync | `lib/crdtSync.ts`, `db/workspaceSync.ts`, `lib/workspaceSync.ts` | GAP-015 emit/arrival adversarial tests + live two-device session |
| Notification substrate | `notifications/substrate.ts`, `scheduler.ts` | dedupe/cap/collapse tests; block reminders restart-proof |
| Capture | `ai/intentRules.ts`, `ai/intentClassify.ts`, `CaptureConsole.tsx`, `CommandCenter.tsx` | rules unit tests; three operator QA cycles live |
| Attention surfaces | `views/AttentionView.tsx`, `lib/attentionQueues.ts`, `lib/attentionFeeders.ts`, `AttentionBadge.tsx`, ONE `attention` widget | queue/feeder tests incl. plan-due; live use |
| Lifecycle + delete | `db/nodeLifecycle.ts`, `db/memoryPurge.ts`, `lib/deleteDeskFlow.ts`, `lib/deskLifecycleMenu.ts`, `TrashView.tsx`, index bulk selection | `deskPurge.test.ts` adversarial scope; CI delete-site lock (4 sites) |
| Nav (DEC-020) | `Sidebar.tsx`, palette | Desks(flat)/Plans/Calendar rows retired; views palette-reachable; **calendar engine untouched** |

## 3. `[PLEXI-UPSTREAM]` flagged diffs (fixes to the base, cherry-pickable)

1. **Wake-coalescing re-arm** (`fix/sync-wake-coalescing`, cherry-picked at
   `4470e2cd`) — separate PR already open, awaiting review.
2. **F010 409 conflict-floor** — `advanceBaseRevCore` (`db/workspaceSync.ts`):
   after a conflict-apply no-op, floor local `sync_rev` to the server's so a
   row can never 409 forever. Proven live (cured real perma-dirty rows).
3. **Park-inbound defensive branches** — `maybeParkApplyFailure`: unknown-kind
   / newer-epoch inbound rows park + surface instead of silently dropping
   (the R016 silent-swallow fix). Structured log line included.
4. **`pruneSharedRows` via the lifecycle module** — revoked shared desks now
   detach-and-revive work items instead of cascading them away.
5. **Sync trail lines** — `[sync-mark]`/`[sync-409]`/`[sync-apply]`:
   greppable, low-noise; the "observed firing" evidence R016 asks for.

## 4. Findings in the base (Caleb's queue, with evidence)

| # | Finding | Evidence | Suggested fix |
|---|---|---|---|
| F-1 | **Initial-pull truncation gap** (P1-F1): `pullChanges` issues ONE un-paginated `GET /workspace/sync?since=` then jumps the cursor to `now` — any server truncation = permanent silent gap; fresh devices get partial workspaces. Kind-agnostic. | Live two-device session: 3 rows the server holds (revs 4736/4737/1, parents present on B) never materialized across many cycles while ~770 items did | Server: `more` flag or `next` cursor + client loop; or cursor = max returned server-updated-at |
| F-2 | **Chat schedule-event year-off**: created block landed in 2025 (startMs computed a year off); block exists but invisible | Reproduced live during S6 QA | Anchor year from `now` at parse |
| F-3 | **Webview nav persistence churn**: `persistNavUrl` (deliberately undebounced) + auto-refreshing embedded page = one push per sync cycle, indefinitely (observed sync_rev 2,800+ on one widget) | poll traces in `p1-live-pass.md` §7 | small debounce or URL-flap guard |
| F-4 | Widget writes that skip `updated_at` skew L3 staleness (June timestamp on a row churning in August) | same trace | touch `updated_at` on nav persistence |
| F-5 | `agentDispatcher.ts` vs the "Dispatch" product naming — collision risk with A7 vocabulary | naming audit (analysis/19) | rename before Dispatch ships |
| F-6 | `ipc/index.ts` concurrent-edit drift (capability gates vs this branch) — now +1 commit (`7930141f`) | merge-base diff | coordinate merge order; file is append-heavy, conflicts are mechanical |

Note: `b66ffe24`/`44f240f8` upstream (managed-Plexii first-run; legacy minimap
retirement) are welcome — the retired legacy minimap matches the stuck widget
observed in P1 diagnostics.

## 5. Merge-readiness preconditions (unchanged from the G6 ledger, status added)

1. **Fleet migration first** — every device carries the S1 migration before
   org exposure; `schema_epoch` guard live. *Mitigated by default-OFF:
   `workItems.enabled` ships opt-in (Settings toggle now exists).* ☐
2. **Defensive branches observed firing upstream** — trail lines landed;
   mixed-peer observation still owed on Caleb's side. ☐
3. **One-code-path doctrine** — agents/missions/MCP write work items ONLY via
   the workItems module (doc'd in ARCHITECTURE §2.3/F008). ☐ (doctrine note
   for the PR description — enforced by CI locks once merged)
4. **Flagged diffs reviewed as their own hunks** (§3). ☐
5. **Findings triaged** (§4 — F-1 matters independently of this PR). ☐
6. **DEC-020 nav retirement acknowledged** — Calendar/Plans/Desks-flat rows
   hidden on this branch; carry or consciously re-add. ☐

## 6. Drift status at package time

`origin/main` is 6 commits ahead of the merge-base (`7930141f…39faa2c4`):
share-dialog, capabilities, first-run, minimap retirement, rebrand, release
4.1.1. **Collision check: NO overlap with workspaceSync/crdtSync/vocabulary/
nodes.ts — only `ipc/index.ts` (mechanical).** Recommended: one
merge-from-main on the fork before opening the PR; expected conflicts:
`ipc/index.ts` only.

## 7. Rollout plan

1. Merge with `workItems.enabled` default OFF → zero behavior change.
2. Fleet updates (migration rides `getDb()` on first launch per device).
3. Opt-in per device via Settings → AI → Attention layer.
4. Org scope stays parked until SPEC-027: the migrated-peer attestation gate
   (`workItemsPref.workItemsOrgEnabled`) is already in place for it.
5. P1-F1 fix lands server-side at Caleb's pace (independent of all of this).
