---
type: moc
document: PLEXI-0001
version: "2.0"
status: Living Document — Baselined for Engineering
tags:
  - moc
  - home
---

# Plexi — PLEXI-0001 v2.0

**Business Requirements Document · Product Requirements Specification · Software Architecture & Engineering Handbook**

> The purpose of Plexi is not to organise software. The purpose of Plexi is to preserve understanding.
> — [[S60 Engineering Principle|§60]]

| | |
|---|---|
| **Document ID** | PLEXI-0001 |
| **Version** | 2.0 — Consolidated Normative Edition |
| **Covers** | Parts I–VII (§0–§88) |
| **Not yet drafted** | Part VIII — see [[S88 Part VIII — Forward Reference\|§88]] |
| **Requirements** | 344 · [[Appendix A — Requirement Index\|full index]] |
| **Invariants** | 13 · [[Invariants]] |
| **Open decisions** | 14 · [[Risk Register]] — **read before implementing** |

---

## Start here

| | |
|---|---|
| **Building something** | `CLAUDE.md`, then the relevant [[#Services\|service brief]] |
| **Understanding the product** | [[Part I — Vision]] → [[Part II — Product Model]] |
| **Understanding the architecture** | [[S45 Platform Architecture\|§45]] → [[S46 High-Level System Architecture\|§46]] → [[S47 Service Architecture\|§47]] |
| **Understanding the data model** | [[S32 Canonical Entity Model\|§32]] → [[#Entities\|entity notes]] |
| **Checking what is decided** | [[Risk Register]] → `decisions/` |
| **How to read requirements** | [[S00 Conventions, requirement identifiers and verification\|§0 Conventions]] |

---

## Parts

| Part | Scope | Sections |
|---|---|---|
| [[Part I — Vision]] | Problem, vision, philosophy, design principles, success criteria | §1–8 |
| [[Part II — Product Model]] | Desk, Objects, Context, Workspace Memory, Resume, Graph, Organisational Intelligence | §9–17 |
| [[Part III — User Experience]] | Cognitive design, Context Health, navigation, search, AI experience, collaboration, accessibility | §18–29 |
| [[Part IV — Domain Model]] | Canonical entities, schemas, domain invariants | §30–44 |
| [[Part V — Platform Architecture]] | Event-driven architecture, services, sync, engines, performance | §45–60 |
| [[Part VI — Data, APIs, Security & Engineering Standards]] | Persistence, API design, event contracts, security, governance, deployment, standards | §61–75 |
| [[Part VII — Applications, Agents, Algorithms & Roadmap]] | Native apps, agents, algorithms, marketplace, roadmap, metrics | §76–88 |

---

## Services

The implementation briefs. Each inlines everything binding on that unit — read one file and start.

| Service | Owns | Blocked by |
|---|---|---|
| [[Workspace Service]] | Desk lifecycle, layout, sessions, visual persistence | [[Risk Register#PLX-RSK-13\|RSK-13]] |
| [[Object Service]] | Object creation, storage, versioning, sharing | [[Risk Register#PLX-RSK-09\|RSK-09]] |
| [[Event Service]] | Event creation, persistence, distribution, replay | [[Risk Register#PLX-RSK-01\|RSK-01]] · [[Risk Register#PLX-RSK-02\|02]] · [[Risk Register#PLX-RSK-08\|08]] |
| [[Context Engine]] | Context Health, materiality, dependency tracking | [[Risk Register#PLX-RSK-03\|RSK-03]] · [[Risk Register#PLX-RSK-12\|12]] |
| [[Resume Engine]] | Resume generation, Workspace Memory, compression | [[Risk Register#PLX-RSK-06\|RSK-06]] |
| [[Graph Engine]] | Knowledge graph, traversal, relationship discovery | [[Risk Register#PLX-RSK-07\|RSK-07]] · [[Risk Register#PLX-RSK-09\|09]] |
| [[Search Service]] | Keyword, semantic, graph, hybrid ranking | [[Risk Register#PLX-RSK-07\|RSK-07]] · [[Risk Register#PLX-RSK-09\|09]] |
| [[AI Orchestrator]] | Model routing, prompt assembly, cost, caching | [[Risk Register#PLX-RSK-05\|RSK-05]] · [[Risk Register#PLX-RSK-10\|10]] · [[Risk Register#PLX-RSK-06\|06]] · [[Risk Register#PLX-RSK-11\|11]] |
| [[Automation Engine]] | Workflows, triggers, approvals | [[Risk Register#PLX-RSK-10\|RSK-10]] |
| [[Connector Service]] | External integrations, auth, sync | [[Risk Register#PLX-RSK-10\|RSK-10]] |
| [[Identity Service]] | AuthN, authZ, roles, permissions, audit | [[Risk Register#PLX-RSK-01\|RSK-01]] · [[Risk Register#PLX-RSK-07\|07]] · [[Risk Register#PLX-RSK-09\|09]] · [[Risk Register#PLX-RSK-12\|12]] |

---

## Entities

[[Desk]] · [[Object]] · [[Event]] · [[Relationship]] · [[Decision]] · [[Context]] · [[Resume]] · [[Session]] · [[Agent]] · [[Organisation]]

All inherit [[S32 Canonical Entity Model|BaseEntity]].

---

## Requirement registers

| | | | |
|---|---|---|---|
| [[REQ-PRIN]] Principles | [[REQ-PRD]] Product | [[REQ-UX]] Experience | [[REQ-A11Y]] Accessibility |
| [[REQ-DOM]] Domain | [[REQ-ARC]] Architecture | [[REQ-EVT]] Events | [[REQ-SYN]] Sync |
| [[REQ-CTX]] Context | [[REQ-RES]] Resume | [[REQ-GPH]] Graph | [[REQ-SCH]] Search |
| [[REQ-AI]] AI | [[REQ-AGT]] Agents | [[REQ-CON]] Connectors | [[REQ-APP]] Applications |
| [[REQ-EXT]] Marketplace | [[REQ-DATA]] Data | [[REQ-API]] API | [[REQ-SEC]] Security |
| [[REQ-OPS]] Operations | [[REQ-ENG]] Engineering | [[REQ-PERF]] Performance | [[REQ-MET]] Metrics |

---

## Registers and appendices

[[Invariants]] · [[Risk Register]] · [[Appendix A — Requirement Index]] · [[Appendix B — Invariant Register]] · [[Appendix C — Glossary]] · [[Appendix D — Event Type Catalogue]] · [[Appendix E — Relationship Type Catalogue]] · [[Appendix F — Architectural Risk Register & Open Issues]] · [[Appendix G — Normative References]] · [[Appendix H — Consolidation Change Log]]

---

## The five decisions that cannot wait

Foreclosing choices whose cost of reversal rises by orders of magnitude once production data exists. All currently **OPEN**.

| ADR | Decision | Required by |
|---|---|---|
| `ADR-01` | [[Risk Register#PLX-RSK-01\|Immutable history vs right to erasure]] | first production Event |
| `ADR-02` | [[Risk Register#PLX-RSK-02\|Event schema evolution over infinite horizon]] | first production Event |
| `ADR-03` | [[Risk Register#PLX-RSK-08\|Event partition key and ordering]] | first production Event |
| `ADR-04` | [[Risk Register#PLX-RSK-04\|CRDT selection and metadata growth]] | Phase 1 design |
| `ADR-05` | [[Risk Register#PLX-RSK-07\|Tenant isolation model per store]] | Phase 1 design |

Roughly three to four weeks of design work now. Effectively unfixable after eighteen months of production events. See [[S85 Five-Year Product Roadmap|§85.2]].
