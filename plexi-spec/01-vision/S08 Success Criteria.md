---
id: S8
section: §8
title: "Success Criteria"
part: I
type: section
defines:
  - PLX-MET-001
  - PLX-MET-002
  - PLX-MET-003
  - PLX-MET-004
  - PLX-MET-005
  - PLX-MET-006
  - PLX-MET-007
  - PLX-MET-008
  - PLX-MET-009
  - PLX-MET-010
  - PLX-MET-011
  - PLX-MET-012
  - PLX-MET-013
tags:
  - section
  - part/i
---

# §8 Success Criteria

◀ [[S07 Design Principles]] · [[Part I — Vision|▲ Part I]] · [[S09 What is Plexi]] ▶

---

The platform succeeds when users say: *"I never lose my place anymore."*

It succeeds when organisations observe fewer duplicate projects, faster onboarding, fewer repeated meetings, reduced project restart time, fewer forgotten decisions, faster knowledge retrieval, lower cognitive load and improved organisational awareness.

### 8.1 Success criteria made measurable

The list above is a set of intentions, not measurements. The table below converts each into an instrumented metric with a baseline method and a target. Targets are stated as **direction and threshold**; absolute values are calibrated during Phase 1 against the measured baseline and then frozen per release train.

| ID | Metric | Definition | Baseline method | Target | V |
|---|---|---|---|---|---|
| [[REQ-MET#PLX-MET-001|PLX-MET-001]] | Resume accuracy | Proportion of Resume assertions the user marks correct when prompted, sampled | In-product sampling, ≥200 samples/tenant/quarter | ≥90% | A |
| [[REQ-MET#PLX-MET-002|PLX-MET-002]] | Context reconstruction time | Elapsed time from Desk open to first substantive edit or Decision action | Instrumented, per Desk-visit | ↓ ≥40% vs first-90-day baseline | A |
| [[REQ-MET#PLX-MET-003|PLX-MET-003]] | Catch-up estimate calibration | Absolute error between estimated catch-up time and observed reconstruction time | Paired with [[REQ-MET#PLX-MET-002|PLX-MET-002]] | ≤±50% at p90 | A |
| [[REQ-MET#PLX-MET-004|PLX-MET-004]] | Duplicate work detected | Count of duplicate-candidate Relationships surfaced and confirmed by a user | Graph telemetry | ↑, reported monthly | A |
| [[REQ-MET#PLX-MET-005|PLX-MET-005]] | Decision latency | Elapsed time from Decision `Proposed` to terminal state | Decision entity timestamps | ↓ ≥25% vs baseline | A |
| [[REQ-MET#PLX-MET-006|PLX-MET-006]] | Attention precision | Proportion of `Attention Required` and `Decision Risk` transitions the user acts on rather than dismisses | Context Health telemetry | ≥60%, and monotonically non-decreasing per release | A |
| [[REQ-MET#PLX-MET-007|PLX-MET-007]] | Search reduction | Searches per active Desk-hour | Search telemetry | ↓ over tenant lifetime | A |
| [[REQ-MET#PLX-MET-008|PLX-MET-008]] | Knowledge reuse | Proportion of new Objects that reference at least one pre-existing Object or Decision | Graph telemetry | ↑ | A |
| [[REQ-MET#PLX-MET-009|PLX-MET-009]] | Onboarding time to first contribution | Days from user creation to first authored Object on a Team or Project Desk | Identity + Object telemetry | ↓ | A |
| [[REQ-MET#PLX-MET-010|PLX-MET-010]] | AI recommendation trust | Proportion of AI recommendations accepted, weighted by materiality | AI Orchestrator telemetry | ↑, with acceptance-vs-outcome correlation tracked | A |
| [[REQ-MET#PLX-MET-011|PLX-MET-011]] | Infrastructure cost per active user | Fully loaded cost including AI inference, per monthly active user, per tenant | Cost telemetry ([[S68 AI Cost Optimisation|§68]]) | ↓ per unit of retained context | A |

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-MET#PLX-MET-012|PLX-MET-012]] | Every metric in §8.1 **MUST** be instrumented and reported before the capability it measures is declared generally available. A capability **MUST NOT** reach GA with its success metric uninstrumented. | I, T | §8, new |
| [[REQ-MET#PLX-MET-013|PLX-MET-013]] | `[[REQ-MET#PLX-MET-006|PLX-MET-006]]` (attention precision) **MUST** be treated as a release gate. A release that reduces attention precision by more than 5 percentage points **MUST NOT** ship without explicit product sign-off recorded against the regression. | A, I | §6.7, new |

> **Why attention precision is a gate.** Philosophy 7 says notifications are failures. The only way that survives contact with a shipping product is if the rate at which the system cries wolf is a number someone is accountable for. Without a gate, Context Health degrades into a second notification tray within three releases — and at that point the product's central differentiator has been quietly deleted by accretion.

---

---

## Requirements defined or cited here

- [[REQ-MET#PLX-MET-001|PLX-MET-001]] — Resume accuracy — Proportion of Resume assertions the user marks correct when prompted, sampled Baseline: In-p
- [[REQ-MET#PLX-MET-002|PLX-MET-002]] — Context reconstruction time — Elapsed time from Desk open to first substantive edit or Decision action Baselin
- [[REQ-MET#PLX-MET-003|PLX-MET-003]] — Catch-up estimate calibration — Absolute error between estimated catch-up time and observed reconstruction tim
- [[REQ-MET#PLX-MET-004|PLX-MET-004]] — Duplicate work detected — Count of duplicate-candidate Relationships surfaced and confirmed by a user Baseline
- [[REQ-MET#PLX-MET-005|PLX-MET-005]] — Decision latency — Elapsed time from Decision `Proposed` to terminal state Baseline: Decision entity timestamp
- [[REQ-MET#PLX-MET-006|PLX-MET-006]] — Attention precision — Proportion of `Attention Required` and `Decision Risk` transitions the user acts on rath
- [[REQ-MET#PLX-MET-007|PLX-MET-007]] — Search reduction — Searches per active Desk-hour Baseline: Search telemetry. Target: ↓ over tenant lifetime.
- [[REQ-MET#PLX-MET-008|PLX-MET-008]] — Knowledge reuse — Proportion of new Objects that reference at least one pre-existing Object or Decision Baseli
- [[REQ-MET#PLX-MET-009|PLX-MET-009]] — Onboarding time to first contribution — Days from user creation to first authored Object on a Team or Project
- [[REQ-MET#PLX-MET-010|PLX-MET-010]] — AI recommendation trust — Proportion of AI recommendations accepted, weighted by materiality Baseline: AI Orch
- [[REQ-MET#PLX-MET-011|PLX-MET-011]] — Infrastructure cost per active user — Fully loaded cost including AI inference, per monthly active user, per t
- [[REQ-MET#PLX-MET-012|PLX-MET-012]] — Every metric in §8.1 **MUST** be instrumented and reported before the capability it measures is declared gener
- [[REQ-MET#PLX-MET-013|PLX-MET-013]] — `PLX-MET-006` (attention precision) **MUST** be treated as a release gate. A release that reduces attention pr

◀ [[S07 Design Principles]] · [[Part I — Vision|▲ Part I]] · [[S09 What is Plexi]] ▶
