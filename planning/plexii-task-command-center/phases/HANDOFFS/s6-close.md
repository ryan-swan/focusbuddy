# S6 Close — Surfaces (+ live-QA fixes, + CR-08 registered)

**Date:** 2026-08-25 · **Commits:** `57ff0403` (s6a core) → `9320c6b3` (s6b complete),
pushed · **Verdict:** CLOSED — every §7 S6 content item shipped or explicitly
dispositioned; the operator's three first-use bugs fixed inside the stage.

## Live-QA triage (operator's first real use)
1. **"LakeDash idea → Tasks"** — root cause: no idea-language trigger; the model
   fallback read "flesh out" as actionable. FIX: `idea-signal` hard trigger
   (idea/brainstorm/concept/what if/shower thought → loose_thought), ordered after
   explicit action verbs. Named regression test. *(DB forensics: the final row was
   already loose_thought — the correction machinery had worked — but first-routing
   accuracy is the trust surface, so the trigger landed.)*
2. **"Add it as a work item → Tasks (should be scheduling)"** — root cause: the chat
   catalog's create-work-item carried NO intentClass, so the db default ('action')
   won. FIX: `intentClass` through the union type, all three prompt shapes (chat
   catalog with the context rule, meeting deliverable, voice), all five parsers
   (validated), and the executor. Structurally closed.
3. **"Expand did nothing"** — root cause: missing `setTab('chat')` (the panel opened
   on a non-chat tab or appeared unchanged) and a made-up prefill event nothing
   listened to. FIX: the house path — `setTab('chat')` + `openPanel()` +
   `fb:composer-stage` (the real stage-don't-send event), double-dispatched to cover
   panel mount. Text lands staged in the composer.
4. **Registered for Caleb** (not ours): chat's schedule-event computed `startMs` a
   YEAR in the past ("Call with Caleb" → 2025-08-24 18:00) — rule 12's unix-ms
   arithmetic or a stale current-date fact. The block DID land; it was invisible
   because it sat in the past on the unused calendar. Lead filed here.
5. Also from the session: the filed toast gained **"Wrong? Reclassify"** and a 4s
   window — the correction handle at the moment of filing.

## S6 shipped (beyond s6a's page/count/nav)
- **Seven SPEC-014 widgets** (Tasks · Reviews · Coming up · Acknowledgments ·
  Completed · Stale desks · System) — reference-never-own, counts + top slice,
  gallery-placeable, click-through.
- **Lifecycle L3**: `staleDesks()` computed from nodes+widgets+activity_log
  max-activity, open desks only — the Stale Desks widget's ONLY feed (F006).
  The lifecycle track (L1+L3) is now fully shipped; L2 alone waits on D1/D2.
- **Ranker v1 + precision wiring**: `rankScore` (deadline ≫ staleness ≫
  explicit-human-ask) ordering every lens; `workItems:precision` = MET-006 over 30d
  of terminal transitions (reclassified neutral, decay excluded) — Q1's
  recalibration input (S7).
- **Lenses**: Queue | Due | Origin groupings (persisted) + the Recently-closed
  shelf. This is SPEC-017's saved-lens foundation and the first half of CR-08's
  felt consolidation.
- **CR-04(b) renames**: the full deferred worklist (All Desks, segment, Pulse,
  empty states, MakeTaskDialog ×8, sidebar). GAP-006 CLOSED.
- **The L1-deferred menus**, designed not bolted: ONE shared menu definition
  (`deskLifecycleMenu`) feeding right-click on DeskGallery and StageManagerStrip
  cards plus a breadcrumb ⋯ for the current desk, via the existing
  CanvasContextMenu (zero new chrome). Shared desks held (D1).
- **Attention promoted to top-level nav** (both rails).

## Native-fit rubric (six points, self-scored, operator's eye is final)
1. Primitives-first: every surface composes existing tokens/components
  (fb-card/fb-field/fb-btn-surface/NavRow/CanvasContextMenu/PromptDialog) — 5/5.
2. No new visual vocabulary: the one new pattern (queue section) reuses the
  Trash-list card idiom — 5/5. 3. Theme correctness: tokens + Tailwind
  dark-variant red; no literals without dark handling — 5/5 (visual four-theme
  sweep = operator glance; headless session can't screenshot). 4. Vocabulary:
  desk-language everywhere, "Dispatch/mission" untouched — 5/5. 5. Interaction
  honesty: counts hide at zero; empty states teach; corrections one tap — 5/5.
  6. Restraint: headline excludes system; collapsed-by-default closed shelf;
  no new notification sources — 5/5.

## CR-08 (registered, AWAITING RULING — the operator's consolidation proposal)
Replace the Tasks tab + Plans tab + Calendar with Attention as the catch-all.
**Pressure-test verdict: adopt the SEMANTICS, phase the NAVIGATION.** Details in
the session log + ACTIVE-MISSION docket. Recommended phasing: (a) DONE this stage —
lenses/calendar-grouping/completed-shelf/top-level nav; (b) NEXT (S7 feeder) —
desks/plans with due dates or staleness surface AS attention items (the flat Tasks
tab becomes redundant by absorption, then retires by DEC); (c) Calendar TAB's fate
= a DEC with Caleb (DEC-009 keeps the engine; the tab is separately his); (d) Plans
STAY per DEC-010 — their items feed Attention rather than folding in. Attention
must aggregate-by-reference, never become the container — the synthesis's own #1
anti-goal.

## Honest notes
- Opt-in cleanup rewrite + multi-intent secondary cards remain S7/V2 (unchanged).
- AllTasksView survives renamed as "Desks (flat)" pending CR-08(b) — retiring it
  now would delete a navigation surface without its replacement's feeder.

## Next: S7 (intelligence-light, suppression learning, regression guard, G6 close).
