---
type: service-brief
service: "Identity Service"
spec_section: §47.11
requirements: 21
tags:
  - service
  - implementation-brief
blocked_by:
  - PLX-RSK-01
  - PLX-RSK-07
  - PLX-RSK-09
  - PLX-RSK-12
---

# Identity Service — implementation brief

[[Home|▲ Home]] · [[S47 Service Architecture|§47 Service Architecture]] · [[S46 High-Level System Architecture|§46 Topology]]

> [!abstract] What this note is
> Everything binding on this service, in one file. Read this before writing any of it.
> Nothing here is optional and nothing here is a summary — each requirement is quoted in full.

## Boundary

**Owns** — Authentication · authorisation · users · groups · roles · permissions · audit

**MUST NOT** — Being bypassed by any service for authorisation decisions

**Datastore** — Relational (identity, roles, policy)  *(owned exclusively; see [[REQ-ARC#PLX-ARC-001|PLX-ARC-001]])*

## Events emitted

- `UserCreated`
- `UserDeactivated`
- `RoleAssigned`
- `PermissionChanged`
- `AuthenticationFailed`
- `PolicyChanged`
- `ErasureExecuted`

Emitting an Event not listed here violates the service contract in [[S47 Service Architecture|§47]]. Add it to the contract first.

## Service level objectives

| ID | Target |
|---|---|
| [[REQ-PERF#PLX-PERF-060|PLX-PERF-060]] | Authorisation decision — p50 3 ms, p95 10 ms, p99 25 ms. Measured: Policy query → decision. |

Measured at reference load defined in [[S58 Performance Requirements|§58]]. A target without production instrumentation MUST NOT be claimed as met ([[REQ-PERF#PLX-PERF-070|PLX-PERF-070]]).

## Invariants this service can violate

| ID | Invariant |
|---|---|
| [[Invariants#PLX-INV-06\|PLX-INV-06]] | Permissions propagate through relationships |

Each MUST have an automated detection test in this service's suite ([[REQ-ENG#PLX-ENG-001|PLX-ENG-001]]).

## Open decisions blocking this service

> [!warning] Do not invent resolutions to these.
> They are unresolved in the specification. If implementation forces the question, stop and record an ADR in `decisions/` rather than choosing silently.

| Risk | Severity | Required by |
|---|---|---|
| [[Risk Register#PLX-RSK-01\|PLX-RSK-01]] — Immutable history vs right to erasure | Critical | first production Event |
| [[Risk Register#PLX-RSK-07\|PLX-RSK-07]] — Tenant isolation model per store | Critical | Phase 1 design |
| [[Risk Register#PLX-RSK-09\|PLX-RSK-09]] — Relationship existence as protected fact | Critical | Phase 2 entry |
| [[Risk Register#PLX-RSK-12\|PLX-RSK-12]] — Presence telemetry as surveillance | High | Phase 1 exit |

---

## Binding requirements (21)

#### [[REQ-PRD#PLX-PRD-070\|PLX-PRD-070]]  ·  `T`  ·  [[S17 Organisational Intelligence|§17]]

Cross-Desk awareness statements **MUST** be permission-filtered per recipient. A statement **MUST NOT** be rendered if doing so would disclose the existence, name, or attributes of an Object, Desk or Decision the recipient is not permitted to know exists.

#### [[REQ-PRD#PLX-PRD-071\|PLX-PRD-071]]  ·  `T, I`  ·  [[S17 Organisational Intelligence|§17]]

Where a cross-Desk dependency exists but the recipient lacks permission to see its subject, the platform **MUST** either suppress the statement entirely or render a permission-safe form that discloses no protected attribute, according to tenant policy. The chosen behaviour **MUST** be configurable and auditable.

#### [[REQ-PRD#PLX-PRD-072\|PLX-PRD-072]]  ·  `T`  ·  [[S17 Organisational Intelligence|§17]]

Departure of a user (deactivation) **MUST NOT** remove Objects, Decisions, Relationships or Events they authored, and **MUST** trigger an ownership reassignment workflow for Objects they owned.

#### [[REQ-EVT#PLX-EVT-012\|PLX-EVT-012]]  ·  `T`  ·  [[S35 Event Entity|§35]]

Every Event **MUST** carry a snapshot of the permissions in effect at emission, so that historical replay evaluates access against the permissions of the time, not of today.

#### [[REQ-EVT#PLX-EVT-033\|PLX-EVT-033]]  ·  `T`  ·  [[S49 Event Store|§49]]

Replay **MUST** evaluate access against the permission snapshot carried on each Event (`[[REQ-EVT#PLX-EVT-012|PLX-EVT-012]]`), not against current permissions.

#### [[REQ-AGT#PLX-AGT-001\|PLX-AGT-001]]  ·  `T`  ·  [[S41 Agent Entity|§41]]

An Agent's effective permissions **MUST** be a subset of the permissions of the principal on whose behalf it acts. Permission checks **MUST** be enforced at the data-access layer, not only at the orchestration layer.

#### [[REQ-AGT#PLX-AGT-005\|PLX-AGT-005]]  ·  `T`  ·  [[S41 Agent Entity|§41]]

Every Agent **MUST** have exactly one `actsOnBehalfOf` human principal at any moment. An Agent with no accountable human principal **MUST** be suspended.

#### [[REQ-SEC#PLX-SEC-010\|PLX-SEC-010]]  ·  `T, I`  ·  [[S42 Organisation Entity|§42]]

Every store — relational, document, event, graph, vector and search — **MUST** enforce tenant isolation at the storage layer, including namespace or row-level security in the graph and vector stores.

#### [[REQ-SEC#PLX-SEC-011\|PLX-SEC-011]]  ·  `T, A`  ·  [[S42 Organisation Entity|§42]]

Cross-Organisation traversal, search or reasoning **MUST** be impossible by construction. No API, query path, agent tool or administrative interface **MUST** be capable of returning data from more than one `organisationId` in a single result.

#### [[REQ-SEC#PLX-SEC-020\|PLX-SEC-020]]  ·  `T, I`  ·  [[S69 Security Architecture|§69]]

Authorisation **MUST** be evaluated at the data-access layer of every service. Gateway-level authorisation alone **MUST NOT** be relied upon.

#### [[REQ-SEC#PLX-SEC-021\|PLX-SEC-021]]  ·  `T`  ·  [[S69 Security Architecture|§69]]

Every authorisation decision **MUST** be auditable, recording principal, resource, decision, policy evaluated and timestamp.

#### [[REQ-SEC#PLX-SEC-022\|PLX-SEC-022]]  ·  `T`  ·  [[S69 Security Architecture|§69]]

Temporary permissions **MUST** carry an explicit expiry and **MUST** be revoked automatically. Permission grants without expiry **MUST** be an explicit, audited administrative action.

#### [[REQ-SEC#PLX-SEC-023\|PLX-SEC-023]]  ·  `T, A`  ·  [[S69 Security Architecture|§69]]

Permission changes **MUST** propagate to derived stores — search index, vector index, graph, materialised Context Health — within `[[REQ-PERF#PLX-PERF-021|PLX-PERF-021]]`, and stale permission state **MUST** fail closed.

#### [[REQ-SEC#PLX-SEC-024\|PLX-SEC-024]]  ·  `T, I`  ·  [[S69 Security Architecture|§69]]

All secrets **MUST** be stored in a managed vault with automatic rotation. Secrets **MUST NOT** appear in configuration files, environment variables in images, logs, Event payloads or prompts.

#### [[REQ-SEC#PLX-SEC-025\|PLX-SEC-025]]  ·  `T, I`  ·  [[S69 Security Architecture|§69]]

Data residency **MUST** be enforceable per Organisation, including for AI inference. A tenant with an EU residency requirement **MUST NOT** have content dispatched to a model endpoint outside the permitted region.

#### [[REQ-SEC#PLX-SEC-026\|PLX-SEC-026]]  ·  `T, I`  ·  [[S69 Security Architecture|§69]]

The platform **MUST** support customer-managed encryption keys for tenants requiring them, with key revocation rendering tenant data inaccessible.

#### [[REQ-SEC#PLX-SEC-027\|PLX-SEC-027]]  ·  `T`  ·  [[S69 Security Architecture|§69]]

AI-generated content **MUST** be marked as such in storage and in every export (`[[REQ-UX#PLX-UX-062|PLX-UX-062]]`, `[[REQ-DOM#PLX-DOM-014|PLX-DOM-014]]`).

#### [[REQ-SEC#PLX-SEC-030\|PLX-SEC-030]]  ·  `T, I`  ·  [[S69 Security Architecture|§69]]

The platform **MUST** implement cryptographic erasure for personal data: per-subject key material, destroyed on valid erasure request, rendering that subject's personal data permanently unrecoverable without modifying any Event record (§44.1).

#### [[REQ-SEC#PLX-SEC-031\|PLX-SEC-031]]  ·  `I, A`  ·  [[S69 Security Architecture|§69]]

The platform **MUST** maintain a data inventory identifying every location personal data is stored, including derived stores, caches, prompt logs, embeddings and backups, and **MUST** ensure erasure reaches all of them.

#### [[REQ-SEC#PLX-SEC-032\|PLX-SEC-032]]  ·  `D, A`  ·  [[S69 Security Architecture|§69]]

Data subject access requests **MUST** be servicable within the statutory period, including data held in Event history, embeddings and AI memory.

#### [[REQ-SEC#PLX-SEC-033\|PLX-SEC-033]]  ·  `I, T`  ·  [[S69 Security Architecture|§69]]

Presence, focus and dwell telemetry **MUST** be retained under the presence retention class (`[[REQ-UX#PLX-UX-072|PLX-UX-072]]`) and **MUST NOT** be repurposed for performance management or monitoring without an explicit, separately-consented tenant configuration.

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
