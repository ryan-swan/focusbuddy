---
type: service-brief
service: "Object Service"
spec_section: §47.2
requirements: 18
tags:
  - service
  - implementation-brief
blocked_by:
  - PLX-RSK-09
---

# Object Service — implementation brief

[[Home|▲ Home]] · [[S47 Service Architecture|§47 Service Architecture]] · [[S46 High-Level System Architecture|§46 Topology]]

> [!abstract] What this note is
> Everything binding on this service, in one file. Read this before writing any of it.
> Nothing here is optional and nothing here is a summary — each requirement is quoted in full.

## Boundary

**Owns** — Object creation · storage · version history · sharing · metadata · lifecycle

**MUST NOT** — Presentation; relationships; Context Health

**Datastore** — Document store + blob store  *(owned exclusively; see [[REQ-ARC#PLX-ARC-001|PLX-ARC-001]])*

## Events emitted

- `ObjectCreated`
- `ObjectUpdated`
- `ObjectVersioned`
- `ObjectShared`
- `ObjectArchived`
- `ObjectDeleted`
- `ObjectImported`
- `ObjectExported`

Emitting an Event not listed here violates the service contract in [[S47 Service Architecture|§47]]. Add it to the contract first.

## Events consumed

- `ConnectorSyncCompleted`
- `PermissionChanged`

## Service level objectives

| ID | Target |
|---|---|
| [[REQ-PERF#PLX-PERF-010|PLX-PERF-010]] | Object open (in-Desk) — p50 150 ms, p95 400 ms, p99 800 ms. Measured: Gateway ingress → content available. |

Measured at reference load defined in [[S58 Performance Requirements|§58]]. A target without production instrumentation MUST NOT be claimed as met ([[REQ-PERF#PLX-PERF-070|PLX-PERF-070]]).

## Invariants this service can violate

| ID | Invariant |
|---|---|
| [[Invariants#PLX-INV-01\|PLX-INV-01]] | Every Object belongs to exactly one owning Desk |
| [[Invariants#PLX-INV-02\|PLX-INV-02]] | Every meaningful change produces an Event |
| [[Invariants#PLX-INV-05\|PLX-INV-05]] | Nothing deletes organisational memory |

Each MUST have an automated detection test in this service's suite ([[REQ-ENG#PLX-ENG-001|PLX-ENG-001]]).

## Open decisions blocking this service

> [!warning] Do not invent resolutions to these.
> They are unresolved in the specification. If implementation forces the question, stop and record an ADR in `decisions/` rather than choosing silently.

| Risk | Severity | Required by |
|---|---|---|
| [[Risk Register#PLX-RSK-09\|PLX-RSK-09]] — Relationship existence as protected fact | Critical | Phase 2 entry |

---

## Binding requirements (18)

#### [[REQ-PRD#PLX-PRD-001\|PLX-PRD-001]]  ·  `T`  ·  [[S10 The Desk|§10]]

Every Object **MUST** belong to exactly one owning Desk.

#### [[REQ-PRD#PLX-PRD-010\|PLX-PRD-010]]  ·  `I, T`  ·  [[S11 Objects|§11]]

All Object types **MUST** use the universal Object schema ([[S34 Object Entity|§34]]). Type-specific data **MUST** be carried in the typed payload, not by extending the base schema.

#### [[REQ-PRD#PLX-PRD-011\|PLX-PRD-011]]  ·  `T`  ·  [[S11 Objects|§11]]

The Object type registry **MUST** be extensible at runtime without redeployment of the Object Service, and extension-registered types **MUST** receive identical permission, event, versioning and Context Health handling to built-in types.

#### [[REQ-PRD#PLX-PRD-012\|PLX-PRD-012]]  ·  `T`  ·  [[S11 Objects|§11]]

Deletion of an Object **MUST** remove it from default visibility and search results while retaining its Events, Relationships and version history.

#### [[REQ-PRD#PLX-PRD-013\|PLX-PRD-013]]  ·  `D, I`  ·  [[S11 Objects|§11]]

The platform **MUST** present users with an accurate, plain-language statement of what deletion does and does not remove, at the point of deletion.

#### [[REQ-PRD#PLX-PRD-014\|PLX-PRD-014]]  ·  `T, A`  ·  [[S11 Objects|§11]]

Every Object **MUST** carry semantic embeddings maintained within `[[REQ-PERF#PLX-PERF-020|PLX-PERF-020]]` of a content-changing Event, or be explicitly excluded from semantic indexing by policy with the exclusion recorded.

#### [[REQ-PRD#PLX-PRD-060\|PLX-PRD-060]]  ·  `T`  ·  [[S16 Shared Objects|§16]]

Sharing an Object into an additional Desk **MUST NOT** change its owning Desk.

#### [[REQ-PRD#PLX-PRD-061\|PLX-PRD-061]]  ·  `T`  ·  [[S16 Shared Objects|§16]]

Where an Object appears in multiple Desks with differing permissions, the **most restrictive** applicable permission **MUST** govern for a given user.

#### [[REQ-PRD#PLX-PRD-062\|PLX-PRD-062]]  ·  `D`  ·  [[S16 Shared Objects|§16]]

The synchronisation mode of a shared Object **MUST** be visible to every user who can see the Object, so that no user edits a Snapshot believing it is a Live Reference.

#### [[REQ-PRD#PLX-PRD-063\|PLX-PRD-063]]  ·  `T`  ·  [[S16 Shared Objects|§16]]

Federated Objects **MUST** record all owners explicitly, and a change of the owner set **MUST** emit an Event and require approval from the existing owner set per tenant policy.

#### [[REQ-DOM#PLX-DOM-020\|PLX-DOM-020]]  ·  `I, T`  ·  [[S33 Desk Entity|§33]]

No Object type **MUST** receive privileged treatment in storage, permission evaluation, event generation, versioning or Context Health computation.

#### [[REQ-DOM#PLX-DOM-030\|PLX-DOM-030]]  ·  `T, I`  ·  [[S34 Object Entity|§34]]

Context Health **MUST NOT** be stored as a scalar attribute on the Object entity. It **MUST** be computed or materialised per (user, Object) pair (`[[REQ-UX#PLX-UX-020|PLX-UX-020]]`).

#### [[REQ-DOM#PLX-DOM-031\|PLX-DOM-031]]  ·  `T`  ·  [[S34 Object Entity|§34]]

`DeskPresence.effectivePermissions` **MUST** be computed as the most restrictive intersection of the owning Desk permissions and the presenting Desk permissions (`[[REQ-PRD#PLX-PRD-061|PLX-PRD-061]]`).

#### [[REQ-DOM#PLX-DOM-032\|PLX-DOM-032]]  ·  `T, A`  ·  [[S34 Object Entity|§34]]

Large Object content **MUST** be stored out-of-band via `contentRef` and **MUST NOT** be embedded in Event payloads. Events **MUST** reference content by immutable digest.

#### [[REQ-DOM#PLX-DOM-040\|PLX-DOM-040]]  ·  `T`  ·  [[S37 Decision Entity|§37]]

`decisionOwner` and every `Approval.approver` **MUST** be a human principal. An Agent or service principal **MUST NOT** be recorded as a Decision owner or approver.

#### [[REQ-DOM#PLX-DOM-041\|PLX-DOM-041]]  ·  `T, D`  ·  [[S37 Decision Entity|§37]]

`aiCommentary` **MUST** be stored and displayed as advisory. It **MUST NOT** be rendered in a manner that implies it constitutes the Decision, the rationale of record, or an approval.

#### [[REQ-DOM#PLX-DOM-042\|PLX-DOM-042]]  ·  `T`  ·  [[S37 Decision Entity|§37]]

Superseding a Decision **MUST** set `supersededById`, **MUST** create a `DecisionSuperseded` Event, and **MUST** trigger Context Health re-evaluation for every Object referencing the superseded Decision.

#### [[REQ-DOM#PLX-DOM-043\|PLX-DOM-043]]  ·  `T, I`  ·  [[S37 Decision Entity|§37]]

Rejected `alternatives` **MUST** be retained permanently. The record of what was *not* chosen, and why, **MUST NOT** be pruned by any retention or compression process.

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
