# Build Prompts — S0–S7 (Phase 5 deliverable)

Authored 2026-08-25 against **ARCHITECTURE.md v2.3 (APPROVED — G3+G4 MET, dual
signatures)**, per §7's rule that prompts follow the passed gate.

**Execute in order.** [00-PROTOCOL.md](00-PROTOCOL.md) first — it carries the quarantine
card, the per-stage loop, branch discipline, and the standing rules every stage inherits.

| # | Prompt | Class | Non-adjacent deps |
|---|---|---|---|
| S0 | [Vocabulary quarantine](S0-vocabulary-quarantine.md) | ADDITIVE | → S5 classifier |
| S1 | [Migration + guards](S1-migration-and-guards.md) | FOUNDATIONAL | everything |
| S2 | [Columns, projection, sync](S2-columns-projection-sync.md) | FOUNDATIONAL | → S4 badges |
| S3 | [IPC, preload, store](S3-ipc-preload-store.md) | ADDITIVE | → S6 surfaces |
| S4 | [Notification substrate](S4-notification-substrate.md) | RESHAPE | → S5 closure, S7 nudges |
| S5 | [Capture pipeline](S5-capture-pipeline.md) | ADDITIVE | needs S0+S4 |
| S6 | [Surfaces](S6-surfaces.md) | ADDITIVE + 2 renames | needs S3 |
| S7 | [Intelligence + G6 close](S7-intelligence-and-close.md) | ADDITIVE + verify | needs S4 |

**Interleaved:** the lifecycle track ([TRACK-LIFECYCLE/PLAN.md](../TRACK-LIFECYCLE/PLAN.md))
— L1 approval-free; L2 blocked on D1/D2 rulings; must land before S6's Stale-Desks
*content* (only that — F006).

**Gate to start:** ROADMAP Phase 5→6 carries the operator green light. Once given,
DEC-015 autopilot covers stage-to-stage execution without per-gate sign-off.
