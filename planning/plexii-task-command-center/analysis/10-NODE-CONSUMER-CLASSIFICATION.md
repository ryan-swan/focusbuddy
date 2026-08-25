<!-- SPEC-004 evidence base — node-consumer classification (GAP-011).
     Produced 2026-08-24 night by a dedicated read-only analysis agent (very thorough);
     SPOT-VERIFIED by the orchestrating session: 6/6 load-bearing claims reproduced
     (nodes.ts:73-78 listNodes; :307+ purgeTrashedNodes; workspaceSync.ts:844-851 swallowed
     catch; shares.ts shared_with_me writes; DesksView.tsx:88/:118 filter+badge;
     agentHistory.ts:319-326 ref-parse DELETE). Full adversarial re-verification of
     Class B/C dispositions happens at G2 per QUALITY-FRAMEWORK. -->

# `work_item` Node-Kind Census — Classification Report

Repo `/Users/ryanmcquillan/focusbuddy-plexi` @ `3def879d` (branch `ryan-command-center`).
All line numbers verified against working tree.

## 0. Two findings that reframe the whole exercise

**(a) A third `NodeKind` already exists in TypeScript.**

`src/shared/types.ts:11`: `export type NodeKind = 'folder' | 'task' | 'task-item'` (comment
at :7-10: declared-but-unbuilt), while the DB rejects it (`database.ts:33`
`CHECK (kind IN ('folder','task'))`).

Consequences: **TypeScript will give zero compile errors when `'work_item'` is added.** The
union is already 3-wide, and there is **not one `switch` statement on `NodeKind` anywhere in
`src/`** (every `switch (x.kind)` hit — `goToTarget.ts:86`, `assistantContext.ts:83`,
`actionExecutor.ts:75`, `MindMapWidget.tsx:2439` — is on a different union). Every node-kind
branch is an `===`/`!==` comparison. There is no exhaustiveness safety net. **The census is
the only line of defence.**

Exactly **one** site handles the existing third kind — `workspaceSnapshot.ts:61`
(`n.kind === 'task' || n.kind === 'task-item'`) — the precedent proving the other 222 sites
were never audited for a third kind.

**(b) ~29% of the prior census was false positives.** `kind` is an overloaded field name
across at least seven unrelated discriminated unions (§7.1).

## 1. Summary counts

| Metric | Count |
|---|---|
| Raw census hits (`kind === / !== / : 'task'\|'folder'`) | **316** across **99** files |
| — of which **not** node kind (§7.1) | **93** across **17** files |
| **True node-kind sites** | **223** across **82** files |
| Class A — safe by construction | **179** |
| Class B — negation / binary-dispatch | **26** |
| Class C — unfiltered child enumeration | **18** |
| **Must-touch total (B + C)** | **44** across **21** files |

Class-B refinement: **all 16 literal `kind !== '…'` sites are "skip" polarity**
(`return`/`continue` on non-match) — they behave as positive filters, safe. The real Class B
risk is **binary dispatch** (`kind === 'folder' ? room : desk`) where the `else` branch
silently means "desk".

## 2. Full classification table

### 2.1 Class C — unfiltered child enumeration (must-touch, highest risk)

