# S6 — Surfaces: Widgets, WorkItemsView, Counts, Palette, Reasons

> **DEC-018 riders:** (A-4) "Dispatch" and "mission" are RESERVED for Caleb's A7 — no
> S6 surface, nav item, or label uses them. (A-5) WorkItemsView's saved lenses include
> a **"By origin"** lens (human/ai/system) — free now, anticipates mission filtering.
> (C-4) run the **pre-S6 main-diff checkpoint** before starting: size Caleb's A6
> refinement drift in anthropic.ts and absorb deliberately.

> **Synthesis-intake riders (analysis/20):** Δ4 — the Awaiting-Ack card's ONE-TAP
> acknowledge (received/understood/accepted → `acknowledged` + closure notify). Δ9 —
> the "what do I need to do today?" conversational entry: a gated work-items context
> block in chat prompt assembly; answers derive from queue DATA, never narration.
> Also: L1 deferred menus land here (StageManagerStrip / DeskGallery / CanvasBreadcrumb
> lifecycle affordances — designed, not bolted).

**Class:** ADDITIVE UI + two label RESHAPEs (CR-04(b)) · **Needs:** S3 · **Risk:** MED —
this is the stage the operator's design-fidelity directive bears on hardest.

**Mission:** the Attention layer becomes visible and native: seven widgets on the Home
registry, the WorkItemsView with its Detached section, the top-bar count, palette actions,
and the one-rendered-reason system — all indistinguishable in craft from Caleb's surfaces.

**DESIGN-FIDELITY.md is in force:** repo `DESIGN_SYSTEM.md` is the law; primitives-first;
four themes; the six-point native-fit check scores every surface; anything below 4 blocks
close. No new visual vocabulary without a Crossroads.

## Read first
- ARCHITECTURE **§6 (every bullet), §2.3 F013 (badges NEVER read `status`)** ·
  DESIGN-FIDELITY.md + repo `DESIGN_SYSTEM.md` · the Home widget registry + an existing
  widget as the house pattern · `CommandCenter.tsx` action registration idiom

## Build items
1. **Seven widget defs** (Tasks, Reviews, Calendar, Awaiting Ack, Completed, Stale Desks,
   System) on the registry, primitive-kit composed. **Stale Desks renders
   gracefully-empty until lifecycle L3 lands** (sole external dependency — F006).
2. **SPEC-015 top-bar count:** counts only, system-excluded, `.fb-tabular`.
3. **SPEC-017 WorkItemsView** + saved lenses + **the DETACHED section:** park-local items
   with `wi_local.detached_from_id` context; **primary action MOVE**; re-attach only when
   the §1 predicate holds; park-inbound events surface in the System queue by `origin`.
   Registered through all seams (sidebar, palette, routing).
4. **CR-04(b) renames:** AllTasksView → "All Desks" AND the Pulse card's labels →
   "open desks / due today" (HomeDashboard insights copy). GAP-006 closes here.
   Label-only; snapshot before/after.
5. **SPEC-020 palette actions** + the palette's B/C guards; wire S3's creation seam into
   the palette (the `fb:command-new-work-item` registration).
6. **SPEC-018/019 reasons + ranker v1:** `reason_code` + signals → ONE rendered reason;
   ranker inputs all item-level (deadline proximity, item-inactivity staleness,
   explicit-human-ask); scored against `attentionPrecision()` (`src/shared/context.ts` /
   `metrics.ts`).
7. **S1's park-local toast copy** ("N work items stayed personal — see Detached") lands
   with the Detached surface it references.

## Adversarial / verify
- **Four-theme live pass** on every new surface (screenshots, all four).
- **Native-fit rubric** per surface, six points each, scored in the close report.
- Badge/count source test: counts derive from `work_item_state` exclusively (grep + unit).
- Detached: park-local fixture renders with context; MOVE works; re-attach hidden when
  predicate fails; System queue shows park-inbound by origin.
- Rename snapshots + a saved-Flow/persistence check (labels only, nothing persisted
  changed).
- `attentionPrecision()` wiring: ranker outputs feed it; metric moves on a fixture.

## Close
Suites green · four-theme proof pack · rubric table in the handoff · commit sequence:
widgets → view+detached → counts → renames → palette → reasons/ranker · ACTIVE-MISSION +
handoff.
