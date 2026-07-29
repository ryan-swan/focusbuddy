---
id: S49
section: §49
title: "Event Store"
part: V
type: section
defines:
  - PLX-DOM-032
  - PLX-EVT-012
  - PLX-EVT-030
  - PLX-EVT-031
  - PLX-EVT-032
  - PLX-EVT-033
  - PLX-EVT-034
  - PLX-EVT-035
  - PLX-EVT-036
tags:
  - section
  - part/v
---

# §49 Event Store

◀ [[S48 Event Architecture]] · [[Part V — Platform Architecture|▲ Part V]] · [[S50 Synchronisation Engine]] ▶

---

The Event Store is the permanent historical record of Plexi.

### 49.1 Requirements

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-EVT#PLX-EVT-030|PLX-EVT-030]] | The Event Store **MUST** be immutable and append-only. No interface, including administrative and database-level access, **MUST** permit update or deletion of a written Event. | T, I | §49 |
| [[REQ-EVT#PLX-EVT-031|PLX-EVT-031]] | The Event Store **MUST** support full and selective replay, reconstructing the state of any Desk at any point in its history. | T | §49 |
| [[REQ-EVT#PLX-EVT-032|PLX-EVT-032]] | The Event Store **MUST** be time-indexed and tenant-isolated, and **MUST** be encrypted at rest with tenant-scoped key material. | T, I | §49 |
| [[REQ-EVT#PLX-EVT-033|PLX-EVT-033]] | Replay **MUST** evaluate access against the permission snapshot carried on each Event (`[[REQ-EVT#PLX-EVT-012|PLX-EVT-012]]`), not against current permissions. | T | §49, new |
| [[REQ-EVT#PLX-EVT-034|PLX-EVT-034]] | Personal data within Event payloads **MUST** be stored under per-subject encryption keys such that destruction of the key renders that data permanently unrecoverable without modifying any Event record. | T, I | §49, §69.7, new |
| [[REQ-EVT#PLX-EVT-035|PLX-EVT-035]] | Event schema evolution **MUST** be supported by an upcasting layer. Readers **MUST** be able to interpret every schema version ever written. Upcasters **MUST** be versioned, tested against archived fixtures of each historical schema, and retained indefinitely. | T, I | §49, new |
| [[REQ-EVT#PLX-EVT-036|PLX-EVT-036]] | The platform **MUST** define and enforce a maximum Event payload size, and **MUST** reject oversized Events rather than truncating them. Large content **MUST** be referenced by digest (`[[REQ-DOM#PLX-DOM-032|PLX-DOM-032]]`). | T | §49, new |

### 49.2 Replay

The platform must be capable of reconstructing any Desk at any point in history. This enables auditing, debugging, knowledge recovery, historical reasoning, simulation and training.

> **On `[[REQ-EVT#PLX-EVT-034|PLX-EVT-034]]` and `[[REQ-EVT#PLX-EVT-035|PLX-EVT-035]]` together.** These two requirements are what make "immutable forever" survivable. Without per-subject encryption, the first valid erasure request forces a choice between breaking the law and breaking the invariant. Without upcasting designed in from the first Event, the store becomes unreadable the third time a schema changes, and "replay any Desk at any point in history" quietly becomes "replay any Desk since the last breaking change." Both are cheap now and effectively impossible to retrofit. See `[[Risk Register#PLX-RSK-01|PLX-RSK-01]]`, `[[Risk Register#PLX-RSK-02|PLX-RSK-02]]`.

---

---

## Requirements defined or cited here

- [[REQ-DOM#PLX-DOM-032|PLX-DOM-032]] — Large Object content **MUST** be stored out-of-band via `contentRef` and **MUST NOT** be embedded in Event pay
- [[REQ-EVT#PLX-EVT-012|PLX-EVT-012]] — Every Event **MUST** carry a snapshot of the permissions in effect at emission, so that historical replay eval
- [[REQ-EVT#PLX-EVT-030|PLX-EVT-030]] — The Event Store **MUST** be immutable and append-only. No interface, including administrative and database-lev
- [[REQ-EVT#PLX-EVT-031|PLX-EVT-031]] — The Event Store **MUST** support full and selective replay, reconstructing the state of any Desk at any point
- [[REQ-EVT#PLX-EVT-032|PLX-EVT-032]] — The Event Store **MUST** be time-indexed and tenant-isolated, and **MUST** be encrypted at rest with tenant-sc
- [[REQ-EVT#PLX-EVT-033|PLX-EVT-033]] — Replay **MUST** evaluate access against the permission snapshot carried on each Event (`PLX-EVT-012`), not aga
- [[REQ-EVT#PLX-EVT-034|PLX-EVT-034]] — Personal data within Event payloads **MUST** be stored under per-subject encryption keys such that destruction
- [[REQ-EVT#PLX-EVT-035|PLX-EVT-035]] — Event schema evolution **MUST** be supported by an upcasting layer. Readers **MUST** be able to interpret ever
- [[REQ-EVT#PLX-EVT-036|PLX-EVT-036]] — The platform **MUST** define and enforce a maximum Event payload size, and **MUST** reject oversized Events ra

◀ [[S48 Event Architecture]] · [[Part V — Platform Architecture|▲ Part V]] · [[S50 Synchronisation Engine]] ▶
