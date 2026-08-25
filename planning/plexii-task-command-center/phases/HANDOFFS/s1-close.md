# S1 Close — Migration, Consumer Dispositions, Lifecycle Guards

**Date:** 2026-08-25 · **Commits:** `ae0f071e` (s1a migration) → `63b0fc0b` (s1b lifecycle)
→ `bfaf00ba` (s1c dispositions+locks), pushed · **Verdict:** CLOSED — every verify class
green, **including the live migration on the real database.**

## The live migration event (the FOUNDATIONAL moment)
Executed deliberately at 2026-08-25 10:51 local: dev app stopped (incl. an orphaned
Electron instance whose single-instance lock had blocked the first relaunch), relaunched,
migration fired on boot. **Post-state, all verified read-only:** `user_version` 1→2 ·
**112/112 rows preserved** (28 folder / 70 task / 14 task-item residue) · CHECK is the
4-kind target incl. `'work_item'` · `nodes_mark_dirty` trigger survived the rebuild ·
4 named indexes recreated · `PRAGMA foreign_key_check` EMPTY · two independent restore
points (our `pre-migrate-2026-08-25T15-51-47.fbbackup` 402MB via VACUUM INTO + Caleb's
`auto-*` backup) · boot log error-free. The live DB was byte-for-byte fixture 2's shape
(quoted-"nodes" DDL, 3-kind CHECK) — the exact case the test suite pinned.

## What shipped
1. **`db/migrateNodesKind.ts`** (electron-free): `migrateNodesKindCheckV2` per §2.1 —
   pinned guard predicate (quoted literal inside the extracted CHECK clause; fixture 3
   proves immunity to the `work_item_state` column name), 4-kind target (GAP-014),
   harvest-before-rename (indexes AND triggers), FK pragma outside the txn, no-match
   skip+surface (`nodesKindMigrationStatus()` queryable), rollback-safe. Plus
   `nodesTableAcceptsWorkItems` (R006 same-device guard). `MIGRATION_VERSION`→2 arms the
   backup; `SCHEMA` born wide.
2. **`db/nodeLifecycle.ts`** (electron-free, single owner of delete-path mechanics):
   `purgeExpiredTrash` (work_items never targets + per-id in-statement liveness),
   `detachAndReviveWorkItemDescendants` (with the S2 `wi_local` hook seam),
   `pruneSharedRows` (detach + outright kind exclusion — covers the P1 stamped state),
   `collectActiveSubtree`, typed refusals (`WorkItemDeleteRefusedError` C2,
   `WorkItemParentRefusedError` leaf invariant).
3. **nodes.ts:** listNodes kind exclusion (highest-leverage fix) · createNode triple gate
   (flag OFF / DDL / personal-scope) + leaf assert · updateNode parentId assert ·
   moveNode assert · deleteNode C2 refusal + lifecycle delegation · purge delegation ·
   moveNodeToOrg park-local (work_items excluded from carry AND detached — no cross-org
   parent link survives).
4. **workspaceSync.ts** [PLEXI-UPSTREAM flagged]: park-inbound branches replace all three
   bare catches (unknown-kind CHECK rejection → parked + surfaced + `listParkedInbound()`;
   FK-retry behavior unchanged) · `collectDeskSubtree` share-collect kind guard ·
   pruneSharedDesk → lifecycle core.
5. **agentHistory.ts** undo: detach-and-revive before its hard delete (site 2/3).
6. **projectPlan.ts:** `setTaskPlan` + `addDependency` assert `kind='task'` (§2.5.8).
7. **types.ts:** `NodeKind = 'folder' | 'task' | 'work_item'` (CR-05a; task-item out of
   the union, tolerated at DB layer + string-compare at workspaceSnapshot).
8. **search.ts** kind filter · **ipc nodes:create** refuses work_item (F008 one-code-path)
   · belt-and-braces renderer guards ×7 (dashboardScope, FoldersCard, CommandCenter,
   StageManagerStrip, DeskGallery, EmailTaskDialog, CanvasBreadcrumb).
9. **CI locks** (`ciDeleteSiteLock.test.ts`): DELETE-against-nodes closed at
   {nodeLifecycle, agentHistory} · `DROP TABLE nodes` only at the migration · zero
   `INSERT OR REPLACE INTO nodes` · inbound-CASCADE set snapshot-pinned · listNodes
   exclusion + assignee quarantine + search filter pinned.

## Verification ledger
Typecheck clean · **2649/2649 tests** (2610 baseline preserved + 39 new: 3 fixtures × full
§2.1 assertion set incl. trigger-FIRES, the five §2.5.4 cases (a)–(e) incl. the device-B
arm, no-match semantics, CI locks) · live migration full assertion pass (above).

## Disposition ledger (the 44 must-touch census sites)
- **EDITED (18):** listNodes (root cause) · search.ts :52+:67 · deleteNode :223 (policy
  comment: includes-by-design) · moveNodeToOrg :256 (exclude+detach) · collectDeskSubtree
  :368 · nodes:create ipc :677 area (refusal; ternary provably binary) · dashboardScope ·
  FoldersCard :55 + drag guard site covered by kind-else · CommandCenter :582 ·
  StageManagerStrip :44 · DeskGallery :25 · EmailTaskDialog · CanvasBreadcrumb :149 ·
  WorkspaceHealthCard :40 — **not edited, see SAFE-BY-FEED** · plan guards ×2 ·
  agentHistory ref-parse site.
- **SAFE-BY-FEED (24):** every remaining Class B binary-dispatch and Class C renderer site
  reads `useNodeStore.nodes`, fed solely by the now-excluding listNodes — a work_item can
  never reach them. This fact is CI-pinned (the listNodes lock); if the feed ever widens,
  the lock fails before the sites can misfire. Includes: SharedView, ContextHealthStrip,
  homeWidgets, HomeDashboard, DesksView icon, stores/nodes archive label, standupRun
  label, FoldersCard render branches, CanvasBreadcrumb icon/aria/share sites,
  nodeTree/WorkspaceHealthCard/MindMap etc.
- **DEFERRED-DELIBERATE (2):** `nextSortOrder`/`moveNode` renumber interleaving — ACCEPTED
  (work_item ordering never reads `sort_order`; S6 orders by due/urgency; zero risk to
  desk drag) · telemetry.ts — work_items invisible in telemetry at S1, revisit S6.
- **crdtSync subtreeNodeIds:** per §3, CRDT partition handling for work_items is S2's
  arrival router + the P1 `nodeSharedRoot` note — not an S1 site.

## Deferred (named, scheduled)
- **Post-migration live KIND test over sync** (R010): needs the disposable/scope-verified
  account — P1 checklist. (DDL acceptance is proven; this is the server round-trip only.)
- C2 refusal UI rendering: lands with the lifecycle menus (L1) / S3 typed results.
- Park-inbound System-queue surfacing: S4/S6 (registry + log live now).

## Next: S2 (columns, projection, satellites, sync contract) per autopilot.
