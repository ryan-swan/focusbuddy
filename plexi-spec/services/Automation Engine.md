---
type: service-brief
service: "Automation Engine"
spec_section: §47.9
requirements: 5
tags:
  - service
  - implementation-brief
blocked_by:
  - PLX-RSK-10
---

# Automation Engine — implementation brief

[[Home|▲ Home]] · [[S47 Service Architecture|§47 Service Architecture]] · [[S46 High-Level System Architecture|§46 Topology]]

> [!abstract] What this note is
> Everything binding on this service, in one file. Read this before writing any of it.
> Nothing here is optional and nothing here is a summary — each requirement is quoted in full.

## Boundary

**Owns** — Workflow execution · triggers · actions · scheduling · approvals · long-running workflows

**MUST NOT** — Executing an action exceeding the initiating principal's permissions

**Datastore** — Workflow DB (durable execution state)  *(owned exclusively; see [[REQ-ARC#PLX-ARC-001|PLX-ARC-001]])*

## Events emitted

- `WorkflowStarted`
- `WorkflowStepCompleted`
- `WorkflowCompleted`
- `WorkflowFailed`
- `ApprovalRequested`
- `ApprovalGranted`
- `ApprovalDeclined`

Emitting an Event not listed here violates the service contract in [[S47 Service Architecture|§47]]. Add it to the contract first.

## Events consumed

- `*all Events as trigger sources*`

## Invariants this service can violate

| ID | Invariant |
|---|---|
| [[Invariants#PLX-INV-02\|PLX-INV-02]] | Every meaningful change produces an Event |
| [[Invariants#PLX-INV-06\|PLX-INV-06]] | Permissions propagate through relationships |

Each MUST have an automated detection test in this service's suite ([[REQ-ENG#PLX-ENG-001|PLX-ENG-001]]).

## Open decisions blocking this service

> [!warning] Do not invent resolutions to these.
> They are unresolved in the specification. If implementation forces the question, stop and record an ADR in `decisions/` rather than choosing silently.

| Risk | Severity | Required by |
|---|---|---|
| [[Risk Register#PLX-RSK-10\|PLX-RSK-10]] — Prompt injection through ingested content | Critical | Phase 3 entry |

---

## Binding requirements (5)

#### [[REQ-DOM#PLX-DOM-040\|PLX-DOM-040]]  ·  `T`  ·  [[S37 Decision Entity|§37]]

`decisionOwner` and every `Approval.approver` **MUST** be a human principal. An Agent or service principal **MUST NOT** be recorded as a Decision owner or approver.

#### [[REQ-EVT#PLX-EVT-015\|PLX-EVT-015]]  ·  `T`  ·  [[S35 Event Entity|§35]]

Every Event consumer **MUST** be idempotent. Consumers **MUST** tolerate at-least-once delivery and duplicate delivery without producing duplicate derived state.

#### [[REQ-SEC#PLX-SEC-020\|PLX-SEC-020]]  ·  `T, I`  ·  [[S69 Security Architecture|§69]]

Authorisation **MUST** be evaluated at the data-access layer of every service. Gateway-level authorisation alone **MUST NOT** be relied upon.

#### [[REQ-SEC#PLX-SEC-021\|PLX-SEC-021]]  ·  `T`  ·  [[S69 Security Architecture|§69]]

Every authorisation decision **MUST** be auditable, recording principal, resource, decision, policy evaluated and timestamp.

#### [[REQ-SEC#PLX-SEC-022\|PLX-SEC-022]]  ·  `T`  ·  [[S69 Security Architecture|§69]]

Temporary permissions **MUST** carry an explicit expiry and **MUST** be revoked automatically. Permission grants without expiry **MUST** be an explicit, audited administrative action.

---

## Definition of done for this service

Every gate in [[S74 Definition of Done|§74]] applies. Service-specific:

- [ ] Every requirement above has a linked passing test named `test_<id>` ([[REQ-ENG#PLX-ENG-021|PLX-ENG-021]])
- [ ] Every invariant above has a detection test that fails when violated ([[REQ-ENG#PLX-ENG-001|PLX-ENG-001]])
- [ ] OpenAPI + AsyncAPI contracts published and validated in CI ([[REQ-ARC#PLX-ARC-020|PLX-ARC-020]])
- [ ] Failure modes and recovery documented ([[REQ-ARC#PLX-ARC-021|PLX-ARC-021]])
- [ ] Contract tests exist against every producer and consumer ([[REQ-ENG#PLX-ENG-011|PLX-ENG-011]])
- [ ] Service degrades deterministically when the AI Orchestrator is unavailable ([[REQ-ARC#PLX-ARC-022|PLX-ARC-022]])
- [ ] Tenant isolation enforced at the storage layer, not application code ([[REQ-SEC#PLX-SEC-010|PLX-SEC-010]])
