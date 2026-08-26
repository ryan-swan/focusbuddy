# Legacy Task-System Branch — Reference & Knowledge Harvest

**Status: REFERENCE ONLY (DEC-005).** Nothing here gets cherry-picked, merged, or copied into
the build until a Phase 4/5 decision explicitly authorizes it. This doc exists so the new
build starts from knowledge, not archaeology.

Confidence: 0.92 · why_not_higher: NewTaskModal read to line ~180 (structure + form model
verified; remaining ~330 lines are form layout/submit per the same patterns); Ryan-structural-
changes' 664 commits sampled only via its tip commit message + the port's completeness claim.
Assumptions: the port commit's "not ported" list is accurate (its message is explicit and the
original feat commit's task-slice file list matches).

## 1 · Provenance

| Fact | Value |
|---|---|
| Primary branch | `ryan-task-system-port` — **one commit**, `fd12cc2f`, 2026-08-03, Ryan |
| What it is | The task-item slice of `Ryan-structural-changes` tip `f77187b4` ("feat: task system, free desks, demo mode, voice UI overhaul"), distilled and re-ported onto 3.9.8-era main (`74576e74`) |
| Origin branch | `Ryan-structural-changes` — 664 commits of divergence; task work is entangled with free desks / demo mode / voice UI. The port already extracted the task slice; go back to the origin branch only if a detail is missing from the port |
| Deliberately not ported | free-desk sidebar, demo mode, voice UI, breadcrumb room-assignment (upstream rewrote those files) |
| Relation to today | NOT an ancestor of HEAD (v4.1.0). Whole-tree diff vs HEAD is 702 files — meaningless. The **task-slice transplant surface** is 10 files (below) |
| Retrieval | `git show fd12cc2f --stat` · `git show fd12cc2f:<path>` · full components extracted for reading convenience (regenerate anytime from git) |

## 2 · What it built (10 files, ~2,190 insertions)

**Data model** (`src/shared/types.ts`, `db/nodes.ts`, `db/database.ts`):
- `NodeKind` gains `'task-item'` — a real lightweight to-do living in the existing `nodes`
  table, parented to a desk.
- New per-item fields: `category` (`action | review | deliverable | decision | wait |
  research | misc`), `urgency` (`high | medium | low`), `taskDueDate` (ISO **string**),
  `taskNotes`, `tags` (string[] as JSON TEXT).
- Reuses existing node machinery: `TaskStatus` (open/in_progress/done/parked),
  `started_at` auto-stamping on in_progress, archived flag, org_id, sort_order.
- Persistence via 5 `ensureColumn` additions + INSERT/UPDATE wiring in `nodes.ts`.

**Migration — the crown jewel** (`migrateNodesKindCheck`, `database.ts`):
- Widens `nodes.kind` CHECK to admit `'task-item'` via full table rebuild.
- **Derives DDL, column list, and indexes from the LIVE schema** (`sqlite_master` +
  `PRAGMA table_info`) instead of a hand-written column list — the original upstream version
  had a 2023-era list that silently dropped every `ensureColumn`-added column (org_id, plan
  fields, sync bookkeeping, team_id…). The rewrite fixed a real data-loss bug.
- Idempotent (guards on the CHECK already containing 'task-item'); FK off/transaction/FK on;
  rewrites self-referencing REFERENCES in the DDL; recreates all indexes.
- Exported behind a minimal `KindCheckDb` interface so unit tests drive it via `node:sqlite`
  while production passes better-sqlite3.
- **Pinned by `tests/unit/nodesKindCheckMigration.test.ts` (144 ln)**: legacy-shaped DB with
  accreted columns → migration → asserts CHECK widened, all ensureColumn data preserved,
  indexes recreated, idempotent on re-run.

