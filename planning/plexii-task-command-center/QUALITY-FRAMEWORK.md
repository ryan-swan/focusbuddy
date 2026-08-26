# Quality Framework — Gates, Rubrics, Pressure Tests

Adapted from Agent-OS (`.claude/rules/quality-gates.md`, `confidence-scoring.md`,
`simulation-mode.md`, model-tiering) for a solo-operator, single-repo feature initiative.
The gates keep their teeth; the ceremony that only makes sense for the full multi-department
runtime (JSONL meta-logs, contract chain documents) is deliberately not wired.

## 1 · Confidence discipline

Every analysis artifact (feature inventory, gap matrix, strategy, architecture) carries a
confidence block:

```
confidence: 0.00–1.00  · why_not_higher: <specific limiting factor>
assumptions: <what must be true — load-bearing ones go to ASSUMPTIONS.md as A-NNN>
flags: LOW_CONFIDENCE (<0.75) | UNVERIFIED_CLAIM | HUMAN_REVIEW_REQUIRED
```

- **< 0.65 on the critical path = BLOCKED** — the item cannot feed downstream phases;
  it gets more evidence or an explicit operator override (logged as a DEC-NNN risk acceptance).
- Calibration per Agent-OS: ≥0.90 verified + triangulated · 0.75–0.89 strong, minor gaps ·
  0.50–0.74 single-source, flag it · <0.50 do not proceed.
- No confidence inflation: scores trace to evidence (file paths, line anchors, live greps).

## 2 · Gate map (which gate fires when)

| Checkpoint | Agent-OS analog | What must be true |
|---|---|---|
| G1 after spec intake | Gate 1 Intelligence Coverage | All spec items inventoried; overall interpretation confidence ≥ 0.80; ambiguities are logged questions, not guesses |
| G2 after gap matrix | Gate 5 Dual-Agent Validation (matrix = CRITICAL output) | Independent adversarial re-verification of ≥30% sample + all EXISTS/CONFLICTS claims; evidence from the live repo, not memory |
| G3 after strategy | Gate 2 Self-Consistency + pre-mortem | Acid test: executable with no other context; logic-auditor pass; red-team kill scenarios have early warnings + contingencies; operator approves |
| G4 after architecture | House rule: architecture passes Logic Auditor before code | 7-section doc; war-gamed; no code exists yet |
| G5 roadmap approval | Pre-flight Gate 6 | Operator green light; deps/tools/inputs verified per stage |
| Per-stage (Phase 6) | Gate 3 internal review + Gate 4 dimensional rubric | No first-draft passes; rubric below; tests + typecheck + live verification |
| Final | Gate 5 on the whole | Consistency audit; every gap CLOSED or deferred with rationale |

**Three-strike rule (adapted):** an artifact rejected 3× at the same gate = stop retrying;
it's a spec/prompt problem, not an execution problem — rediagnose upstream, log a DEC-NNN.

**Crossroads escalation (PRESERVATION-DOCTRINE):** any conflict between a new feature and
existing functionality — found in Phase 2 or discovered mid-build — halts that thread and
goes to the operator as a priced options-set (preserve/refactor/rebuild/descope + recommendation).
Never self-granted, never silent. Rulings are DEC-NNN entries.

## 3 · Rubrics (Gate 4 dimensional scoring, 1–5, no dimension compensates for another)

**Analysis artifacts** (inventory, matrix, strategy, architecture):
accuracy-of-evidence · completeness · internal consistency · actionability · honesty-about-unknowns.

**Product/UX decisions:**
elegance (does the simple path stay simple) · intuitiveness (guessable without docs) ·
native fit (reads as Plexii — **scored against [DESIGN-FIDELITY.md](DESIGN-FIDELITY.md)'s
six-point check: tokens-only color, primitives composed, corners/motion/type from tokens,
all four themes verified, nav through existing seams, focus/feedback intact**) ·
AI-appropriateness (AI acts only with evidence + consent; deterministic fallback always
exists; never fabricates) · human agency (the human decides where it matters) ·
collaboration soundness.

**Code stages:**
correctness · house-fit (wiring conventions, naming — no new `taskId` overloads) ·
test coverage (success + adversarial per stage) · performance (no dashboard jank; scheduler
correctness when app closed/reopened) · reversibility (migrations additive; feature can be
gated off) · **preservation** (existing core flows unbroken: current suites pass, adjacent
surfaces smoke-checked live — mandatory ≥4 for RESHAPE/FOUNDATIONAL stages, per
PRESERVATION-DOCTRINE).

APPROVE = all ≥ 4 · CONDITIONAL = all ≥ 3 with named improvements · REJECT = any < 3 with
per-dimension feedback.

## 4 · Pressure-test roster (who attacks what, when)

| Stage | Dispatched agents (available in this session's Agent tool) |
|---|---|
| G1 spec intake | `Explore` (live-repo evidence) — intake itself is done inline for full context fidelity |
| G2 gap matrix | independent `Explore`/`general-purpose` verifier prompted to REFUTE classifications |
| G3 strategy | `product-strategist` (build) → `logic-auditor` + `red-team-agent` + `assumption-auditor` (attack) → `audience-calibrator` (new-user read) |
| G4 architecture | `architecture-designer` (build) → `logic-auditor` (mandatory pass) + `risk-analyst` (3-scenario) |
| G5 roadmap | `task-architect` + `priority-architect` (build) → `success-criteria-builder` (rubrics per stage) |
| Per-stage code | `code-reviewer` (4-dimension review) + `test-engineer` (adversarial tests) |
| Final | `consistency-auditor` across all shipped artifacts |

Rule: builders never grade their own work; every pressure test runs in a fresh context with
the artifact + the refutation mandate, not the builder's reasoning.

## 5 · Verification discipline (from Agent-OS verification-and-quality)

- Every "verified" claim ships with a verify-command the operator can run independently
  (`npm run typecheck`, `npm run test:unit`, a grep, a screenshot of the live app).
- Adversarial tests are mandatory for anything that gates or schedules (notification
  scheduler, consent flows): build it, break it on purpose, confirm the break is caught.
- Live verification: the dev app runs on this branch with HMR proven — every renderer stage
  ends with the change observed in the running app, not assumed.
