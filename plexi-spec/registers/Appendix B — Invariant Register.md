---
type: appendix
appendix: B
title: "Invariant Register"
tags:
  - appendix
---

# Appendix B — Invariant Register

[[Home|▲ Home]]

---

An invariant is stronger than a requirement. A requirement describes something the system does; an invariant describes something the system can never stop doing. Every invariant below **MUST** have at least one automated detection test (`[[REQ-ENG#PLX-ENG-001|PLX-ENG-001]]`, `[[REQ-ENG#PLX-ENG-014|PLX-ENG-014]]`). An invariant asserted only in documentation is not enforced.

| ID | Invariant | Enforcement mechanism | Detection test | Source |
|---|---|---|---|---|
| **[[Invariants#PLX-INV-01|PLX-INV-01]]** | Every Object belongs to exactly one owning Desk. Objects may appear in many Desks; ownership remains singular. | Non-null FK constraint on `Object.deskId`; presence in additional Desks modelled only via `DeskPresence` | Schema constraint test; property test asserting no Object has two owning Desks | [[S44 Domain Invariants|§44]] R1, [[S10 The Desk|§10]] |
| **[[Invariants#PLX-INV-02|PLX-INV-02]]** | Every meaningful change produces an Event. No silent mutations. | Transactional outbox (`[[REQ-EVT#PLX-EVT-014|PLX-EVT-014]]`); write path rejects mutation without event | Reconciliation job comparing Object version increments against Event count; alerts on divergence | [[S44 Domain Invariants|§44]] R2, [[S59 Architectural Invariants|§59]] |
| **[[Invariants#PLX-INV-03|PLX-INV-03]]** | Every Relationship has provenance. Every connection is explainable. | Non-empty `evidence[]` validated at write time (`[[REQ-GPH#PLX-GPH-001|PLX-GPH-001]]`) | Write-path rejection test; periodic scan for zero-evidence edges | [[S44 Domain Invariants|§44]] R3, [[S59 Architectural Invariants|§59]] |
| **[[Invariants#PLX-INV-04|PLX-INV-04]]** | AI never bypasses structured data. Structured truth precedes generated interpretation. | AI cannot write domain state (`[[REQ-AI#PLX-AI-005|PLX-AI-005]]`); all AI output proposed as Events subject to validation | Test asserting no code path allows AI Orchestrator direct datastore write; assertion-without-evidence rejection test | [[S44 Domain Invariants|§44]] R4, [[S59 Architectural Invariants|§59]] |
| **[[Invariants#PLX-INV-05|PLX-INV-05]]** | Nothing deletes organisational memory. Deletion affects visibility, never history. **Sole exception: the erasure carve-out (§44.1).** | Event Store exposes no update or delete operation; `deletedAt` affects read filters only | Test asserting no delete/update API on Event Store, including admin surfaces; erasure path verified to destroy key, not record | [[S44 Domain Invariants|§44]] R5, [[S59 Architectural Invariants|§59]], §69.7 |
| **[[Invariants#PLX-INV-06|PLX-INV-06]]** | Permissions propagate through relationships. No Object exposes information beyond the owner's permissions. Most-restrictive-wins on multi-Desk presence. | Data-access-layer authorisation (`[[REQ-SEC#PLX-SEC-020|PLX-SEC-020]]`); permission-filtered traversal (`[[REQ-GPH#PLX-GPH-010|PLX-GPH-010]]`); intersection at `DeskPresence.effectivePermissions` | Cross-Desk exposure test suite; traversal fuzzing against a permission matrix; existence-leak tests on counts and distances | [[S44 Domain Invariants|§44]] R6, [[S16 Shared Objects|§16]] |
| **[[Invariants#PLX-INV-07|PLX-INV-07]]** | Everything remains inspectable. Every recommendation, summary, AI conclusion, relationship, decision and event. The user can always ask *why*, and the platform always answers. | Evidence references mandatory on all inferred output; disclosure path Summary → Raw Events (`[[REQ-UX#PLX-UX-051|PLX-UX-051]]`) | Test asserting every user-facing inferred assertion carries a resolvable evidence reference | [[S44 Domain Invariants|§44]] R7, [[S59 Architectural Invariants|§59]] |
| **[[Invariants#PLX-INV-08|PLX-INV-08]]** | Every Event is immutable once written. | Append-only store; no update/delete interface at any layer | Immutability test including direct datastore access attempts | [[S59 Architectural Invariants|§59]] |
| **[[Invariants#PLX-INV-09|PLX-INV-09]]** | Every recommendation is explainable. | Recommendation schema requires all eight fields of §24.3 | Schema validation; render-path test rejecting evidence-free recommendations | [[S59 Architectural Invariants|§59]], [[S24 AI Experience|§24]] |
| **[[Invariants#PLX-INV-10|PLX-INV-10]]** | Every service owns exactly one domain and one datastore. | Architecture fitness function in CI; no cross-service datastore credentials issued | Dependency-graph analysis; credential audit | [[S59 Architectural Invariants|§59]], [[S45 Platform Architecture|§45]] |
| **[[Invariants#PLX-INV-11|PLX-INV-11]]** | No service bypasses the Event Bus for inter-service state propagation. | Network policy; no direct cross-service datastore access | Architecture fitness function; network policy audit | [[S59 Architectural Invariants|§59]], [[S46 High-Level System Architecture|§46]] |
| **[[Invariants#PLX-INV-12|PLX-INV-12]]** | Workspace Memory is always recoverable. | Derived stores rebuildable from Event Store (`[[REQ-DATA#PLX-DATA-002|PLX-DATA-002]]`) | Quarterly full-rebuild test at production scale | [[S59 Architectural Invariants|§59]], [[S62 Canonical Data Architecture|§62]] |
| **[[Invariants#PLX-INV-13|PLX-INV-13]]** | Context survives application changes. Connector removal never destroys context. | Objects and Relationships persist independently of Connector lifecycle (`[[REQ-CON#PLX-CON-006|PLX-CON-006]]`) | Connector removal test asserting Object, Relationship, Event and Context survival | [[S59 Architectural Invariants|§59]], [[S04 Vision|§4]], [[S57 Connector Framework|§57]] |

---
