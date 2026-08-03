---
id: S77
section: §77
title: "Native Workspace Applications"
part: VII
type: section
defines:
  - PLX-A11Y-003
  - PLX-APP-010
  - PLX-APP-011
  - PLX-APP-012
  - PLX-APP-020
  - PLX-APP-030
  - PLX-APP-031
  - PLX-APP-040
  - PLX-APP-041
  - PLX-DOM-043
  - PLX-GPH-010
  - PLX-PERF-001
  - PLX-UX-030
  - PLX-UX-032
tags:
  - section
  - part/vii
---

# §77 Native Workspace Applications

◀ [[S76 Native Application Philosophy]] · [[Part VII — Applications, Agents, Algorithms & Roadmap|▲ Part VII]] · [[S78 AI Agent Framework]] ▶

---

Every application shares a common design language and understands Desk context, Relationships, Workspace Memory, AI, permissions and Events. Applications differ only in their user experience.

### 77.1 Workspace Canvas

The Canvas is the primary working surface. It is **not a whiteboard** — it is the visual representation of a Desk.

**Responsibilities:** spatial layout · Object placement · multi-monitor awareness · infinite workspace · live collaboration · persistent positioning · context restoration.

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-APP#PLX-APP-010|PLX-APP-010]] | The Canvas **MUST** persist Object position, size and z-order per (user, Desk, device class) and restore them exactly (`[[REQ-UX#PLX-UX-030|PLX-UX-030]]`, `[[REQ-UX#PLX-UX-032|PLX-UX-032]]`). | T, D | §77 |
| [[REQ-APP#PLX-APP-011|PLX-APP-011]] | The Canvas **MUST** provide the equivalent linear, screen-reader-navigable representation required by `[[REQ-A11Y#PLX-A11Y-003|PLX-A11Y-003]]`, developed and released concurrently with the spatial surface. | T, D | §77, [[S27 Accessibility|§27]] |
| [[REQ-APP#PLX-APP-012|PLX-APP-012]] | Canvas rendering **MUST** virtualise off-viewport Objects so that Desk open latency (`[[REQ-PERF#PLX-PERF-001|PLX-PERF-001]]`) is independent of total Object count. | A, T | §77, new |

### 77.2 Knowledge Cards

Knowledge Cards replace disconnected notes. Each card is addressable, searchable, relational, versioned and AI-aware. Knowledge Cards become graph nodes.

### 77.3 Decision Tracker

Every important decision becomes an Object. Users can propose decisions, attach evidence, record alternatives, assign ownership, request approval and review historical decisions. Decisions become reusable organisational knowledge.

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-APP#PLX-APP-020|PLX-APP-020]] | The Decision Tracker **MUST** require a recorded alternative-considered entry, or an explicit statement that none was considered, before a Decision may move to `approved`. | T, D | §77, [[S37 Decision Entity|§37]] |

> **On `[[REQ-APP#PLX-APP-020|PLX-APP-020]]`.** This is a small piece of interaction design with outsized long-term value. The alternatives array (`[[REQ-DOM#PLX-DOM-043|PLX-DOM-043]]`) is the highest-value data the platform will ever hold, and it will be empty in practice unless the interface makes recording it the path of least resistance at the moment the decision is made. Nobody comes back later to fill it in.

### 77.4 Meeting Workspace

Meetings should produce organisational memory rather than isolated recordings. Each meeting includes agenda, participants, transcript, recording, AI summary, decisions, actions, referenced Objects, related Desks and follow-up tasks. Everything produced during a meeting becomes connected automatically.

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-APP#PLX-APP-030|PLX-APP-030]] | Meeting recording and transcription **MUST** obtain and record consent from all participants per the applicable jurisdiction, and **MUST NOT** commence without it. | T, D, I | §77, new |
| [[REQ-APP#PLX-APP-031|PLX-APP-031]] | Decisions and actions extracted from a meeting by AI **MUST** be created as provisional and **MUST** require human confirmation before entering `approved` state or generating Relationships. | T | §77, [[S37 Decision Entity|§37]] |

> **On `[[REQ-APP#PLX-APP-030|PLX-APP-030]]`.** Recording consent is not a uniform rule — all-party consent jurisdictions exist within single countries, let alone across a multinational tenant. A meeting recorder that gets this wrong creates criminal liability, not just a compliance finding. The consent model must be per-participant and per-jurisdiction, determined at meeting start.

### 77.5 AI Workspace

AI conversations are permanent workspace Objects. Unlike traditional chat interfaces, conversations remain connected to Objects, Decisions, Meetings, Knowledge, Relationships and Events. A conversation never exists in isolation.

### 77.6 Relationship Explorer

A visual interface for exploring organisational knowledge, answering questions such as *"What depends on this proposal?"*, *"What decisions affected this project?"*, *"Which teams reference this policy?"*, *"What assumptions are shared across these clients?"*

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-APP#PLX-APP-040|PLX-APP-040]] | The Relationship Explorer **MUST** apply permission-filtered traversal (`[[REQ-GPH#PLX-GPH-010|PLX-GPH-010]]`) and **MUST NOT** reveal node existence, path counts or graph distances involving non-permitted nodes. | T | §77, [[S53 Knowledge Graph Runtime|§53]] |
| [[REQ-APP#PLX-APP-041|PLX-APP-041]] | The Relationship Explorer **MUST** display, for every edge, its evidence, confidence, discovery method and state (provisional or confirmed). | D | §77, [[S36 Relationship Entity|§36]] |

---

---

## Requirements defined or cited here

- [[REQ-A11Y#PLX-A11Y-003|PLX-A11Y-003]] — The spatial Canvas **MUST** provide an equivalent non-spatial, linear, screen-reader-navigable representation
- [[REQ-APP#PLX-APP-010|PLX-APP-010]] — The Canvas **MUST** persist Object position, size and z-order per (user, Desk, device class) and restore them
- [[REQ-APP#PLX-APP-011|PLX-APP-011]] — The Canvas **MUST** provide the equivalent linear, screen-reader-navigable representation required by `PLX-A11
- [[REQ-APP#PLX-APP-012|PLX-APP-012]] — Canvas rendering **MUST** virtualise off-viewport Objects so that Desk open latency (`PLX-PERF-001`) is indepe
- [[REQ-APP#PLX-APP-020|PLX-APP-020]] — The Decision Tracker **MUST** require a recorded alternative-considered entry, or an explicit statement that n
- [[REQ-APP#PLX-APP-030|PLX-APP-030]] — Meeting recording and transcription **MUST** obtain and record consent from all participants per the applicabl
- [[REQ-APP#PLX-APP-031|PLX-APP-031]] — Decisions and actions extracted from a meeting by AI **MUST** be created as provisional and **MUST** require h
- [[REQ-APP#PLX-APP-040|PLX-APP-040]] — The Relationship Explorer **MUST** apply permission-filtered traversal (`PLX-GPH-010`) and **MUST NOT** reveal
- [[REQ-APP#PLX-APP-041|PLX-APP-041]] — The Relationship Explorer **MUST** display, for every edge, its evidence, confidence, discovery method and sta
- [[REQ-DOM#PLX-DOM-043|PLX-DOM-043]] — Rejected `alternatives` **MUST** be retained permanently. The record of what was *not* chosen, and why, **MUST
- [[REQ-GPH#PLX-GPH-010|PLX-GPH-010]] — Graph traversal **MUST** be permission-filtered. Traversal **MUST NOT** cross an edge into a node the requesti
- [[REQ-PERF#PLX-PERF-001|PLX-PERF-001]] — Desk open — first meaningful paint of Resume Card and layout — p50 600 ms, p95 1.5 s, p99 **2.0 s**. Measured:
- [[REQ-UX#PLX-UX-030|PLX-UX-030]] — The platform **MUST NOT** reposition, resize or reflow user-placed Objects on a Desk without explicit user act
- [[REQ-UX#PLX-UX-032|PLX-UX-032]] — Layout **MUST** be persisted per (user, Desk, device class), so that a user's desktop arrangement is not overw

◀ [[S76 Native Application Philosophy]] · [[Part VII — Applications, Agents, Algorithms & Roadmap|▲ Part VII]] · [[S78 AI Agent Framework]] ▶
