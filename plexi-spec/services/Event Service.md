---
type: service-brief
service: "Event Service"
spec_section: §47.3
requirements: 29
tags:
  - service
  - implementation-brief
blocked_by:
  - PLX-RSK-01
  - PLX-RSK-02
  - PLX-RSK-08
---

# Event Service — implementation brief

[[Home|▲ Home]] · [[S47 Service Architecture|§47 Service Architecture]] · [[S46 High-Level System Architecture|§46 Topology]]

> [!abstract] What this note is
> Everything binding on this service, in one file. Read this before writing any of it.
> Nothing here is optional and nothing here is a summary — each requirement is quoted in full.

## Boundary

**Owns** — Event creation · persistence · distribution · replay · audit

**MUST NOT** — Exposing mutation or deletion of Event records via ANY interface

**Datastore** — Event Store (append-only log) + partitioned bus  *(owned exclusively; see [[REQ-ARC#PLX-ARC-001|PLX-ARC-001]])*

## Events emitted

- `ReplayStarted`
- `ReplayCompleted`
- `RetentionPolicyApplied`

Emitting an Event not listed here violates the service contract in [[S47 Service Architecture|§47]]. Add it to the contract first.

## Events consumed

- `*all Events*`

## Service level objectives

| ID | Target |
|---|---|
| [[REQ-PERF#PLX-PERF-030|PLX-PERF-030]] | Event ingestion to Event Store durability — p50 15 ms, p95 50 ms, p99 120 ms. Measured: Emission → fsync acknowledged. |
| [[REQ-PERF#PLX-PERF-031|PLX-PERF-031]] | Event Store → bus delivery to first subscriber — p50 20 ms, p95 80 ms, p99 200 ms. Measured: Store commit → subscriber receipt. |

Measured at reference load defined in [[S58 Performance Requirements|§58]]. A target without production instrumentation MUST NOT be claimed as met ([[REQ-PERF#PLX-PERF-070|PLX-PERF-070]]).

## Invariants this service can violate

| ID | Invariant |
|---|---|
| [[Invariants#PLX-INV-02\|PLX-INV-02]] | Every meaningful change produces an Event |
| [[Invariants#PLX-INV-05\|PLX-INV-05]] | Nothing deletes organisational memory |
| [[Invariants#PLX-INV-08\|PLX-INV-08]] | Every Event is immutable once written |
| [[Invariants#PLX-INV-11\|PLX-INV-11]] | No service bypasses the Event Bus |
| [[Invariants#PLX-INV-12\|PLX-INV-12]] | Workspace Memory is always recoverable |

Each MUST have an automated detection test in this service's suite ([[REQ-ENG#PLX-ENG-001|PLX-ENG-001]]).

## Open decisions blocking this service

> [!warning] Do not invent resolutions to these.
> They are unresolved in the specification. If implementation forces the question, stop and record an ADR in `decisions/` rather than choosing silently.

| Risk | Severity | Required by |
|---|---|---|
| [[Risk Register#PLX-RSK-01\|PLX-RSK-01]] — Immutable history vs right to erasure | Critical | first production Event |
| [[Risk Register#PLX-RSK-02\|PLX-RSK-02]] — Event schema evolution over infinite horizon | Critical | first production Event |
| [[Risk Register#PLX-RSK-08\|PLX-RSK-08]] — Event partition key and ordering | High | first production Event |

---

## Binding requirements (29)

#### [[REQ-EVT#PLX-EVT-010\|PLX-EVT-010]]  ·  `T, I`  ·  [[S35 Event Entity|§35]]

Events **MUST** be immutable once written. The Event Store **MUST NOT** expose update or delete operations for Event records through any interface, including administrative interfaces.

#### [[REQ-EVT#PLX-EVT-011\|PLX-EVT-011]]  ·  `T`  ·  [[S35 Event Entity|§35]]

Every Event **MUST** carry `correlationId` and, where it was caused by another Event or a command, `causationId`, so that any derived state can be traced to its originating user action.

#### [[REQ-EVT#PLX-EVT-012\|PLX-EVT-012]]  ·  `T`  ·  [[S35 Event Entity|§35]]

Every Event **MUST** carry a snapshot of the permissions in effect at emission, so that historical replay evaluates access against the permissions of the time, not of today.

#### [[REQ-EVT#PLX-EVT-013\|PLX-EVT-013]]  ·  `T`  ·  [[S35 Event Entity|§35]]

Events **MUST** distinguish occurrence time (`timestamp`) from ingestion time (`recordedAt`). Consumers **MUST** order by `sequence` within a partition, never by wall-clock timestamp.

#### [[REQ-EVT#PLX-EVT-014\|PLX-EVT-014]]  ·  `T, I`  ·  [[S35 Event Entity|§35]]

Event emission and the corresponding state mutation **MUST** be atomic. Implementations **MUST** use a transactional outbox or an equivalent mechanism guaranteeing that no state change is committed without its Event, and no Event is published without its state change.

#### [[REQ-EVT#PLX-EVT-015\|PLX-EVT-015]]  ·  `T`  ·  [[S35 Event Entity|§35]]

Every Event consumer **MUST** be idempotent. Consumers **MUST** tolerate at-least-once delivery and duplicate delivery without producing duplicate derived state.

#### [[REQ-EVT#PLX-EVT-020\|PLX-EVT-020]]  ·  `T, A`  ·  [[S48 Event Architecture|§48]]

Deterministic processing of an Event **MUST** complete before any AI reasoning is invoked on that Event. AI invocation **MUST NOT** be a precondition for any Context Health transition, Relationship confirmation or Resume update.

#### [[REQ-EVT#PLX-EVT-021\|PLX-EVT-021]]  ·  `T`  ·  [[S48 Event Architecture|§48]]

Failure or unavailability of AI reasoning **MUST NOT** prevent Event processing, Context Health computation or Resume generation from completing.

#### [[REQ-EVT#PLX-EVT-022\|PLX-EVT-022]]  ·  `T, A`  ·  [[S48 Event Architecture|§48]]

The Event Bus **MUST** preserve ordering within a partition. The partition key **MUST** be `deskId` for Desk-scoped Events and `objectId` for Object-scoped Events, so that causally related Events are never reordered relative to one another.

#### [[REQ-EVT#PLX-EVT-023\|PLX-EVT-023]]  ·  `T`  ·  [[S48 Event Architecture|§48]]

Every Event **MUST** be assigned to exactly one of the categories in §48.2, and the category **MUST** be carried on the wire.

#### [[REQ-EVT#PLX-EVT-024\|PLX-EVT-024]]  ·  `T`  ·  [[S48 Event Architecture|§48]]

Consumers **MUST** handle out-of-order delivery across partitions and **MUST NOT** assume global total ordering.

#### [[REQ-EVT#PLX-EVT-030\|PLX-EVT-030]]  ·  `T, I`  ·  [[S49 Event Store|§49]]

The Event Store **MUST** be immutable and append-only. No interface, including administrative and database-level access, **MUST** permit update or deletion of a written Event.

#### [[REQ-EVT#PLX-EVT-031\|PLX-EVT-031]]  ·  `T`  ·  [[S49 Event Store|§49]]

The Event Store **MUST** support full and selective replay, reconstructing the state of any Desk at any point in its history.

#### [[REQ-EVT#PLX-EVT-032\|PLX-EVT-032]]  ·  `T, I`  ·  [[S49 Event Store|§49]]

The Event Store **MUST** be time-indexed and tenant-isolated, and **MUST** be encrypted at rest with tenant-scoped key material.

#### [[REQ-EVT#PLX-EVT-033\|PLX-EVT-033]]  ·  `T`  ·  [[S49 Event Store|§49]]

Replay **MUST** evaluate access against the permission snapshot carried on each Event (`[[REQ-EVT#PLX-EVT-012|PLX-EVT-012]]`), not against current permissions.

#### [[REQ-EVT#PLX-EVT-034\|PLX-EVT-034]]  ·  `T, I`  ·  [[S49 Event Store|§49]]

Personal data within Event payloads **MUST** be stored under per-subject encryption keys such that destruction of the key renders that data permanently unrecoverable without modifying any Event record.

#### [[REQ-EVT#PLX-EVT-035\|PLX-EVT-035]]  ·  `T, I`  ·  [[S49 Event Store|§49]]

Event schema evolution **MUST** be supported by an upcasting layer. Readers **MUST** be able to interpret every schema version ever written. Upcasters **MUST** be versioned, tested against archived fixtures of each historical schema, and retained indefinitely.

#### [[REQ-EVT#PLX-EVT-036\|PLX-EVT-036]]  ·  `T`  ·  [[S49 Event Store|§49]]

The platform **MUST** define and enforce a maximum Event payload size, and **MUST** reject oversized Events rather than truncating them. Large content **MUST** be referenced by digest (`[[REQ-DOM#PLX-DOM-032|PLX-DOM-032]]`).

#### [[REQ-EVT#PLX-EVT-040\|PLX-EVT-040]]  ·  `T`  ·  [[S64 Event Contracts|§64]]

Every Event **MUST** conform to CloudEvents v1.0.2 structure and **MUST** carry the Plexi extension attributes of §64.1.

#### [[REQ-EVT#PLX-EVT-041\|PLX-EVT-041]]  ·  `T, I`  ·  [[S64 Event Contracts|§64]]

Event type names **MUST** be past tense and **MUST** carry an explicit version suffix. Command-shaped event names **MUST** be rejected in CI by a naming lint.

#### [[REQ-EVT#PLX-EVT-042\|PLX-EVT-042]]  ·  `T`  ·  [[S64 Event Contracts|§64]]

Producers **MUST** guarantee that `source` + `id` is unique for each distinct Event.

#### [[REQ-EVT#PLX-EVT-043\|PLX-EVT-043]]  ·  `T, I`  ·  [[S64 Event Contracts|§64]]

Every Event type **MUST** have a published JSON Schema at a stable `dataschema` URI, versioned, and validated in CI against every producer and consumer.

#### [[REQ-EVT#PLX-EVT-044\|PLX-EVT-044]]  ·  `I, T`  ·  [[S64 Event Contracts|§64]]

A breaking change to an Event schema **MUST** be published as a new type version. Existing type versions **MUST NOT** be redefined.

#### [[REQ-EVT#PLX-EVT-045\|PLX-EVT-045]]  ·  `T`  ·  [[S64 Event Contracts|§64]]

Large state payloads **MUST** be carried as content digests, not inline (`[[REQ-DOM#PLX-DOM-032|PLX-DOM-032]]`).

#### [[REQ-DATA#PLX-DATA-002\|PLX-DATA-002]]  ·  `T, A`  ·  [[S62 Canonical Data Architecture|§62]]

Derived stores — graph, vector, search, Context DB, Resume DB — **MUST** be fully rebuildable from the Event Store. Rebuild **MUST** be tested at least once per release train.

#### [[REQ-DATA#PLX-DATA-003\|PLX-DATA-003]]  ·  `I`  ·  [[S62 Canonical Data Architecture|§62]]

Only the Event Store is a system of record for history. Only the Object store is a system of record for current Object content. Every other store **MUST** be treated as a rebuildable projection.

#### [[REQ-SEC#PLX-SEC-030\|PLX-SEC-030]]  ·  `T, I`  ·  [[S69 Security Architecture|§69]]

The platform **MUST** implement cryptographic erasure for personal data: per-subject key material, destroyed on valid erasure request, rendering that subject's personal data permanently unrecoverable without modifying any Event record (§44.1).

#### [[REQ-OPS#PLX-OPS-014\|PLX-OPS-014]]  ·  `T, I`  ·  [[S72 Observability|§72]]

Event Store lag, derived-store rebuild lag and consumer lag per partition **MUST** be measured and alerted, as these are the platform's primary silent-failure modes.

#### [[REQ-ENG#PLX-ENG-012\|PLX-ENG-012]]  ·  `T`  ·  [[S73 Engineering Standards|§73]]

Event replay tests **MUST** verify that replaying a recorded Event stream reproduces identical derived state, and **MUST** run against every derived store.

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
