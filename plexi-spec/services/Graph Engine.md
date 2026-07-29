---
type: service-brief
service: "Graph Engine"
spec_section: §47.6
requirements: 19
tags:
  - service
  - implementation-brief
blocked_by:
  - PLX-RSK-07
  - PLX-RSK-09
---

# Graph Engine — implementation brief

[[Home|▲ Home]] · [[S47 Service Architecture|§47 Service Architecture]] · [[S46 High-Level System Architecture|§46 Topology]]

> [!abstract] What this note is
> Everything binding on this service, in one file. Read this before writing any of it.
> Nothing here is optional and nothing here is a summary — each requirement is quoted in full.

## Boundary

**Owns** — Knowledge graph · relationship storage · traversal · discovery · dependency analysis

**MUST NOT** — Emitting confirmed Relationships from AI discovery

**Datastore** — Graph DB (tenant-namespaced)  *(owned exclusively; see [[REQ-ARC#PLX-ARC-001|PLX-ARC-001]])*

## Events emitted

- `RelationshipDiscovered`
- `RelationshipConfirmed`
- `RelationshipRejected`
- `RelationshipSuperseded`
- `DuplicateDetected`
- `ClusterFormed`

Emitting an Event not listed here violates the service contract in [[S47 Service Architecture|§47]]. Add it to the contract first.

## Events consumed

- `*all domain Events*`
- `EmbeddingUpdated`

## Service level objectives

| ID | Target |
|---|---|
| [[REQ-PERF#PLX-PERF-022|PLX-PERF-022]] | Graph traversal, permission-filtered, depth ≤ 3 — p50 40 ms, p95 120 ms, p99 250 ms. Measured: Query ingress → result set. |

Measured at reference load defined in [[S58 Performance Requirements|§58]]. A target without production instrumentation MUST NOT be claimed as met ([[REQ-PERF#PLX-PERF-070|PLX-PERF-070]]).

## Invariants this service can violate

| ID | Invariant |
|---|---|
| [[Invariants#PLX-INV-03\|PLX-INV-03]] | Every Relationship has provenance |
| [[Invariants#PLX-INV-06\|PLX-INV-06]] | Permissions propagate through relationships |

Each MUST have an automated detection test in this service's suite ([[REQ-ENG#PLX-ENG-001|PLX-ENG-001]]).

## Open decisions blocking this service

> [!warning] Do not invent resolutions to these.
> They are unresolved in the specification. If implementation forces the question, stop and record an ADR in `decisions/` rather than choosing silently.

| Risk | Severity | Required by |
|---|---|---|
| [[Risk Register#PLX-RSK-07\|PLX-RSK-07]] — Tenant isolation model per store | Critical | Phase 1 design |
| [[Risk Register#PLX-RSK-09\|PLX-RSK-09]] — Relationship existence as protected fact | Critical | Phase 2 entry |

---

## Binding requirements (19)

#### [[REQ-PRD#PLX-PRD-050\|PLX-PRD-050]]  ·  `T`  ·  [[S15 Knowledge Graph|§15]]

Every Relationship **MUST** carry provenance: discovery method, creating actor or system, evidence references, and confidence.

#### [[REQ-PRD#PLX-PRD-051\|PLX-PRD-051]]  ·  `T`  ·  [[S15 Knowledge Graph|§15]]

AI-discovered Relationships **MUST** be stored as `provisional` and **MUST NOT** influence Context Health, Resume content or permission evaluation until confirmed by a user or until confidence exceeds the configured tenant threshold.

#### [[REQ-PRD#PLX-PRD-052\|PLX-PRD-052]]  ·  `T`  ·  [[S15 Knowledge Graph|§15]]

Promotion of a provisional Relationship to confirmed by threshold **MUST** emit a `RelationshipConfirmed` Event recording the threshold and the confidence at promotion.

#### [[REQ-PRD#PLX-PRD-053\|PLX-PRD-053]]  ·  `D`  ·  [[S15 Knowledge Graph|§15]]

The platform **MUST NOT** require a user to manually construct graph structure in order to receive relationship-derived intelligence.

#### [[REQ-CTX#PLX-CTX-026\|PLX-CTX-026]]  ·  `T`  ·  [[S80 Context Engine Algorithms|§80]]

Propagation **MUST** be cycle-safe. The Relationship graph is not acyclic and propagation **MUST** terminate on cyclic paths without repeated re-entry.

#### [[REQ-GPH#PLX-GPH-001\|PLX-GPH-001]]  ·  `T`  ·  [[S36 Relationship Entity|§36]]

Every Relationship **MUST** carry at least one `EvidenceRef`. A Relationship with an empty evidence set **MUST** be rejected at write time.

#### [[REQ-GPH#PLX-GPH-002\|PLX-GPH-002]]  ·  `T`  ·  [[S36 Relationship Entity|§36]]

Provisional Relationships **MUST NOT** contribute to Context Health propagation, Resume content, search ranking or permission evaluation.

#### [[REQ-GPH#PLX-GPH-003\|PLX-GPH-003]]  ·  `T`  ·  [[S36 Relationship Entity|§36]]

Relationship confidence **MUST** be recalculated when supporting evidence is superseded or invalidated, and a Relationship whose confidence falls below the tenant threshold **MUST** revert to provisional.

#### [[REQ-GPH#PLX-GPH-004\|PLX-GPH-004]]  ·  `D`  ·  [[S36 Relationship Entity|§36]]

Users **MUST NOT** be required to construct graph structure manually to obtain relationship-derived intelligence. Manual curation **MUST** be available as confirmation and correction.

#### [[REQ-GPH#PLX-GPH-005\|PLX-GPH-005]]  ·  `T`  ·  [[S36 Relationship Entity|§36]]

A rejected Relationship **MUST** be retained with state `rejected` and **MUST NOT** be re-proposed on identical evidence.

#### [[REQ-GPH#PLX-GPH-010\|PLX-GPH-010]]  ·  `T, A`  ·  [[S53 Knowledge Graph Runtime|§53]]

Graph traversal **MUST** be permission-filtered. Traversal **MUST NOT** cross an edge into a node the requesting principal cannot read, and **MUST NOT** disclose the existence of such a node through path counts, distances or aggregate results.

#### [[REQ-GPH#PLX-GPH-011\|PLX-GPH-011]]  ·  `I, T`  ·  [[S53 Knowledge Graph Runtime|§53]]

Graph storage **MUST** be tenant-namespaced at the engine level. Application-level tenant filtering alone **MUST NOT** be relied upon (`[[REQ-SEC#PLX-SEC-011|PLX-SEC-011]]`).

#### [[REQ-GPH#PLX-GPH-012\|PLX-GPH-012]]  ·  `T`  ·  [[S53 Knowledge Graph Runtime|§53]]

Graph writes **MUST** be idempotent with respect to Event replay. Replaying an Event **MUST NOT** duplicate nodes or edges.

#### [[REQ-GPH#PLX-GPH-013\|PLX-GPH-013]]  ·  `A`  ·  [[S53 Knowledge Graph Runtime|§53]]

Community detection, clustering and duplicate detection **MUST** run asynchronously and **MUST NOT** be on the synchronous path of any user-facing operation with a latency SLO.

#### [[REQ-GPH#PLX-GPH-020\|PLX-GPH-020]]  ·  `T, I`  ·  [[S65 Knowledge Graph Schema|§65]]

The relationship type vocabulary **MUST** be a single closed registry (Appendix E). Services **MUST NOT** introduce edge types outside the registry; extension-defined types **MUST** be registered before use.

#### [[REQ-GPH#PLX-GPH-021\|PLX-GPH-021]]  ·  `T`  ·  [[S65 Knowledge Graph Schema|§65]]

Every edge **MUST** carry a permission scope, and traversal **MUST** evaluate it (`[[REQ-GPH#PLX-GPH-010|PLX-GPH-010]]`).

#### [[REQ-GPH#PLX-GPH-022\|PLX-GPH-022]]  ·  `T`  ·  [[S65 Knowledge Graph Schema|§65]]

Node and edge writes **MUST** carry the `correlationId` of the originating Event, so that any graph state is traceable to the user action that produced it.

#### [[REQ-SEC#PLX-SEC-010\|PLX-SEC-010]]  ·  `T, I`  ·  [[S42 Organisation Entity|§42]]

Every store — relational, document, event, graph, vector and search — **MUST** enforce tenant isolation at the storage layer, including namespace or row-level security in the graph and vector stores.

#### [[REQ-SEC#PLX-SEC-011\|PLX-SEC-011]]  ·  `T, A`  ·  [[S42 Organisation Entity|§42]]

Cross-Organisation traversal, search or reasoning **MUST** be impossible by construction. No API, query path, agent tool or administrative interface **MUST** be capable of returning data from more than one `organisationId` in a single result.

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
