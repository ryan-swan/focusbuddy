---
type: service-brief
service: "Search Service"
spec_section: §47.7
requirements: 9
tags:
  - service
  - implementation-brief
blocked_by:
  - PLX-RSK-07
  - PLX-RSK-09
---

# Search Service — implementation brief

[[Home|▲ Home]] · [[S47 Service Architecture|§47 Service Architecture]] · [[S46 High-Level System Architecture|§46 Topology]]

> [!abstract] What this note is
> Everything binding on this service, in one file. Read this before writing any of it.
> Nothing here is optional and nothing here is a summary — each requirement is quoted in full.

## Boundary

**Owns** — Keyword · semantic · graph · hybrid ranking · context-aware search

**MUST NOT** — Returning results before permission filtering

**Datastore** — Search index + vector index  *(owned exclusively; see [[REQ-ARC#PLX-ARC-001|PLX-ARC-001]])*

## Events emitted

- `SearchExecuted`
- `EmbeddingUpdated`

Emitting an Event not listed here violates the service contract in [[S47 Service Architecture|§47]]. Add it to the contract first.

## Events consumed

- `ObjectCreated`
- `ObjectUpdated`
- `ObjectDeleted`
- `PermissionChanged`
- `RelationshipConfirmed`

## Service level objectives

| ID | Target |
|---|---|
| [[REQ-PERF#PLX-PERF-040|PLX-PERF-040]] | Search, AI re-ranking disabled — p50 80 ms, p95 200 ms, p99 **300 ms**. Measured: Query ingress → ranked results. |
| [[REQ-PERF#PLX-PERF-041|PLX-PERF-041]] | Semantic index freshness after content-changing Event — p50 2 s, p95 10 s, p99 30 s. Measured: Event → embedding queryable. |
| [[REQ-PERF#PLX-PERF-042|PLX-PERF-042]] | Search, including AI re-ranking — p50 400 ms, p95 900 ms, p99 1.5 s. Measured: Query ingress → re-ranked results. |

Measured at reference load defined in [[S58 Performance Requirements|§58]]. A target without production instrumentation MUST NOT be claimed as met ([[REQ-PERF#PLX-PERF-070|PLX-PERF-070]]).

## Invariants this service can violate

| ID | Invariant |
|---|---|
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

## Binding requirements (9)

#### [[REQ-PRD#PLX-PRD-014\|PLX-PRD-014]]  ·  `T, A`  ·  [[S11 Objects|§11]]

Every Object **MUST** carry semantic embeddings maintained within `[[REQ-PERF#PLX-PERF-020|PLX-PERF-020]]` of a content-changing Event, or be explicitly excluded from semantic indexing by policy with the exclusion recorded.

#### [[REQ-UX#PLX-UX-040\|PLX-UX-040]]  ·  `T`  ·  [[S22 Search Experience|§22]]

Search results **MUST** be ranked with the active Desk as a ranking input. The same query issued from two different Desks **MUST** be permitted to produce different orderings.

#### [[REQ-UX#PLX-UX-041\|PLX-UX-041]]  ·  `T`  ·  [[S22 Search Experience|§22]]

Search **MUST** apply permission filtering as the first stage of the ranking pipeline, before any relevance computation, and **MUST NOT** disclose the existence of non-permitted results through result counts, pagination totals or ranking artefacts.

#### [[REQ-SCH#PLX-SCH-001\|PLX-SCH-001]]  ·  `T, A`  ·  [[S54 Search Architecture|§54]]

Permission filtering **MUST** be the first stage of the ranking pipeline and **MUST** be applied at the index or query layer, not as a post-filter over returned results.

#### [[REQ-SCH#PLX-SCH-002\|PLX-SCH-002]]  ·  `T`  ·  [[S54 Search Architecture|§54]]

Result counts, pagination totals and relevance scores **MUST NOT** disclose the existence of non-permitted results.

#### [[REQ-SCH#PLX-SCH-003\|PLX-SCH-003]]  ·  `T`  ·  [[S54 Search Architecture|§54]]

AI re-ranking **MUST** be the final stage and **MUST** be optional. Disabling it **MUST** degrade result ordering, not result correctness or completeness.

#### [[REQ-SCH#PLX-SCH-004\|PLX-SCH-004]]  ·  `A`  ·  [[S54 Search Architecture|§54]]

Search **MUST** meet `[[REQ-PERF#PLX-PERF-040|PLX-PERF-040]]` with AI re-ranking disabled. AI re-ranking **MUST** operate within a separate, additive budget and **MUST** be abandoned rather than exceed it.

#### [[REQ-SCH#PLX-SCH-005\|PLX-SCH-005]]  ·  `T, A`  ·  [[S54 Search Architecture|§54]]

Semantic index freshness **MUST** meet `[[REQ-PERF#PLX-PERF-041|PLX-PERF-041]]`; where an Object's embedding is stale, results **MUST** still include the Object via keyword and relationship paths.

#### [[REQ-SEC#PLX-SEC-023\|PLX-SEC-023]]  ·  `T, A`  ·  [[S69 Security Architecture|§69]]

Permission changes **MUST** propagate to derived stores — search index, vector index, graph, materialised Context Health — within `[[REQ-PERF#PLX-PERF-021|PLX-PERF-021]]`, and stale permission state **MUST** fail closed.

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
