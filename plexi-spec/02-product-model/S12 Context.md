---
id: S12
section: §12
title: "Context"
part: II
type: section
defines:
  - PLX-PRD-020
  - PLX-PRD-021
  - PLX-PRD-022
  - PLX-PRD-023
tags:
  - section
  - part/ii
---

# §12 Context

◀ [[S11 Objects]] · [[Part II — Product Model|▲ Part II]] · [[S13 Workspace Memory]] ▶

---

### 12.1 Definition

**Context** is the collection of information required to continue meaningful work without reconstruction. Context is not documentation. Context is understanding.

### 12.2 Layers of Context

| Layer | Contents | Acquisition |
|---|---|---|
| **Visual** | Window positions, layouts, tabs, selections, scroll positions, zoom level | Observed |
| **Operational** | Current task, current workflow, active Objects, recent activity, open dependencies | Observed |
| **Cognitive** | Current question, hypothesis, intent, reasoning, mental bookmark, expected next action | **Inferred or declared** |
| **Decision** | What has been decided, why, by whom, evidence, confidence, alternatives rejected | Structured capture |
| **Organisational** | Related teams, shared work, dependencies, cross-project impact, stakeholders, ownership | Derived from graph |
| **Historical** | Timeline, version history, past assumptions, previous decisions, major milestones | Derived from events |

### 12.3 The acquisition column is load-bearing

The **Acquisition** column above is an addition made during consolidation, and it is the most important thing in this section.

Visual and Operational context can be *observed* — the platform sees window positions and edit events directly. Decision, Organisational and Historical context are *derived* from structured records the platform already holds.

**Cognitive context cannot be observed.** The platform cannot see a user's hypothesis. It can only (a) infer it probabilistically from behaviour, or (b) ask. Conflating these is how a product ends up confidently telling a user what they were thinking, and being wrong — which damages trust far more than saying nothing.

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-PRD#PLX-PRD-020|PLX-PRD-020]] | Cognitive Context values **MUST** be labelled with their acquisition method: `declared` (user-stated), `inferred` (model-derived), or `absent`. | T | §12, new |
| [[REQ-PRD#PLX-PRD-021|PLX-PRD-021]] | Inferred Cognitive Context **MUST** carry a confidence score and **MUST** be visually distinguished from declared Cognitive Context wherever displayed. | T, D | §12, new |
| [[REQ-PRD#PLX-PRD-022|PLX-PRD-022]] | Inferred Cognitive Context below the platform confidence threshold **MUST NOT** be displayed as an assertion. It **MAY** be offered as a question to the user. | T, D | §12, new |
| [[REQ-PRD#PLX-PRD-023|PLX-PRD-023]] | The platform **MUST** provide a low-friction affordance for a user to declare their current question and expected next action, and **MUST NOT** require it. | D | §12, [[S40 Session Entity|§40]] |

---

---

## Requirements defined or cited here

- [[REQ-PRD#PLX-PRD-020|PLX-PRD-020]] — Cognitive Context values **MUST** be labelled with their acquisition method: `declared` (user-stated), `inferr
- [[REQ-PRD#PLX-PRD-021|PLX-PRD-021]] — Inferred Cognitive Context **MUST** carry a confidence score and **MUST** be visually distinguished from decla
- [[REQ-PRD#PLX-PRD-022|PLX-PRD-022]] — Inferred Cognitive Context below the platform confidence threshold **MUST NOT** be displayed as an assertion.
- [[REQ-PRD#PLX-PRD-023|PLX-PRD-023]] — The platform **MUST** provide a low-friction affordance for a user to declare their current question and expec

◀ [[S11 Objects]] · [[Part II — Product Model|▲ Part II]] · [[S13 Workspace Memory]] ▶
