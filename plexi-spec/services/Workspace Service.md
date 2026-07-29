---
type: service-brief
service: "Workspace Service"
spec_section: §47.1
requirements: 45
tags:
  - service
  - implementation-brief
blocked_by:
  - PLX-RSK-13
---

# Workspace Service — implementation brief

[[Home|▲ Home]] · [[S47 Service Architecture|§47 Service Architecture]] · [[S46 High-Level System Architecture|§46 Topology]]

> [!abstract] What this note is
> Everything binding on this service, in one file. Read this before writing any of it.
> Nothing here is optional and nothing here is a summary — each requirement is quoted in full.

## Boundary

**Owns** — Desk lifecycle · workspace layouts · window positions · Sessions · Object placement · visual persistence

**MUST NOT** — Interpreting Object content; computing Context Health; generating Resumes

**Datastore** — Relational (layout, session, membership)  *(owned exclusively; see [[REQ-ARC#PLX-ARC-001|PLX-ARC-001]])*

## Events emitted

- `DeskCreated`
- `DeskActivated`
- `DeskPaused`
- `DeskArchived`
- `DeskArchetypeChanged`
- `LayoutChanged`
- `SessionStarted`
- `SessionEnded`
- `ObjectPlaced`
- `ObjectMoved`
- `ObjectResized`

Emitting an Event not listed here violates the service contract in [[S47 Service Architecture|§47]]. Add it to the contract first.

## Events consumed

- `ObjectCreated`
- `ObjectDeleted`
- `PermissionChanged`

## Service level objectives

| ID | Target |
|---|---|
| [[REQ-PERF#PLX-PERF-001|PLX-PERF-001]] | Desk open — first meaningful paint of Resume Card and layout — p50 600 ms, p95 1.5 s, p99 **2.0 s**. Measured: Gateway ingress → last byte of initial payload. |
| [[REQ-PERF#PLX-PERF-002|PLX-PERF-002]] | Desk open — full Object hydration — p50 1.5 s, p95 3.5 s, p99 5.0 s. Measured: Gateway ingress → all in-viewport Objects interactive. |

Measured at reference load defined in [[S58 Performance Requirements|§58]]. A target without production instrumentation MUST NOT be claimed as met ([[REQ-PERF#PLX-PERF-070|PLX-PERF-070]]).

## Invariants this service can violate

| ID | Invariant |
|---|---|
| [[Invariants#PLX-INV-01\|PLX-INV-01]] | Every Object belongs to exactly one owning Desk |
| [[Invariants#PLX-INV-02\|PLX-INV-02]] | Every meaningful change produces an Event |

Each MUST have an automated detection test in this service's suite ([[REQ-ENG#PLX-ENG-001|PLX-ENG-001]]).

## Open decisions blocking this service

> [!warning] Do not invent resolutions to these.
> They are unresolved in the specification. If implementation forces the question, stop and record an ADR in `decisions/` rather than choosing silently.

| Risk | Severity | Required by |
|---|---|---|
| [[Risk Register#PLX-RSK-13\|PLX-RSK-13]] — Accessibility of spatial metaphor | High | Phase 1 design |

---

## Binding requirements (45)

#### [[REQ-PRD#PLX-PRD-001\|PLX-PRD-001]]  ·  `T`  ·  [[S10 The Desk|§10]]

Every Object **MUST** belong to exactly one owning Desk.

#### [[REQ-PRD#PLX-PRD-002\|PLX-PRD-002]]  ·  `T, D`  ·  [[S10 The Desk|§10]]

A Desk **MUST** persist its complete visual layout, including Object positions, sizes, z-order, scroll positions, selections and zoom level, and **MUST** restore it on reopen.

#### [[REQ-PRD#PLX-PRD-003\|PLX-PRD-003]]  ·  `T`  ·  [[S10 The Desk|§10]]

Desk archetype **MUST** be a mutable attribute. Changing archetype **MUST NOT** require data migration, **MUST NOT** alter Object ownership, and **MUST** emit a `DeskArchetypeChanged` Event.

#### [[REQ-PRD#PLX-PRD-004\|PLX-PRD-004]]  ·  `T`  ·  [[S10 The Desk|§10]]

Desk state transitions **MUST** follow the state machine in §10.4. Invalid transitions **MUST** be rejected with a machine-readable error identifying the attempted and permitted transitions.

#### [[REQ-PRD#PLX-PRD-005\|PLX-PRD-005]]  ·  `T`  ·  [[S10 The Desk|§10]]

Archiving or moving a Desk to Historical **MUST NOT** delete Events, Relationships or Decisions, and **MUST NOT** remove the Desk from search for users holding read permission.

#### [[REQ-PRD#PLX-PRD-006\|PLX-PRD-006]]  ·  `T, D`  ·  [[S10 The Desk|§10]]

A Desk **MUST** carry an explicit, user-editable **Current Objective**. Where absent, the platform **MUST** prompt for one and **MAY** propose a draft derived from Desk activity; a proposed objective **MUST** be marked as unconfirmed until a user accepts it.

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

#### [[REQ-PRD#PLX-PRD-020\|PLX-PRD-020]]  ·  `T`  ·  [[S12 Context|§12]]

Cognitive Context values **MUST** be labelled with their acquisition method: `declared` (user-stated), `inferred` (model-derived), or `absent`.

#### [[REQ-PRD#PLX-PRD-021\|PLX-PRD-021]]  ·  `T, D`  ·  [[S12 Context|§12]]

Inferred Cognitive Context **MUST** carry a confidence score and **MUST** be visually distinguished from declared Cognitive Context wherever displayed.

#### [[REQ-PRD#PLX-PRD-022\|PLX-PRD-022]]  ·  `T, D`  ·  [[S12 Context|§12]]

Inferred Cognitive Context below the platform confidence threshold **MUST NOT** be displayed as an assertion. It **MAY** be offered as a question to the user.

#### [[REQ-PRD#PLX-PRD-023\|PLX-PRD-023]]  ·  `D`  ·  [[S12 Context|§12]]

The platform **MUST** provide a low-friction affordance for a user to declare their current question and expected next action, and **MUST NOT** require it.

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

#### [[REQ-PRD#PLX-PRD-050\|PLX-PRD-050]]  ·  `T`  ·  [[S15 Knowledge Graph|§15]]

Every Relationship **MUST** carry provenance: discovery method, creating actor or system, evidence references, and confidence.

#### [[REQ-PRD#PLX-PRD-051\|PLX-PRD-051]]  ·  `T`  ·  [[S15 Knowledge Graph|§15]]

AI-discovered Relationships **MUST** be stored as `provisional` and **MUST NOT** influence Context Health, Resume content or permission evaluation until confirmed by a user or until confidence exceeds the configured tenant threshold.

#### [[REQ-PRD#PLX-PRD-052\|PLX-PRD-052]]  ·  `T`  ·  [[S15 Knowledge Graph|§15]]

Promotion of a provisional Relationship to confirmed by threshold **MUST** emit a `RelationshipConfirmed` Event recording the threshold and the confidence at promotion.

#### [[REQ-PRD#PLX-PRD-053\|PLX-PRD-053]]  ·  `D`  ·  [[S15 Knowledge Graph|§15]]

The platform **MUST NOT** require a user to manually construct graph structure in order to receive relationship-derived intelligence.

#### [[REQ-PRD#PLX-PRD-060\|PLX-PRD-060]]  ·  `T`  ·  [[S16 Shared Objects|§16]]

Sharing an Object into an additional Desk **MUST NOT** change its owning Desk.

#### [[REQ-PRD#PLX-PRD-061\|PLX-PRD-061]]  ·  `T`  ·  [[S16 Shared Objects|§16]]

Where an Object appears in multiple Desks with differing permissions, the **most restrictive** applicable permission **MUST** govern for a given user.

#### [[REQ-PRD#PLX-PRD-062\|PLX-PRD-062]]  ·  `D`  ·  [[S16 Shared Objects|§16]]

The synchronisation mode of a shared Object **MUST** be visible to every user who can see the Object, so that no user edits a Snapshot believing it is a Live Reference.

#### [[REQ-PRD#PLX-PRD-063\|PLX-PRD-063]]  ·  `T`  ·  [[S16 Shared Objects|§16]]

Federated Objects **MUST** record all owners explicitly, and a change of the owner set **MUST** emit an Event and require approval from the existing owner set per tenant policy.

#### [[REQ-PRD#PLX-PRD-070\|PLX-PRD-070]]  ·  `T`  ·  [[S17 Organisational Intelligence|§17]]

Cross-Desk awareness statements **MUST** be permission-filtered per recipient. A statement **MUST NOT** be rendered if doing so would disclose the existence, name, or attributes of an Object, Desk or Decision the recipient is not permitted to know exists.

#### [[REQ-PRD#PLX-PRD-071\|PLX-PRD-071]]  ·  `T, I`  ·  [[S17 Organisational Intelligence|§17]]

Where a cross-Desk dependency exists but the recipient lacks permission to see its subject, the platform **MUST** either suppress the statement entirely or render a permission-safe form that discloses no protected attribute, according to tenant policy. The chosen behaviour **MUST** be configurable and auditable.

#### [[REQ-PRD#PLX-PRD-072\|PLX-PRD-072]]  ·  `T`  ·  [[S17 Organisational Intelligence|§17]]

Departure of a user (deactivation) **MUST NOT** remove Objects, Decisions, Relationships or Events they authored, and **MUST** trigger an ownership reassignment workflow for Objects they owned.

#### [[REQ-UX#PLX-UX-030\|PLX-UX-030]]  ·  `T, D`  ·  [[S21 Workspace Navigation|§21]]

The platform **MUST NOT** reposition, resize or reflow user-placed Objects on a Desk without explicit user action, except where required by a viewport change, and **MUST** restore the user's canonical layout when the original viewport is restored.

#### [[REQ-UX#PLX-UX-031\|PLX-UX-031]]  ·  `T, D`  ·  [[S21 Workspace Navigation|§21]]

Desk restoration **MUST** restore layout, scroll positions, window states, open conversations, selected Objects, AI discussions and active workflows to the state recorded in the most recent Session snapshot.

#### [[REQ-UX#PLX-UX-032\|PLX-UX-032]]  ·  `T`  ·  [[S21 Workspace Navigation|§21]]

Layout **MUST** be persisted per (user, Desk, device class), so that a user's desktop arrangement is not overwritten by their mobile or multi-monitor arrangement.

#### [[REQ-UX#PLX-UX-033\|PLX-UX-033]]  ·  `D`  ·  [[S21 Workspace Navigation|§21]]

Where layout cannot be fully restored (for example, an Object has been deleted or permission revoked), the platform **MUST** indicate what could not be restored rather than silently omitting it.

#### [[REQ-DOM#PLX-DOM-050\|PLX-DOM-050]]  ·  `T, I`  ·  [[S40 Session Entity|§40]]

`FocusRecord` data (which Object, for how long) **MUST** be classified as presence-class data and **MUST** be subject to the retention constraints of `[[REQ-UX#PLX-UX-072|PLX-UX-072]]`.

#### [[REQ-DOM#PLX-DOM-051\|PLX-DOM-051]]  ·  `T`  ·  [[S40 Session Entity|§40]]

Sessions **MUST** be closed by explicit exit, by timeout, or by recovery on next connection. An unclosed Session **MUST NOT** block Resume generation.

#### [[REQ-APP#PLX-APP-010\|PLX-APP-010]]  ·  `T, D`  ·  [[S77 Native Workspace Applications|§77]]

The Canvas **MUST** persist Object position, size and z-order per (user, Desk, device class) and restore them exactly (`[[REQ-UX#PLX-UX-030|PLX-UX-030]]`, `[[REQ-UX#PLX-UX-032|PLX-UX-032]]`).

#### [[REQ-APP#PLX-APP-011\|PLX-APP-011]]  ·  `T, D`  ·  [[S77 Native Workspace Applications|§77]]

The Canvas **MUST** provide the equivalent linear, screen-reader-navigable representation required by `[[REQ-A11Y#PLX-A11Y-003|PLX-A11Y-003]]`, developed and released concurrently with the spatial surface.

#### [[REQ-APP#PLX-APP-012\|PLX-APP-012]]  ·  `A, T`  ·  [[S77 Native Workspace Applications|§77]]

Canvas rendering **MUST** virtualise off-viewport Objects so that Desk open latency (`[[REQ-PERF#PLX-PERF-001|PLX-PERF-001]]`) is independent of total Object count.

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
