---
type: requirement-register
area: AI
domain: "AI orchestration & governance"
count: 24
tags:
  - requirements
  - area/ai
---

# REQ-AI — AI orchestration & governance

24 normative requirements. Identifiers are permanent and never reused.

> [!important] For Claude Code
> Every requirement below is binding. Cite the ID in the test name that verifies it (`test_plx_ai_001_*`) so [[S74 Definition of Done|§74]] gate 13 (requirement-to-test traceability) can be machine-checked.

| ID | § | V | Summary |
|---|---|---|---|
| [[#PLX-AI-001]] | §55 | I, T | All model invocation MUST occur through a single internal abstraction. No service other than the AI Orchestrator MUST hold a provi |
| [[#PLX-AI-002]] | §55 | I | The platform MUST maintain a declared capability matrix per model covering at minimum: tool calling, structured output, context wi |
| [[#PLX-AI-003]] | §55 | T | Task routing MUST refuse to dispatch a task to a model that does not declare the capabilities the task requires, and MUST emit Rea |
| [[#PLX-AI-004]] | §55 | T, A | Provider substitution MUST be verifiable by an evaluation suite executed against every supported model, with results recorded per  |
| [[#PLX-AI-005]] | §55 | T, I | AI MUST NOT write domain state directly. All AI-originated changes MUST be proposed as Events subject to the same validation, perm |
| [[#PLX-AI-006]] | §55 | T, A | Prompt assembly MUST enforce permission scoping: no content MUST enter a prompt that the requesting principal is not permitted to  |
| [[#PLX-AI-007]] | §55 | T, I | Every model invocation MUST be recorded with model identity, version, token counts, cost, latency, cache status and the identity o |
| [[#PLX-AI-010]] | §67 | T, A | Prompt assembly MUST enforce permission scoping at the retrieval layer (PLX-AI-006). Instructing a model to withhold content MUST  |
| [[#PLX-AI-011]] | §67 | T | Every assembled prompt MUST record the identifiers of every source from which context was drawn, so that a generated output's inpu |
| [[#PLX-AI-012]] | §67 | T, A | Organisation AI policies MUST be applied before user request content and MUST NOT be overridable by user or Object content. Conten |
| [[#PLX-AI-013]] | §67 | T, I | Prompt templates MUST be versioned and their versions recorded on each invocation, so that a change in output behaviour is attribu |
| [[#PLX-AI-020]] | §68 | T | Every AI invocation MUST record token counts, model identity and version, cost, latency and cache status (PLX-AI-007). |
| [[#PLX-AI-021]] | §68 | T, A | Reasoning outputs MUST be cached keyed by the digest of the structured input. Cache hit rate MUST be reported per prompt type. |
| [[#PLX-AI-022]] | §68 | T | Embeddings MUST NOT be regenerated for unchanged content. Embedding generation MUST be keyed by content digest and embedding model |
| [[#PLX-AI-030]] | §68 | T | Every Organisation and every Desk MUST support a configurable AI cost ceiling. Exceeding a ceiling MUST suspend AI operations for  |
| [[#PLX-AI-031]] | §68 | A, I | The platform MUST report fully loaded AI cost per active user per tenant (PLX-MET-011) and MUST publish a unit-economics model bef |
| [[#PLX-AI-032]] | §68 | T | Model selection MUST be recorded per invocation with the routing rationale, so that cost regressions are attributable. |
| [[#PLX-AI-040]] | §70 | T | Every AI recommendation MUST be accompanied by retrievable evidence (PLX-PRIN-007). |
| [[#PLX-AI-041]] | §70 | T, D | AI MUST express uncertainty explicitly and MUST NOT present low-confidence output as assertion (PLX-PRD-022, PLX-PRD-044). |
| [[#PLX-AI-042]] | §70 | T, A | AI MUST NOT create organisational facts. Any assertion about the organisation MUST be derivable from structured platform data (PLX |
| [[#PLX-AI-043]] | §70 | T, I | Every reasoning request MUST be logged with inputs by reference, model identity, output, cost and requesting principal, retained p |
| [[#PLX-AI-044]] | §70 | T, A | The platform MUST support model replacement without application change (PLX-AI-001–PLX-AI-004). |
| [[#PLX-AI-045]] | §70 | I | The platform MUST maintain, per deployed AI capability, a record sufficient to support regulatory obligations applicable in the te |
| [[#PLX-AI-046]] | §70 | T, I | Where AI output materially influences a decision affecting an individual's employment, evaluation or access, the platform MUST rec |

---

### PLX-AI-001

All model invocation **MUST** occur through a single internal abstraction. No service other than the AI Orchestrator **MUST** hold a provider SDK dependency or provider credential.

| | |
|---|---|
| **Verification** | `I, T` |
| **Defined in** | [[S55 AI Orchestration|§55]] |
| **Derives from** | §55.2 |
| **Test name** | `test_plx_ai_001` |

### PLX-AI-002

The platform **MUST** maintain a declared capability matrix per model covering at minimum: tool calling, structured output, context window, prompt caching, streaming, and data-residency eligibility.

| | |
|---|---|
| **Verification** | `I` |
| **Defined in** | [[S55 AI Orchestration|§55]] |
| **Derives from** | [[S55 AI Orchestration|§55]], new |
| **Test name** | `test_plx_ai_002` |

### PLX-AI-003

Task routing **MUST** refuse to dispatch a task to a model that does not declare the capabilities the task requires, and **MUST** emit `ReasoningRejected` rather than degrade silently.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S55 AI Orchestration|§55]] |
| **Derives from** | [[S55 AI Orchestration|§55]], new |
| **Test name** | `test_plx_ai_003` |

### PLX-AI-004

Provider substitution **MUST** be verifiable by an evaluation suite executed against every supported model, with results recorded per release. A provider **MUST NOT** be declared supported without a passing evaluation run.

| | |
|---|---|
| **Verification** | `T, A` |
| **Defined in** | [[S55 AI Orchestration|§55]] |
| **Derives from** | §55.2, new |
| **Test name** | `test_plx_ai_004` |

### PLX-AI-005

AI **MUST NOT** write domain state directly. All AI-originated changes **MUST** be proposed as Events subject to the same validation, permission and confirmation rules as human-originated changes.

| | |
|---|---|
| **Verification** | `T, I` |
| **Defined in** | [[S55 AI Orchestration|§55]] |
| **Derives from** | [[S55 AI Orchestration|§55]], [[S44 Domain Invariants|§44]] R4 |
| **Test name** | `test_plx_ai_005` |

### PLX-AI-006

Prompt assembly **MUST** enforce permission scoping: no content **MUST** enter a prompt that the requesting principal is not permitted to read.

| | |
|---|---|
| **Verification** | `T, A` |
| **Defined in** | [[S55 AI Orchestration|§55]] |
| **Derives from** | [[S67 AI Prompt Framework|§67]], [[S69 Security Architecture|§69]] |
| **Test name** | `test_plx_ai_006` |

### PLX-AI-007

Every model invocation **MUST** be recorded with model identity, version, token counts, cost, latency, cache status and the identity of the requesting principal.

| | |
|---|---|
| **Verification** | `T, I` |
| **Defined in** | [[S55 AI Orchestration|§55]] |
| **Derives from** | [[S55 AI Orchestration|§55]], [[S68 AI Cost Optimisation|§68]], [[S72 Observability|§72]] |
| **Test name** | `test_plx_ai_007` |

### PLX-AI-010

Prompt assembly **MUST** enforce permission scoping at the retrieval layer (`[[REQ-AI#PLX-AI-006|PLX-AI-006]]`). Instructing a model to withhold content **MUST NOT** be used as an access control.

| | |
|---|---|
| **Verification** | `T, A` |
| **Defined in** | [[S67 AI Prompt Framework|§67]] |
| **Derives from** | [[S67 AI Prompt Framework|§67]], [[S69 Security Architecture|§69]] |
| **Test name** | `test_plx_ai_010` |

### PLX-AI-011

Every assembled prompt **MUST** record the identifiers of every source from which context was drawn, so that a generated output's inputs are auditable.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S67 AI Prompt Framework|§67]] |
| **Derives from** | [[S67 AI Prompt Framework|§67]], [[S70 AI Governance|§70]] |
| **Test name** | `test_plx_ai_011` |

### PLX-AI-012

Organisation AI policies **MUST** be applied before user request content and **MUST NOT** be overridable by user or Object content. Content-originated instructions **MUST NOT** alter policy, tool availability or permission scope.

| | |
|---|---|
| **Verification** | `T, A` |
| **Defined in** | [[S67 AI Prompt Framework|§67]] |
| **Derives from** | [[S67 AI Prompt Framework|§67]], new |
| **Test name** | `test_plx_ai_012` |

### PLX-AI-013

Prompt templates **MUST** be versioned and their versions recorded on each invocation, so that a change in output behaviour is attributable to a change in template, model or data.

| | |
|---|---|
| **Verification** | `T, I` |
| **Defined in** | [[S67 AI Prompt Framework|§67]] |
| **Derives from** | [[S67 AI Prompt Framework|§67]], new |
| **Test name** | `test_plx_ai_013` |

### PLX-AI-020

Every AI invocation **MUST** record token counts, model identity and version, cost, latency and cache status (`[[REQ-AI#PLX-AI-007|PLX-AI-007]]`).

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S68 AI Cost Optimisation|§68]] |
| **Derives from** | [[S68 AI Cost Optimisation|§68]], [[S72 Observability|§72]] |
| **Test name** | `test_plx_ai_020` |

### PLX-AI-021

Reasoning outputs **MUST** be cached keyed by the digest of the structured input. Cache hit rate **MUST** be reported per prompt type.

| | |
|---|---|
| **Verification** | `T, A` |
| **Defined in** | [[S68 AI Cost Optimisation|§68]] |
| **Derives from** | [[S68 AI Cost Optimisation|§68]], [[S72 Observability|§72]] |
| **Test name** | `test_plx_ai_021` |

### PLX-AI-022

Embeddings **MUST NOT** be regenerated for unchanged content. Embedding generation **MUST** be keyed by content digest and embedding model version.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S68 AI Cost Optimisation|§68]] |
| **Derives from** | [[S68 AI Cost Optimisation|§68]] |
| **Test name** | `test_plx_ai_022` |

### PLX-AI-030

Every Organisation and every Desk **MUST** support a configurable AI cost ceiling. Exceeding a ceiling **MUST** suspend AI operations for that scope and emit `CostCeilingExceeded`, and **MUST NOT** silently substitute a cheaper model or truncate context.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S68 AI Cost Optimisation|§68]] |
| **Derives from** | [[S68 AI Cost Optimisation|§68]], new |
| **Test name** | `test_plx_ai_030` |

### PLX-AI-031

The platform **MUST** report fully loaded AI cost per active user per tenant (`[[REQ-MET#PLX-MET-011|PLX-MET-011]]`) and **MUST** publish a unit-economics model before general availability.

| | |
|---|---|
| **Verification** | `A, I` |
| **Defined in** | [[S68 AI Cost Optimisation|§68]] |
| **Derives from** | [[S68 AI Cost Optimisation|§68]], new |
| **Test name** | `test_plx_ai_031` |

### PLX-AI-032

Model selection **MUST** be recorded per invocation with the routing rationale, so that cost regressions are attributable.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S68 AI Cost Optimisation|§68]] |
| **Derives from** | [[S68 AI Cost Optimisation|§68]], new |
| **Test name** | `test_plx_ai_032` |

### PLX-AI-040

Every AI recommendation **MUST** be accompanied by retrievable evidence (`[[REQ-PRIN#PLX-PRIN-007|PLX-PRIN-007]]`).

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S70 AI Governance|§70]] |
| **Derives from** | [[S70 AI Governance|§70]] |
| **Test name** | `test_plx_ai_040` |

### PLX-AI-041

AI **MUST** express uncertainty explicitly and **MUST NOT** present low-confidence output as assertion (`[[REQ-PRD#PLX-PRD-022|PLX-PRD-022]]`, `[[REQ-PRD#PLX-PRD-044|PLX-PRD-044]]`).

| | |
|---|---|
| **Verification** | `T, D` |
| **Defined in** | [[S70 AI Governance|§70]] |
| **Derives from** | [[S70 AI Governance|§70]] |
| **Test name** | `test_plx_ai_041` |

### PLX-AI-042

AI **MUST NOT** create organisational facts. Any assertion about the organisation **MUST** be derivable from structured platform data (`[[Invariants#PLX-INV-04|PLX-INV-04]]`).

| | |
|---|---|
| **Verification** | `T, A` |
| **Defined in** | [[S70 AI Governance|§70]] |
| **Derives from** | [[S70 AI Governance|§70]], [[S44 Domain Invariants|§44]] R4 |
| **Test name** | `test_plx_ai_042` |

### PLX-AI-043

Every reasoning request **MUST** be logged with inputs by reference, model identity, output, cost and requesting principal, retained per tenant policy.

| | |
|---|---|
| **Verification** | `T, I` |
| **Defined in** | [[S70 AI Governance|§70]] |
| **Derives from** | [[S70 AI Governance|§70]], [[S72 Observability|§72]] |
| **Test name** | `test_plx_ai_043` |

### PLX-AI-044

The platform **MUST** support model replacement without application change (`[[REQ-AI#PLX-AI-001|PLX-AI-001]]`–`[[REQ-AI#PLX-AI-004|PLX-AI-004]]`).

| | |
|---|---|
| **Verification** | `T, A` |
| **Defined in** | [[S70 AI Governance|§70]] |
| **Derives from** | [[S70 AI Governance|§70]], [[S55 AI Orchestration|§55]] |
| **Test name** | `test_plx_ai_044` |

### PLX-AI-045

The platform **MUST** maintain, per deployed AI capability, a record sufficient to support regulatory obligations applicable in the tenant's jurisdiction, including intended purpose, data sources, evaluation results, human oversight mechanism and logging of operation.

| | |
|---|---|
| **Verification** | `I` |
| **Defined in** | [[S70 AI Governance|§70]] |
| **Derives from** | [[S70 AI Governance|§70]], new |
| **Test name** | `test_plx_ai_045` |

### PLX-AI-046

Where AI output materially influences a decision affecting an individual's employment, evaluation or access, the platform **MUST** record the human decision-maker, and **MUST NOT** permit the AI output to be the sole basis of record.

| | |
|---|---|
| **Verification** | `T, I` |
| **Defined in** | [[S70 AI Governance|§70]] |
| **Derives from** | [[S70 AI Governance|§70]], new |
| **Test name** | `test_plx_ai_046` |
