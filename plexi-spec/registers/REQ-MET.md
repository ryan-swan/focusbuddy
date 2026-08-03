---
type: requirement-register
area: MET
domain: "Metrics"
count: 15
tags:
  - requirements
  - area/met
---

# REQ-MET — Metrics

15 normative requirements. Identifiers are permanent and never reused.

> [!important] For Claude Code
> Every requirement below is binding. Cite the ID in the test name that verifies it (`test_plx_met_001_*`) so [[S74 Definition of Done|§74]] gate 13 (requirement-to-test traceability) can be machine-checked.

| ID | § | V | Summary |
|---|---|---|---|
| [[#PLX-MET-001]] | §8 | A | Resume accuracy — Proportion of Resume assertions the user marks correct when prompted, sampled Baseline: In-product sampling, ≥20 |
| [[#PLX-MET-002]] | §8 | A | Context reconstruction time — Elapsed time from Desk open to first substantive edit or Decision action Baseline: Instrumented, per |
| [[#PLX-MET-003]] | §8 | A | Catch-up estimate calibration — Absolute error between estimated catch-up time and observed reconstruction time Baseline: Paired w |
| [[#PLX-MET-004]] | §8 | A | Duplicate work detected — Count of duplicate-candidate Relationships surfaced and confirmed by a user Baseline: Graph telemetry. T |
| [[#PLX-MET-005]] | §8 | A | Decision latency — Elapsed time from Decision Proposed to terminal state Baseline: Decision entity timestamps. Target: ↓ ≥25% vs b |
| [[#PLX-MET-006]] | §8 | A | Attention precision — Proportion of Attention Required and Decision Risk transitions the user acts on rather than dismisses Baseli |
| [[#PLX-MET-007]] | §8 | A | Search reduction — Searches per active Desk-hour Baseline: Search telemetry. Target: ↓ over tenant lifetime. |
| [[#PLX-MET-008]] | §8 | A | Knowledge reuse — Proportion of new Objects that reference at least one pre-existing Object or Decision Baseline: Graph telemetry. |
| [[#PLX-MET-009]] | §8 | A | Onboarding time to first contribution — Days from user creation to first authored Object on a Team or Project Desk Baseline: Ident |
| [[#PLX-MET-010]] | §8 | A | AI recommendation trust — Proportion of AI recommendations accepted, weighted by materiality Baseline: AI Orchestrator telemetry.  |
| [[#PLX-MET-011]] | §8 | A | Infrastructure cost per active user — Fully loaded cost including AI inference, per monthly active user, per tenant Baseline: Cost |
| [[#PLX-MET-012]] | §8 | I, T | Every metric in §8.1 MUST be instrumented and reported before the capability it measures is declared generally available. A capabi |
| [[#PLX-MET-013]] | §8 | A, I | PLX-MET-006 (attention precision) MUST be treated as a release gate. A release that reduces attention precision by more than 5 per |
| [[#PLX-MET-020]] | §86 | I | Primary metrics MUST take precedence over secondary metrics in product decision-making. Where a change improves a secondary metric |
| [[#PLX-MET-021]] | §86 | I | "Time in product" and equivalent engagement-maximising metrics MUST NOT be adopted as success metrics. The platform's stated purpo |

---

### PLX-MET-001

Resume accuracy — Proportion of Resume assertions the user marks correct when prompted, sampled Baseline: In-product sampling, ≥200 samples/tenant/quarter. Target: ≥90%.

| | |
|---|---|
| **Verification** | `A` |
| **Defined in** | [[S08 Success Criteria|§8]] |
| **Derives from** | [[S08 Success Criteria|§8]] |
| **Test name** | `test_plx_met_001` |

### PLX-MET-002

Context reconstruction time — Elapsed time from Desk open to first substantive edit or Decision action Baseline: Instrumented, per Desk-visit. Target: ↓ ≥40% vs first-90-day baseline.

| | |
|---|---|
| **Verification** | `A` |
| **Defined in** | [[S08 Success Criteria|§8]] |
| **Derives from** | [[S08 Success Criteria|§8]] |
| **Test name** | `test_plx_met_002` |

### PLX-MET-003

Catch-up estimate calibration — Absolute error between estimated catch-up time and observed reconstruction time Baseline: Paired with [[REQ-MET#PLX-MET-002|PLX-MET-002]]. Target: ≤±50% at p90.

| | |
|---|---|
| **Verification** | `A` |
| **Defined in** | [[S08 Success Criteria|§8]] |
| **Derives from** | [[S08 Success Criteria|§8]] |
| **Test name** | `test_plx_met_003` |

### PLX-MET-004

Duplicate work detected — Count of duplicate-candidate Relationships surfaced and confirmed by a user Baseline: Graph telemetry. Target: ↑, reported monthly.

| | |
|---|---|
| **Verification** | `A` |
| **Defined in** | [[S08 Success Criteria|§8]] |
| **Derives from** | [[S08 Success Criteria|§8]] |
| **Test name** | `test_plx_met_004` |

### PLX-MET-005

Decision latency — Elapsed time from Decision `Proposed` to terminal state Baseline: Decision entity timestamps. Target: ↓ ≥25% vs baseline.

| | |
|---|---|
| **Verification** | `A` |
| **Defined in** | [[S08 Success Criteria|§8]] |
| **Derives from** | [[S08 Success Criteria|§8]] |
| **Test name** | `test_plx_met_005` |

### PLX-MET-006

Attention precision — Proportion of `Attention Required` and `Decision Risk` transitions the user acts on rather than dismisses Baseline: Context Health telemetry. Target: ≥60%, and monotonically non-decreasing per release.

| | |
|---|---|
| **Verification** | `A` |
| **Defined in** | [[S08 Success Criteria|§8]] |
| **Derives from** | [[S08 Success Criteria|§8]] |
| **Test name** | `test_plx_met_006` |

### PLX-MET-007

Search reduction — Searches per active Desk-hour Baseline: Search telemetry. Target: ↓ over tenant lifetime.

| | |
|---|---|
| **Verification** | `A` |
| **Defined in** | [[S08 Success Criteria|§8]] |
| **Derives from** | [[S08 Success Criteria|§8]] |
| **Test name** | `test_plx_met_007` |

### PLX-MET-008

Knowledge reuse — Proportion of new Objects that reference at least one pre-existing Object or Decision Baseline: Graph telemetry. Target: ↑.

| | |
|---|---|
| **Verification** | `A` |
| **Defined in** | [[S08 Success Criteria|§8]] |
| **Derives from** | [[S08 Success Criteria|§8]] |
| **Test name** | `test_plx_met_008` |

### PLX-MET-009

Onboarding time to first contribution — Days from user creation to first authored Object on a Team or Project Desk Baseline: Identity + Object telemetry. Target: ↓.

| | |
|---|---|
| **Verification** | `A` |
| **Defined in** | [[S08 Success Criteria|§8]] |
| **Derives from** | [[S08 Success Criteria|§8]] |
| **Test name** | `test_plx_met_009` |

### PLX-MET-010

AI recommendation trust — Proportion of AI recommendations accepted, weighted by materiality Baseline: AI Orchestrator telemetry. Target: ↑, with acceptance-vs-outcome correlation tracked.

| | |
|---|---|
| **Verification** | `A` |
| **Defined in** | [[S08 Success Criteria|§8]] |
| **Derives from** | [[S08 Success Criteria|§8]] |
| **Test name** | `test_plx_met_010` |

### PLX-MET-011

Infrastructure cost per active user — Fully loaded cost including AI inference, per monthly active user, per tenant Baseline: Cost telemetry ([[S68 AI Cost Optimisation|§68]]). Target: ↓ per unit of retained context.

| | |
|---|---|
| **Verification** | `A` |
| **Defined in** | [[S08 Success Criteria|§8]] |
| **Derives from** | [[S08 Success Criteria|§8]] |
| **Test name** | `test_plx_met_011` |

### PLX-MET-012

Every metric in §8.1 **MUST** be instrumented and reported before the capability it measures is declared generally available. A capability **MUST NOT** reach GA with its success metric uninstrumented.

| | |
|---|---|
| **Verification** | `I, T` |
| **Defined in** | [[S08 Success Criteria|§8]] |
| **Derives from** | [[S08 Success Criteria|§8]], new |
| **Test name** | `test_plx_met_012` |

### PLX-MET-013

`[[REQ-MET#PLX-MET-006|PLX-MET-006]]` (attention precision) **MUST** be treated as a release gate. A release that reduces attention precision by more than 5 percentage points **MUST NOT** ship without explicit product sign-off recorded against the regression.

| | |
|---|---|
| **Verification** | `A, I` |
| **Defined in** | [[S08 Success Criteria|§8]] |
| **Derives from** | §6.7, new |
| **Test name** | `test_plx_met_013` |

### PLX-MET-020

Primary metrics **MUST** take precedence over secondary metrics in product decision-making. Where a change improves a secondary metric while degrading a primary metric, it **MUST** be rejected or explicitly accepted with recorded rationale.

| | |
|---|---|
| **Verification** | `I` |
| **Defined in** | [[S86 Product Success Metrics|§86]] |
| **Derives from** | [[S86 Product Success Metrics|§86]], new |
| **Test name** | `test_plx_met_020` |

### PLX-MET-021

"Time in product" and equivalent engagement-maximising metrics **MUST NOT** be adopted as success metrics. The platform's stated purpose is to reduce time spent reconstructing context.

| | |
|---|---|
| **Verification** | `I` |
| **Defined in** | [[S86 Product Success Metrics|§86]] |
| **Derives from** | [[S86 Product Success Metrics|§86]], new |
| **Test name** | `test_plx_met_021` |
