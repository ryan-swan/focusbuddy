---
id: S70
section: §70
title: "AI Governance"
part: VI
type: section
defines:
  - PLX-AI-001
  - PLX-AI-004
  - PLX-AI-040
  - PLX-AI-041
  - PLX-AI-042
  - PLX-AI-043
  - PLX-AI-044
  - PLX-AI-045
  - PLX-AI-046
  - PLX-PRD-022
  - PLX-PRD-044
  - PLX-PRIN-007
tags:
  - section
  - part/vi
---

# §70 AI Governance

◀ [[S69 Security Architecture]] · [[Part VI — Data, APIs, Security & Engineering Standards|▲ Part VI]] · [[S71 Deployment Architecture]] ▶

---

AI must remain accountable.

### 70.1 Requirements

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-AI#PLX-AI-040|PLX-AI-040]] | Every AI recommendation **MUST** be accompanied by retrievable evidence (`[[REQ-PRIN#PLX-PRIN-007|PLX-PRIN-007]]`). | T | §70 |
| [[REQ-AI#PLX-AI-041|PLX-AI-041]] | AI **MUST** express uncertainty explicitly and **MUST NOT** present low-confidence output as assertion (`[[REQ-PRD#PLX-PRD-022|PLX-PRD-022]]`, `[[REQ-PRD#PLX-PRD-044|PLX-PRD-044]]`). | T, D | §70 |
| [[REQ-AI#PLX-AI-042|PLX-AI-042]] | AI **MUST NOT** create organisational facts. Any assertion about the organisation **MUST** be derivable from structured platform data (`[[Invariants#PLX-INV-04|PLX-INV-04]]`). | T, A | §70, [[S44 Domain Invariants|§44]] R4 |
| [[REQ-AI#PLX-AI-043|PLX-AI-043]] | Every reasoning request **MUST** be logged with inputs by reference, model identity, output, cost and requesting principal, retained per tenant policy. | T, I | §70, [[S72 Observability|§72]] |
| [[REQ-AI#PLX-AI-044|PLX-AI-044]] | The platform **MUST** support model replacement without application change (`[[REQ-AI#PLX-AI-001|PLX-AI-001]]`–`[[REQ-AI#PLX-AI-004|PLX-AI-004]]`). | T, A | §70, [[S55 AI Orchestration|§55]] |
| [[REQ-AI#PLX-AI-045|PLX-AI-045]] | The platform **MUST** maintain, per deployed AI capability, a record sufficient to support regulatory obligations applicable in the tenant's jurisdiction, including intended purpose, data sources, evaluation results, human oversight mechanism and logging of operation. | I | §70, new |
| [[REQ-AI#PLX-AI-046|PLX-AI-046]] | Where AI output materially influences a decision affecting an individual's employment, evaluation or access, the platform **MUST** record the human decision-maker, and **MUST NOT** permit the AI output to be the sole basis of record. | T, I | §70, new |

> **On `[[REQ-AI#PLX-AI-045|PLX-AI-045]]` and `[[REQ-AI#PLX-AI-046|PLX-AI-046]]`.** Plexi is not obviously a high-risk AI system — but "Organisational Intelligence", cross-team visibility, contribution analysis and executive dashboards sit uncomfortably close to worker management, which *is* an Annex III high-risk category under the EU AI Act. Whether Plexi lands inside or outside that boundary depends on how the Organisation Desk and executive dashboard features are actually built and marketed. The record-keeping, human-oversight and logging obligations are far cheaper to build in now than to retrofit, and much of the machinery — evidence trails, audit events, explainability, human accountability for Decisions — this specification already requires for product reasons. Tracked as `[[Risk Register#PLX-RSK-11|PLX-RSK-11]]`.

---

---

## Requirements defined or cited here

- [[REQ-AI#PLX-AI-001|PLX-AI-001]] — All model invocation **MUST** occur through a single internal abstraction. No service other than the AI Orches
- [[REQ-AI#PLX-AI-004|PLX-AI-004]] — Provider substitution **MUST** be verifiable by an evaluation suite executed against every supported model, wi
- [[REQ-AI#PLX-AI-040|PLX-AI-040]] — Every AI recommendation **MUST** be accompanied by retrievable evidence (`PLX-PRIN-007`).
- [[REQ-AI#PLX-AI-041|PLX-AI-041]] — AI **MUST** express uncertainty explicitly and **MUST NOT** present low-confidence output as assertion (`PLX-P
- [[REQ-AI#PLX-AI-042|PLX-AI-042]] — AI **MUST NOT** create organisational facts. Any assertion about the organisation **MUST** be derivable from s
- [[REQ-AI#PLX-AI-043|PLX-AI-043]] — Every reasoning request **MUST** be logged with inputs by reference, model identity, output, cost and requesti
- [[REQ-AI#PLX-AI-044|PLX-AI-044]] — The platform **MUST** support model replacement without application change (`PLX-AI-001`–`PLX-AI-004`).
- [[REQ-AI#PLX-AI-045|PLX-AI-045]] — The platform **MUST** maintain, per deployed AI capability, a record sufficient to support regulatory obligati
- [[REQ-AI#PLX-AI-046|PLX-AI-046]] — Where AI output materially influences a decision affecting an individual's employment, evaluation or access, t
- [[REQ-PRD#PLX-PRD-022|PLX-PRD-022]] — Inferred Cognitive Context below the platform confidence threshold **MUST NOT** be displayed as an assertion.
- [[REQ-PRD#PLX-PRD-044|PLX-PRD-044]] — Where the Resume Engine has insufficient signal to produce a confident summary, it **MUST** state that plainly
- [[REQ-PRIN#PLX-PRIN-007|PLX-PRIN-007]] — Every user-visible AI recommendation **MUST** be accompanied by machine-retrievable evidence consisting of ref

◀ [[S69 Security Architecture]] · [[Part VI — Data, APIs, Security & Engineering Standards|▲ Part VI]] · [[S71 Deployment Architecture]] ▶
