# Active Mission

<!-- Single source of truth for live state. Update at every phase boundary, then regenerate
     NEXT-SESSION-PROMPT.md. -->

**Last updated:** 2026-08-24 (night, G1 closed) · **State:** IN_PROGRESS — Phase 2

**G1 MET (DEC-014):** spec captured + inventoried (44 items + SPEC-042/043/044); primary
objective confirmed as drafted; all crossroads ruled (CR-01..07 = standing recommendations;
CR-07 = Option B parallel prerequisite); Q5 shaped (DEC-013); IQ-1 resolved (deliberate
trim); ambiguities Q1–Q4, Q6–Q8 scheduled for Phase 2/3 proposals returned for approval.

**Phase 2 scope (widened per register §5 + analysis/09):**
1. SPEC-004 — 305-site node-consumer classification → **background agent running**,
   draft lands in analysis/10.
2. SPEC-044 — AI vocabulary audit (protocol-quarantine approach) → **background agent
   running**, draft lands in analysis/11.
3. Sync proof, SPLIT: (a) server passes new node columns/kinds opaquely; (b) client stamps
   and preserves them on arrival. Live experiment — needs the dev app + supervised session.
4. ACL semantics documentation (org / team / per-desk) for SPEC-030.
5. C1-03 shared-tab triage (enumeration vs. metadata) — folded into workstream 1.
6. Sync reliability assessment (BUG-C2-01: partial widget sync, 7–8s latency).
7. The gap matrix itself (analysis/02): all 44 items EXISTS/PARTIAL/MISSING/CONFLICTS with
   evidence + ≥30% adversarial re-verification (G2 dual validation).

## Right now

Phase 0 (Foundation) is complete and the five pre-spec rulings are **operator-approved**
(DEC-007..011): work items are nodes (`work_item`, CHECK widened — provisional to G4);
routing specced both scopes, built self-first; calendar engine stays with surface rebuild
licensed; plans untouched in v1; vocabulary locked. Design Fidelity Standard codified
(DESIGN-FIDELITY.md — repo DESIGN_SYSTEM.md is the law; primitives-first; six-point
native-fit check in the rubric). **Next action: the spec-drafting session writes the intake
spec with the docket's rulings; operator pastes it here → run
[phases/PHASE-1-spec-intake/PLAN.md](phases/PHASE-1-spec-intake/PLAN.md).**

## Execution order

1. ~~Phase 0 — Foundation~~ ✔
2. Phase 1 — Spec intake & decomposition ← **NEXT (blocked on: operator supplies spec)**
3. Phase 2 — Current-state verification & gap analysis (incl. GAP-008 sync-layer investigation)
4. Phase 3 — Product strategy & experience design (+ pressure test 1)
5. Phase 4 — Technical architecture (+ pressure test 2)
6. Phase 5 — Staged build roadmap (operator green light)
7. Phase 6..N — Execute per-stage loop
8. Phase F — Integrate & close

## Recently completed (audit trail — most recent first)

- **2026-08-24 (latest) — Vocabulary complete + consumer census.** DEC-012: the surface is
  **"Attention"** (verified convergence with Caleb's existing `AttentionItem`/`ContextObject`
  + `attentionPrecision()`; "Signal" eliminated — the sync transport is the signal server).
  GAP-011 registered with measured census: **305 kind-branching call sites / 99 files** to
  classify in Phase 2 (negations + unfiltered child enumerations = the risk classes).
  All spec-blocking rulings now closed — the spec-drafting session has its green light.
- **2026-08-24 (late) — Five pre-spec rulings approved + Design Fidelity Standard.**
  Operator approved analysis/05-PRE-SPEC-RULINGS.md in full → DEC-007 (schema: widen CHECK,
  work items are nodes), DEC-008 (routing: spec both, self-first), DEC-009 (calendar:
  engine stays, surface licensed, external P2), DEC-010 (plans untouched v1), DEC-011
  (vocabulary: `work_item`, forever). Sync substrate verified (CRDT, server-mediated,
  `nodes` + `time_blocks` on the whitelist) — A-003 0.55→0.85, GAP-008 IN_PROGRESS.
  Design directive codified → [DESIGN-FIDELITY.md](DESIGN-FIDELITY.md).
- **2026-08-24 — Preservation & Rebuild Doctrine codified (Phase 0 addendum, DEC-006).**
  Operator's pre-spec directive locked in: core Plexii is inviolable; rebuilds of existing
  surfaces go through the Crossroads Protocol (operator decides); foundational
  schema/routing changes get the strictest tier; every spec item triaged P0/P1/P2 against
  the operator-confirmed primary objective → [PRESERVATION-DOCTRINE.md](PRESERVATION-DOCTRINE.md).
  Threaded through intake, roadmap gates, rubrics; A-006 (calendar usage) registered.
- **2026-08-24 — Legacy task-branch harvest (Phase 0 addendum).** `ryan-task-system-port`
  (`fd12cc2f`) excavated: data model, production-grade CHECK-widening migration + pinning
  test, 3 polished UI components, measured port costs (small: 10 files, ≤210-line target
  drift, zero new deps). Reference-only per DEC-005 →
  [analysis/03-LEGACY-TASK-BRANCH.md](analysis/03-LEGACY-TASK-BRANCH.md).
- **2026-08-24 — Phase 0 shipped.** Mission-control scaffolded from the agent-os template
  (9 docs, zero raw placeholders); gates G1–G6 adapted; registers seeded (7 gaps + 2 open
  questions, 5 assumptions, 4 decisions); Phase 1 PLAN written; baseline pre-flight PASS.
- **2026-08-24 (earlier today) — Foundation prerequisites.** Branch `ryan-command-center` cut
  @ a92b30cb and pushed to fork; codebase map produced and delivered
  (`.claude/COMMAND-CENTER-MAP.md` + artifact); dev app launched, HMR round-trip verified.

## Open items

See [GAP-REGISTER.md](GAP-REGISTER.md). Non-blocking niceties: Caleb/Michael re-adding
`ryan-swan` as collaborator on origin would allow moving the branch off the fork (DEC-001).

## How this file gets used

Read at session start. Update "Right now" + "Recently completed" at each phase boundary;
regenerate [NEXT-SESSION-PROMPT.md](NEXT-SESSION-PROMPT.md). If "Right now" says X and the
operator asks for Y, surface the conflict before doing Y.
