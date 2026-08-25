# Next Session — Resume Prompt

**Last updated:** 2026-08-24 · Phase 0 (Foundation) shipped; waiting on the product spec.

## <<<PROMPT BEGIN>>>

You are resuming **plexii-task-command-center** — an Agent-OS-governed initiative to build
intelligent Task, Notification, and personal command-center features in Plexii on the
isolated branch `ryan-command-center`. You have no memory of prior sessions; everything is
in the living docs. Read in order: [00-CONTEXT.md](00-CONTEXT.md) →
[ACTIVE-MISSION.md](ACTIVE-MISSION.md) → [ROADMAP.md](ROADMAP.md) →
[DECISIONS-LOG.md](DECISIONS-LOG.md). The codebase map is
`../../.claude/COMMAND-CENTER-MAP.md`.

Pre-flight:
```bash
cd ~/focusbuddy-plexi && git fetch origin --prune && git status --short --branch && git rev-list --left-right --count ryan-command-center...origin/main && npm run typecheck
```
(Drift from origin/main is information, not a problem — log it; merging is a DEC-NNN.)

Next task: whatever [ACTIVE-MISSION.md](ACTIVE-MISSION.md) → "Right now" says. As of this
prompt: **receive the operator's product spec and execute
[phases/PHASE-1-spec-intake/PLAN.md](phases/PHASE-1-spec-intake/PLAN.md) per
[SPEC-INTAKE.md](SPEC-INTAKE.md)** — verbatim capture, SPEC-NNN inventory, ambiguities as
questions, gate G1. If ACTIVE-MISSION differs, trust it (it's newer than this prompt).

Before writing code: none is authorized until gates G1→G5 pass (DEC-004). Phases 3+ that are
only ROADMAP rows get a PLAN.md + operator approval before execution.

Close discipline: end every session by updating [ACTIVE-MISSION.md](ACTIVE-MISSION.md),
regenerating this file, and dropping a handoff note in `phases/HANDOFFS/`.

Locked decisions (don't relitigate): DEC-001 fork-branch isolation · DEC-002 in-repo
mission-control · DEC-003 agent-os as methodology not runtime · DEC-004 analysis before
build, spec as authority · DEC-005 legacy branch reference-only · DEC-006 preservation
doctrine · **DEC-007 work items are nodes (CHECK widened; provisional to G4)** · DEC-008
routing specced both scopes, built self-first · DEC-009 calendar engine stays, surface
rebuild licensed, external = P2 · DEC-010 plans untouched in v1 · **DEC-011 the entity is
`work_item`, forever** · **DEC-012 the surface is "Attention"** (extends Caleb's existing
`AttentionItem`/`ContextObject` concept — spec §1 defines the layering) · design law =
DESIGN-FIDELITY.md (repo DESIGN_SYSTEM.md + primitives-first + six-point native-fit check).
GAP-011: 305 kind-branching call sites / 99 files must be classified in Phase 2.

Absolute constraints: never push to origin main · new entities never reuse `taskId` ·
don't commit `package-lock.json` (or anything, unless the operator asks) · ambiguity becomes
a logged question, never a guess · every "verified" claim carries a verify-command · no broad
filesystem discovery beyond this repo + this folder · **PRESERVATION-DOCTRINE governs every
phase: core Plexii functionality is inviolable, rebuild-vs-preserve crossroads are presented
to the operator (never self-granted), foundational schema/routing changes are additive-first,
reversible, dual-validated, regression-guarded.**

## <<<PROMPT END>>>
