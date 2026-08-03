---
id: S73
section: §73
title: "Engineering Standards"
part: VI
type: section
defines:
  - PLX-AI-004
  - PLX-ARC-022
  - PLX-ENG-001
  - PLX-ENG-010
  - PLX-ENG-011
  - PLX-ENG-012
  - PLX-ENG-013
  - PLX-ENG-014
  - PLX-ENG-015
  - PLX-ENG-016
  - PLX-EVT-021
tags:
  - section
  - part/vi
---

# §73 Engineering Standards

◀ [[S72 Observability]] · [[Part VI — Data, APIs, Security & Engineering Standards|▲ Part VI]] · [[S74 Definition of Done]] ▶

---

### 73.1 Code

Readable before clever · business language over technical language · single responsibility · explicit interfaces · dependency injection · immutable events · versioned APIs.

### 73.2 Testing

Unit · integration · contract · event replay · AI evaluation · performance · security · accessibility · chaos.

### 73.3 Documentation

Every service requires: purpose · responsibilities · dependencies · API specification · event contracts · failure modes · recovery procedures · monitoring guidance · security considerations · AI interaction rules.

### 73.4 Requirements

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-ENG#PLX-ENG-010|PLX-ENG-010]] | Every change **MUST** be evaluated against [[S06 Product Philosophy|§6]] Philosophy 1: a change that increases functionality while reducing the accuracy or freshness of Context **MUST** be rejected. | I | [[S60 Engineering Principle|§60]], [[S75 Engineering Manifesto|§75]] |
| [[REQ-ENG#PLX-ENG-011|PLX-ENG-011]] | Contract tests **MUST** exist between every producer and consumer of an Event type and every API client and server, and **MUST** run in CI. | T | §73.2 |
| [[REQ-ENG#PLX-ENG-012|PLX-ENG-012]] | Event replay tests **MUST** verify that replaying a recorded Event stream reproduces identical derived state, and **MUST** run against every derived store. | T | §73.2, [[S62 Canonical Data Architecture|§62]] |
| [[REQ-ENG#PLX-ENG-013|PLX-ENG-013]] | AI evaluation tests **MUST** run against every supported model on every release, with recorded pass thresholds per prompt type (`[[REQ-AI#PLX-AI-004|PLX-AI-004]]`). | T | §73.2, [[S55 AI Orchestration|§55]] |
| [[REQ-ENG#PLX-ENG-014|PLX-ENG-014]] | Every invariant in Appendix B **MUST** have an automated detection test (`[[REQ-ENG#PLX-ENG-001|PLX-ENG-001]]`). | T | [[S59 Architectural Invariants|§59]] |
| [[REQ-ENG#PLX-ENG-015|PLX-ENG-015]] | Chaos testing **MUST** include AI provider unavailability, Event Bus partition loss, consumer lag and derived-store divergence, verifying `[[REQ-ARC#PLX-ARC-022|PLX-ARC-022]]` and `[[REQ-EVT#PLX-EVT-021|PLX-EVT-021]]`. | T | §73.2, new |
| [[REQ-ENG#PLX-ENG-016|PLX-ENG-016]] | Every service **MUST** publish the documentation set of §73.3 before production deployment. Deployment without it **MUST** be blocked. | I | §73.3 |

---

---

## Requirements defined or cited here

- [[REQ-AI#PLX-AI-004|PLX-AI-004]] — Provider substitution **MUST** be verifiable by an evaluation suite executed against every supported model, wi
- [[REQ-ARC#PLX-ARC-022|PLX-ARC-022]] — No service **MUST** require synchronous availability of the AI Orchestrator to serve its core capability. Loss
- [[REQ-ENG#PLX-ENG-001|PLX-ENG-001]] — Every invariant in Appendix B **MUST** have at least one automated detection test that fails if the invariant
- [[REQ-ENG#PLX-ENG-010|PLX-ENG-010]] — Every change **MUST** be evaluated against §6 Philosophy 1: a change that increases functionality while reduci
- [[REQ-ENG#PLX-ENG-011|PLX-ENG-011]] — Contract tests **MUST** exist between every producer and consumer of an Event type and every API client and se
- [[REQ-ENG#PLX-ENG-012|PLX-ENG-012]] — Event replay tests **MUST** verify that replaying a recorded Event stream reproduces identical derived state,
- [[REQ-ENG#PLX-ENG-013|PLX-ENG-013]] — AI evaluation tests **MUST** run against every supported model on every release, with recorded pass thresholds
- [[REQ-ENG#PLX-ENG-014|PLX-ENG-014]] — Every invariant in Appendix B **MUST** have an automated detection test (`PLX-ENG-001`).
- [[REQ-ENG#PLX-ENG-015|PLX-ENG-015]] — Chaos testing **MUST** include AI provider unavailability, Event Bus partition loss, consumer lag and derived-
- [[REQ-ENG#PLX-ENG-016|PLX-ENG-016]] — Every service **MUST** publish the documentation set of §73.3 before production deployment. Deployment without
- [[REQ-EVT#PLX-EVT-021|PLX-EVT-021]] — Failure or unavailability of AI reasoning **MUST NOT** prevent Event processing, Context Health computation or

◀ [[S72 Observability]] · [[Part VI — Data, APIs, Security & Engineering Standards|▲ Part VI]] · [[S74 Definition of Done]] ▶
