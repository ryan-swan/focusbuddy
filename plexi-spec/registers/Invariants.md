---
type: register
register: invariants
count: 13
tags:
  - invariants
---

# Invariants

An invariant is stronger than a requirement. A requirement describes something the system does; an invariant describes something the system can **never stop doing**.

> [!danger] Every invariant MUST have an automated detection test that fails when it is violated ([[REQ-ENG#PLX-ENG-001|PLX-ENG-001]]). An invariant asserted only in documentation is not enforced.

### PLX-INV-01

**Every Object belongs to exactly one owning Desk.**

| | |
|---|---|
| **Full statement** | Every Object belongs to exactly one owning Desk. Objects may appear in many Desks; ownership remains singular. |
| **Enforcement** | Non-null FK constraint on `Object.deskId`; presence in additional Desks modelled only via `DeskPresence` |
| **Detection test** | Schema constraint test; property test asserting no Object has two owning Desks |
| **Source** | [[S44 Domain Invariants|§44]] R1, [[S10 The Desk|§10]] |

**Services that can violate it:** [[Workspace Service]] · [[Object Service]]

### PLX-INV-02

**Every meaningful change produces an Event.**

| | |
|---|---|
| **Full statement** | Every meaningful change produces an Event. No silent mutations. |
| **Enforcement** | Transactional outbox (`[[REQ-EVT#PLX-EVT-014|PLX-EVT-014]]`); write path rejects mutation without event |
| **Detection test** | Reconciliation job comparing Object version increments against Event count; alerts on divergence |
| **Source** | [[S44 Domain Invariants|§44]] R2, [[S59 Architectural Invariants|§59]] |

**Services that can violate it:** [[Workspace Service]] · [[Object Service]] · [[Event Service]] · [[Automation Engine]]

### PLX-INV-03

**Every Relationship has provenance.**

| | |
|---|---|
| **Full statement** | Every Relationship has provenance. Every connection is explainable. |
| **Enforcement** | Non-empty `evidence[]` validated at write time (`[[REQ-GPH#PLX-GPH-001|PLX-GPH-001]]`) |
| **Detection test** | Write-path rejection test; periodic scan for zero-evidence edges |
| **Source** | [[S44 Domain Invariants|§44]] R3, [[S59 Architectural Invariants|§59]] |

**Services that can violate it:** [[Graph Engine]]

### PLX-INV-04

**AI never bypasses structured data.**

| | |
|---|---|
| **Full statement** | AI never bypasses structured data. Structured truth precedes generated interpretation. |
| **Enforcement** | AI cannot write domain state (`[[REQ-AI#PLX-AI-005|PLX-AI-005]]`); all AI output proposed as Events subject to validation |
| **Detection test** | Test asserting no code path allows AI Orchestrator direct datastore write; assertion-without-evidence rejection test |
| **Source** | [[S44 Domain Invariants|§44]] R4, [[S59 Architectural Invariants|§59]] |

**Services that can violate it:** [[Context Engine]] · [[AI Orchestrator]]

### PLX-INV-05

**Nothing deletes organisational memory.**

| | |
|---|---|
| **Full statement** | Nothing deletes organisational memory. Deletion affects visibility, never history. **Sole exception: the erasure carve-out (§44.1).** |
| **Enforcement** | Event Store exposes no update or delete operation; `deletedAt` affects read filters only |
| **Detection test** | Test asserting no delete/update API on Event Store, including admin surfaces; erasure path verified to destroy key, not record |
| **Source** | [[S44 Domain Invariants|§44]] R5, [[S59 Architectural Invariants|§59]], §69.7 |

**Services that can violate it:** [[Object Service]] · [[Event Service]] · [[Resume Engine]]

### PLX-INV-06

**Permissions propagate through relationships.**

| | |
|---|---|
| **Full statement** | Permissions propagate through relationships. No Object exposes information beyond the owner's permissions. Most-restrictive-wins on multi-Desk presence. |
| **Enforcement** | Data-access-layer authorisation (`[[REQ-SEC#PLX-SEC-020|PLX-SEC-020]]`); permission-filtered traversal (`[[REQ-GPH#PLX-GPH-010|PLX-GPH-010]]`); intersection at `DeskPresence.effectivePermissions` |
| **Detection test** | Cross-Desk exposure test suite; traversal fuzzing against a permission matrix; existence-leak tests on counts and distances |
| **Source** | [[S44 Domain Invariants|§44]] R6, [[S16 Shared Objects|§16]] |

**Services that can violate it:** [[Context Engine]] · [[Graph Engine]] · [[Search Service]] · [[Automation Engine]] · [[Connector Service]] · [[Identity Service]]

### PLX-INV-07

**Everything remains inspectable.**

| | |
|---|---|
| **Full statement** | Everything remains inspectable. Every recommendation, summary, AI conclusion, relationship, decision and event. The user can always ask *why*, and the platform always answers. |
| **Enforcement** | Evidence references mandatory on all inferred output; disclosure path Summary → Raw Events (`[[REQ-UX#PLX-UX-051|PLX-UX-051]]`) |
| **Detection test** | Test asserting every user-facing inferred assertion carries a resolvable evidence reference |
| **Source** | [[S44 Domain Invariants|§44]] R7, [[S59 Architectural Invariants|§59]] |

**Services that can violate it:** [[Context Engine]] · [[Resume Engine]] · [[AI Orchestrator]]

### PLX-INV-08

**Every Event is immutable once written.**

| | |
|---|---|
| **Full statement** | Every Event is immutable once written. |
| **Enforcement** | Append-only store; no update/delete interface at any layer |
| **Detection test** | Immutability test including direct datastore access attempts |
| **Source** | [[S59 Architectural Invariants|§59]] |

**Services that can violate it:** [[Event Service]]

### PLX-INV-09

**Every recommendation is explainable.**

| | |
|---|---|
| **Full statement** | Every recommendation is explainable. |
| **Enforcement** | Recommendation schema requires all eight fields of §24.3 |
| **Detection test** | Schema validation; render-path test rejecting evidence-free recommendations |
| **Source** | [[S59 Architectural Invariants|§59]], [[S24 AI Experience|§24]] |

**Services that can violate it:** [[AI Orchestrator]]

### PLX-INV-10

**Every service owns exactly one domain.**

| | |
|---|---|
| **Full statement** | Every service owns exactly one domain and one datastore. |
| **Enforcement** | Architecture fitness function in CI; no cross-service datastore credentials issued |
| **Detection test** | Dependency-graph analysis; credential audit |
| **Source** | [[S59 Architectural Invariants|§59]], [[S45 Platform Architecture|§45]] |

### PLX-INV-11

**No service bypasses the Event Bus.**

| | |
|---|---|
| **Full statement** | No service bypasses the Event Bus for inter-service state propagation. |
| **Enforcement** | Network policy; no direct cross-service datastore access |
| **Detection test** | Architecture fitness function; network policy audit |
| **Source** | [[S59 Architectural Invariants|§59]], [[S46 High-Level System Architecture|§46]] |

**Services that can violate it:** [[Event Service]]

### PLX-INV-12

**Workspace Memory is always recoverable.**

| | |
|---|---|
| **Full statement** | Workspace Memory is always recoverable. |
| **Enforcement** | Derived stores rebuildable from Event Store (`[[REQ-DATA#PLX-DATA-002|PLX-DATA-002]]`) |
| **Detection test** | Quarterly full-rebuild test at production scale |
| **Source** | [[S59 Architectural Invariants|§59]], [[S62 Canonical Data Architecture|§62]] |

**Services that can violate it:** [[Event Service]] · [[Resume Engine]]

### PLX-INV-13

**Context survives application changes.**

| | |
|---|---|
| **Full statement** | Context survives application changes. Connector removal never destroys context. |
| **Enforcement** | Objects and Relationships persist independently of Connector lifecycle (`[[REQ-CON#PLX-CON-006|PLX-CON-006]]`) |
| **Detection test** | Connector removal test asserting Object, Relationship, Event and Context survival |
| **Source** | [[S59 Architectural Invariants|§59]], [[S04 Vision|§4]], [[S57 Connector Framework|§57]] |

**Services that can violate it:** [[Connector Service]]
