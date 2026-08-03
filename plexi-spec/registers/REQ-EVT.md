---
type: requirement-register
area: EVT
domain: "Events, event store & contracts"
count: 24
tags:
  - requirements
  - area/evt
---

# REQ-EVT — Events, event store & contracts

24 normative requirements. Identifiers are permanent and never reused.

> [!important] For Claude Code
> Every requirement below is binding. Cite the ID in the test name that verifies it (`test_plx_evt_010_*`) so [[S74 Definition of Done|§74]] gate 13 (requirement-to-test traceability) can be machine-checked.

| ID | § | V | Summary |
|---|---|---|---|
| [[#PLX-EVT-010]] | §35 | T, I | Events MUST be immutable once written. The Event Store MUST NOT expose update or delete operations for Event records through any i |
| [[#PLX-EVT-011]] | §35 | T | Every Event MUST carry correlationId and, where it was caused by another Event or a command, causationId, so that any derived stat |
| [[#PLX-EVT-012]] | §35 | T | Every Event MUST carry a snapshot of the permissions in effect at emission, so that historical replay evaluates access against the |
| [[#PLX-EVT-013]] | §35 | T | Events MUST distinguish occurrence time (timestamp) from ingestion time (recordedAt). Consumers MUST order by sequence within a pa |
| [[#PLX-EVT-014]] | §35 | T, I | Event emission and the corresponding state mutation MUST be atomic. Implementations MUST use a transactional outbox or an equivale |
| [[#PLX-EVT-015]] | §35 | T | Every Event consumer MUST be idempotent. Consumers MUST tolerate at-least-once delivery and duplicate delivery without producing d |
| [[#PLX-EVT-020]] | §48 | T, A | Deterministic processing of an Event MUST complete before any AI reasoning is invoked on that Event. AI invocation MUST NOT be a p |
| [[#PLX-EVT-021]] | §48 | T | Failure or unavailability of AI reasoning MUST NOT prevent Event processing, Context Health computation or Resume generation from  |
| [[#PLX-EVT-022]] | §48 | T, A | The Event Bus MUST preserve ordering within a partition. The partition key MUST be deskId for Desk-scoped Events and objectId for  |
| [[#PLX-EVT-023]] | §48 | T | Every Event MUST be assigned to exactly one of the categories in §48.2, and the category MUST be carried on the wire. |
| [[#PLX-EVT-024]] | §48 | T | Consumers MUST handle out-of-order delivery across partitions and MUST NOT assume global total ordering. |
| [[#PLX-EVT-030]] | §49 | T, I | The Event Store MUST be immutable and append-only. No interface, including administrative and database-level access, MUST permit u |
| [[#PLX-EVT-031]] | §49 | T | The Event Store MUST support full and selective replay, reconstructing the state of any Desk at any point in its history. |
| [[#PLX-EVT-032]] | §49 | T, I | The Event Store MUST be time-indexed and tenant-isolated, and MUST be encrypted at rest with tenant-scoped key material. |
| [[#PLX-EVT-033]] | §49 | T | Replay MUST evaluate access against the permission snapshot carried on each Event (PLX-EVT-012), not against current permissions. |
| [[#PLX-EVT-034]] | §49 | T, I | Personal data within Event payloads MUST be stored under per-subject encryption keys such that destruction of the key renders that |
| [[#PLX-EVT-035]] | §49 | T, I | Event schema evolution MUST be supported by an upcasting layer. Readers MUST be able to interpret every schema version ever writte |
| [[#PLX-EVT-036]] | §49 | T | The platform MUST define and enforce a maximum Event payload size, and MUST reject oversized Events rather than truncating them. L |
| [[#PLX-EVT-040]] | §64 | T | Every Event MUST conform to CloudEvents v1.0.2 structure and MUST carry the Plexi extension attributes of §64.1. |
| [[#PLX-EVT-041]] | §64 | T, I | Event type names MUST be past tense and MUST carry an explicit version suffix. Command-shaped event names MUST be rejected in CI b |
| [[#PLX-EVT-042]] | §64 | T | Producers MUST guarantee that source + id is unique for each distinct Event. |
| [[#PLX-EVT-043]] | §64 | T, I | Every Event type MUST have a published JSON Schema at a stable dataschema URI, versioned, and validated in CI against every produc |
| [[#PLX-EVT-044]] | §64 | I, T | A breaking change to an Event schema MUST be published as a new type version. Existing type versions MUST NOT be redefined. |
| [[#PLX-EVT-045]] | §64 | T | Large state payloads MUST be carried as content digests, not inline (PLX-DOM-032). |

---

### PLX-EVT-010

Events **MUST** be immutable once written. The Event Store **MUST NOT** expose update or delete operations for Event records through any interface, including administrative interfaces.

| | |
|---|---|
| **Verification** | `T, I` |
| **Defined in** | [[S35 Event Entity|§35]] |
| **Derives from** | §35.4, [[S49 Event Store|§49]] |
| **Test name** | `test_plx_evt_010` |

### PLX-EVT-011

Every Event **MUST** carry `correlationId` and, where it was caused by another Event or a command, `causationId`, so that any derived state can be traced to its originating user action.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S35 Event Entity|§35]] |
| **Derives from** | §35.2, new |
| **Test name** | `test_plx_evt_011` |

### PLX-EVT-012

Every Event **MUST** carry a snapshot of the permissions in effect at emission, so that historical replay evaluates access against the permissions of the time, not of today.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S35 Event Entity|§35]] |
| **Derives from** | §35.2, new |
| **Test name** | `test_plx_evt_012` |

### PLX-EVT-013

Events **MUST** distinguish occurrence time (`timestamp`) from ingestion time (`recordedAt`). Consumers **MUST** order by `sequence` within a partition, never by wall-clock timestamp.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S35 Event Entity|§35]] |
| **Derives from** | §35.2, new |
| **Test name** | `test_plx_evt_013` |

### PLX-EVT-014

Event emission and the corresponding state mutation **MUST** be atomic. Implementations **MUST** use a transactional outbox or an equivalent mechanism guaranteeing that no state change is committed without its Event, and no Event is published without its state change.

| | |
|---|---|
| **Verification** | `T, I` |
| **Defined in** | [[S35 Event Entity|§35]] |
| **Derives from** | [[S48 Event Architecture|§48]], new |
| **Test name** | `test_plx_evt_014` |

### PLX-EVT-015

Every Event consumer **MUST** be idempotent. Consumers **MUST** tolerate at-least-once delivery and duplicate delivery without producing duplicate derived state.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S35 Event Entity|§35]] |
| **Derives from** | [[S48 Event Architecture|§48]], new |
| **Test name** | `test_plx_evt_015` |

### PLX-EVT-020

Deterministic processing of an Event **MUST** complete before any AI reasoning is invoked on that Event. AI invocation **MUST NOT** be a precondition for any Context Health transition, Relationship confirmation or Resume update.

| | |
|---|---|
| **Verification** | `T, A` |
| **Defined in** | [[S48 Event Architecture|§48]] |
| **Derives from** | [[S48 Event Architecture|§48]] |
| **Test name** | `test_plx_evt_020` |

### PLX-EVT-021

Failure or unavailability of AI reasoning **MUST NOT** prevent Event processing, Context Health computation or Resume generation from completing.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S48 Event Architecture|§48]] |
| **Derives from** | [[S48 Event Architecture|§48]], [[S45 Platform Architecture|§45]] |
| **Test name** | `test_plx_evt_021` |

### PLX-EVT-022

The Event Bus **MUST** preserve ordering within a partition. The partition key **MUST** be `deskId` for Desk-scoped Events and `objectId` for Object-scoped Events, so that causally related Events are never reordered relative to one another.

| | |
|---|---|
| **Verification** | `T, A` |
| **Defined in** | [[S48 Event Architecture|§48]] |
| **Derives from** | [[S48 Event Architecture|§48]], new |
| **Test name** | `test_plx_evt_022` |

### PLX-EVT-023

Every Event **MUST** be assigned to exactly one of the categories in §48.2, and the category **MUST** be carried on the wire.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S48 Event Architecture|§48]] |
| **Derives from** | §48.2, new |
| **Test name** | `test_plx_evt_023` |

### PLX-EVT-024

Consumers **MUST** handle out-of-order delivery across partitions and **MUST NOT** assume global total ordering.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S48 Event Architecture|§48]] |
| **Derives from** | [[S48 Event Architecture|§48]], new |
| **Test name** | `test_plx_evt_024` |

### PLX-EVT-030

The Event Store **MUST** be immutable and append-only. No interface, including administrative and database-level access, **MUST** permit update or deletion of a written Event.

| | |
|---|---|
| **Verification** | `T, I` |
| **Defined in** | [[S49 Event Store|§49]] |
| **Derives from** | [[S49 Event Store|§49]] |
| **Test name** | `test_plx_evt_030` |

### PLX-EVT-031

The Event Store **MUST** support full and selective replay, reconstructing the state of any Desk at any point in its history.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S49 Event Store|§49]] |
| **Derives from** | [[S49 Event Store|§49]] |
| **Test name** | `test_plx_evt_031` |

### PLX-EVT-032

The Event Store **MUST** be time-indexed and tenant-isolated, and **MUST** be encrypted at rest with tenant-scoped key material.

| | |
|---|---|
| **Verification** | `T, I` |
| **Defined in** | [[S49 Event Store|§49]] |
| **Derives from** | [[S49 Event Store|§49]] |
| **Test name** | `test_plx_evt_032` |

### PLX-EVT-033

Replay **MUST** evaluate access against the permission snapshot carried on each Event (`[[REQ-EVT#PLX-EVT-012|PLX-EVT-012]]`), not against current permissions.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S49 Event Store|§49]] |
| **Derives from** | [[S49 Event Store|§49]], new |
| **Test name** | `test_plx_evt_033` |

### PLX-EVT-034

Personal data within Event payloads **MUST** be stored under per-subject encryption keys such that destruction of the key renders that data permanently unrecoverable without modifying any Event record.

| | |
|---|---|
| **Verification** | `T, I` |
| **Defined in** | [[S49 Event Store|§49]] |
| **Derives from** | [[S49 Event Store|§49]], §69.7, new |
| **Test name** | `test_plx_evt_034` |

### PLX-EVT-035

Event schema evolution **MUST** be supported by an upcasting layer. Readers **MUST** be able to interpret every schema version ever written. Upcasters **MUST** be versioned, tested against archived fixtures of each historical schema, and retained indefinitely.

| | |
|---|---|
| **Verification** | `T, I` |
| **Defined in** | [[S49 Event Store|§49]] |
| **Derives from** | [[S49 Event Store|§49]], new |
| **Test name** | `test_plx_evt_035` |

### PLX-EVT-036

The platform **MUST** define and enforce a maximum Event payload size, and **MUST** reject oversized Events rather than truncating them. Large content **MUST** be referenced by digest (`[[REQ-DOM#PLX-DOM-032|PLX-DOM-032]]`).

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S49 Event Store|§49]] |
| **Derives from** | [[S49 Event Store|§49]], new |
| **Test name** | `test_plx_evt_036` |

### PLX-EVT-040

Every Event **MUST** conform to CloudEvents v1.0.2 structure and **MUST** carry the Plexi extension attributes of §64.1.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S64 Event Contracts|§64]] |
| **Derives from** | [[S64 Event Contracts|§64]], new |
| **Test name** | `test_plx_evt_040` |

### PLX-EVT-041

Event type names **MUST** be past tense and **MUST** carry an explicit version suffix. Command-shaped event names **MUST** be rejected in CI by a naming lint.

| | |
|---|---|
| **Verification** | `T, I` |
| **Defined in** | [[S64 Event Contracts|§64]] |
| **Derives from** | §64.2 |
| **Test name** | `test_plx_evt_041` |

### PLX-EVT-042

Producers **MUST** guarantee that `source` + `id` is unique for each distinct Event.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S64 Event Contracts|§64]] |
| **Derives from** | [[S64 Event Contracts|§64]], RFC/CE |
| **Test name** | `test_plx_evt_042` |

### PLX-EVT-043

Every Event type **MUST** have a published JSON Schema at a stable `dataschema` URI, versioned, and validated in CI against every producer and consumer.

| | |
|---|---|
| **Verification** | `T, I` |
| **Defined in** | [[S64 Event Contracts|§64]] |
| **Derives from** | [[S64 Event Contracts|§64]], new |
| **Test name** | `test_plx_evt_043` |

### PLX-EVT-044

A breaking change to an Event schema **MUST** be published as a new type version. Existing type versions **MUST NOT** be redefined.

| | |
|---|---|
| **Verification** | `I, T` |
| **Defined in** | [[S64 Event Contracts|§64]] |
| **Derives from** | [[S64 Event Contracts|§64]], [[S49 Event Store|§49]] |
| **Test name** | `test_plx_evt_044` |

### PLX-EVT-045

Large state payloads **MUST** be carried as content digests, not inline (`[[REQ-DOM#PLX-DOM-032|PLX-DOM-032]]`).

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S64 Event Contracts|§64]] |
| **Derives from** | [[S64 Event Contracts|§64]], [[S34 Object Entity|§34]] |
| **Test name** | `test_plx_evt_045` |