| file:line | pattern | verdict | minimal change |
|---|---|---|---|
| `src/main/db/nodes.ts:223` | `deleteNode` recursive `collect`: `SELECT id FROM nodes WHERE parent_id = ? AND trashed_at IS NULL` | **must-touch** | Decide policy: if work_items trash with their desk, add explicit `-- includes work_item` assertion + test; if not, add `AND kind != 'work_item'` |
| `src/main/db/nodes.ts:256` | identical sweep in `moveNodeToOrg` | **must-touch** | Same policy; org re-scope carries or excludes work_items deliberately |
| `src/main/db/nodes.ts:91` | `nextSortOrder`: `MAX(sort_order) … WHERE parent_id IS ?` | **must-touch** | Scope to same-kind siblings or accept interleaved ranks |
| `src/main/db/nodes.ts:366` | `moveNode` sibling renumber, no kind filter | **must-touch** | Renumber within kind, else a desk drag reshuffles work_item ranks |
| `src/main/db/nodes.ts:73-78` | `listNodes()` — `SELECT * FROM nodes`, no kind filter, feeds ALL renderer consumers | **must-touch (root cause)** | Keep + fix consumers, or add a kind param — this single query feeds all 82 renderer files |
| `src/main/db/workspaceSync.ts:368` | `collectDeskSubtree` child sweep | **must-touch** | Work_items get `shared_root_id` stamped and pushed to collaborators |
| `src/main/db/projectPlan.ts:54,56` | recursive CTE child sweep | safe **output** | Terminal filter `n.kind = 'task'` at :62 blocks leakage — §4 |
| `src/main/db/search.ts:52-56` | global search `SELECT … FROM nodes` no kind filter | **must-touch** | Add `AND kind IN ('folder','task')` |
| `src/renderer/src/lib/nodeTree.ts:15-35` | `buildTree` byParent map, no kind filter | **must-touch** | Filter input at call site or add `kinds` param (single importer today: FoldersCard) |
| `src/renderer/src/lib/nodeTree.ts:64-79` | `isDescendantOrSelf` map | safe | Cycle guard only |
| `StageManagerStrip.tsx:44` | `filter(n => !n.archived && parentId-match)` — no kind filter | **must-touch** | Add kind guard |
| `DeskGallery.tsx:25` | `filter(n => n.parentId === null && !n.archived)` | **must-touch** | Add `&& n.kind === 'task'` |
| `CommandCenter.tsx:582` | palette empty-query browse over all nodes | **must-touch** | `if (n.kind === 'work_item') continue` |
| `CanvasBreadcrumb.tsx:149-159` | ancestor chain walk via parentId | **must-touch** | Skip work_items in `chain` |
| `mail/EmailTaskDialog.tsx:34-51` | `orderTree` destination picker | **must-touch** | Filter to folder/task before `orderTree` |
| `dashboard/FoldersCard.tsx:34-46` | `childrenOf` + `bucketFor` walk (`:55` descends into non-tasks as rooms) | **must-touch** | `else if (kid.kind === 'folder')` |
| `dashboard/FoldersCard.tsx:198` | drag-reparent sibling ordering | **must-touch** | Kind filter so `beforeId` isn't a work_item |
| `dashboard/WorkspaceHealthCard.tsx:40` | room child count (`:46` filters, `:40` doesn't) | **must-touch** | Add `&& n.kind === 'task'` |
| `lib/crdtSync.ts:748-765` | `subtreeNodeIds` byParent walk | **must-touch** | CRDT partition membership would include work_items |
| `lib/dashboardScope.ts:14-28` | `descendantTaskIds`: `if task push; else walk` | **must-touch** | `else` recurses into work_items as sub-projects → `else if (c.kind === 'folder')` |

### 2.2 Class B — binary dispatch, "not folder ⇒ desk" (must-touch)

| file:line | pattern | verdict |
|---|---|---|
| `StageManagerStrip.tsx:81-82` | `folder ? goProject : goTask` | must-touch |
| `DeskGallery.tsx:56-57` | same | must-touch |
| `dashboard/WorkspaceHealthCard.tsx:204-205` | same | must-touch |
| `ContextHealthStrip.tsx:80` | same | must-touch |
| `views/homeWidgets.tsx:72-79` | `useOpenDesk`: folder→goRoom else→goTask | must-touch |
| `views/HomeDashboard.tsx:571` | folder branch else desk | must-touch |
| `CanvasBreadcrumb.tsx:246,256` | `isFolder` alias → goRoom/onOpenTask | must-touch |
| `CommandCenter.tsx:585,588-598` | `isFolder` → label/icon/hint/run binary (pairs with C :582) | must-touch |
| `views/SharedView.tsx:70-71` | `rootKind === 'folder' ? goProject : goTask` | must-touch |
| `src/main/db/search.ts:67,69` | non-folder labelled `'task'` in results (pairs with C :52) | must-touch |
| `src/main/ipc/index.ts:677` | `'RoomCreated' : 'DeskCreated'` event | must-touch (add WorkItemCreated) |
| `stores/nodes.ts:203` | `'room' : 'desk'` archive channel label | must-touch |
| `src/main/assistant/standupRun.ts:87` | `'Untitled room' : 'Untitled desk'` | must-touch (cosmetic) |
| `CanvasBreadcrumb.tsx:302,345,346,401,402,520` | binary icon/aria/title/share-kind (`:520` passes `'task'` to ShareDialog) | must-touch (:520 guard explicitly) |
| `views/DesksView.tsx:132` | icon ternary (dead once :88 filters) | must-touch (clarity) |
| `views/homeWidgets.tsx:105` | icon ternary | must-touch (cosmetic) |
| `dashboard/FoldersCard.tsx:222,393` | `isFolder` render branch (guarded upstream by :104) | must-touch (low risk) |
| `views/StartOrAskPlexi.tsx:158-163` | ternaries pre-filtered by :156 positive OR | safe (dead else) |

### 2.3 Class B-form but SAFE — "skip"-polarity negations (no change)

All 16 verified as guard-clause skips: `PreTaskBridge.tsx:14` · `ShareDialog.tsx:58,63` ·
`FoldersCard.tsx:104,118` · `WorkspaceProgressCard.tsx:66` · `radar.ts:41` ·
`conversationDesks.ts:16` · `workspaceExtras.ts:77` · `anthropic.ts:326,1638,2421,2541,3050`
· `mentionResolver.ts:171,218`

### 2.4 Class A — positive filters (179 sites, safe, no change)

Representative set (full = every positive `kind === …` literal and every `kind:` literal in
create/draft, minus §2.1–2.2): `views/homeWidgets.tsx` 142, 809-825, 853, 1200, 1636, 1817,
1947, 1986, 2083 · `HomeDashboard.tsx` 504, 514, 527, 553, 629, 1951 · `DesksView.tsx` 62,
75, 88, 190 · `RoomsView.tsx` 46, 60, 72 · `AllTasksView.tsx` 170 · `InsightsView.tsx` 67 ·
`StartOrAskPlexi.tsx` 85, 156 · `WeekTimeGrid.tsx` 73, 78, 285 · `PlexiProjectsView.tsx`
109, 305 · `SharedView.tsx` 16, 19 (**already 3-kind aware**) · `acceptShare.ts` ×12 ·
`shareSnapshot.ts` ×8 · `workspaceSnapshot.ts` 42, 43, 60, 61 (**:61 handles task-item**) ·
`radar.ts` 41 · `velocityStats.ts` 23 · `goToTarget.ts` 27-28 · singles in
`createShowcaseDesk/liveCanvasMigrate/meetingShare/officeShareSnapshot/assistantMentions/
accountClient/actionExecutor/useAssistantWidgetPin/crdtSync` · `stores/nodes.ts` 29, 98,
177 · dashboard cards ×5 · `WorkspaceHeader.tsx:93`, `RelatedDesksModal.tsx:43`,
`SyncWidgetPicker.tsx:42,48`, `ProposalCards.tsx:133,310`, `NewNodeDialog.tsx:81,83,91,183`,
`MakeTaskDialog.tsx:47,109,118`, `FirstRunOnboarding`, `useFreeDesk.ts:26,40`,
`HomeDashboardRegion.tsx:110,119`, `PlexiSuiteHome`, `AssembleDeskView`, `CalendarView`,
`PlexiMeetView`, `TaskLinkWidget`, `PortalWidget`, `widgetLookup`, `AssistantTasksTab`,
`RadarSuggestions`, `AssistantOverlay`, `WrapupOverlay`, `ChatPanel` · main:
`apiServer.ts:132,157`, `telemetry.ts:137-138` (**work_items invisible in telemetry — decide
deliberately**), `canvasSnapshots.ts:164`, `flows.ts:170`, `projectPlan.ts:62,502`,
`ipc/index.ts:858,867,887`.

## 3. Top blast radius — the 8 worst if unfixed

1. **`nodes.ts:216-235` (`deleteNode`)** — collect recurses on parent_id with no kind
   filter, soft-deletes everything, returns the undo set; the toast says
   `Delete desk "X"` while N unseen work_items went too. `purgeTrashedNodes` (:307-318)
   hard-DELETEs after 7 days; FK CASCADE (database.ts:32) takes widgets. **Silent, delayed,
   unrecoverable data loss** — travel-with-desk must become a decision, not an accident.
2. **`nodes.ts:73-78` (`listNodes`)** — the single unfiltered SELECT feeding
   `useNodeStore.nodes` → all 82 renderer files. **Highest-leverage single fix point.**
3. **`StageManagerStrip.tsx:44`** — hover dropdown renders work_items as desk cards **with
   live widget miniatures** and click-routes them into a full desk canvas.
4. **`search.ts:52-69`** — global search returns work_items labelled `type:'task'` app-wide.
5. **`CommandCenter.tsx:582-600`** — palette browse: work_items displace real desks in the
   60-cap and present as `Open task`.
6. **`workspaceSync.ts:361-408` + `:844-851`** — subtree collect sweeps work_items to
   collaborators; on an **un-migrated peer**, the INSERT hits the old CHECK and the
   exception is **swallowed by a bare catch** whose comment assumes "FK not present yet" —
   **a silent, permanent, infinitely-retrying sync failure**. Ship the migration ahead of
   the feature or add a migration gate. |
7. **`DeskGallery.tsx:25`** — top-level work_items render as desk cards.
8. **`mail/EmailTaskDialog.tsx:34-51`** — destination picker offers work_items as parents:
   users can file a desk *inside* a work_item.

Runner-up: `nodeTree.ts:15-35` — contained; single importer (FoldersCard) since the Sidebar
tree was removed (§7.3).

## 4. `projectPlan.ts` / `PlexiProjectsView.tsx` — no leak

The recursive CTE descends through any kind but the terminal predicate is positive
(`WHERE n.kind = 'task' …`, projectPlan.ts:62); listing filters `kind='folder' AND is_plan=1`
(:502). `PlexiProjectsView`'s only node-kind sites are creates (:109, :305); its other
`kind` hits are `FileEntry.kind`. **DEC-010's boundary holds with zero work.** One flagged
side effect: a desk nested *under* a work_item WOULD appear in the Gantt (CTE recurses
through) — accept deliberately or note in SPEC-002.

## 5. The sync path — opaque carry, two caveats

Push (`collectPending` :168-200, org/shared collects) branches only on `itemType`, never node
kind; `bodyFromRow` (:105-109) copies every non-bookkeeping column — **`kind` and any new
columns ride opaquely**. Pull (`applyRemoteShared` :764-857 + org/personal appliers) builds
column lists from `PRAGMA table_info` — **client-side new-column passthrough is
by-construction**. Caveats: `collectDeskSubtree:368` (Class C above) and the **cross-version
CHECK hazard** (blast #6). Nodes apply before widgets (rank ordering) so FKs resolve;
`SHARED_COL_TABLES` = nodes/widgets/fb_tables/fb_rows; the only kind filter in sync is FILE
kind (`SYNCED_FILE_KINDS`).

**A-003 impact:** the client half of the split sync proof is now evidenced from code. The
remaining unknown is the SERVER (does it store/echo unknown kinds and columns opaquely?) +
one live end-to-end confirmation.

## 6. Shared-tab routing bug (BUG-C1-03) — DIAGNOSED

**Root cause: enumeration — a two-data-source mismatch. NOT missing metadata.**

- **Shared tab** reads `useSharesStore.inbox` → `shares.ts:146-152`
  `SELECT * FROM shared_with_me` — a table written **only** by `acceptShare()` (the
  paste-a-share-link flow).
- **All Desks** reads `useNodeStore.nodes` with a pure kind filter (`DesksView.tsx:88`), no
  shared exclusion.
- A desk arriving over the **live ACL sync path** materializes directly into `nodes`
  (`applyRemoteShared`), parented under the "Shared with me" container, with
  `shared_root_id` + `shared_from_handle` **correctly stamped** — proven by
  `DesksView.tsx:118-124` rendering the "Shared by X" badge from exactly that metadata.
  So it appears in All Desks (wearing the badge) and is structurally invisible to the
  Shared tab.

**Fix shape (small product call, → G2 docket):** (i) exclude `sharedRootId != null` from All
Desks and make SharedView the union of invites + materialized live shares (matches
SharedView's current empty-state promise), or (ii) accept All Desks as home for accepted
shares and relabel the tab "Share invitations".

**Census-method validation: YES — ground-truth positive.** Structurally identical to Class C:
an enumeration filtered by one discriminator (`kind === 'task'`) while a second
(`sharedRootId`) that should partition the list is never consulted. And the failure is
user-visible but silent — the argument for treating Class C as must-touch.

## 7. What the census pattern missed

### 7.1 False positives — `kind` spans 7+ unrelated unions (93 sites, 17 files)

`view.kind` (40+ members; ALL of Sidebar's hits) · `FileEntry.kind` (folder/file/doc; Files,
Drive, PlexiProjects rows, brainIngest, digestRouter…) · StreamDeck button kind ·
`Widget.kind` · MindMap node kind · `ShareableKind` · proposal/target/app kinds. Sharp edge:
`shared/fields.ts:407` and `shared/streamdeck.ts:135` literally contain `kind: 'folder'` —
both false positives; same for `FolderPickerModal` (Drive folders) and `stores/presence.ts:108`
(`view.kind`).

### 7.2 Sites literal-grep cannot reach

| form | file:line | class | note |
|---|---|---|---|
| **String-prefix ref parsing** | `src/main/ai/agentHistory.ts:319-326` | B | `kind = ref.slice(0, sepIdx)`; `if (kind === 'task') DELETE FROM nodes` — node kind as a substring of a `"task:<id>"` token; invisible to `.kind ===` greps; **hard-deletes nodes** |
| Kind implied by `parentId === null` | `stores/nodes.ts:28-30`, `:95-99` | A | desk-limit gating; top-level work_item wouldn't count — load-bearing semantics |
| Kind as function parameter | `views/homeWidgets.tsx:809-825` | A | `nodeGroup(kind: 'task' \| 'folder', …)` — literal type needs widening if ever reused |
| Kind via boolean alias | `CanvasBreadcrumb.tsx:246`, `CommandCenter.tsx:585`, `FoldersCard.tsx:222,393` | B | `const isFolder = …` branches many lines later; real branch count exceeds literal count |
| DB constraints | `database.ts:33` CHECK, `:32` CASCADE | — | the hard gate + an implicit unfiltered subtree op with no `kind` token |
| `ShareSnap` narrowing | `acceptShare.ts:29` | A | structural literal `'folder' \| 'task'` — one of the few places TS WILL flag a work_item |
| **Deliberate 3-kind precedent** | `workspaceSnapshot.ts:61`; `SharedView.tsx:16,19` | A | the only two sites written for a third kind — use as the template |

### 7.3 Structural corrections to the census scope

- **`Sidebar.tsx` has no node tree** — all ~40 hits are `view.kind`; the inline tree was
  replaced by All Rooms / All Desks / Shared index pages (changelog.ts:278). `nodeTree.ts`'s
  header comment claiming Sidebar usage is **stale**; `buildTree` has one importer
  (FoldersCard).
- **`CanvasLinearView.tsx`**: zero node-kind sites (widget kinds only). **`NewTaskModal`**:
  gone; the surviving seam is the `fb:command-new-task` **event** (dispatched from
  CommandCenter:416, DeskGallery:62, StageManagerStrip:97,103, AllTasksView:357; handled
  Sidebar:199-213 with `kind: detail?.kind ?? 'task'`) — **the natural plug-in point for a
  work_item creation path**.
