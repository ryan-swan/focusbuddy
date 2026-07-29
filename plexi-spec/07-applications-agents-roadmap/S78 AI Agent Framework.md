---
id: S78
section: §78
title: "AI Agent Framework"
part: VII
type: section
defines:
  - PLX-AGT-003
  - PLX-AGT-020
  - PLX-AGT-021
  - PLX-AGT-022
  - PLX-AGT-023
  - PLX-APP-030
  - PLX-APP-031
  - PLX-DOM-014
  - PLX-DOM-040
  - PLX-ENG-013
  - PLX-EVT-020
tags:
  - section
  - part/vii
---

# §78 AI Agent Framework

◀ [[S77 Native Workspace Applications]] · [[Part VII — Applications, Agents, Algorithms & Roadmap|▲ Part VII]] · [[S79 Agent Collaboration]] ▶

---

AI Agents are specialised workers operating within defined responsibilities. Agents collaborate; they do not compete.

### 78.1 Agent classes

| Agent | Responsibilities | Constraints |
|---|---|---|
| **Workspace Agent** | Maintains Desk context, tracks ongoing work, produces Resume updates | Deterministic stages must complete first (`[[REQ-EVT#PLX-EVT-020|PLX-EVT-020]]`) |
| **Research Agent** | Collects external information, summarises findings, attaches evidence | **Never** makes organisational decisions; external fetch requires `externalDataAllowed` |
| **Writing Agent** | Produces reports, emails, specifications, proposals, documentation, marketing content | Output marked `ai_generated` (`[[REQ-DOM#PLX-DOM-014|PLX-DOM-014]]`); references organisational knowledge where appropriate |
| **Decision Agent** | Reviews evidence, identifies missing information, highlights conflicting assumptions, suggests reviewers, produces decision summaries | **Never** owner or approver (`[[REQ-DOM#PLX-DOM-040|PLX-DOM-040]]`) |
| **Meeting Agent** | Before: briefing packs, relevant history, unresolved issues. During: captures discussion, identifies actions, tracks decisions. After: updates Resume, creates tasks, updates graph | Consent required (`[[REQ-APP#PLX-APP-030|PLX-APP-030]]`); outputs provisional (`[[REQ-APP#PLX-APP-031|PLX-APP-031]]`) |
| **Knowledge Agent** | Identifies duplicates, suggests relationships, improves organisation, detects outdated knowledge, maintains consistency | Relationships created provisional only (`[[REQ-AGT#PLX-AGT-003|PLX-AGT-003]]`) |
| **Development Agent** | Explains architecture, generates code, reviews pull requests, detects architectural drift, maintains engineering standards | Code changes require human approval |

### 78.2 Requirements

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-AGT#PLX-AGT-020|PLX-AGT-020]] | Every Agent class **MUST** declare its permitted tool set, and tool invocation **MUST** be permission-checked at the tool boundary against the acting principal, not trusted from the model's request. | T, A | §78, [[S67 AI Prompt Framework|§67]] |
| [[REQ-AGT#PLX-AGT-021|PLX-AGT-021]] | The Research Agent **MUST NOT** transmit tenant content to external systems unless the Desk's `externalDataAllowed` is true, and every external transmission **MUST** be logged with its destination and content digest. | T, I | §78, [[S69 Security Architecture|§69]] |
| [[REQ-AGT#PLX-AGT-022|PLX-AGT-022]] | Every Agent **MUST** have a defined evaluation suite with recorded pass thresholds, executed per release (`[[REQ-ENG#PLX-ENG-013|PLX-ENG-013]]`). | T | §78, [[S73 Engineering Standards|§73]] |
| [[REQ-AGT#PLX-AGT-023|PLX-AGT-023]] | Agent memory scope **MUST** be enforced at retrieval. An Agent with `memoryScope: "desk"` **MUST NOT** retrieve content from another Desk, even where the acting principal has permission to it. | T | [[S41 Agent Entity|§41]], new |

> **On `[[REQ-AGT#PLX-AGT-023|PLX-AGT-023]]`.** Permission scope and memory scope are different constraints and both are needed. A user may legitimately have access to forty Desks; that does not mean their Meeting Agent, summarising one meeting, should be reasoning over all forty. Beyond the obvious cost and quality effects, an agent that silently pulls context from a Desk the user was not thinking about will eventually surface something from a sensitive Desk into an innocuous one — technically permitted, contextually a serious breach of expectation.

---

---

## Requirements defined or cited here

- [[REQ-AGT#PLX-AGT-003|PLX-AGT-003]] — Agents **MUST NOT** create Relationships in `confirmed` state. Agent-created Relationships **MUST** be `provis
- [[REQ-AGT#PLX-AGT-020|PLX-AGT-020]] — Every Agent class **MUST** declare its permitted tool set, and tool invocation **MUST** be permission-checked
- [[REQ-AGT#PLX-AGT-021|PLX-AGT-021]] — The Research Agent **MUST NOT** transmit tenant content to external systems unless the Desk's `externalDataAll
- [[REQ-AGT#PLX-AGT-022|PLX-AGT-022]] — Every Agent **MUST** have a defined evaluation suite with recorded pass thresholds, executed per release (`PLX
- [[REQ-AGT#PLX-AGT-023|PLX-AGT-023]] — Agent memory scope **MUST** be enforced at retrieval. An Agent with `memoryScope: "desk"` **MUST NOT** retriev
- [[REQ-APP#PLX-APP-030|PLX-APP-030]] — Meeting recording and transcription **MUST** obtain and record consent from all participants per the applicabl
- [[REQ-APP#PLX-APP-031|PLX-APP-031]] — Decisions and actions extracted from a meeting by AI **MUST** be created as provisional and **MUST** require h
- [[REQ-DOM#PLX-DOM-014|PLX-DOM-014]] — `aiMetadata.provenance` **MUST** be set on every entity at creation and **MUST NOT** be downgraded from `ai_ge
- [[REQ-DOM#PLX-DOM-040|PLX-DOM-040]] — `decisionOwner` and every `Approval.approver` **MUST** be a human principal. An Agent or service principal **M
- [[REQ-ENG#PLX-ENG-013|PLX-ENG-013]] — AI evaluation tests **MUST** run against every supported model on every release, with recorded pass thresholds
- [[REQ-EVT#PLX-EVT-020|PLX-EVT-020]] — Deterministic processing of an Event **MUST** complete before any AI reasoning is invoked on that Event. AI in

◀ [[S77 Native Workspace Applications]] · [[Part VII — Applications, Agents, Algorithms & Roadmap|▲ Part VII]] · [[S79 Agent Collaboration]] ▶
