---
type: requirement-register
area: ARC
domain: "Platform & service architecture"
count: 6
tags:
  - requirements
  - area/arc
---

# REQ-ARC — Platform & service architecture

6 normative requirements. Identifiers are permanent and never reused.

> [!important] For Claude Code
> Every requirement below is binding. Cite the ID in the test name that verifies it (`test_plx_arc_001_*`) so [[S74 Definition of Done|§74]] gate 13 (requirement-to-test traceability) can be machine-checked.

| ID | § | V | Summary |
|---|---|---|---|
| [[#PLX-ARC-001]] | §45 | I, T | Each service MUST own exactly one business capability and MUST own its own datastore. No service MUST read or write another servic |
| [[#PLX-ARC-002]] | §45 | I, A | Inter-service communication MUST occur exclusively through published APIs and Events. Shared-database integration between services |
| [[#PLX-ARC-010]] | §45 | T, A | Every service MUST be horizontally scalable without coordinated deployment, and MUST tolerate concurrent instances of itself proce |
| [[#PLX-ARC-020]] | §47 | T, I | Every service MUST publish an OpenAPI or equivalent machine-readable contract, and an AsyncAPI or equivalent Event contract, versi |
| [[#PLX-ARC-021]] | §47 | I | Every service MUST document its failure modes and recovery procedures before production deployment (§73). |
| [[#PLX-ARC-022]] | §47 | T, A | No service MUST require synchronous availability of the AI Orchestrator to serve its core capability. Loss of AI availability MUST |

---

### PLX-ARC-001

Each service **MUST** own exactly one business capability and **MUST** own its own datastore. No service **MUST** read or write another service's datastore directly.

| | |
|---|---|
| **Verification** | `I, T` |
| **Defined in** | [[S45 Platform Architecture|§45]] |
| **Derives from** | [[S45 Platform Architecture|§45]], [[S46 High-Level System Architecture|§46]] |
| **Test name** | `test_plx_arc_001` |

### PLX-ARC-002

Inter-service communication **MUST** occur exclusively through published APIs and Events. Shared-database integration between services **MUST NOT** be used.

| | |
|---|---|
| **Verification** | `I, A` |
| **Defined in** | [[S45 Platform Architecture|§45]] |
| **Derives from** | [[S46 High-Level System Architecture|§46]] |
| **Test name** | `test_plx_arc_002` |

### PLX-ARC-010

Every service **MUST** be horizontally scalable without coordinated deployment, and **MUST** tolerate concurrent instances of itself processing the same event stream partition set.

| | |
|---|---|
| **Verification** | `T, A` |
| **Defined in** | [[S45 Platform Architecture|§45]] |
| **Derives from** | [[S45 Platform Architecture|§45]] |
| **Test name** | `test_plx_arc_010` |

### PLX-ARC-020

Every service **MUST** publish an OpenAPI or equivalent machine-readable contract, and an AsyncAPI or equivalent Event contract, versioned and validated in CI.

| | |
|---|---|
| **Verification** | `T, I` |
| **Defined in** | [[S47 Service Architecture|§47]] |
| **Derives from** | [[S47 Service Architecture|§47]], [[S73 Engineering Standards|§73]] |
| **Test name** | `test_plx_arc_020` |

### PLX-ARC-021

Every service **MUST** document its failure modes and recovery procedures before production deployment ([[S73 Engineering Standards|§73]]).

| | |
|---|---|
| **Verification** | `I` |
| **Defined in** | [[S47 Service Architecture|§47]] |
| **Derives from** | [[S73 Engineering Standards|§73]] |
| **Test name** | `test_plx_arc_021` |

### PLX-ARC-022

No service **MUST** require synchronous availability of the AI Orchestrator to serve its core capability. Loss of AI availability **MUST** degrade the platform to deterministic operation, not to unavailability.

| | |
|---|---|
| **Verification** | `T, A` |
| **Defined in** | [[S47 Service Architecture|§47]] |
| **Derives from** | [[S45 Platform Architecture|§45]], new |
| **Test name** | `test_plx_arc_022` |
