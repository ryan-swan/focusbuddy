---
type: requirement-register
area: ENG
domain: "Engineering standards"
count: 11
tags:
  - requirements
  - area/eng
---

# REQ-ENG — Engineering standards

11 normative requirements. Identifiers are permanent and never reused.

> [!important] For Claude Code
> Every requirement below is binding. Cite the ID in the test name that verifies it (`test_plx_eng_001_*`) so [[S74 Definition of Done|§74]] gate 13 (requirement-to-test traceability) can be machine-checked.

| ID | § | V | Summary |
|---|---|---|---|
| [[#PLX-ENG-001]] | §59 | T, I | Every invariant in Appendix B MUST have at least one automated detection test that fails if the invariant is violated. Invariants  |
| [[#PLX-ENG-010]] | §73 | I | Every change MUST be evaluated against §6 Philosophy 1: a change that increases functionality while reducing the accuracy or fresh |
| [[#PLX-ENG-011]] | §73 | T | Contract tests MUST exist between every producer and consumer of an Event type and every API client and server, and MUST run in CI |
| [[#PLX-ENG-012]] | §73 | T | Event replay tests MUST verify that replaying a recorded Event stream reproduces identical derived state, and MUST run against eve |
| [[#PLX-ENG-013]] | §73 | T | AI evaluation tests MUST run against every supported model on every release, with recorded pass thresholds per prompt type (PLX-AI |
| [[#PLX-ENG-014]] | §73 | T | Every invariant in Appendix B MUST have an automated detection test (PLX-ENG-001). |
| [[#PLX-ENG-015]] | §73 | T | Chaos testing MUST include AI provider unavailability, Event Bus partition loss, consumer lag and derived-store divergence, verify |
| [[#PLX-ENG-016]] | §73 | I | Every service MUST publish the documentation set of §73.3 before production deployment. Deployment without it MUST be blocked. |
| [[#PLX-ENG-020]] | §74 | I | A feature MUST NOT be marked done with any §74 gate unmet. Exceptions MUST be recorded as accepted risk with a named owner and a r |
| [[#PLX-ENG-021]] | §74 | T, I | Requirement-to-test traceability MUST be machine-checkable. CI MUST report any PLX-* requirement with no linked verifying test. |
| [[#PLX-ENG-030]] | §85 | I | Every item in §85.2 MUST be resolved, with the resolution recorded as an ADR, before the stated milestone. A milestone MUST NOT be |

---

### PLX-ENG-001

Every invariant in Appendix B **MUST** have at least one automated detection test that fails if the invariant is violated. Invariants asserted only in documentation **MUST NOT** be considered enforced.

| | |
|---|---|
| **Verification** | `T, I` |
| **Defined in** | [[S59 Architectural Invariants|§59]] |
| **Derives from** | [[S59 Architectural Invariants|§59]], new |
| **Test name** | `test_plx_eng_001` |

### PLX-ENG-010

Every change **MUST** be evaluated against [[S06 Product Philosophy|§6]] Philosophy 1: a change that increases functionality while reducing the accuracy or freshness of Context **MUST** be rejected.

| | |
|---|---|
| **Verification** | `I` |
| **Defined in** | [[S73 Engineering Standards|§73]] |
| **Derives from** | [[S60 Engineering Principle|§60]], [[S75 Engineering Manifesto|§75]] |
| **Test name** | `test_plx_eng_010` |

### PLX-ENG-011

Contract tests **MUST** exist between every producer and consumer of an Event type and every API client and server, and **MUST** run in CI.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S73 Engineering Standards|§73]] |
| **Derives from** | §73.2 |
| **Test name** | `test_plx_eng_011` |

### PLX-ENG-012

Event replay tests **MUST** verify that replaying a recorded Event stream reproduces identical derived state, and **MUST** run against every derived store.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S73 Engineering Standards|§73]] |
| **Derives from** | §73.2, [[S62 Canonical Data Architecture|§62]] |
| **Test name** | `test_plx_eng_012` |

### PLX-ENG-013

AI evaluation tests **MUST** run against every supported model on every release, with recorded pass thresholds per prompt type (`[[REQ-AI#PLX-AI-004|PLX-AI-004]]`).

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S73 Engineering Standards|§73]] |
| **Derives from** | §73.2, [[S55 AI Orchestration|§55]] |
| **Test name** | `test_plx_eng_013` |

### PLX-ENG-014

Every invariant in Appendix B **MUST** have an automated detection test (`[[REQ-ENG#PLX-ENG-001|PLX-ENG-001]]`).

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S73 Engineering Standards|§73]] |
| **Derives from** | [[S59 Architectural Invariants|§59]] |
| **Test name** | `test_plx_eng_014` |

### PLX-ENG-015

Chaos testing **MUST** include AI provider unavailability, Event Bus partition loss, consumer lag and derived-store divergence, verifying `[[REQ-ARC#PLX-ARC-022|PLX-ARC-022]]` and `[[REQ-EVT#PLX-EVT-021|PLX-EVT-021]]`.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S73 Engineering Standards|§73]] |
| **Derives from** | §73.2, new |
| **Test name** | `test_plx_eng_015` |

### PLX-ENG-016

Every service **MUST** publish the documentation set of §73.3 before production deployment. Deployment without it **MUST** be blocked.

| | |
|---|---|
| **Verification** | `I` |
| **Defined in** | [[S73 Engineering Standards|§73]] |
| **Derives from** | §73.3 |
| **Test name** | `test_plx_eng_016` |

### PLX-ENG-020

A feature **MUST NOT** be marked done with any [[S74 Definition of Done|§74]] gate unmet. Exceptions **MUST** be recorded as accepted risk with a named owner and a remediation date.

| | |
|---|---|
| **Verification** | `I` |
| **Defined in** | [[S74 Definition of Done|§74]] |
| **Derives from** | [[S74 Definition of Done|§74]] |
| **Test name** | `test_plx_eng_020` |

### PLX-ENG-021

Requirement-to-test traceability **MUST** be machine-checkable. CI **MUST** report any `PLX-*` requirement with no linked verifying test.

| | |
|---|---|
| **Verification** | `T, I` |
| **Defined in** | [[S74 Definition of Done|§74]] |
| **Derives from** | [[S74 Definition of Done|§74]], new |
| **Test name** | `test_plx_eng_021` |

### PLX-ENG-030

Every item in §85.2 **MUST** be resolved, with the resolution recorded as an ADR, before the stated milestone. A milestone **MUST NOT** be declared complete with an open foreclosing decision.

| | |
|---|---|
| **Verification** | `I` |
| **Defined in** | [[S85 Five-Year Product Roadmap|§85]] |
| **Derives from** | [[S85 Five-Year Product Roadmap|§85]], new |
| **Test name** | `test_plx_eng_030` |
