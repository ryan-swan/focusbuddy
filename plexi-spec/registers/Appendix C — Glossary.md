---
type: appendix
appendix: C
title: "Glossary"
tags:
  - appendix
---

# Appendix C — Glossary

[[Home|▲ Home]]

---

Capitalised terms in this document refer to these definitions and never to their ordinary-English senses.

| Term | Definition |
|---|---|
| **Agent** | A specialised AI worker operating within an explicit permission and memory scope, always acting on behalf of exactly one human principal. Never an independent user. [[S41 Agent Entity|§41]], §78. |
| **Archetype** | A presentation and default-policy template for a Desk (personal, project, team, organisation, client, knowledge). Not a distinct type; mutable without migration. §10.3. |
| **Attention Required** | A Context Health state indicating changes may affect the user's current work. §20.3. |
| **BaseEntity** | The common schema from which every persisted entity inherits. §32.1. |
| **Catch-up estimate** | A range, with a stated basis, of how long a user will need to reconstruct understanding on returning to a Desk. [[S39 Resume Entity|§39]], `[[REQ-RES#PLX-RES-003|PLX-RES-003]]`. |
| **Cognitive Context** | The layer of Context comprising current question, hypothesis, intent, reasoning and expected next action. Cannot be observed; only declared or inferred. §12.3. |
| **Confirmed Relationship** | A Relationship accepted by a user, or promoted by exceeding the tenant confidence threshold. Contrast Provisional. §36. |
| **Context** | The information required to continue meaningful work without reconstruction. Not documentation — understanding. §12. |
| **Context Health** | A per-(user, Object) measure of how current that user's understanding is relative to the Object's current state. Distinct from Object status. §20. |
| **Context Operating System** | The product category Plexi defines: a system managing context, decisions, relationships, knowledge, attention and continuity, as an operating system manages windows, files and memory. §9.2. |
| **Crypto-shredding** | Rendering data permanently unrecoverable by destroying its encryption key rather than deleting the record. The mechanism by which erasure is reconciled with `[[Invariants#PLX-INV-05|PLX-INV-05]]`. §69.7. |
| **Decision** | A first-class entity recording what was decided, by whom, why, on what evidence, and what alternatives were rejected. §37. |
| **Decision Risk** | A Context Health state indicating one or more Decisions associated with an Object may no longer be valid. §20.3. |
| **Derived store** | Any store rebuildable from the Event Store: graph, vector, search, Context DB, Resume DB. Never a system of record. §62.3. |
| **Desk** | The fundamental unit of work. A persistent living workspace with behaviour, memory and intelligence. Everything exists inside a Desk. §10. |
| **Event** | An immutable, append-only record of a meaningful change. The permanent substrate from which all understanding derives. [[S35 Event Entity|§35]], §64. |
| **Evidence** | A reference to a specific Object, Event, Decision, Meeting, Message or external source supporting an inferred assertion. Mandatory on every Relationship and recommendation. §36.1. |
| **Federated Object** | An Object with multiple owners, shared editing and shared history, presented independently in each Desk. §16.1. |
| **Foreclosing decision** | An architectural choice whose cost of reversal rises by orders of magnitude once production data exists. Catalogued in §85.2. |
| **Knowledge Graph** | The continuously evolving graph of entities and Relationships from which Organisational Intelligence emerges. Active, not passive. [[S15 Knowledge Graph|§15]], §53. |
| **Live Reference** | A synchronisation mode in which one canonical Object appears identically in every Desk. §16.1. |
| **Materiality** | The computed significance of a change, determining whether it updates Context Health, triggers Resume regeneration, requests AI reasoning, or requires no action. Deterministic. §51.3, §80.1. |
| **Object** | Anything visible inside Plexi. First-class; no type receives architectural preference. [[S11 Objects|§11]], §34. |
| **Organisation** | The highest contextual boundary and the tenant isolation boundary. §42. |
| **Organisational Intelligence** | Understanding emerging from Relationships between Desks, rather than from a central database. §17. |
| **Provisional Relationship** | An AI- or system-discovered Relationship not yet confirmed. Does not influence Context Health, Resume, search ranking or permissions. §36.3, `[[REQ-GPH#PLX-GPH-002|PLX-GPH-002]]`. |
| **Resume / Resume Object** | A versioned, evidence-linked representation of the current understanding of a Desk, generated continuously and never requested. [[S14 Resume Intelligence|§14]], §39. |
| **Session** | An uninterrupted period of work on a Desk, capturing cognition as well as activity. §40. |
| **Snapshot** | A static point-in-time copy of an Object; the original continues independently. §16.1. |
| **Tenant** | One Organisation, as an isolation boundary. §42. |
| **Upcasting** | Interpreting a historical Event schema version under the current model. Mandatory and permanent. `[[REQ-EVT#PLX-EVT-035|PLX-EVT-035]]`. |
| **Workspace Memory** | The complete working state of a Desk — visual arrangement, conversations, objectives, questions, dependencies, changes, AI state, reasoning, session history. [[S13 Workspace Memory|§13]], §66. |

### C.1 Reconciled Object type registry

The source drafts gave two overlapping Object type lists (§11.3, §34.3). The union below is authoritative.

Document · Spreadsheet · Presentation · Canvas · Whiteboard · Widget · Table · Database Table · Kanban · Task · Decision · Chat · Conversation · AI Conversation · Meeting · Voice Recording · Recording · Video · Media · Email · Prompt · Automation · Workflow · Terminal · Code Editor · Diagram · Timeline · Knowledge Card · Bookmark · Browser Window · Dashboard · API Connection · External Application · Agent

Differences reconciled: §11.3 uniquely contributed Kanban, Whiteboard, Email, Voice Recording, Video, Browser Window, Timeline, Agent, Database Table. §34.3 uniquely contributed Canvas, Table, Conversation, Recording, Media. Where two entries denote the same concept (Chat/Conversation, Voice Recording/Recording, Video/Media, Table/Database Table), both are retained as distinct registry entries pending a product decision — recorded as an open editorial item in Appendix H.

---
