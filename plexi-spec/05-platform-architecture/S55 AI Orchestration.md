---
id: S55
section: §55
title: "AI Orchestration"
part: V
type: section
defines:
  - PLX-AI-001
  - PLX-AI-002
  - PLX-AI-003
  - PLX-AI-004
  - PLX-AI-005
  - PLX-AI-006
  - PLX-AI-007
tags:
  - section
  - part/v
---

# §55 AI Orchestration

◀ [[S54 Search Architecture]] · [[Part V — Platform Architecture|▲ Part V]] · [[S56 Multi-Agent Architecture]] ▶

---

The AI layer never owns business logic. It owns **reasoning**.

### 55.1 Responsibilities

Prompt assembly · model selection · agent routing · memory retrieval · tool invocation · explanation generation · cost optimisation · confidence scoring · caching.

### 55.2 Model independence

No AI vendor should become embedded into Plexi. Models are interchangeable. Supported providers should include OpenAI, Anthropic, Google, Meta, local models and future providers. Changing providers must not require application changes.

### 55.3 What model independence actually requires

"Changing providers must not require application changes" is achievable only if the abstraction is drawn at the right level and the platform accepts explicit capability degradation. Providers differ materially in tool-calling semantics, structured-output guarantees, context window size, prompt-caching behaviour, streaming semantics, safety filtering and token accounting. An abstraction that pretends these are identical will leak at exactly the moment a provider is swapped under production load.

The workable form is: a stable internal interface, a declared **capability matrix** per model, and routing that refuses to dispatch a task to a model lacking a required capability.

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-AI#PLX-AI-001|PLX-AI-001]] | All model invocation **MUST** occur through a single internal abstraction. No service other than the AI Orchestrator **MUST** hold a provider SDK dependency or provider credential. | I, T | §55.2 |
| [[REQ-AI#PLX-AI-002|PLX-AI-002]] | The platform **MUST** maintain a declared capability matrix per model covering at minimum: tool calling, structured output, context window, prompt caching, streaming, and data-residency eligibility. | I | §55, new |
| [[REQ-AI#PLX-AI-003|PLX-AI-003]] | Task routing **MUST** refuse to dispatch a task to a model that does not declare the capabilities the task requires, and **MUST** emit `ReasoningRejected` rather than degrade silently. | T | §55, new |
| [[REQ-AI#PLX-AI-004|PLX-AI-004]] | Provider substitution **MUST** be verifiable by an evaluation suite executed against every supported model, with results recorded per release. A provider **MUST NOT** be declared supported without a passing evaluation run. | T, A | §55.2, new |
| [[REQ-AI#PLX-AI-005|PLX-AI-005]] | AI **MUST NOT** write domain state directly. All AI-originated changes **MUST** be proposed as Events subject to the same validation, permission and confirmation rules as human-originated changes. | T, I | §55, [[S44 Domain Invariants|§44]] R4 |
| [[REQ-AI#PLX-AI-006|PLX-AI-006]] | Prompt assembly **MUST** enforce permission scoping: no content **MUST** enter a prompt that the requesting principal is not permitted to read. | T, A | [[S67 AI Prompt Framework|§67]], [[S69 Security Architecture|§69]] |
| [[REQ-AI#PLX-AI-007|PLX-AI-007]] | Every model invocation **MUST** be recorded with model identity, version, token counts, cost, latency, cache status and the identity of the requesting principal. | T, I | §55, [[S68 AI Cost Optimisation|§68]], [[S72 Observability|§72]] |

> **On `[[REQ-AI#PLX-AI-006|PLX-AI-006]]`.** This is the most likely serious security defect in an AI-native architecture, and it does not look like one. Prompt assembly gathers context from many sources to answer a question well; the more it gathers, the better the answer. A single unfiltered retrieval path — one graph query that ignores the permission scope, one "include related objects" convenience — and the model will faithfully summarise content the user was never entitled to see, in prose, with no access-log entry against the source Object. Permission scoping must be enforced inside the retrieval layer, not by prompt instruction. Instructing a model not to reveal something it has been given is not a security control.

---

---

## Requirements defined or cited here

- [[REQ-AI#PLX-AI-001|PLX-AI-001]] — All model invocation **MUST** occur through a single internal abstraction. No service other than the AI Orches
- [[REQ-AI#PLX-AI-002|PLX-AI-002]] — The platform **MUST** maintain a declared capability matrix per model covering at minimum: tool calling, struc
- [[REQ-AI#PLX-AI-003|PLX-AI-003]] — Task routing **MUST** refuse to dispatch a task to a model that does not declare the capabilities the task req
- [[REQ-AI#PLX-AI-004|PLX-AI-004]] — Provider substitution **MUST** be verifiable by an evaluation suite executed against every supported model, wi
- [[REQ-AI#PLX-AI-005|PLX-AI-005]] — AI **MUST NOT** write domain state directly. All AI-originated changes **MUST** be proposed as Events subject
- [[REQ-AI#PLX-AI-006|PLX-AI-006]] — Prompt assembly **MUST** enforce permission scoping: no content **MUST** enter a prompt that the requesting pr
- [[REQ-AI#PLX-AI-007|PLX-AI-007]] — Every model invocation **MUST** be recorded with model identity, version, token counts, cost, latency, cache s

◀ [[S54 Search Architecture]] · [[Part V — Platform Architecture|▲ Part V]] · [[S56 Multi-Agent Architecture]] ▶
