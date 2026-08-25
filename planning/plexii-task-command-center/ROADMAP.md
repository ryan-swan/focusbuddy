# Roadmap — Plexii Task Command Center

<!-- Owns the phase structure + gates + dependency web. Live state lives in ACTIVE-MISSION.md. -->

## Phases

| Phase | Produces | Depends on | Gate (measurable "done") |
|---|---|---|---|
| **0 — Foundation** | Mission-control scaffold, quality framework, spec-intake protocol, verified repo baseline | — | Scaffold complete, no raw placeholders; baseline pre-flight PASS (branch current, tree clean, dev app + HMR proven) |
| **1 — Spec intake & decomposition** | `analysis/00-SPEC-RAW.md` (verbatim spec), `analysis/01-FEATURE-INVENTORY.md` (every spec item as SPEC-NNN with intent, user value, priority claim, proposed P0/P1/P2 centrality, change tier, touches-existing, ambiguities) | Phase 0 + operator supplies spec | **G1 (Intelligence-coverage):** every spec item captured with an ID; **primary objective extracted and operator-confirmed**; interpretation confidence ≥ 0.80 overall; every ambiguity logged as a GAP-NNN open question and surfaced to operator — no silent interpretation |
| **2 — Current-state verification & gap analysis** | `analysis/02-GAP-MATRIX.md` — each SPEC-NNN classified EXISTS / PARTIAL / MISSING / CONFLICTS with file-path evidence, plus enhancement opportunities the spec doesn't know about (memory `commitment` kind, consent gate, standup pattern, existing widget registry), plus the **crossroads docket**: every CONFLICTS/RESHAPE/FOUNDATIONAL item written up per the Crossroads Protocol (what exists / what the objective needs / options priced / recommendation) | Phase 1 | **G2 + dual validation:** every SPEC-NNN classified with evidence gathered against the live repo (not just the map — line anchors drift); an independent adversarial pass re-verifies a ≥30% sample and every CONFLICTS/EXISTS claim; disagreements resolved or escalated; **crossroads docket presented to operator in one batch — each ruling logged as a DEC-NNN before Phase 3 designs on top of it** |
| **3 — Product strategy & experience design** | Prioritized feature set with the **P0/P1/P2 cut line** (P2 = roadmap-later, logged and designed-around, not built); UX/interaction architecture (where AI acts vs. where the human decides; collaboration model); design-language fit plan; per-feature success criteria | Phase 2 | **G3 + pressure test 1:** logic-auditor passes the argument chain; red-team + assumption-auditor adversarial pass produces kill scenarios with early warnings; **operator approves the P0/P1/P2 cut line and direction**; no unresolved crossroads ruling is contradicted |
| **4 — Technical architecture** | 7-section architecture doc: schema (the task-entity fork-in-the-road, notification persistence, sync/collab model), IPC + preload contracts, main-process scheduler, migration plan per house wiring conventions; every FOUNDATIONAL change carries an additive-first migration + reversibility plan + named regression surface | Phase 3 | **G4 + pressure test 2:** architecture passes independent logic-auditor review BEFORE any code (house rule); acid test — "could a capable team execute this with no other context?"; war-game kill scenarios on the schema + sync decisions each have a contingency; **FOUNDATIONAL sections dual-validated** |
| **5 — Build roadmap (staged)** | Decomposition into build stages, each with file-by-file PLAN, tests, rubric, gate; critical path + parallel opportunities | Phase 4 | **G5 (operator green light):** operator approves the staged roadmap — the autopilot authorization for Phase 6 |
| **6..N — Execute (per-stage loop)** | Working, tested code on `ryan-command-center`, verified live in the dev app | Phase 5; each stage on its predecessors | **Per-stage gate:** pre-flight → build → typecheck + unit tests green → adversarial tests → rubric ≥ 4 on all dimensions (QUALITY-FRAMEWORK) → **preservation regression guard for RESHAPE/FOUNDATIONAL stages (existing suites pass + adjacent-surface smoke in the live app, per PRESERVATION-DOCTRINE)** → live HMR verification → stage closed in ACTIVE-MISSION. A mid-build collision with existing functionality halts the stage and fires the Crossroads Protocol |
| **F — Integrate & close** | Consistency audit across all shipped stages, docs, final handoff | all stages | **G6:** consistency-auditor passes (terminology, design language, claims); all GAP-NNN CLOSED or explicitly deferred with rationale; NEXT-SESSION-PROMPT final |

## Dependency web

Linear through Phase 5 — each phase consumes the prior phase's artifact. Inside Phase 6,
stages may parallelize where the Phase 5 decomposition proves independence (schema/backend
stages will be on the critical path ahead of renderer widget stages; the Phase 5 roadmap
draws the actual web).

Cross-cutting: **Caleb's `main` moves daily.** Every phase pre-flight re-fetches origin and
records drift; a merge from `origin/main` is a logged decision (DEC-NNN), never an ambient
side effect. Conflict on core files triggers assumption A-001's playbook.

## Success criteria (whole initiative)

0. **Plexii's existing core stays excellent** — no core critical functionality degraded;
   every RESHAPE/FOUNDATIONAL change passed its regression guard; every rebuild of an
   existing surface traces to an operator crossroads ruling (PRESERVATION-DOCTRINE).
1. Every spec item has a verified disposition (built / P2-roadmap-logged / deliberately
   deferred with rationale) — nothing silently dropped.
2. Shipped features pass their per-stage gates: tests + typecheck green, rubric ≥ 4 across
   all dimensions, live verification in the dev app.
3. The feature reads as native Plexii: house patterns honored (verifiable in review —
   registry-based widgets, composer split, consent gate for AI actions, org-scoped data,
   distinct non-`taskId` field names).
4. The experience bar: elegant, intuitive, simple — audience-calibrator pass from a
   new-user perspective; AI assists where it has evidence, humans decide where it matters,
   collaboration is first-class.
5. The operator's own bar: "arguably one of the best features within Plexii" — measured by
   the operator using it for their real tasks during Phase 6 and not wanting to go back.

## Unresolved questions

- The product spec itself — everything above sharpens on arrival (→ Phase 1).
- Collaboration substrate: what the app's existing "Synced" org layer can carry for shared
  tasks (→ GAP-007, investigated in Phase 2).
- Task entity: widen `nodes.kind` CHECK vs. dedicated `fb_task_items` table — Phase 4
  decision informed by the spec's collaboration + query needs (→ GAP-001).
- Whether this ships into the app at all — decided by testing; isolation on the fork keeps
  both outcomes cheap (→ A-002).
