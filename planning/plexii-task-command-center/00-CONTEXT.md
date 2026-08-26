# 00 — Context Kernel

<!-- Read first. Owns ORIENTATION only: what/why + the index to source material.
     Live state → ACTIVE-MISSION.md · decisions → DECISIONS-LOG.md · gaps → GAP-REGISTER.md. -->

## What we're building

Intelligent **Task**, **Notification**, and **personal dashboard / command-center** features
inside Plexii (the PlexiDesk desktop app, repo `saasmouth/focusbuddy`), developed on the
isolated branch `ryan-command-center` (pushed to fork `ryan-swan/focusbuddy`). The work runs
as a phased Agent-OS initiative: spec intake → verified gap analysis → product/UX strategy →
technical architecture → staged build, with a pressure test and quality gate at every main
stage. Nothing is built until the operator-supplied product spec is analyzed and the roadmap
is approved.

## Why

Task and project management should become Plexii's killer capability — so clean, polished,
and intelligent that "people can't work anywhere else because their tasks and projects are
managed in such a clean polished way" (operator framing, 2026-08-24). The bar: world-class
developer + product designer + UI/UX lens; elegant, intuitive, simple; AI where appropriate,
human interaction where it matters; shared collaboratively. Whether the feature ships into
the app depends on testing — hence full isolation on the fork branch.

## Scope boundary

- **In:** intelligent tasks, notifications, personal dashboard/command-center; their data
  model, IPC/preload contracts, renderer UI, AI behaviors, collaboration model; analysis,
  architecture, build plan, and staged implementation on `ryan-command-center`.
- **Out:** touching `main` or Caleb's in-flight work; app-wide redesigns not required by the
  feature; broad filesystem-discovery playbooks (Agent-OS CONTEXT.md IP constraint — all
  analysis stays scoped to this repo and this planning folder); committing/pushing without
  operator ask.

## Source material (the "read these" index)

| Topic | File |
|---|---|
| Codebase map — where tasks/notifications/dashboard/AI live today, with traps | `../../.claude/COMMAND-CENTER-MAP.md` (styled: https://claude.ai/code/artifact/1f1710c1-8718-4bae-8824-5c710eea17d0) |
| Product spec (the input this initiative analyzes) | `analysis/00-SPEC-RAW.md` — **not yet supplied**; operator pastes it next |
| Spec-intake protocol (how the spec gets processed on arrival) | [SPEC-INTAKE.md](SPEC-INTAKE.md) |
| Legacy task-branch harvest — Ryan's earlier task-item build (`ryan-task-system-port` @ `fd12cc2f`): data model, verified CHECK-widening migration + test, UX patterns, measured port costs. **Reference only (DEC-005)** | [analysis/03-LEGACY-TASK-BRANCH.md](analysis/03-LEGACY-TASK-BRANCH.md) |
| Consolidated landscape & principles — the pre-spec synthesis: three strata, substrate verdicts, banked assets, the 10 governing principles | [analysis/04-LANDSCAPE-AND-PRINCIPLES.md](analysis/04-LANDSCAPE-AND-PRINCIPLES.md) (styled: https://claude.ai/code/artifact/2fa0e1fb-c800-4e72-a2b3-a1bca0de76d4) |
| Quality framework — gates, rubrics, pressure-test roster | [QUALITY-FRAMEWORK.md](QUALITY-FRAMEWORK.md) |
| Assumption register | [ASSUMPTIONS.md](ASSUMPTIONS.md) |
| Governing SOP | `~/AI/frameworks/agent-os/playbooks/start-a-new-initiative.md` + `principles/phased-build-discipline.md` |
| Quality gates + confidence scoring (adapted here) | `~/AI/frameworks/agent-os/.claude/rules/quality-gates.md`, `confidence-scoring.md` |
| Preservation & Rebuild Doctrine — the three laws, change tiers, Crossroads Protocol, P0/P1/P2 triage (operator directive, DEC-006) | [PRESERVATION-DOCTRINE.md](PRESERVATION-DOCTRINE.md) |
| Design Fidelity Standard — authorities (repo DESIGN_SYSTEM.md, tokens, plexi primitive kit, brand PDF), the compressed laws, enforcement wiring (operator directive) | [DESIGN-FIDELITY.md](DESIGN-FIDELITY.md) |
| Pre-spec rulings docket — five rulings, evidence E1–E5, all approved 2026-08-24 → DEC-007..011 | [analysis/05-PRE-SPEC-RULINGS.md](analysis/05-PRE-SPEC-RULINGS.md) |

## Standing constraints

1. **Branch isolation.** All work lands on `ryan-command-center`. Pull Caleb's updates from
   `origin` (`saasmouth/focusbuddy`); push to `fork` (`ryan-swan/focusbuddy`). Never push to
   origin main.
2. **`taskId` means desk** everywhere in the existing code. New entities use distinct field
   names (`itemId`/`todoId`). See map §00.
3. **House patterns are the design language**: widget registry (`homeWidgetDefs.ts`), RailCard
   chrome, the standup's pure-composer/orchestrator/AI-weave-with-deterministic-fallback split,
   the consent-gate pattern for AI acting on the user's behalf, org-scoped tables, static
   imports only in main.
4. **Don't commit `package-lock.json`** unless a dependency is intentionally added (Caleb's
   4.1.0 release commit forgot the lockfile bump; local npm rewrites it as noise).
5. Agent-OS is used here as **methodology + gate structure** (documentation layer), not its
   hook runtime — its JSONL logs stay untouched, and its 2026-08-24 watchdog FAIL
   (hook-behavior tests, agent-os repo itself) does not bear on this initiative.
6. Node engine mismatch on this machine (v25 vs required 20–22) is a watched assumption
   (A-004), not a blocker.

## Doc-ownership map (this initiative's living docs)

| Doc | Owns |
|---|---|
| 00-CONTEXT.md | Orientation + source material (this file) |
| ACTIVE-MISSION.md | Live state |
| ROADMAP.md | Phases + gates + dependency web |
| DECISIONS-LOG.md | Decisions (DEC-NNN) |
| GAP-REGISTER.md | Gaps + open questions (GAP-NNN) |
| ASSUMPTIONS.md | Assumption register (A-NNN) with invalidation triggers |
| QUALITY-FRAMEWORK.md | Gates, rubrics, confidence rules, pressure-test roster |
| PRESERVATION-DOCTRINE.md | The three laws, change tiers, Crossroads Protocol, P0/P1/P2 triage |
| DESIGN-FIDELITY.md | Design authorities, compressed UI laws, native-fit enforcement |
| SPEC-INTAKE.md | Protocol for processing the product spec on arrival |
| NEXT-SESSION-PROMPT.md | Resume prompt |
| phases/ | Per-phase tactical plans + handoff notes |
| analysis/ | Phase 1–2 outputs: raw spec, feature inventory, gap matrix |
