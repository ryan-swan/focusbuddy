---
type: service-brief
service: "Context Engine"
spec_section: §47.4
requirements: 28
tags:
  - service
  - implementation-brief
blocked_by:
  - PLX-RSK-03
  - PLX-RSK-12
---

# Context Engine — implementation brief

[[Home|▲ Home]] · [[S47 Service Architecture|§47 Service Architecture]] · [[S46 High-Level System Architecture|§46 Topology]]

> [!abstract] What this note is
> Everything binding on this service, in one file. Read this before writing any of it.
> Nothing here is optional and nothing here is a summary — each requirement is quoted in full.

## Boundary

**Owns** — Current understanding · Context Health · Resume triggers · dependency tracking · materiality

**MUST NOT** — Calling AI models in the deterministic scoring path

**Datastore** — Context DB (per-user per-Object health; Context Objects)  *(owned exclusively; see [[REQ-ARC#PLX-ARC-001|PLX-ARC-001]])*

## Events emitted

- `ContextHealthChanged`
- `MaterialityScored`
- `DependencyImpactDetected`
- `ContextGenerated`
- `AttentionRaised`

Emitting an Event not listed here violates the service contract in [[S47 Service Architecture|§47]]. Add it to the contract first.

## Events consumed

- `*all domain Events*`
- `RelationshipConfirmed`
- `DecisionSuperseded`

## Service level objectives

| ID | Target |
|---|---|
| [[REQ-PERF#PLX-PERF-020|PLX-PERF-020]] | Context Health update — direct impact (depth 0–1) — p50 60 ms, p95 180 ms, p99 **250 ms**. Measured: Event ingestion → health state committed. |
| [[REQ-PERF#PLX-PERF-021|PLX-PERF-021]] | Context Health update — propagated impact (depth 2–N, within bound) — p50 120 ms, p95 350 ms, p99 **500 ms**. Measured: Event ingestion → all in-bound propagation committed. |

Measured at reference load defined in [[S58 Performance Requirements|§58]]. A target without production instrumentation MUST NOT be claimed as met ([[REQ-PERF#PLX-PERF-070|PLX-PERF-070]]).

## Invariants this service can violate

| ID | Invariant |
|---|---|
| [[Invariants#PLX-INV-04\|PLX-INV-04]] | AI never bypasses structured data |
| [[Invariants#PLX-INV-06\|PLX-INV-06]] | Permissions propagate through relationships |
| [[Invariants#PLX-INV-07\|PLX-INV-07]] | Everything remains inspectable |

Each MUST have an automated detection test in this service's suite ([[REQ-ENG#PLX-ENG-001|PLX-ENG-001]]).

## Open decisions blocking this service

> [!warning] Do not invent resolutions to these.
> They are unresolved in the specification. If implementation forces the question, stop and record an ADR in `decisions/` rather than choosing silently.

| Risk | Severity | Required by |
|---|---|---|
| [[Risk Register#PLX-RSK-03\|PLX-RSK-03]] — Context Health computation cost at scale | High | Phase 2 design |
| [[Risk Register#PLX-RSK-12\|PLX-RSK-12]] — Presence telemetry as surveillance | High | Phase 1 exit |

---

## Binding requirements (28)

#### [[REQ-PRD#PLX-PRD-020\|PLX-PRD-020]]  ·  `T`  ·  [[S12 Context|§12]]

Cognitive Context values **MUST** be labelled with their acquisition method: `declared` (user-stated), `inferred` (model-derived), or `absent`.

#### [[REQ-PRD#PLX-PRD-021\|PLX-PRD-021]]  ·  `T, D`  ·  [[S12 Context|§12]]

Inferred Cognitive Context **MUST** carry a confidence score and **MUST** be visually distinguished from declared Cognitive Context wherever displayed.

#### [[REQ-PRD#PLX-PRD-022\|PLX-PRD-022]]  ·  `T, D`  ·  [[S12 Context|§12]]

Inferred Cognitive Context below the platform confidence threshold **MUST NOT** be displayed as an assertion. It **MAY** be offered as a question to the user.

#### [[REQ-UX#PLX-UX-020\|PLX-UX-020]]  ·  `T`  ·  [[S20 Context Health|§20]]

Context Health **MUST** be evaluated per (user, Object) pair, relative to that user's last review point.

#### [[REQ-UX#PLX-UX-021\|PLX-UX-021]]  ·  `T`  ·  [[S20 Context Health|§20]]

Context Health transitions **MUST** be driven by materiality score ([[S80 Context Engine Algorithms|§80]]), not by raw change detection. A non-material change **MUST NOT** produce an `Attention Required` transition.

#### [[REQ-UX#PLX-UX-022\|PLX-UX-022]]  ·  `T, A`  ·  [[S20 Context Health|§20]]

Context Health **MUST** propagate across confirmed Relationships. Propagation depth **MUST** be bounded by configuration, and the bound **MUST** be recorded in the propagation Event so that truncation is visible rather than silent.

#### [[REQ-UX#PLX-UX-023\|PLX-UX-023]]  ·  `T`  ·  [[S20 Context Health|§20]]

Presence (`Live Activity`) **MUST** be modelled orthogonally to Context Health state and **MUST NOT** overwrite an `Attention Required` or `Decision Risk` state.

#### [[REQ-UX#PLX-UX-024\|PLX-UX-024]]  ·  `T`  ·  [[S20 Context Health|§20]]

Every Context Health transition **MUST** record the triggering Event, the materiality score, and the propagation path, and this record **MUST** be retrievable by the user (`[[REQ-UX#PLX-UX-015|PLX-UX-015]]`).

#### [[REQ-UX#PLX-UX-025\|PLX-UX-025]]  ·  `T`  ·  [[S20 Context Health|§20]]

Transition to `Decision Risk` **MUST** identify the specific Decision or Decisions at risk and the specific change believed to invalidate them. A `Decision Risk` state without a named Decision **MUST NOT** be raised.

#### [[REQ-DOM#PLX-DOM-030\|PLX-DOM-030]]  ·  `T, I`  ·  [[S34 Object Entity|§34]]

Context Health **MUST NOT** be stored as a scalar attribute on the Object entity. It **MUST** be computed or materialised per (user, Object) pair (`[[REQ-UX#PLX-UX-020|PLX-UX-020]]`).

#### [[REQ-EVT#PLX-EVT-020\|PLX-EVT-020]]  ·  `T, A`  ·  [[S48 Event Architecture|§48]]

Deterministic processing of an Event **MUST** complete before any AI reasoning is invoked on that Event. AI invocation **MUST NOT** be a precondition for any Context Health transition, Relationship confirmation or Resume update.

#### [[REQ-EVT#PLX-EVT-021\|PLX-EVT-021]]  ·  `T`  ·  [[S48 Event Architecture|§48]]

Failure or unavailability of AI reasoning **MUST NOT** prevent Event processing, Context Health computation or Resume generation from completing.

#### [[REQ-CTX#PLX-CTX-001\|PLX-CTX-001]]  ·  `T`  ·  [[S38 Context Entity|§38]]

Context Objects **MUST** be versioned and retained. Superseded Context Objects **MUST** remain retrievable for audit.

#### [[REQ-CTX#PLX-CTX-002\|PLX-CTX-002]]  ·  `T`  ·  [[S38 Context Entity|§38]]

Every field in a Context Object derived from inference **MUST** carry source, confidence and evidence (`CognitiveField`).

#### [[REQ-CTX#PLX-CTX-010\|PLX-CTX-010]]  ·  `T`  ·  [[S51 Context Engine|§51]]

Materiality scoring **MUST** be deterministic and reproducible. Given identical inputs, it **MUST** produce an identical score.

#### [[REQ-CTX#PLX-CTX-011\|PLX-CTX-011]]  ·  `T, A`  ·  [[S51 Context Engine|§51]]

Materiality scoring **MUST NOT** require an AI model call in its primary path. AI **MAY** be used to enrich explanation after scoring completes.

#### [[REQ-CTX#PLX-CTX-012\|PLX-CTX-012]]  ·  `T, I`  ·  [[S51 Context Engine|§51]]

Materiality thresholds **MUST** be tenant-configurable and **MUST** be recorded on each scoring Event, so that a change in threshold is distinguishable from a change in behaviour when auditing historical decisions.

#### [[REQ-CTX#PLX-CTX-013\|PLX-CTX-013]]  ·  `T, A`  ·  [[S51 Context Engine|§51]]

The Context Engine **MUST** bound dependency propagation by configured maximum depth and maximum fan-out. Where a propagation is truncated by either bound, the truncation **MUST** be recorded and **MUST** be visible in the resulting attention record.

#### [[REQ-CTX#PLX-CTX-014\|PLX-CTX-014]]  ·  `A`  ·  [[S51 Context Engine|§51]]

Context Health computation **MUST** meet `[[REQ-PERF#PLX-PERF-020|PLX-PERF-020]]` for direct impact and `[[REQ-PERF#PLX-PERF-021|PLX-PERF-021]]` for propagated impact. These are separate budgets and **MUST NOT** be conflated.

#### [[REQ-CTX#PLX-CTX-020\|PLX-CTX-020]]  ·  `T`  ·  [[S80 Context Engine Algorithms|§80]]

Materiality scoring **MUST** be a pure function of its declared inputs — deterministic, reproducible and free of model invocation (`[[REQ-CTX#PLX-CTX-010|PLX-CTX-010]]`, `[[REQ-CTX#PLX-CTX-011|PLX-CTX-011]]`).

#### [[REQ-CTX#PLX-CTX-021\|PLX-CTX-021]]  ·  `T`  ·  [[S80 Context Engine Algorithms|§80]]

The materiality function and its weights **MUST** be versioned, and the version **MUST** be recorded on every scoring Event, so that historical scores remain interpretable after the function changes.

#### [[REQ-CTX#PLX-CTX-022\|PLX-CTX-022]]  ·  `T, I`  ·  [[S80 Context Engine Algorithms|§80]]

Materiality weights **MUST** be tunable per tenant without code deployment, and every tuning change **MUST** emit an auditable Event.

#### [[REQ-CTX#PLX-CTX-023\|PLX-CTX-023]]  ·  `A, T`  ·  [[S80 Context Engine Algorithms|§80]]

Propagation **MUST** be incremental. A change **MUST NOT** trigger recalculation of unaffected graph regions.

#### [[REQ-CTX#PLX-CTX-024\|PLX-CTX-024]]  ·  `T, A`  ·  [[S80 Context Engine Algorithms|§80]]

Propagation **MUST** be bounded by maximum depth and maximum fan-out, both tenant-configurable, and truncation **MUST** be recorded and visible (`[[REQ-CTX#PLX-CTX-013|PLX-CTX-013]]`).

#### [[REQ-CTX#PLX-CTX-025\|PLX-CTX-025]]  ·  `A, T`  ·  [[S80 Context Engine Algorithms|§80]]

Synchronous propagation **MUST** be limited to the budget of `[[REQ-PERF#PLX-PERF-021|PLX-PERF-021]]`; propagation beyond that budget **MUST** continue asynchronously and **MUST** update Context Health on completion.

#### [[REQ-CTX#PLX-CTX-026\|PLX-CTX-026]]  ·  `T`  ·  [[S80 Context Engine Algorithms|§80]]

Propagation **MUST** be cycle-safe. The Relationship graph is not acyclic and propagation **MUST** terminate on cyclic paths without repeated re-entry.

#### [[REQ-CTX#PLX-CTX-030\|PLX-CTX-030]]  ·  `T`  ·  [[S80 Context Engine Algorithms|§80]]

Context freshness **MUST** be computed per (user, Desk) and **MUST** decay with elapsed meaningful change, not with elapsed time alone.

#### [[REQ-CTX#PLX-CTX-031\|PLX-CTX-031]]  ·  `I, T`  ·  [[S80 Context Engine Algorithms|§80]]

Freshness scores **MUST NOT** be surfaced as a comparative measure between users, and **MUST NOT** be exportable in a form that supports individual performance ranking.

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
