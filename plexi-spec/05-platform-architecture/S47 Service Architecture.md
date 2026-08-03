---
id: S47
section: §47
title: "Service Architecture"
part: V
type: section
defines:
  - PLX-AGT-003
  - PLX-ARC-001
  - PLX-ARC-020
  - PLX-ARC-021
  - PLX-ARC-022
  - PLX-EVT-020
  - PLX-PERF-001
  - PLX-PERF-010
  - PLX-PERF-011
  - PLX-PERF-020
  - PLX-PERF-021
  - PLX-PERF-022
  - PLX-PERF-030
  - PLX-PERF-040
  - PLX-PERF-050
  - PLX-PERF-060
  - PLX-PRD-032
  - PLX-SCH-001
tags:
  - section
  - part/v
---

# §47 Service Architecture

◀ [[S46 High-Level System Architecture]] · [[Part V — Platform Architecture|▲ Part V]] · [[S48 Event Architecture]] ▶

---

The initial platform consists of the following services. Each row of each contract table is binding: a service that emits Events not listed in its contract, or consumes a store it does not own, is in violation of `[[REQ-ARC#PLX-ARC-001|PLX-ARC-001]]`.

### 47.1 Workspace Service

**Owns:** Desk lifecycle · workspace layouts · window positions · Sessions · Object placement · visual persistence.

The Workspace Service owns **visual state only**. It does not understand business meaning.

| Aspect | Contract |
|---|---|
| Datastore | Relational (layout, session, membership) |
| Emits | `DeskCreated`, `DeskActivated`, `DeskPaused`, `DeskArchived`, `DeskArchetypeChanged`, `LayoutChanged`, `SessionStarted`, `SessionEnded`, `ObjectPlaced`, `ObjectMoved`, `ObjectResized` |
| Consumes | `ObjectCreated`, `ObjectDeleted`, `PermissionChanged` |
| Must not | Interpret Object content; compute Context Health; generate Resumes |
| SLO | `[[REQ-PERF#PLX-PERF-001|PLX-PERF-001]]` |

### 47.2 Object Service

**Owns:** Object creation · storage · version history · sharing · metadata · lifecycle. Every visible entity originates here.

| Aspect | Contract |
|---|---|
| Datastore | Document store + blob store |
| Emits | `ObjectCreated`, `ObjectUpdated`, `ObjectVersioned`, `ObjectShared`, `ObjectArchived`, `ObjectDeleted`, `ObjectImported`, `ObjectExported` |
| Consumes | `ConnectorSyncCompleted`, `PermissionChanged` |
| Must not | Own presentation; own relationships; own Context Health |
| SLO | `[[REQ-PERF#PLX-PERF-010|PLX-PERF-010]]` |

### 47.3 Event Service

**Owns:** Event creation · persistence · distribution · replay · audit. Events are append-only and never modified.

| Aspect | Contract |
|---|---|
| Datastore | Event Store (append-only log) + partitioned bus |
| Emits | — (transports all Events; emits only `ReplayStarted`, `ReplayCompleted`, `RetentionPolicyApplied`) |
| Consumes | All Events |
| Must not | Expose mutation or deletion of Event records via any interface |
| SLO | `[[REQ-PERF#PLX-PERF-030|PLX-PERF-030]]` |

### 47.4 Context Engine

**Owns:** current understanding · Context Health · Resume generation triggers · dependency tracking · materiality analysis.

The Context Engine answers: *"What does this mean?"*

| Aspect | Contract |
|---|---|
| Datastore | Context DB (per-user, per-Object health; Context Objects) |
| Emits | `ContextHealthChanged`, `MaterialityScored`, `DependencyImpactDetected`, `ContextGenerated`, `AttentionRaised` |
| Consumes | All domain Events, `RelationshipConfirmed`, `DecisionSuperseded` |
| Must not | Call AI models directly for deterministic scoring (`[[REQ-EVT#PLX-EVT-020|PLX-EVT-020]]`) |
| SLO | `[[REQ-PERF#PLX-PERF-020|PLX-PERF-020]]`, `[[REQ-PERF#PLX-PERF-021|PLX-PERF-021]]` |

### 47.5 Resume Engine

**Owns:** Resume generation · Workspace Memory · context compression · return summaries · suggested next actions · catch-up estimation.

| Aspect | Contract |
|---|---|
| Datastore | Resume DB (versioned Resume Objects, compression artefacts) |
| Emits | `ResumeGenerated`, `ResumeSuperseded`, `MemoryCompressed`, `CatchupEstimated` |
| Consumes | `ContextHealthChanged`, `MaterialityScored`, `SessionEnded`, `DecisionApproved` |
| Must not | Delete or mutate source Events during compression (`[[REQ-PRD#PLX-PRD-032|PLX-PRD-032]]`) |
| SLO | `[[REQ-PERF#PLX-PERF-011|PLX-PERF-011]]` |

