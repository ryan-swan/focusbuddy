---
id: S17
section: §17
title: "Organisational Intelligence"
part: II
type: section
defines:
  - PLX-PRD-070
  - PLX-PRD-071
  - PLX-PRD-072
tags:
  - section
  - part/ii
---

# §17 Organisational Intelligence

◀ [[S16 Shared Objects]] · [[Part II — Product Model|▲ Part II]] · [[S18 User Experience Philosophy]] ▶

---

Individual memory creates personal productivity. Shared memory creates organisational intelligence.

### 17.1 Definition

Organisational Intelligence emerges from Relationships between Desks — not from a central database.

### 17.2 Cross-Desk awareness

> *"This proposal depends on a decision currently waiting in Legal."*
> *"This document duplicates work already completed by Engineering."*
> *"This client has three active projects sharing the same assumptions."*
> *"The Marketing team updated the pricing model affecting this proposal."*

### 17.3 Organisational memory

When people leave, knowledge, context, reasoning, history and relationships remain. The organisation continues learning.

### 17.4 Success criteria

The organisation should become easier to understand every month. The platform should reduce duplicate work, knowledge loss, context switching, decision latency, project restart time and meeting overhead, while increasing alignment, transparency, organisational memory, collective intelligence, cross-team awareness and knowledge reuse.

### 17.5 Requirements

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-PRD#PLX-PRD-070|PLX-PRD-070]] | Cross-Desk awareness statements **MUST** be permission-filtered per recipient. A statement **MUST NOT** be rendered if doing so would disclose the existence, name, or attributes of an Object, Desk or Decision the recipient is not permitted to know exists. | T | §17.2, [[S44 Domain Invariants|§44]] R6 |
| [[REQ-PRD#PLX-PRD-071|PLX-PRD-071]] | Where a cross-Desk dependency exists but the recipient lacks permission to see its subject, the platform **MUST** either suppress the statement entirely or render a permission-safe form that discloses no protected attribute, according to tenant policy. The chosen behaviour **MUST** be configurable and auditable. | T, I | §17.2, new |
| [[REQ-PRD#PLX-PRD-072|PLX-PRD-072]] | Departure of a user (deactivation) **MUST NOT** remove Objects, Decisions, Relationships or Events they authored, and **MUST** trigger an ownership reassignment workflow for Objects they owned. | T | §17.3, new |

> **On `[[REQ-PRD#PLX-PRD-070|PLX-PRD-070]]` and `[[REQ-PRD#PLX-PRD-071|PLX-PRD-071]]`.** This is the sharpest edge in the whole product. "This proposal depends on a decision currently waiting in Legal" is exactly the insight that makes Plexi valuable — and it discloses the existence of a Legal decision to someone who may have no right to know a Legal review is underway. Existence itself is a protected fact in acquisitions, restructures, terminations and litigation. The platform therefore needs an explicit, per-tenant answer to *"is the existence of a relationship itself confidential?"*, not a permission check applied only to content. Tracked as `[[Risk Register#PLX-RSK-09|PLX-RSK-09]]`.

---

---

## Requirements defined or cited here

- [[REQ-PRD#PLX-PRD-070|PLX-PRD-070]] — Cross-Desk awareness statements **MUST** be permission-filtered per recipient. A statement **MUST NOT** be ren
- [[REQ-PRD#PLX-PRD-071|PLX-PRD-071]] — Where a cross-Desk dependency exists but the recipient lacks permission to see its subject, the platform **MUS
- [[REQ-PRD#PLX-PRD-072|PLX-PRD-072]] — Departure of a user (deactivation) **MUST NOT** remove Objects, Decisions, Relationships or Events they author

◀ [[S16 Shared Objects]] · [[Part II — Product Model|▲ Part II]] · [[S18 User Experience Philosophy]] ▶
