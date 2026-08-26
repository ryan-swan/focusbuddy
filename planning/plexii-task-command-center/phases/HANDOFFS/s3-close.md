# S3 Close — IPC Namespace, Store, Creation Seam

**Date:** 2026-08-25 · **Commit:** `00240bda`, pushed · **Verdict:** CLOSED.

## What shipped
- **db verbs** over the S2 core: `listWorkItems` / `getWorkItem` /
  `updateWorkItemFields` (patchable set enforced — `title, notes, intentClass, dueAt,
  wiUrgency, reasonCode, approvalState`; hostile `status`/`workItemState` keys ignored,
  unit-pinned) / `reclassifyWorkItem` (re-bins intent, item stays ACTIVE — the terminal
  `reclassified` state is a separate outcome via setState) / `snoozeWorkItem` /
  `markWorkItemRead` (wi_local, device-local) / `workItemCounts` (by state, org-scoped,
  trash-excluded).
- **`workItems:*` IPC + preload**, every verb wrapping the db module (F008); typed
  refusal codes reach the caller.
- **`stores/workItems.ts`** — the renderer store + live-path producer (§3): `create` →
  `crdtEmitNodeCreate` (full-manifest snapshot); `setState` emits `workItemState` ONLY
  (status never rides the wire — receivers derive their own projection, F012);
  `updateFields`/`reclassify` emit their changed manifest attrs; snooze/markRead emit
  nothing. Never touches `useNodeStore` or `nodes:*` (parity-locked).
- **Sync loop** refreshes the store after pulls, beside useNodeStore.
- **Creation seam:** `fb:command-new-work-item` listener beside the new-task handler in
  Sidebar; S6's palette supplies `detail.title`; refusals warn honestly until the S6
  surfaces render them.

## Verification
Typecheck clean · **2694/2694** (8 new: verb behavior on node:sqlite + namespace/store/
seam parity locks) · live: app boots clean on the S3 build (fresh PID confirmed by
start-time — the lock-survivor protocol from s2-close applied), 112 nodes intact, zero
work_item rows (flag OFF — correct).

## Deliberate call
**`workItems.enabled` stays OFF.** The create path is unit-proven end-to-end
(gates → insert → projection → emit contract), but flipping the flag on the live app
would also switch ON the S0 gated AI-catalog addendum — advertising `create-work-item`
to the model before any surface exists to show the result. The flag-ON live smoke
belongs to S5/S6 (§2.6's rollout order). Recorded as the S3→S5 handover condition.

## Next: S4 (notification substrate — RESHAPE; regression guard applies).
