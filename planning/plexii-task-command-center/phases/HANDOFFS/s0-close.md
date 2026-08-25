# S0 Close — Vocabulary Quarantine (SPEC-044)

**Date:** 2026-08-25 · **Commit:** `09e129d9` (22 files, +443/−72) · **Verdict:** CLOSED,
all verify classes green. Operator green light for Phase 6 recorded as **DEC-017**.

## What shipped
1. **`src/main/ai/vocabulary.ts`** — the single source of truth: `CREATE_TASK_DEFINITION`,
   `UPDATE_TASK_DEFINITION`, `PROTOCOL_VOCAB_NOTE`, `MINDMAP_TASK_SCOPE_NOTE`,
   `CREATE_WORK_ITEM_KIND`, and `workItemCatalogAddendum(enabled)` (returns '' while OFF —
   the model is never taught a verb that would no-op). Dependency-free.
2. **`src/main/workItemsPref.ts`** — `workItems.enabled`, default OFF, one-line-JSON
   userData persistence (house pattern).
3. **Prompt quarantine** across `anthropic.ts` (catalog entries + hard rule 7b + persona +
   12 surfaces + `taskBlock` labels now `Desk:`/`Desk id:`), `agentDispatcher.ts`,
   `voiceNote.ts`, `mindMap.ts` (map-local sense scoped), `dailyBriefContext.ts`. The
   meeting-wrapup rule keeps its routing behavior but now defines create-task as
   desk-creating. suggestWorkspaceActions' `"short action"` to-do-teaching example removed.
4. **`create-work-item` reserved end-to-end:** `ActionProposal` union variant; parser arms
   in all five parsers; `CREATION_KINDS`; `actionLabel` maps ('Work item' / 'Creating a
   work item'); executor arm returns `"Work items aren't enabled yet."` — honest, never a
   silent drop. apiServer verified unable to mint kinds (hardcodes `kind:'task'`).
5. **Flow engine:** honest `default:` arm for unknown persisted action types (was:
   undefined fall-through on foreign data). Labels: 'Create a desk', 'When a desk is
   completed', run-log 'Created desk', fallback 'Untitled desk'. **Persisted verbs frozen.**
6. **Renderer labels:** 'New desk' card verb, 'Desk created.' toast, ten 'Open a desk
   first —' refusals (incl. 'desk-bound'), MindMap proposal label, Flow editor 'Desk
   title' placeholder, 'Plan my desks' capability chip.

## Verification
- Typecheck clean · **2628/2628 tests green** (2610 baseline + 18 new in
  `tests/unit/vocabQuarantine.test.ts`); 4 pre-existing label pins updated to desk
  (dailyBriefContext ×2, actionLabel, chatStreamConsumer).
- Grep-locks now in CI: shared-definition imports at the riskiest-5 files, five parser
  arms, both flag-checked addendum injections, frozen protocol strings
  (`'task-completed'`, `case 'create-task'`, wire shapes), no `"short action"` residue.
- Saved-Flow compat: wire strings byte-identical (asserted); flow engine still creates
  desk nodes from the frozen verb (asserted); labels are render-time only.
- **Live status honestly stated:** renderer half is live now via Vite HMR in the running
  dev app; main-process prompt half is compiled+tested and takes effect on next app
  launch (`electron-vite dev` runs without `--watch`; the running main predates the edit).

## Decisions taken in-stage (all minimal-change, reversible)
- Sticky-widget setup noun `'tasks'` → `'to-dos'` (a genuine to-do sense that collided).
- Workspace-builder example list dropped `"tasks"` from its table examples.
- `Task not found` → `Desk not found` (5 IPC errors).
- **Deferred to S6 (CR-04(b) coherent flip):** AllTasksView, sidebar segment 'Tasks',
  HomeDashboard Pulse labels, homeWidgets/HomeDashboardRegion empty states, InsightsView,
  MakeTaskDialog, MessagesView Pulse group. **Skipped:** orphaned dashboard portlet
  strings (unreachable UI; noted for a future sweep with the portlet system's fate).
- Plans domain untouched per DEC-010 (`PlexiProjectsView` "Task title" is a plan row —
  correct as is).

## Next: S1 (migration + guards) per the autopilot.
