---
type: service-brief
service: "AI Orchestrator"
spec_section: §47.8
requirements: 33
tags:
  - service
  - implementation-brief
blocked_by:
  - PLX-RSK-05
  - PLX-RSK-06
  - PLX-RSK-10
  - PLX-RSK-11
---

# AI Orchestrator — implementation brief

[[Home|▲ Home]] · [[S47 Service Architecture|§47 Service Architecture]] · [[S46 High-Level System Architecture|§46 Topology]]

> [!abstract] What this note is
> Everything binding on this service, in one file. Read this before writing any of it.
> Nothing here is optional and nothing here is a summary — each requirement is quoted in full.

## Boundary

**Owns** — Model routing · prompt assembly · agent coordination · tool invocation · cost · caching · AI policy

**MUST NOT** — Writing domain state directly; bypassing permission evaluation

**Datastore** — Prompt cache, reasoning cache, cost ledger  *(owned exclusively; see [[REQ-ARC#PLX-ARC-001|PLX-ARC-001]])*

## Events emitted

- `ReasoningRequested`
- `ReasoningCompleted`
- `ReasoningRejected`
- `ModelRouted`
- `CostRecorded`
- `CostCeilingExceeded`

Emitting an Event not listed here violates the service contract in [[S47 Service Architecture|§47]]. Add it to the contract first.

## Events consumed

- `AttentionRaised`
- `ContextGenerated`
- `ResumeGenerated`
- `*agent task requests*`

## Service level objectives

| ID | Target |
|---|---|
| [[REQ-PERF#PLX-PERF-050|PLX-PERF-050]] | AI recommendation, end to end — p50 2.5 s, p95 6 s, p99 **10 s**. Measured: Request → recommendation with evidence rendered. |

Measured at reference load defined in [[S58 Performance Requirements|§58]]. A target without production instrumentation MUST NOT be claimed as met ([[REQ-PERF#PLX-PERF-070|PLX-PERF-070]]).

## Invariants this service can violate

| ID | Invariant |
|---|---|
| [[Invariants#PLX-INV-04\|PLX-INV-04]] | AI never bypasses structured data |
| [[Invariants#PLX-INV-07\|PLX-INV-07]] | Everything remains inspectable |
| [[Invariants#PLX-INV-09\|PLX-INV-09]] | Every recommendation is explainable |

Each MUST have an automated detection test in this service's suite ([[REQ-ENG#PLX-ENG-001|PLX-ENG-001]]).

## Open decisions blocking this service

> [!warning] Do not invent resolutions to these.
> They are unresolved in the specification. If implementation forces the question, stop and record an ADR in `decisions/` rather than choosing silently.

| Risk | Severity | Required by |
|---|---|---|
| [[Risk Register#PLX-RSK-05\|PLX-RSK-05]] — AI unit economics | Critical | Phase 1 exit |
| [[Risk Register#PLX-RSK-06\|PLX-RSK-06]] — Confidence score calibration | High | confidence display GA |
| [[Risk Register#PLX-RSK-10\|PLX-RSK-10]] — Prompt injection through ingested content | Critical | Phase 3 entry |
| [[Risk Register#PLX-RSK-11\|PLX-RSK-11]] — Regulatory classification | High | Phase 4 entry |

---

## Binding requirements (33)

#### [[REQ-UX#PLX-UX-060\|PLX-UX-060]]  ·  `T`  ·  [[S24 AI Experience|§24]]

Every AI recommendation presented to a user **MUST** carry all eight fields of §24.3. A recommendation missing evidence **MUST NOT** be displayed.

#### [[REQ-UX#PLX-UX-061\|PLX-UX-061]]  ·  `T, D`  ·  [[S24 AI Experience|§24]]

AI **MUST** obtain explicit user confirmation before any action that mutates an Object, changes a permission, sends an external communication, or incurs cost above the tenant-configured threshold.

#### [[REQ-UX#PLX-UX-062\|PLX-UX-062]]  ·  `T, D`  ·  [[S24 AI Experience|§24]]

AI-generated content **MUST** be visually and programmatically distinguishable from human-authored content at every point of display and in every export.

#### [[REQ-UX#PLX-UX-063\|PLX-UX-063]]  ·  `A, I`  ·  [[S24 AI Experience|§24]]

Confidence scores presented to users **MUST** be derived from a documented, calibrated methodology. Uncalibrated model self-report **MUST NOT** be surfaced as a confidence score.

#### [[REQ-DOM#PLX-DOM-014\|PLX-DOM-014]]  ·  `T`  ·  [[S32 Canonical Entity Model|§32]]

`aiMetadata.provenance` **MUST** be set on every entity at creation and **MUST NOT** be downgraded from `ai_generated` to `human` by any subsequent operation.

#### [[REQ-ARC#PLX-ARC-022\|PLX-ARC-022]]  ·  `T, A`  ·  [[S47 Service Architecture|§47]]

No service **MUST** require synchronous availability of the AI Orchestrator to serve its core capability. Loss of AI availability **MUST** degrade the platform to deterministic operation, not to unavailability.

#### [[REQ-EVT#PLX-EVT-020\|PLX-EVT-020]]  ·  `T, A`  ·  [[S48 Event Architecture|§48]]

Deterministic processing of an Event **MUST** complete before any AI reasoning is invoked on that Event. AI invocation **MUST NOT** be a precondition for any Context Health transition, Relationship confirmation or Resume update.

#### [[REQ-EVT#PLX-EVT-021\|PLX-EVT-021]]  ·  `T`  ·  [[S48 Event Architecture|§48]]

Failure or unavailability of AI reasoning **MUST NOT** prevent Event processing, Context Health computation or Resume generation from completing.

#### [[REQ-AI#PLX-AI-001\|PLX-AI-001]]  ·  `I, T`  ·  [[S55 AI Orchestration|§55]]

All model invocation **MUST** occur through a single internal abstraction. No service other than the AI Orchestrator **MUST** hold a provider SDK dependency or provider credential.

#### [[REQ-AI#PLX-AI-002\|PLX-AI-002]]  ·  `I`  ·  [[S55 AI Orchestration|§55]]

The platform **MUST** maintain a declared capability matrix per model covering at minimum: tool calling, structured output, context window, prompt caching, streaming, and data-residency eligibility.

#### [[REQ-AI#PLX-AI-003\|PLX-AI-003]]  ·  `T`  ·  [[S55 AI Orchestration|§55]]

Task routing **MUST** refuse to dispatch a task to a model that does not declare the capabilities the task requires, and **MUST** emit `ReasoningRejected` rather than degrade silently.

#### [[REQ-AI#PLX-AI-004\|PLX-AI-004]]  ·  `T, A`  ·  [[S55 AI Orchestration|§55]]

Provider substitution **MUST** be verifiable by an evaluation suite executed against every supported model, with results recorded per release. A provider **MUST NOT** be declared supported without a passing evaluation run.

#### [[REQ-AI#PLX-AI-005\|PLX-AI-005]]  ·  `T, I`  ·  [[S55 AI Orchestration|§55]]

AI **MUST NOT** write domain state directly. All AI-originated changes **MUST** be proposed as Events subject to the same validation, permission and confirmation rules as human-originated changes.

#### [[REQ-AI#PLX-AI-006\|PLX-AI-006]]  ·  `T, A`  ·  [[S55 AI Orchestration|§55]]

Prompt assembly **MUST** enforce permission scoping: no content **MUST** enter a prompt that the requesting principal is not permitted to read.

#### [[REQ-AI#PLX-AI-007\|PLX-AI-007]]  ·  `T, I`  ·  [[S55 AI Orchestration|§55]]

Every model invocation **MUST** be recorded with model identity, version, token counts, cost, latency, cache status and the identity of the requesting principal.

#### [[REQ-AI#PLX-AI-010\|PLX-AI-010]]  ·  `T, A`  ·  [[S67 AI Prompt Framework|§67]]

Prompt assembly **MUST** enforce permission scoping at the retrieval layer (`[[REQ-AI#PLX-AI-006|PLX-AI-006]]`). Instructing a model to withhold content **MUST NOT** be used as an access control.

#### [[REQ-AI#PLX-AI-011\|PLX-AI-011]]  ·  `T`  ·  [[S67 AI Prompt Framework|§67]]

Every assembled prompt **MUST** record the identifiers of every source from which context was drawn, so that a generated output's inputs are auditable.

#### [[REQ-AI#PLX-AI-012\|PLX-AI-012]]  ·  `T, A`  ·  [[S67 AI Prompt Framework|§67]]

Organisation AI policies **MUST** be applied before user request content and **MUST NOT** be overridable by user or Object content. Content-originated instructions **MUST NOT** alter policy, tool availability or permission scope.

#### [[REQ-AI#PLX-AI-013\|PLX-AI-013]]  ·  `T, I`  ·  [[S67 AI Prompt Framework|§67]]

Prompt templates **MUST** be versioned and their versions recorded on each invocation, so that a change in output behaviour is attributable to a change in template, model or data.

#### [[REQ-AI#PLX-AI-020\|PLX-AI-020]]  ·  `T`  ·  [[S68 AI Cost Optimisation|§68]]

Every AI invocation **MUST** record token counts, model identity and version, cost, latency and cache status (`[[REQ-AI#PLX-AI-007|PLX-AI-007]]`).

#### [[REQ-AI#PLX-AI-021\|PLX-AI-021]]  ·  `T, A`  ·  [[S68 AI Cost Optimisation|§68]]

Reasoning outputs **MUST** be cached keyed by the digest of the structured input. Cache hit rate **MUST** be reported per prompt type.

#### [[REQ-AI#PLX-AI-022\|PLX-AI-022]]  ·  `T`  ·  [[S68 AI Cost Optimisation|§68]]

Embeddings **MUST NOT** be regenerated for unchanged content. Embedding generation **MUST** be keyed by content digest and embedding model version.

#### [[REQ-AI#PLX-AI-030\|PLX-AI-030]]  ·  `T`  ·  [[S68 AI Cost Optimisation|§68]]

Every Organisation and every Desk **MUST** support a configurable AI cost ceiling. Exceeding a ceiling **MUST** suspend AI operations for that scope and emit `CostCeilingExceeded`, and **MUST NOT** silently substitute a cheaper model or truncate context.

#### [[REQ-AI#PLX-AI-031\|PLX-AI-031]]  ·  `A, I`  ·  [[S68 AI Cost Optimisation|§68]]

The platform **MUST** report fully loaded AI cost per active user per tenant (`[[REQ-MET#PLX-MET-011|PLX-MET-011]]`) and **MUST** publish a unit-economics model before general availability.

#### [[REQ-AI#PLX-AI-032\|PLX-AI-032]]  ·  `T`  ·  [[S68 AI Cost Optimisation|§68]]

Model selection **MUST** be recorded per invocation with the routing rationale, so that cost regressions are attributable.

#### [[REQ-AI#PLX-AI-040\|PLX-AI-040]]  ·  `T`  ·  [[S70 AI Governance|§70]]

Every AI recommendation **MUST** be accompanied by retrievable evidence (`[[REQ-PRIN#PLX-PRIN-007|PLX-PRIN-007]]`).

#### [[REQ-AI#PLX-AI-041\|PLX-AI-041]]  ·  `T, D`  ·  [[S70 AI Governance|§70]]

AI **MUST** express uncertainty explicitly and **MUST NOT** present low-confidence output as assertion (`[[REQ-PRD#PLX-PRD-022|PLX-PRD-022]]`, `[[REQ-PRD#PLX-PRD-044|PLX-PRD-044]]`).

#### [[REQ-AI#PLX-AI-042\|PLX-AI-042]]  ·  `T, A`  ·  [[S70 AI Governance|§70]]

AI **MUST NOT** create organisational facts. Any assertion about the organisation **MUST** be derivable from structured platform data (`[[Invariants#PLX-INV-04|PLX-INV-04]]`).

#### [[REQ-AI#PLX-AI-043\|PLX-AI-043]]  ·  `T, I`  ·  [[S70 AI Governance|§70]]

Every reasoning request **MUST** be logged with inputs by reference, model identity, output, cost and requesting principal, retained per tenant policy.

#### [[REQ-AI#PLX-AI-044\|PLX-AI-044]]  ·  `T, A`  ·  [[S70 AI Governance|§70]]

The platform **MUST** support model replacement without application change (`[[REQ-AI#PLX-AI-001|PLX-AI-001]]`–`[[REQ-AI#PLX-AI-004|PLX-AI-004]]`).

#### [[REQ-AI#PLX-AI-045\|PLX-AI-045]]  ·  `I`  ·  [[S70 AI Governance|§70]]

The platform **MUST** maintain, per deployed AI capability, a record sufficient to support regulatory obligations applicable in the tenant's jurisdiction, including intended purpose, data sources, evaluation results, human oversight mechanism and logging of operation.

#### [[REQ-AI#PLX-AI-046\|PLX-AI-046]]  ·  `T, I`  ·  [[S70 AI Governance|§70]]

Where AI output materially influences a decision affecting an individual's employment, evaluation or access, the platform **MUST** record the human decision-maker, and **MUST NOT** permit the AI output to be the sole basis of record.

#### [[REQ-SEC#PLX-SEC-025\|PLX-SEC-025]]  ·  `T, I`  ·  [[S69 Security Architecture|§69]]

Data residency **MUST** be enforceable per Organisation, including for AI inference. A tenant with an EU residency requirement **MUST NOT** have content dispatched to a model endpoint outside the permitted region.

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
