---
id: S13
section: §13
title: "Workspace Memory"
part: II
type: section
defines:
  - PLX-PRD-030
  - PLX-PRD-031
  - PLX-PRD-032
  - PLX-PRD-033
  - PLX-PRD-034
tags:
  - section
  - part/ii
---

# §13 Workspace Memory

◀ [[S12 Context]] · [[Part II — Product Model|▲ Part II]] · [[S14 Resume Intelligence]] ▶

---

**Workspace Memory** is the defining capability of Plexi. Without it, the platform is another dashboard. With it, it is a cognitive operating system.

### 13.1 Definition

Workspace Memory captures not only information but the complete working state of a Desk: visual arrangement, open conversations, current objectives, outstanding questions, dependencies, recent changes, AI state, human reasoning and session history.

### 13.2 Memory principles

Memory is automatic. Memory is incremental. Memory never requires manual maintenance. Memory improves with time.

### 13.3 Session snapshots

Every time a user leaves a Desk, the platform records a snapshot: open Objects, Object focus, current selections, AI conversations, recent edits, current question, expected next action and estimated resume point.

The user never presses *Save Context*. Context is continuously preserved.

### 13.4 Context compression

Not every Event deserves permanent memory. Workspace Memory periodically compresses activity.

Instead of storing:

```
Opened document · Closed document · Opened document
Scrolled · Scrolled · Scrolled · Selected paragraph
```

the platform stores:

> *"User reviewed pricing proposal and focused on Section 4."*

Meaning survives. Noise disappears.

**Compression is a derived-state operation, not an Event Store operation.** The underlying Events are never removed — compression produces a summary artefact alongside them. This distinction is absolute and is registered as `[[Invariants#PLX-INV-06|PLX-INV-06]]`.

### 13.5 Requirements

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-PRD#PLX-PRD-030|PLX-PRD-030]] | Workspace Memory capture **MUST** be automatic. The platform **MUST NOT** expose any user action whose function is to save context. | I, D | §13.2 |
| [[REQ-PRD#PLX-PRD-031|PLX-PRD-031]] | A Session snapshot **MUST** be written on Desk exit, on session timeout, and at intervals not exceeding 60 seconds during active work, so that context survives unexpected client termination. | T | §13.3, new |
| [[REQ-PRD#PLX-PRD-032|PLX-PRD-032]] | Context compression **MUST NOT** delete, alter or render unreadable any Event in the Event Store. Compression **MUST** produce a derived summary artefact that references the compressed Events by identifier. | T | §13.4, [[S49 Event Store|§49]] |
| [[REQ-PRD#PLX-PRD-033|PLX-PRD-033]] | Every compressed summary **MUST** be expandable to the underlying Event set on user request. | T, D | §13.4, [[S23 Resume Experience|§23]] |
| [[REQ-PRD#PLX-PRD-034|PLX-PRD-034]] | Memory layers ([[S66 Workspace Memory Architecture|§66]]) **MUST** carry independent, tenant-configurable retention policies, and retention policy application **MUST** emit an auditable Event. | T, I | [[S66 Workspace Memory Architecture|§66]] |

---

---

## Requirements defined or cited here

- [[REQ-PRD#PLX-PRD-030|PLX-PRD-030]] — Workspace Memory capture **MUST** be automatic. The platform **MUST NOT** expose any user action whose functio
- [[REQ-PRD#PLX-PRD-031|PLX-PRD-031]] — A Session snapshot **MUST** be written on Desk exit, on session timeout, and at intervals not exceeding 60 sec
- [[REQ-PRD#PLX-PRD-032|PLX-PRD-032]] — Context compression **MUST NOT** delete, alter or render unreadable any Event in the Event Store. Compression
- [[REQ-PRD#PLX-PRD-033|PLX-PRD-033]] — Every compressed summary **MUST** be expandable to the underlying Event set on user request.
- [[REQ-PRD#PLX-PRD-034|PLX-PRD-034]] — Memory layers (§66) **MUST** carry independent, tenant-configurable retention policies, and retention policy a

◀ [[S12 Context]] · [[Part II — Product Model|▲ Part II]] · [[S14 Resume Intelligence]] ▶
