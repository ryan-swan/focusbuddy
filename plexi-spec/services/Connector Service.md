---
type: service-brief
service: "Connector Service"
spec_section: §47.1
requirements: 11
tags:
  - service
  - implementation-brief
blocked_by:
  - PLX-RSK-10
---

# Connector Service — implementation brief

[[Home|▲ Home]] · [[S47 Service Architecture|§47 Service Architecture]] · [[S46 High-Level System Architecture|§46 Topology]]

> [!abstract] What this note is
> Everything binding on this service, in one file. Read this before writing any of it.
> Nothing here is optional and nothing here is a summary — each requirement is quoted in full.

## Boundary

**Owns** — External applications · authentication · integrations · webhooks · import · export · sync

**MUST NOT** — Storing third-party credentials outside the credential vault

**Datastore** — Connector config, credential vault references, sync cursors  *(owned exclusively; see [[REQ-ARC#PLX-ARC-001|PLX-ARC-001]])*

## Events emitted

- `ConnectorConnected`
- `ConnectorDisconnected`
- `ConnectorSyncStarted`
- `ConnectorSyncCompleted`
- `ConnectorSyncFailed`
- `ExternalObjectImported`

Emitting an Event not listed here violates the service contract in [[S47 Service Architecture|§47]]. Add it to the contract first.

## Events consumed

- `ObjectUpdated`
- `WorkflowStepCompleted`

## Invariants this service can violate

| ID | Invariant |
|---|---|
| [[Invariants#PLX-INV-06\|PLX-INV-06]] | Permissions propagate through relationships |
| [[Invariants#PLX-INV-13\|PLX-INV-13]] | Context survives application changes |

Each MUST have an automated detection test in this service's suite ([[REQ-ENG#PLX-ENG-001|PLX-ENG-001]]).

## Open decisions blocking this service

> [!warning] Do not invent resolutions to these.
> They are unresolved in the specification. If implementation forces the question, stop and record an ADR in `decisions/` rather than choosing silently.

| Risk | Severity | Required by |
|---|---|---|
| [[Risk Register#PLX-RSK-10\|PLX-RSK-10]] — Prompt injection through ingested content | Critical | Phase 3 entry |

---

## Binding requirements (11)

#### [[REQ-PRIN#PLX-PRIN-002\|PLX-PRIN-002]]  ·  `T`  ·  [[S01 Executive Summary|§1]]

The platform **MUST** preserve context independently of the applications that produced it. Removal, replacement or deprecation of a Connector **MUST NOT** destroy previously captured context, relationships or history relating to Objects sourced through it.

#### [[REQ-EVT#PLX-EVT-015\|PLX-EVT-015]]  ·  `T`  ·  [[S35 Event Entity|§35]]

Every Event consumer **MUST** be idempotent. Consumers **MUST** tolerate at-least-once delivery and duplicate delivery without producing duplicate derived state.

#### [[REQ-CON#PLX-CON-001\|PLX-CON-001]]  ·  `T, I`  ·  [[S57 Connector Framework|§57]]

Every Connector **MUST** declare which capabilities it implements. Consumers **MUST** query declared capabilities rather than assuming them.

#### [[REQ-CON#PLX-CON-002\|PLX-CON-002]]  ·  `T, A`  ·  [[S57 Connector Framework|§57]]

Connectors **MUST** map external permissions into the Plexi permission model, and **MUST NOT** grant a Plexi principal access to external content beyond what the external system grants the linked external principal.

#### [[REQ-CON#PLX-CON-003\|PLX-CON-003]]  ·  `I, T`  ·  [[S57 Connector Framework|§57]]

Where a Connector cannot faithfully represent an external system's permission model, it **MUST** default to the most restrictive interpretation and **MUST** record the limitation in its capability declaration.

#### [[REQ-CON#PLX-CON-004\|PLX-CON-004]]  ·  `T, I`  ·  [[S57 Connector Framework|§57]]

Connector credentials **MUST** be stored in a dedicated credential vault, encrypted with tenant-scoped keys, and **MUST NOT** be readable by any service other than the Connector Service.

#### [[REQ-CON#PLX-CON-005\|PLX-CON-005]]  ·  `T`  ·  [[S57 Connector Framework|§57]]

Connector synchronisation **MUST** be resumable from a durable cursor and **MUST** be idempotent. Re-running a sync **MUST NOT** duplicate Objects or Events.

#### [[REQ-CON#PLX-CON-006\|PLX-CON-006]]  ·  `T`  ·  [[S57 Connector Framework|§57]]

Removal of a Connector **MUST NOT** delete previously imported Objects, Relationships, Events or derived context (`[[REQ-PRIN#PLX-PRIN-002|PLX-PRIN-002]]`).

#### [[REQ-CON#PLX-CON-007\|PLX-CON-007]]  ·  `T, D`  ·  [[S57 Connector Framework|§57]]

Connectors **MUST** implement backoff and rate-limit handling for the external system, and **MUST** surface persistent sync failure as a user-visible state rather than failing silently.

#### [[REQ-DATA#PLX-DATA-006\|PLX-DATA-006]]  ·  `I`  ·  [[S62 Canonical Data Architecture|§62]]

Personal data **MUST** be catalogued per store, with its lawful basis, retention period and erasure mechanism recorded, before that store enters production.

#### [[REQ-SEC#PLX-SEC-024\|PLX-SEC-024]]  ·  `T, I`  ·  [[S69 Security Architecture|§69]]

All secrets **MUST** be stored in a managed vault with automatic rotation. Secrets **MUST NOT** appear in configuration files, environment variables in images, logs, Event payloads or prompts.

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