**UI** (all in the app's own design tokens — `--surface-*`, `--ink-*`, `--edge-*`, accent):
- `TaskDetailPanel.tsx` (508 ln) — the task row. Collapsed: tri-state checkbox
  (open / in_progress-with-play-glyph / done-with-check), title with done strikethrough,
  category badge (per-category color system), urgency dot, due-date chip, hover-revealed
  **go-to-desk** navigation, expand chevron. Expanded (framer-motion height animation):
  inline click-to-edit title, segmented status control, toggleable category chips, urgency
  pills with dots, native date input, tag chip input (Enter/comma adds, Backspace-on-empty
  removes last, dedupe, blur commits), auto-grow notes textarea, two-step delete confirm.
- `TaskListWidget.tsx` (156 ln) — on-canvas checklist widget (kind `task-list`, registered
  in `widgetCatalog` under Tools). **Desk/Room scope toggle** (room resolved by walking to
  the top-level ancestor; room scope = task-items under any desk in the room). Quick-add
  input (Enter). Open section + collapsed "Done (n)" section. Rows delegate to
  TaskDetailPanel. Items are real nodes (survive layout changes; appear in AllTasksView).
- `NewTaskModal.tsx` (510 ln) — full creation form: title (validated), category chips,
  urgency pills, due date, tags, notes, and a **Room → Desk cascading assignment picker**
  with context-aware defaults (desk you're on → its room; "no room" shows free desks).
- `AllTasksView.tsx` (+263/-51) — mixed desk+task-item listing; all-7-category chip filter
  always visible; desk-filter dropdown (built from desks that actually have items); + New
  Task button; task-item rows render as TaskDetailPanel; filter definitions tightened
  (non-done filters exclude done AND parked); hooks into the existing energy-level sort.
- `Canvas.tsx` (+3) — render case for the widget. No IPC/preload changes were needed at all:
  the generic `nodes:*` channels pass the new draft/patch fields through untouched.

## 3 · Design decisions worth carrying forward (knowledge, independent of code reuse)

1. **Tasks are nodes, not widget content.** One canonical store; the same item appears on a
   desk widget and in the global view; layout changes can't orphan work.
2. **Tasks live where the work lives.** Desk/room spatial scoping is the differentiated idea —
   tasks attach to the spatial context (desk) rather than floating in an app-silo. The scope
   toggle (this desk / this room) is a strong primitive for the command center.
3. **Field-level trap awareness.** `taskDueDate` is a deliberately separate ISO-string field
   from the desks' numeric `dueDate` — same discipline the new build codified as GAP-004.
4. **A work-type taxonomy, not just a checkbox** — the 7 categories describe *kinds of work*
   (decision, wait, review…), which is exactly the substrate an intelligent layer needs to
   reason about ("you have 3 decisions pending", "2 waits are stale — nudge?").
5. **Urgency ≠ priority.** Kept separate from the existing 1–5 priority/interest/importance
   axes; three coarse levels with immediate visual encoding (dot color).
6. **Migration discipline**: schema-derived rebuilds, testability via a minimal DB interface,
   pinning tests against legacy-shaped databases. This is the house standard the new build's
   Phase 6 migrations meet regardless of which schema path wins.

## 4 · Port-viability (measured, not guessed)

Drift of the port's target files from its base (`74576e74`) to HEAD (`a92b30cb`):

| File | Drift since port base | Transplant read |
|---|---|---|
| `src/shared/types.ts` | +210/-? (additive growth) | Port's additions are additive type members — trivial re-apply |
| `src/main/db/database.ts` | +175 | Migration function + ensureColumns are additive; register call sits beside `migrateShareKindChecks` which still exists — low friction |
| `src/main/db/nodes.ts` | +43 | INSERT/UPDATE column wiring — mechanical re-apply, must re-check current column list |
| `src/renderer/src/components/views/AllTasksView.tsx` | +47 | Current file is 517 ln vs port-era; moderate manual merge |
| `src/renderer/src/lib/widgetCatalog.ts` | +15 | Still exists; catalog entry re-adds cleanly |
| `src/renderer/src/components/Canvas.tsx` | +311 | 3-line change; re-locate the render switch |
| New files (TaskDetailPanel, NewTaskModal, TaskListWidget, migration test) | n/a | Drop-in candidates; design-token classes and `plexi/Modal` still current; **framer-motion now on HEAD (^11.18.2) — zero new dependencies** |

Net: **if Phase 4 chooses the extend-nodes path, this branch cuts the substrate stage from
"greenfield" to "verified re-apply + modernize"** — likely days → hours for schema + basic UI.
If Phase 4 chooses a dedicated `fb_task_items` table instead, the UI components and the
migration *pattern* (schema-derived rebuild + pinning test) still transfer; only the
persistence wiring changes.

## 5 · The gap between this branch and the new vision

This was the substrate slice only — by its own framing "barely scratching the surface":
- No notifications, reminders, or scheduler (GAP-002/003 untouched)
- No AI anywhere — no intelligent triage, extraction, summarization, or memory-commitment link
- No dashboard/Home integration (predates the A5 Home widget registry entirely — its widget
  went on the desk canvas via the old `widgetCatalog`, a different registry than
  `homeWidgetDefs.ts`; the new build must serve both surfaces deliberately)
- No collaboration/sync design (GAP-008), no recurrence, no capability gating, no
  subtasks/dependencies, no keyboard-first flows, no bulk operations
- Pre-dates v4's agent loop, consent gate, and memory core — none of the intelligent
  primitives existed yet

## 6 · Rules of engagement (per operator, 2026-08-24)

- Use for **reference and knowledge**; accelerate coding **only if directly applicable** to
  the new build — and only after the spec-driven pipeline authorizes it (DEC-004 order holds).
- Phase 2 gap matrix may cite this doc as evidence (e.g., "PARTIAL — legacy implementation
  exists off-main"). Phase 4's schema decision (GAP-001) MUST weigh both paths with this
  branch as exhibit A for the extend-nodes path.
- If reuse is authorized later: re-apply from `fd12cc2f` by hand with review — never a
  mechanical merge/rebase (base is 3.9.8; Caleb's 4.x rewrites collide at the tree level even
  where the slice is clean).
