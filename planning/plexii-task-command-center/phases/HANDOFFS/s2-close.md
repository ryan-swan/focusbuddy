# S2 Close — Columns, Projection, Satellites, Sync Contract

**Date:** 2026-08-25 · **Commit:** `2c133165`, pushed · **Verdict:** CLOSED — all verify
classes green; schema live on the real DB; the 409 fix proven live.

## What shipped
1. **`shared/workItems.ts`** — THE column manifest (13 columns incl. `schema_epoch` with
   its `rendererEmitted:false` pin, F-m2″) + `statusForWorkItemState` — the one source
   consumed by ensureColumns, both transports, the arrival router, and the parity locks
   (guess-list #9: drift impossible).
2. **`db/workItems.ts`** — `ensureWorkItemSchema` (columns + `wi_local`/`wi_deliveries` +
   R017 orphan sweep), `createWorkItemCore` (triple-gated; projection computed at write),
   `setWorkItemStateCore`, **`normalizeAppliedWorkItem`** (F012: local projection beats
   hostile wire status — never-done pinned; F-M3″ leaf detach on replicated parents;
   F-M5″ newer-epoch park), the `applyRemoteWorkItem*` router functions (F008 one code
   path), `workItemDetachHook` → `wi_local.detached_from_id` wired at ALL THREE lifecycle
   sites (purge, prune, agentHistory) + moveNodeToOrg's park-local.
3. **The ARRIVAL ROUTER (§3 D1)** — crdtSync kind-branches all three node apply paths to
   `workItems:applySyncEvent`: creates route to the full-column materializer (never
   `nodes.create`, which refuses the kind and would tombstone-poison the id on the old
   path); attrs land on manifest columns (wire `status` ignored — derived); deletes
   soft-trash (desk-sweep propagation, §2.5.1) — never the C2 path, never tombstoned (a
   purge on the origin revives the item later). `isWorkItemId` resolves via a renderer
   cache + one-time `workItems:kindOf` (store lookup covers the desk hot path free).
4. **Allowlists + emitters (GAP-015)** — `NODE_ATTR_KEYS` gains the manifest attrs BY
   SPREAD (no literals to drift); `emitNodeCreate` carries the full renderer-emitted
   manifest for work_items.
5. **Poll arms** — `normalizeIfWorkItem` after every successful upsert at all three
   appliers (recompute + leaf + epoch-park surfacing through the S1 park registry).
6. **409 baseRev fix (F010)** [PLEXI-UPSTREAM] — `advanceBaseRev` floors local `sync_rev`
   to the server's after every conflict-apply on all three loops (personal/org/shared);
   floor-never-rewind semantics unit-pinned.
7. `updateNode` refuses direct `status` writes for work_items; FbNode carries the
   manifest fields (typed, camelCase).

## Verification ledger
Typecheck clean · **2686/2686 tests** (37 new: every-state projection table + never-done
+ unknown-state coarsening; apply-recompute vs hostile wire; leaf detach; epoch park;
satellites + orphan sweep + detach hook; allowlist/emit/router/IPC parity locks;
advanceBaseRev floor semantics ×3 arms pinned).

**Live (the real DB, read-only verified):** all 13 columns present · `wi_local` +
`wi_deliveries` created · 112/112 rows intact · FK-check clean · app boots clean.
**The 409 fix proven live:** the six perma-dirty demo rows (Client Work / Northwind,
revs stuck-climbing 4525→4706 for days) now complete round trips — a `needs_sync=0`
settle window was observed and server revs advance (5662+). *Cured: unroutability.*
**New lead (pre-existing, NOT S2):* something local re-touches those demo rows every
cycle (they re-dirty after each successful push) — a periodic writer to hunt at the
sync-reliability P1 pass; harmless bandwidth noise meanwhile.

## Operational note (repeat offender)
Electron survives `pkill` of its wrapper and holds the single-instance lock — a "fresh"
launch then exits silently and the OLD main keeps running. This bit twice (S1's first
relaunch, S2's first verify). Protocol now: kill by PID (`pgrep -f
electron/dist.*MacOS`), confirm start-time with `ps -o lstart`, THEN launch.

## Deferred (named)
- GAP-015 two-device emit/arrival adversarial + main-process-detach-reaches-device-B:
  requires the disposable second account — joins R010 on the P1 live checklist. Unit
  equivalents shipped (router + normalize + parity).
- Park-inbound reapply sweep (drain the parked set post-migration): with the boot-time
  work_item read path (S3's list) — noted for S3.

## Next: S3 (IPC namespace, store, creation seam) per autopilot.
