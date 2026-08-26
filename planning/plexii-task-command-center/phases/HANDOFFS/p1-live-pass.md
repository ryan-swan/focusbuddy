# P1 Live Pass — Findings + Fixes (2026-08-25)

The seven-item P1 checklist from [s7-close-G6.md](s7-close-G6.md), executed. Status
per item, with the evidence.

## 1. R010 — production server accepts `kind='work_item'` — **PROVEN (live evidence)**
The personal push loop carries no kind filter, so the operator's real work items
have been syncing since the flag went ON. Live DB at 17:00: **9/9 work_item rows
with server revs 5–17, `needs_sync=0`, zero rejections, zero parked rows.** The
production signal server accepts the new kind, assigns revs, and the client cleans.
The disposable-account containment R010 prescribed was for first contact; first
contact happened organically on the daily driver and was clean. **Push half: retired.**

## 2. GAP-015 two-device arrival — **CLOSED (live, same evening)**
Device B ran on this Mac via the app's own `FB_TEST_USER_DATA` isolation (own DB,
own single-instance lock, `preview` build); the operator signed it in. Verified
headless against B's throwaway DB:
- **All 9 work_items materialized** with `kind='work_item'`, routing columns
  (intent_class) intact, and the status projection RECOMPUTED CORRECTLY on
  arrival — `completed→done`, `dismissed→parked` (the A-02 never-done invariant
  held through the production server on a real second device).
- **Fresh capture round-trip:** operator filed "@attention Device B arrival
  test" on A → row `952e04f4` appeared on B as `work_item / action / open`
  within the watcher's 10s polling grid.
- **Trash propagation:** a throwaway desk trashed on A arrived on B as
  SOFT-TRASH (`trashed_at` set, row alive) — the §8 retention rule's substrate
  observed live, not just asserted.
- Detach-reaches-B stays covered by the S2 unit test: no current UI path
  parents a work item to a desk (capture files unparented), so the live
  variant waits for whichever surface first creates parented items.

## 2a. NEW FINDING — **P1-F1: initial-pull truncation gap (Caleb-core, pre-existing)** `[PLEXI-UPSTREAM]`
Exposed by the fresh-device login. Three personal rows the server verifiably
holds (pushed June–July, acked at revs 4736/4737/1: tasks `1647a665`
"Untitled table", `b5ad4171` "Send Track to Fiverr", task-item `57b7fa86`)
**never materialized on device B** across multiple pull cycles, while ~770+
other items (122 nodes, 605 widgets, 34 tables…) did. All three parents exist
on B, so FK-ordering failure is ruled out. Mechanism: `pullChanges` issues ONE
`GET /workspace/sync?since=` with no limit handling and no pagination loop,
then `setCursor(pulled.now)` — **any server-side truncation of the response
becomes a permanent, silent gap**, because the time cursor jumps past the
unreturned tail and nothing ever retries it. (The apply-arm comment "the next
cycle retries it" is also false under this cursor design — a row that fails
apply is never re-pulled.) Impact: every fresh device login can silently
receive a partial workspace; kind-agnostic (work items were NOT special — all
9 arrived). Remediations (server help needed): loop until exhausted via a
`more` flag / `next` cursor, or cursor = max returned server-updated-at
instead of `now`. Test-instance recovery is trivial: touching a missing row on
A re-syncs it.

## 3. Routed-trash recipient retention rule — **RULED + FROZEN**
Stated in ARCHITECTURE §8 (P1 row): sender trash arrives as **soft-trash only**
(apply arms already map remote deletes to `trashed_at`, never tombstone); the
recipient's copy sits in THEIR trash on the standard purge clock; restore
**detaches** from the withdrawn route (never re-projects into sender scope);
recipient-owned satellites (`wi_local`, acknowledgment history) survive to purge;
ONE deduped "Withdrawn: <title>" system-queue notification. SPEC-027 designs
against this rule.

## 4. Shared-refresh widening (15 §6 #5) — **FIXED**
The org and shared pull arms refreshed nodes/widgets/tables but never
`useWorkItemStore` — inbound work_items landed in the DB and Attention showed
stale until the personal loop happened to run. Both arms now reload the
work-item store when anything applied ([workspaceSync.ts](../../../src/renderer/src/lib/workspaceSync.ts)).

## 5. `nodeSharedRoot` partition fix — **FIXED**
`nodeSharedRoot` resolved only from `useNodeStore`, which excludes work_items —
so a shared desk's work_item attr/delete emits resolved `null` and misrouted to
the personal partition (create was already correct via `node.sharedRootId`).
Now falls through to `useWorkItemStore` ([crdtSync.ts](../../../src/renderer/src/lib/crdtSync.ts)).

## 6. Migrated-peer confirmation — **GATE BUILT (mechanism, not the flip)**
`workItemsPref` gained per-org attestations: `attestOrgMigrated(orgId, note)` /
`revokeOrgAttestation` / `orgMigrationAttested` / **`workItemsOrgEnabled(orgId)`**
(= capability ON ∧ org attested), persisted in `work-items.json`, exposed over
IPC + preload. Two latent data-loss bugs fixed in the same pass (`load()` and
`setWorkItemsEnabled()` both rebuilt the pref and would have dropped
attestations). `moveNodeToOrg` still parks unconditionally — the org-carry
branch that consults the gate lands with the SPEC-027 architecture pass, by
design.

## 7. The "demo-row re-toucher" hunt — **SOLVED: not a sync defect**
The residue was two widgets (`needs_sync=1` persisting, `sync_rev` +1/minute,
data columns byte-identical). Instrumented three greppable trails —
`[sync-mark]` (widget markPushed), `[sync-409]` (conflict-floor; this is also
the R016-named "deliberate structured log line" for the defensive trail), and
`[sync-apply]` (widget applies) — and ran a 0.2s poll. Verdict: the churn is
**live renderer activity**, not a loop defect — an OPEN webview widget persists
every page navigation (`persistNavUrl`, deliberately undebounced per its own
comment) and auto-refreshing embedded pages re-dirty the row faster than the
5s sampling window; the minimap's viewport writes ride the same shape. On a
fresh idle boot the churn is zero (90s × 0.2s: frozen row). Push→clean cycles
work; F010 holds; no 409s observed; the server accepts everything.
**Registered for Caleb (not overridden — his widget, his stated no-debounce
choice):** an auto-refreshing page inside a webview widget generates one push
per sync cycle indefinitely; a small debounce or a flap guard would quiet it.
Residual cosmetic note: those writes skip `updated_at` (June timestamp on a row
churning in August), which mildly skews L3 stale-desk math for desks whose only
activity is webview navigation.

Closing data point (17:22): a further ~7.5-minute idle watch after the fresh
boot showed ZERO sync cycles — no [sync-mark]/[sync-409]/[sync-apply] lines,
both rows frozen at `needs_sync=1`, revs 1093/2834 unchanged. The wake
coalescer idles deeply with no user activity (expected post-`fix/sync-wake-
coalescing` behavior); the two rows will push-clean on the operator's next
interaction, and the [sync-mark] lines will record it.

## Merge-preconditions delta
Precondition 2 ("defensive branches observed firing") now has its structured
trail lines in place ([sync-409]/[sync-apply]); the mixed-peer observation still
requires the two-device session above.
