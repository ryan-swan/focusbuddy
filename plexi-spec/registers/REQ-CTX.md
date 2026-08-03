---
type: requirement-register
area: CTX
domain: "Context Engine"
count: 16
tags:
  - requirements
  - area/ctx
---

# REQ-CTX — Context Engine

16 normative requirements. Identifiers are permanent and never reused.

> [!important] For Claude Code
> Every requirement below is binding. Cite the ID in the test name that verifies it (`test_plx_ctx_001_*`) so [[S74 Definition of Done|§74]] gate 13 (requirement-to-test traceability) can be machine-checked.

| ID | § | V | Summary |
|---|---|---|---|
| [[#PLX-CTX-001]] | §38 | T | Context Objects MUST be versioned and retained. Superseded Context Objects MUST remain retrievable for audit. |
| [[#PLX-CTX-002]] | §38 | T | Every field in a Context Object derived from inference MUST carry source, confidence and evidence (CognitiveField). |
| [[#PLX-CTX-010]] | §51 | T | Materiality scoring MUST be deterministic and reproducible. Given identical inputs, it MUST produce an identical score. |
| [[#PLX-CTX-011]] | §51 | T, A | Materiality scoring MUST NOT require an AI model call in its primary path. AI MAY be used to enrich explanation after scoring comp |
| [[#PLX-CTX-012]] | §51 | T, I | Materiality thresholds MUST be tenant-configurable and MUST be recorded on each scoring Event, so that a change in threshold is di |
| [[#PLX-CTX-013]] | §51 | T, A | The Context Engine MUST bound dependency propagation by configured maximum depth and maximum fan-out. Where a propagation is trunc |
| [[#PLX-CTX-014]] | §51 | A | Context Health computation MUST meet PLX-PERF-020 for direct impact and PLX-PERF-021 for propagated impact. These are separate bud |
| [[#PLX-CTX-020]] | §80 | T | Materiality scoring MUST be a pure function of its declared inputs — deterministic, reproducible and free of model invocation (PLX |
| [[#PLX-CTX-021]] | §80 | T | The materiality function and its weights MUST be versioned, and the version MUST be recorded on every scoring Event, so that histo |
| [[#PLX-CTX-022]] | §80 | T, I | Materiality weights MUST be tunable per tenant without code deployment, and every tuning change MUST emit an auditable Event. |
| [[#PLX-CTX-023]] | §80 | A, T | Propagation MUST be incremental. A change MUST NOT trigger recalculation of unaffected graph regions. |
| [[#PLX-CTX-024]] | §80 | T, A | Propagation MUST be bounded by maximum depth and maximum fan-out, both tenant-configurable, and truncation MUST be recorded and vi |
| [[#PLX-CTX-025]] | §80 | A, T | Synchronous propagation MUST be limited to the budget of PLX-PERF-021; propagation beyond that budget MUST continue asynchronously |
| [[#PLX-CTX-026]] | §80 | T | Propagation MUST be cycle-safe. The Relationship graph is not acyclic and propagation MUST terminate on cyclic paths without repea |
| [[#PLX-CTX-030]] | §80 | T | Context freshness MUST be computed per (user, Desk) and MUST decay with elapsed meaningful change, not with elapsed time alone. |
| [[#PLX-CTX-031]] | §80 | I, T | Freshness scores MUST NOT be surfaced as a comparative measure between users, and MUST NOT be exportable in a form that supports i |

---

### PLX-CTX-001

Context Objects **MUST** be versioned and retained. Superseded Context Objects **MUST** remain retrievable for audit.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S38 Context Entity|§38]] |
| **Derives from** | §38.2 |
| **Test name** | `test_plx_ctx_001` |

### PLX-CTX-002

Every field in a Context Object derived from inference **MUST** carry source, confidence and evidence (`CognitiveField`).

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S38 Context Entity|§38]] |
| **Derives from** | [[S38 Context Entity|§38]], [[S12 Context|§12]] |
| **Test name** | `test_plx_ctx_002` |

### PLX-CTX-010

Materiality scoring **MUST** be deterministic and reproducible. Given identical inputs, it **MUST** produce an identical score.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S51 Context Engine|§51]] |
| **Derives from** | [[S51 Context Engine|§51]], [[S48 Event Architecture|§48]] |
| **Test name** | `test_plx_ctx_010` |

### PLX-CTX-011

Materiality scoring **MUST NOT** require an AI model call in its primary path. AI **MAY** be used to enrich explanation after scoring completes.

| | |
|---|---|
| **Verification** | `T, A` |
| **Defined in** | [[S51 Context Engine|§51]] |
| **Derives from** | [[S48 Event Architecture|§48]], [[S51 Context Engine|§51]] |
| **Test name** | `test_plx_ctx_011` |

### PLX-CTX-012

Materiality thresholds **MUST** be tenant-configurable and **MUST** be recorded on each scoring Event, so that a change in threshold is distinguishable from a change in behaviour when auditing historical decisions.

| | |
|---|---|
| **Verification** | `T, I` |
| **Defined in** | [[S51 Context Engine|§51]] |
| **Derives from** | [[S51 Context Engine|§51]], new |
| **Test name** | `test_plx_ctx_012` |

### PLX-CTX-013

The Context Engine **MUST** bound dependency propagation by configured maximum depth and maximum fan-out. Where a propagation is truncated by either bound, the truncation **MUST** be recorded and **MUST** be visible in the resulting attention record.

| | |
|---|---|
| **Verification** | `T, A` |
| **Defined in** | [[S51 Context Engine|§51]] |
| **Derives from** | [[S51 Context Engine|§51]], [[S80 Context Engine Algorithms|§80]] |
| **Test name** | `test_plx_ctx_013` |

### PLX-CTX-014

Context Health computation **MUST** meet `[[REQ-PERF#PLX-PERF-020|PLX-PERF-020]]` for direct impact and `[[REQ-PERF#PLX-PERF-021|PLX-PERF-021]]` for propagated impact. These are separate budgets and **MUST NOT** be conflated.

| | |
|---|---|
| **Verification** | `A` |
| **Defined in** | [[S51 Context Engine|§51]] |
| **Derives from** | [[S58 Performance Requirements|§58]], new |
| **Test name** | `test_plx_ctx_014` |

### PLX-CTX-020

Materiality scoring **MUST** be a pure function of its declared inputs — deterministic, reproducible and free of model invocation (`[[REQ-CTX#PLX-CTX-010|PLX-CTX-010]]`, `[[REQ-CTX#PLX-CTX-011|PLX-CTX-011]]`).

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S80 Context Engine Algorithms|§80]] |
| **Derives from** | [[S80 Context Engine Algorithms|§80]] |
| **Test name** | `test_plx_ctx_020` |

### PLX-CTX-021

The materiality function and its weights **MUST** be versioned, and the version **MUST** be recorded on every scoring Event, so that historical scores remain interpretable after the function changes.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S80 Context Engine Algorithms|§80]] |
| **Derives from** | [[S80 Context Engine Algorithms|§80]], new |
| **Test name** | `test_plx_ctx_021` |

### PLX-CTX-022

Materiality weights **MUST** be tunable per tenant without code deployment, and every tuning change **MUST** emit an auditable Event.

| | |
|---|---|
| **Verification** | `T, I` |
| **Defined in** | [[S80 Context Engine Algorithms|§80]] |
| **Derives from** | [[S80 Context Engine Algorithms|§80]], new |
| **Test name** | `test_plx_ctx_022` |

### PLX-CTX-023

Propagation **MUST** be incremental. A change **MUST NOT** trigger recalculation of unaffected graph regions.

| | |
|---|---|
| **Verification** | `A, T` |
| **Defined in** | [[S80 Context Engine Algorithms|§80]] |
| **Derives from** | [[S80 Context Engine Algorithms|§80]] |
| **Test name** | `test_plx_ctx_023` |

### PLX-CTX-024

Propagation **MUST** be bounded by maximum depth and maximum fan-out, both tenant-configurable, and truncation **MUST** be recorded and visible (`[[REQ-CTX#PLX-CTX-013|PLX-CTX-013]]`).

| | |
|---|---|
| **Verification** | `T, A` |
| **Defined in** | [[S80 Context Engine Algorithms|§80]] |
| **Derives from** | [[S80 Context Engine Algorithms|§80]], [[S51 Context Engine|§51]] |
| **Test name** | `test_plx_ctx_024` |

### PLX-CTX-025

Synchronous propagation **MUST** be limited to the budget of `[[REQ-PERF#PLX-PERF-021|PLX-PERF-021]]`; propagation beyond that budget **MUST** continue asynchronously and **MUST** update Context Health on completion.

| | |
|---|---|
| **Verification** | `A, T` |
| **Defined in** | [[S80 Context Engine Algorithms|§80]] |
| **Derives from** | [[S80 Context Engine Algorithms|§80]], [[S58 Performance Requirements|§58]] |
| **Test name** | `test_plx_ctx_025` |

### PLX-CTX-026

Propagation **MUST** be cycle-safe. The Relationship graph is not acyclic and propagation **MUST** terminate on cyclic paths without repeated re-entry.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S80 Context Engine Algorithms|§80]] |
| **Derives from** | [[S80 Context Engine Algorithms|§80]], new |
| **Test name** | `test_plx_ctx_026` |

### PLX-CTX-030

Context freshness **MUST** be computed per (user, Desk) and **MUST** decay with elapsed meaningful change, not with elapsed time alone.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S80 Context Engine Algorithms|§80]] |
| **Derives from** | [[S80 Context Engine Algorithms|§80]] |
| **Test name** | `test_plx_ctx_030` |

### PLX-CTX-031

Freshness scores **MUST NOT** be surfaced as a comparative measure between users, and **MUST NOT** be exportable in a form that supports individual performance ranking.

| | |
|---|---|
| **Verification** | `I, T` |
| **Defined in** | [[S80 Context Engine Algorithms|§80]] |
| **Derives from** | [[S80 Context Engine Algorithms|§80]], new |
| **Test name** | `test_plx_ctx_031` |
