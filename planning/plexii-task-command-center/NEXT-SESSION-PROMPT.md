# Next Session — Resume Prompt

**Last updated:** 2026-08-25 early · **G2 CLOSED** (all seven Phase 2 workstreams
delivered; matrix adversarially verified 12/4/0 with corrections integrated; evidence
library complete: analysis/02+10-16). Phase 3 open per DEC-015 autopilot: draft the
7-section architecture (consume the FULL evidence library — esp. GAP-013/014/015/016, the
A-01/A-02 amendments, analysis/14§consequences + 15§6 preconditions), then logic-auditor +
risk war-game before G3; then stage decomposition + per-stage build prompts. Q1/Q7 rulings
(analysis/16) + shared-desk delete v1 default still awaited from operator — non-blocking
for architecture, due before Phase 5.

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

Next task: whatever [ACTIVE-MISSION.md](ACTIVE-MISSION.md) → "Phase 2 scope" says. As of
this prompt: **collect the two agent drafts (analysis/10 node-consumer classification,
analysis/11 AI vocab audit), verify them, then run the split sync proof against the live
dev app — (a) do new node columns/kinds pass the server opaquely, (b) does the client stamp
and preserve them on arrival — then assemble analysis/02-GAP-MATRIX.md (all 44 SPEC items,
evidence-classified, ≥30% adversarially re-verified) toward G2.** If ACTIVE-MISSION
differs, trust it (it's newer than this prompt).

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