### 47.6 Graph Engine

**Owns:** knowledge graph · relationship storage · graph traversal · relationship discovery · dependency analysis · organisational reasoning.

| Aspect | Contract |
|---|---|
| Datastore | Graph DB (tenant-namespaced) |
| Emits | `RelationshipDiscovered`, `RelationshipConfirmed`, `RelationshipRejected`, `RelationshipSuperseded`, `DuplicateDetected`, `ClusterFormed` |
| Consumes | All domain Events, `EmbeddingUpdated` |
| Must not | Emit `confirmed` Relationships from AI discovery (`[[REQ-AGT#PLX-AGT-003|PLX-AGT-003]]`) |
| SLO | `[[REQ-PERF#PLX-PERF-022|PLX-PERF-022]]` |

### 47.7 Search Service

**Owns:** keyword search · semantic search · graph search · hybrid ranking · context-aware search.

| Aspect | Contract |
|---|---|
| Datastore | Search index + vector index |
| Emits | `SearchExecuted`, `EmbeddingUpdated` |
| Consumes | `ObjectCreated`, `ObjectUpdated`, `ObjectDeleted`, `PermissionChanged`, `RelationshipConfirmed` |
| Must not | Return results before permission filtering (`[[REQ-SCH#PLX-SCH-001|PLX-SCH-001]]`) |
| SLO | `[[REQ-PERF#PLX-PERF-040|PLX-PERF-040]]` |

### 47.8 AI Orchestrator

**Owns:** model routing · prompt assembly · agent coordination · tool invocation · cost management · caching · AI policy enforcement.

| Aspect | Contract |
|---|---|
| Datastore | Prompt cache, reasoning cache, cost ledger |
| Emits | `ReasoningRequested`, `ReasoningCompleted`, `ReasoningRejected`, `ModelRouted`, `CostRecorded`, `CostCeilingExceeded` |
| Consumes | `AttentionRaised`, `ContextGenerated`, `ResumeGenerated`, agent task requests |
| Must not | Write domain state directly; bypass permission evaluation |
| SLO | `[[REQ-PERF#PLX-PERF-050|PLX-PERF-050]]` |

### 47.9 Automation Engine

**Owns:** workflow execution · triggers · actions · scheduling · approvals · long-running workflows.

| Aspect | Contract |
|---|---|
| Datastore | Workflow DB (durable execution state) |
| Emits | `WorkflowStarted`, `WorkflowStepCompleted`, `WorkflowCompleted`, `WorkflowFailed`, `ApprovalRequested`, `ApprovalGranted`, `ApprovalDeclined` |
| Consumes | All Events (as trigger sources) |
| Must not | Execute an action exceeding the initiating principal's permissions |
| SLO | — |

### 47.10 Connector Service

**Owns:** external applications · authentication · API integrations · webhooks · import · export · synchronisation.

| Aspect | Contract |
|---|---|
| Datastore | Connector config, credential vault references, sync cursors |
| Emits | `ConnectorConnected`, `ConnectorDisconnected`, `ConnectorSyncStarted`, `ConnectorSyncCompleted`, `ConnectorSyncFailed`, `ExternalObjectImported` |
| Consumes | `ObjectUpdated` (for outbound sync), `WorkflowStepCompleted` |
| Must not | Store third-party credentials outside the credential vault |
| SLO | — |

### 47.11 Identity Service

**Owns:** authentication · authorisation · users · groups · roles · permissions · audit.

| Aspect | Contract |
|---|---|
| Datastore | Relational (identity, roles, policy) |
| Emits | `UserCreated`, `UserDeactivated`, `RoleAssigned`, `PermissionChanged`, `AuthenticationFailed`, `PolicyChanged` |
| Consumes | — |
| Must not | Be bypassed by any service for authorisation decisions |
| SLO | `[[REQ-PERF#PLX-PERF-060|PLX-PERF-060]]` |

