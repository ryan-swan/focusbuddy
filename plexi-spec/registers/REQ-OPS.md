---
type: requirement-register
area: OPS
domain: "Deployment & observability"
count: 9
tags:
  - requirements
  - area/ops
---

# REQ-OPS — Deployment & observability

9 normative requirements. Identifiers are permanent and never reused.

> [!important] For Claude Code
> Every requirement below is binding. Cite the ID in the test name that verifies it (`test_plx_ops_001_*`) so [[S74 Definition of Done|§74]] gate 13 (requirement-to-test traceability) can be machine-checked.

| ID | § | V | Summary |
|---|---|---|---|
| [[#PLX-OPS-001]] | §71 | T, D | Every service MUST be deployable as a container with no host-specific dependencies and MUST support rolling deployment without dow |
| [[#PLX-OPS-002]] | §71 | I | The tenant isolation model (silo, pool or bridge) MUST be an explicit, recorded per-deployment decision, and the chosen model MUST |
| [[#PLX-OPS-003]] | §71 | T, I | Regional deployment MUST enforce data residency for storage, processing, backups and AI inference (PLX-SEC-025). |
| [[#PLX-OPS-004]] | §71 | T, I | Every deployment topology offered commercially MUST be continuously exercised in CI. A topology that is not tested MUST NOT be off |
| [[#PLX-OPS-010]] | §72 | T, I | Every service MUST emit metrics, structured logs and distributed traces using OpenTelemetry semantics, with correlationId propagat |
| [[#PLX-OPS-011]] | §72 | I, A | Every target in §58 MUST have a corresponding production SLI, an alert threshold and an error budget. |
| [[#PLX-OPS-012]] | §72 | T | AI cost and token usage MUST be observable per tenant, per Desk, per prompt type and per model. |
| [[#PLX-OPS-013]] | §72 | T, I | Logs MUST NOT contain Object content, personal data or prompt content. Content MUST be referenced by identifier and digest. |
| [[#PLX-OPS-014]] | §72 | T, I | Event Store lag, derived-store rebuild lag and consumer lag per partition MUST be measured and alerted, as these are the platform' |

---

### PLX-OPS-001

Every service **MUST** be deployable as a container with no host-specific dependencies and **MUST** support rolling deployment without downtime.

| | |
|---|---|
| **Verification** | `T, D` |
| **Defined in** | [[S71 Deployment Architecture|§71]] |
| **Derives from** | [[S71 Deployment Architecture|§71]] |
| **Test name** | `test_plx_ops_001` |

### PLX-OPS-002

The tenant isolation model (`silo`, `pool` or `bridge`) **MUST** be an explicit, recorded per-deployment decision, and the chosen model **MUST** be documented per store, not only per platform.

| | |
|---|---|
| **Verification** | `I` |
| **Defined in** | [[S71 Deployment Architecture|§71]] |
| **Derives from** | [[S71 Deployment Architecture|§71]], [[S42 Organisation Entity|§42]], new |
| **Test name** | `test_plx_ops_002` |

### PLX-OPS-003

Regional deployment **MUST** enforce data residency for storage, processing, backups and AI inference (`[[REQ-SEC#PLX-SEC-025|PLX-SEC-025]]`).

| | |
|---|---|
| **Verification** | `T, I` |
| **Defined in** | [[S71 Deployment Architecture|§71]] |
| **Derives from** | [[S71 Deployment Architecture|§71]] |
| **Test name** | `test_plx_ops_003` |

### PLX-OPS-004

Every deployment topology offered commercially **MUST** be continuously exercised in CI. A topology that is not tested **MUST NOT** be offered.

| | |
|---|---|
| **Verification** | `T, I` |
| **Defined in** | [[S71 Deployment Architecture|§71]] |
| **Derives from** | [[S71 Deployment Architecture|§71]], new |
| **Test name** | `test_plx_ops_004` |

### PLX-OPS-010

Every service **MUST** emit metrics, structured logs and distributed traces using OpenTelemetry semantics, with `correlationId` propagated end to end from user action through every derived effect.

| | |
|---|---|
| **Verification** | `T, I` |
| **Defined in** | [[S72 Observability|§72]] |
| **Derives from** | [[S72 Observability|§72]] |
| **Test name** | `test_plx_ops_010` |

### PLX-OPS-011

Every target in [[S58 Performance Requirements|§58]] **MUST** have a corresponding production SLI, an alert threshold and an error budget.

| | |
|---|---|
| **Verification** | `I, A` |
| **Defined in** | [[S72 Observability|§72]] |
| **Derives from** | [[S58 Performance Requirements|§58]], [[S72 Observability|§72]] |
| **Test name** | `test_plx_ops_011` |

### PLX-OPS-012

AI cost and token usage **MUST** be observable per tenant, per Desk, per prompt type and per model.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S72 Observability|§72]] |
| **Derives from** | [[S72 Observability|§72]], [[S68 AI Cost Optimisation|§68]] |
| **Test name** | `test_plx_ops_012` |

### PLX-OPS-013

Logs **MUST NOT** contain Object content, personal data or prompt content. Content **MUST** be referenced by identifier and digest.

| | |
|---|---|
| **Verification** | `T, I` |
| **Defined in** | [[S72 Observability|§72]] |
| **Derives from** | [[S72 Observability|§72]], new |
| **Test name** | `test_plx_ops_013` |

### PLX-OPS-014

Event Store lag, derived-store rebuild lag and consumer lag per partition **MUST** be measured and alerted, as these are the platform's primary silent-failure modes.

| | |
|---|---|
| **Verification** | `T, I` |
| **Defined in** | [[S72 Observability|§72]] |
| **Derives from** | [[S72 Observability|§72]], new |
| **Test name** | `test_plx_ops_014` |
