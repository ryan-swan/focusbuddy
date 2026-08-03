---
type: requirement-register
area: RES
domain: "Resume Engine"
count: 12
tags:
  - requirements
  - area/res
---

# REQ-RES — Resume Engine

12 normative requirements. Identifiers are permanent and never reused.

> [!important] For Claude Code
> Every requirement below is binding. Cite the ID in the test name that verifies it (`test_plx_res_001_*`) so [[S74 Definition of Done|§74]] gate 13 (requirement-to-test traceability) can be machine-checked.

| ID | § | V | Summary |
|---|---|---|---|
| [[#PLX-RES-001]] | §39 | T, D | Resume Objects MUST be versioned and diffable against any prior Resume for the same Desk and user. |
| [[#PLX-RES-002]] | §39 | T | Every Resume MUST record the Event identifiers from which it was derived. A Resume assertion not traceable to Events MUST NOT be e |
| [[#PLX-RES-003]] | §39 | T, D | estimatedCatchup MUST be expressed as a range with a stated basis, not a bare point value. |
| [[#PLX-RES-004]] | §39 | T | Where forUserId is null, the Resume MUST be permission-filtered at render time per viewing user; a collaborative Resume MUST NOT b |
| [[#PLX-RES-010]] | §52 | A, T | Resume generation MUST be incremental. A Resume update MUST NOT require reprocessing the full Event history of a Desk. |
| [[#PLX-RES-011]] | §52 | T | Stages 1–6 of the Resume pipeline MUST be independently testable and MUST produce a complete structured Resume without invoking a  |
| [[#PLX-RES-012]] | §52 | T, A | Expensive reasoning outputs MUST be cached and keyed by the structured input digest, so that identical input never incurs repeated |
| [[#PLX-RES-013]] | §52 | T | Where stage 7 is unavailable or disabled, the Resume MUST still render from the structured output of stages 1–6. |
| [[#PLX-RES-020]] | §81 | T | Each Resume stage MUST be independently testable with recorded fixtures, and stage outputs MUST be inspectable in non-production e |
| [[#PLX-RES-021]] | §81 | T | Stages 1–5 and 7 MUST complete without model invocation. A Resume MUST be renderable from these stages alone (PLX-RES-013). |
| [[#PLX-RES-022]] | §81 | A | Catch-up estimation (stage 7) MUST be calibrated against observed reconstruction time (PLX-MET-003) and recalibrated at least quar |
| [[#PLX-RES-023]] | §81 | T | Noise removal (stage 3) MUST be reversible: removed Events MUST remain reachable through the disclosure path of PLX-UX-051. |

---

### PLX-RES-001

Resume Objects **MUST** be versioned and diffable against any prior Resume for the same Desk and user.

| | |
|---|---|
| **Verification** | `T, D` |
| **Defined in** | [[S39 Resume Entity|§39]] |
| **Derives from** | [[S39 Resume Entity|§39]] |
| **Test name** | `test_plx_res_001` |

### PLX-RES-002

Every Resume **MUST** record the Event identifiers from which it was derived. A Resume assertion not traceable to Events **MUST NOT** be emitted.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S39 Resume Entity|§39]] |
| **Derives from** | [[S39 Resume Entity|§39]], §7.9 |
| **Test name** | `test_plx_res_002` |

### PLX-RES-003

`estimatedCatchup` **MUST** be expressed as a range with a stated basis, not a bare point value.

| | |
|---|---|
| **Verification** | `T, D` |
| **Defined in** | [[S39 Resume Entity|§39]] |
| **Derives from** | [[S14 Resume Intelligence|§14]], new |
| **Test name** | `test_plx_res_003` |

### PLX-RES-004

Where `forUserId` is null, the Resume **MUST** be permission-filtered at render time per viewing user; a collaborative Resume **MUST NOT** be materialised in a form that leaks non-permitted content.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S39 Resume Entity|§39]] |
| **Derives from** | §25.3, new |
| **Test name** | `test_plx_res_004` |

### PLX-RES-010

Resume generation **MUST** be incremental. A Resume update **MUST NOT** require reprocessing the full Event history of a Desk.

| | |
|---|---|
| **Verification** | `A, T` |
| **Defined in** | [[S52 Resume Engine|§52]] |
| **Derives from** | §52.2 |
| **Test name** | `test_plx_res_010` |

### PLX-RES-011

Stages 1–6 of the Resume pipeline **MUST** be independently testable and **MUST** produce a complete structured Resume without invoking a model. Stage 7 (AI Summary) **MUST** be additive prose over that structure.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S52 Resume Engine|§52]] |
| **Derives from** | [[S52 Resume Engine|§52]], [[S81 Resume Algorithms|§81]] |
| **Test name** | `test_plx_res_011` |

### PLX-RES-012

Expensive reasoning outputs **MUST** be cached and keyed by the structured input digest, so that identical input never incurs repeated model cost.

| | |
|---|---|
| **Verification** | `T, A` |
| **Defined in** | [[S52 Resume Engine|§52]] |
| **Derives from** | §52.2, [[S68 AI Cost Optimisation|§68]] |
| **Test name** | `test_plx_res_012` |

### PLX-RES-013

Where stage 7 is unavailable or disabled, the Resume **MUST** still render from the structured output of stages 1–6.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S52 Resume Engine|§52]] |
| **Derives from** | [[S52 Resume Engine|§52]], [[S33 Desk Entity|§33]] |
| **Test name** | `test_plx_res_013` |

### PLX-RES-020

Each Resume stage **MUST** be independently testable with recorded fixtures, and stage outputs **MUST** be inspectable in non-production environments.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S81 Resume Algorithms|§81]] |
| **Derives from** | [[S81 Resume Algorithms|§81]] |
| **Test name** | `test_plx_res_020` |

### PLX-RES-021

Stages 1–5 and 7 **MUST** complete without model invocation. A Resume **MUST** be renderable from these stages alone (`[[REQ-RES#PLX-RES-013|PLX-RES-013]]`).

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S81 Resume Algorithms|§81]] |
| **Derives from** | [[S81 Resume Algorithms|§81]], [[S52 Resume Engine|§52]] |
| **Test name** | `test_plx_res_021` |

### PLX-RES-022

Catch-up estimation (stage 7) **MUST** be calibrated against observed reconstruction time (`[[REQ-MET#PLX-MET-003|PLX-MET-003]]`) and recalibrated at least quarterly per tenant.

| | |
|---|---|
| **Verification** | `A` |
| **Defined in** | [[S81 Resume Algorithms|§81]] |
| **Derives from** | [[S81 Resume Algorithms|§81]], [[S14 Resume Intelligence|§14]] |
| **Test name** | `test_plx_res_022` |

### PLX-RES-023

Noise removal (stage 3) **MUST** be reversible: removed Events **MUST** remain reachable through the disclosure path of `[[REQ-UX#PLX-UX-051|PLX-UX-051]]`.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S81 Resume Algorithms|§81]] |
| **Derives from** | [[S81 Resume Algorithms|§81]], [[S23 Resume Experience|§23]] |
| **Test name** | `test_plx_res_023` |