### 47.12 Cross-cutting requirements

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-ARC#PLX-ARC-020|PLX-ARC-020]] | Every service **MUST** publish an OpenAPI or equivalent machine-readable contract, and an AsyncAPI or equivalent Event contract, versioned and validated in CI. | T, I | §47, [[S73 Engineering Standards|§73]] |
| [[REQ-ARC#PLX-ARC-021|PLX-ARC-021]] | Every service **MUST** document its failure modes and recovery procedures before production deployment ([[S73 Engineering Standards|§73]]). | I | [[S73 Engineering Standards|§73]] |
| [[REQ-ARC#PLX-ARC-022|PLX-ARC-022]] | No service **MUST** require synchronous availability of the AI Orchestrator to serve its core capability. Loss of AI availability **MUST** degrade the platform to deterministic operation, not to unavailability. | T, A | [[S45 Platform Architecture|§45]], new |

> **On `[[REQ-ARC#PLX-ARC-022|PLX-ARC-022]]`.** This is the operational expression of [[S33 Desk Entity|§33]]'s requirement that AI-disabled Desks still work. It also protects against the most likely production incident on this architecture: a model provider outage or rate-limit event. If Desk open depends on an inference call, a provider incident becomes a full platform outage. It must not.

---

---

## Requirements defined or cited here

- [[REQ-AGT#PLX-AGT-003|PLX-AGT-003]] — Agents **MUST NOT** create Relationships in `confirmed` state. Agent-created Relationships **MUST** be `provis
- [[REQ-ARC#PLX-ARC-001|PLX-ARC-001]] — Each service **MUST** own exactly one business capability and **MUST** own its own datastore. No service **MUS
- [[REQ-ARC#PLX-ARC-020|PLX-ARC-020]] — Every service **MUST** publish an OpenAPI or equivalent machine-readable contract, and an AsyncAPI or equivale
- [[REQ-ARC#PLX-ARC-021|PLX-ARC-021]] — Every service **MUST** document its failure modes and recovery procedures before production deployment (§73).
- [[REQ-ARC#PLX-ARC-022|PLX-ARC-022]] — No service **MUST** require synchronous availability of the AI Orchestrator to serve its core capability. Loss
- [[REQ-EVT#PLX-EVT-020|PLX-EVT-020]] — Deterministic processing of an Event **MUST** complete before any AI reasoning is invoked on that Event. AI in
- [[REQ-PERF#PLX-PERF-001|PLX-PERF-001]] — Desk open — first meaningful paint of Resume Card and layout — p50 600 ms, p95 1.5 s, p99 **2.0 s**. Measured:
- [[REQ-PERF#PLX-PERF-010|PLX-PERF-010]] — Object open (in-Desk) — p50 150 ms, p95 400 ms, p99 800 ms. Measured: Gateway ingress → content available.
- [[REQ-PERF#PLX-PERF-011|PLX-PERF-011]] — Resume generation — deterministic stages 1–6 — p50 400 ms, p95 1.2 s, p99 2.0 s. Measured: Trigger Event → str
- [[REQ-PERF#PLX-PERF-020|PLX-PERF-020]] — Context Health update — direct impact (depth 0–1) — p50 60 ms, p95 180 ms, p99 **250 ms**. Measured: Event ing
- [[REQ-PERF#PLX-PERF-021|PLX-PERF-021]] — Context Health update — propagated impact (depth 2–N, within bound) — p50 120 ms, p95 350 ms, p99 **500 ms**.
- [[REQ-PERF#PLX-PERF-022|PLX-PERF-022]] — Graph traversal, permission-filtered, depth ≤ 3 — p50 40 ms, p95 120 ms, p99 250 ms. Measured: Query ingress →
- [[REQ-PERF#PLX-PERF-030|PLX-PERF-030]] — Event ingestion to Event Store durability — p50 15 ms, p95 50 ms, p99 120 ms. Measured: Emission → fsync ackno
- [[REQ-PERF#PLX-PERF-040|PLX-PERF-040]] — Search, AI re-ranking disabled — p50 80 ms, p95 200 ms, p99 **300 ms**. Measured: Query ingress → ranked resul
- [[REQ-PERF#PLX-PERF-050|PLX-PERF-050]] — AI recommendation, end to end — p50 2.5 s, p95 6 s, p99 **10 s**. Measured: Request → recommendation with evid
- [[REQ-PERF#PLX-PERF-060|PLX-PERF-060]] — Authorisation decision — p50 3 ms, p95 10 ms, p99 25 ms. Measured: Policy query → decision.
- [[REQ-PRD#PLX-PRD-032|PLX-PRD-032]] — Context compression **MUST NOT** delete, alter or render unreadable any Event in the Event Store. Compression
- [[REQ-SCH#PLX-SCH-001|PLX-SCH-001]] — Permission filtering **MUST** be the first stage of the ranking pipeline and **MUST** be applied at the index

◀ [[S46 High-Level System Architecture]] · [[Part V — Platform Architecture|▲ Part V]] · [[S48 Event Architecture]] ▶
