---
type: service-brief
service: "Resume Engine"
spec_section: §47.5
requirements: 28
tags:
  - service
  - implementation-brief
blocked_by:
  - PLX-RSK-06
---

# Resume Engine — implementation brief

[[Home|▲ Home]] · [[S47 Service Architecture|§47 Service Architecture]] · [[S46 High-Level System Architecture|§46 Topology]]

> [!abstract] What this note is
> Everything binding on this service, in one file. Read this before writing any of it.
> Nothing here is optional and nothing here is a summary — each requirement is quoted in full.

## Boundary

**Owns** — Resume generation · Workspace Memory · context compression · catch-up estimation

**MUST NOT** — Deleting or mutating source Events during compression

**Datastore** — Resume DB (versioned Resume Objects, compression artefacts)  *(owned exclusively; see [[REQ-ARC#PLX-ARC-001|PLX-ARC-001]])*

## Events emitted

- `ResumeGenerated`
- `ResumeSuperseded`
- `MemoryCompressed`
- `CatchupEstimated`

Emitting an Event not listed here violates the service contract in [[S47 Service Architecture|§47]]. Add it to the contract first.

## Events consumed

- `ContextHealthChanged`
- `MaterialityScored`
- `SessionEnded`
- `DecisionApproved`

## Service level objectives

| ID | Target |
|---|---|
| [[REQ-PERF#PLX-PERF-011|PLX-PERF-011]] | Resume generation — deterministic stages 1–6 — p50 400 ms, p95 1.2 s, p99 2.0 s. Measured: Trigger Event → structured Resume persisted. |
| [[REQ-PERF#PLX-PERF-012|PLX-PERF-012]] | Resume generation — including AI summary (stage 7) — p50 1.5 s, p95 3.5 s, p99 **5.0 s**. Measured: Trigger Event → Resume Object complete. |

Measured at reference load defined in [[S58 Performance Requirements|§58]]. A target without production instrumentation MUST NOT be claimed as met ([[REQ-PERF#PLX-PERF-070|PLX-PERF-070]]).

## Invariants this service can violate

| ID | Invariant |
|---|---|
| [[Invariants#PLX-INV-05\|PLX-INV-05]] | Nothing deletes organisational memory |
| [[Invariants#PLX-INV-07\|PLX-INV-07]] | Everything remains inspectable |
| [[Invariants#PLX-INV-12\|PLX-INV-12]] | Workspace Memory is always recoverable |

Each MUST have an automated detection test in this service's suite ([[REQ-ENG#PLX-ENG-001|PLX-ENG-001]]).

## Open decisions blocking this service

> [!warning] Do not invent resolutions to these.
> They are unresolved in the specification. If implementation forces the question, stop and record an ADR in `decisions/` rather than choosing silently.

| Risk | Severity | Required by |
|---|---|---|
| [[Risk Register#PLX-RSK-06\|PLX-RSK-06]] — Confidence score calibration | High | confidence display GA |

---

## Binding requirements (28)

#### [[REQ-PRD#PLX-PRD-030\|PLX-PRD-030]]  ·  `I, D`  ·  [[S13 Workspace Memory|§13]]

Workspace Memory capture **MUST** be automatic. The platform **MUST NOT** expose any user action whose function is to save context.

#### [[REQ-PRD#PLX-PRD-031\|PLX-PRD-031]]  ·  `T`  ·  [[S13 Workspace Memory|§13]]

A Session snapshot **MUST** be written on Desk exit, on session timeout, and at intervals not exceeding 60 seconds during active work, so that context survives unexpected client termination.

#### [[REQ-PRD#PLX-PRD-032\|PLX-PRD-032]]  ·  `T`  ·  [[S13 Workspace Memory|§13]]

Context compression **MUST NOT** delete, alter or render unreadable any Event in the Event Store. Compression **MUST** produce a derived summary artefact that references the compressed Events by identifier.

#### [[REQ-PRD#PLX-PRD-033\|PLX-PRD-033]]  ·  `T, D`  ·  [[S13 Workspace Memory|§13]]

Every compressed summary **MUST** be expandable to the underlying Event set on user request.

#### [[REQ-PRD#PLX-PRD-034\|PLX-PRD-034]]  ·  `T, I`  ·  [[S13 Workspace Memory|§13]]

Memory layers ([[S66 Workspace Memory Architecture|§66]]) **MUST** carry independent, tenant-configurable retention policies, and retention policy application **MUST** emit an auditable Event.

#### [[REQ-PRD#PLX-PRD-040\|PLX-PRD-040]]  ·  `T, D`  ·  [[S14 Resume Intelligence|§14]]

Resume generation **MUST** be continuous and automatic. The platform **MUST NOT** require a user to request a Resume.

#### [[REQ-PRD#PLX-PRD-041\|PLX-PRD-041]]  ·  `T`  ·  [[S14 Resume Intelligence|§14]]

Every Resume assertion **MUST** carry references to the Events that support it.

#### [[REQ-PRD#PLX-PRD-042\|PLX-PRD-042]]  ·  `T, D`  ·  [[S14 Resume Intelligence|§14]]

Resume Objects **MUST** be versioned and comparable, so that a user can diff the current understanding against any prior Resume for the same Desk.

#### [[REQ-PRD#PLX-PRD-043\|PLX-PRD-043]]  ·  `T, A`  ·  [[S14 Resume Intelligence|§14]]

Estimated catch-up time **MUST** be presented with an accuracy qualifier, and its calibration **MUST** be tracked as `[[REQ-MET#PLX-MET-003|PLX-MET-003]]`.

#### [[REQ-PRD#PLX-PRD-044\|PLX-PRD-044]]  ·  `T, D`  ·  [[S14 Resume Intelligence|§14]]

Where the Resume Engine has insufficient signal to produce a confident summary, it **MUST** state that plainly rather than emitting a low-confidence narrative.

#### [[REQ-UX#PLX-UX-050\|PLX-UX-050]]  ·  `T, D`  ·  [[S23 Resume Experience|§23]]

Every Desk open **MUST** present a Resume Card. Where no changes have occurred, it **MUST** state so explicitly rather than rendering empty.

#### [[REQ-UX#PLX-UX-051\|PLX-UX-051]]  ·  `D`  ·  [[S23 Resume Experience|§23]]

The disclosure path Summary → Details → Evidence → History → Raw Events **MUST** be complete and navigable for every Resume assertion.

#### [[REQ-UX#PLX-UX-052\|PLX-UX-052]]  ·  `D, I`  ·  [[S23 Resume Experience|§23]]

The Resume Card **MUST** display a confidence score, and the meaning of the score **MUST** be documented in-product in plain language.

#### [[REQ-RES#PLX-RES-001\|PLX-RES-001]]  ·  `T, D`  ·  [[S39 Resume Entity|§39]]

Resume Objects **MUST** be versioned and diffable against any prior Resume for the same Desk and user.

#### [[REQ-RES#PLX-RES-002\|PLX-RES-002]]  ·  `T`  ·  [[S39 Resume Entity|§39]]

Every Resume **MUST** record the Event identifiers from which it was derived. A Resume assertion not traceable to Events **MUST NOT** be emitted.

#### [[REQ-RES#PLX-RES-003\|PLX-RES-003]]  ·  `T, D`  ·  [[S39 Resume Entity|§39]]

`estimatedCatchup` **MUST** be expressed as a range with a stated basis, not a bare point value.

#### [[REQ-RES#PLX-RES-004\|PLX-RES-004]]  ·  `T`  ·  [[S39 Resume Entity|§39]]

Where `forUserId` is null, the Resume **MUST** be permission-filtered at render time per viewing user; a collaborative Resume **MUST NOT** be materialised in a form that leaks non-permitted content.

#### [[REQ-RES#PLX-RES-010\|PLX-RES-010]]  ·  `A, T`  ·  [[S52 Resume Engine|§52]]

Resume generation **MUST** be incremental. A Resume update **MUST NOT** require reprocessing the full Event history of a Desk.

#### [[REQ-RES#PLX-RES-011\|PLX-RES-011]]  ·  `T`  ·  [[S52 Resume Engine|§52]]

Stages 1–6 of the Resume pipeline **MUST** be independently testable and **MUST** produce a complete structured Resume without invoking a model. Stage 7 (AI Summary) **MUST** be additive prose over that structure.

#### [[REQ-RES#PLX-RES-012\|PLX-RES-012]]  ·  `T, A`  ·  [[S52 Resume Engine|§52]]

Expensive reasoning outputs **MUST** be cached and keyed by the structured input digest, so that identical input never incurs repeated model cost.

#### [[REQ-RES#PLX-RES-013\|PLX-RES-013]]  ·  `T`  ·  [[S52 Resume Engine|§52]]

Where stage 7 is unavailable or disabled, the Resume **MUST** still render from the structured output of stages 1–6.

#### [[REQ-RES#PLX-RES-020\|PLX-RES-020]]  ·  `T`  ·  [[S81 Resume Algorithms|§81]]

Each Resume stage **MUST** be independently testable with recorded fixtures, and stage outputs **MUST** be inspectable in non-production environments.

#### [[REQ-RES#PLX-RES-021\|PLX-RES-021]]  ·  `T`  ·  [[S81 Resume Algorithms|§81]]

Stages 1–5 and 7 **MUST** complete without model invocation. A Resume **MUST** be renderable from these stages alone (`[[REQ-RES#PLX-RES-013|PLX-RES-013]]`).

#### [[REQ-RES#PLX-RES-022\|PLX-RES-022]]  ·  `A`  ·  [[S81 Resume Algorithms|§81]]

Catch-up estimation (stage 7) **MUST** be calibrated against observed reconstruction time (`[[REQ-MET#PLX-MET-003|PLX-MET-003]]`) and recalibrated at least quarterly per tenant.

#### [[REQ-RES#PLX-RES-023\|PLX-RES-023]]  ·  `T`  ·  [[S81 Resume Algorithms|§81]]

Noise removal (stage 3) **MUST** be reversible: removed Events **MUST** remain reachable through the disclosure path of `[[REQ-UX#PLX-UX-051|PLX-UX-051]]`.

#### [[REQ-DATA#PLX-DATA-010\|PLX-DATA-010]]  ·  `T, I`  ·  [[S66 Workspace Memory Architecture|§66]]

Each memory layer **MUST** carry an independent, tenant-configurable retention policy, and policy application **MUST** emit an auditable Event.

#### [[REQ-DATA#PLX-DATA-011\|PLX-DATA-011]]  ·  `T, I`  ·  [[S66 Workspace Memory Architecture|§66]]

AI memory **MUST** be classified as derived and rebuildable. Loss of AI memory **MUST NOT** cause loss of Objects, Events, Relationships or Decisions.

#### [[REQ-DATA#PLX-DATA-012\|PLX-DATA-012]]  ·  `T`  ·  [[S66 Workspace Memory Architecture|§66]]

Retention policies **MUST NOT** be capable of pruning Decision `alternatives` (`[[REQ-DOM#PLX-DOM-043|PLX-DOM-043]]`) or Event records (`[[Invariants#PLX-INV-05|PLX-INV-05]]`).

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
