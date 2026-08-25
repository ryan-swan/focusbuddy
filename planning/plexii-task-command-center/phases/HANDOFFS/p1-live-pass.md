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

## 2. GAP-015 two-device arrival — **INSTANCE B PREPARED, one operator step**
Device B runs on this Mac via the app's own `FB_TEST_USER_DATA` isolation (own DB,
own single-instance lock, `preview` build so no dev-server conflict). Launched
logged-out; the operator logs it in (their account = honest same-account two-device
config, or a disposable). Then the arrival verifications run headless against
device B's throwaway DB (writable — it is not the sacred live DB):
- all 9 work_items materialize with kind + projection intact,
- a fresh @attention capture on A arrives on B within one poll cycle,
- desk-trash on A → detach-and-revive observed on B (the GAP-015 device-B arm),
- the §2.1 park-inbound branch: no silent drops (`parked_inbound` empty or surfaced).

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
