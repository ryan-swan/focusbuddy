---
id: S52
section: §52
title: "Resume Engine"
part: V
type: section
defines:
  - PLX-RES-010
  - PLX-RES-011
  - PLX-RES-012
  - PLX-RES-013
tags:
  - section
  - part/v
---

# §52 Resume Engine

◀ [[S51 Context Engine]] · [[Part V — Platform Architecture|▲ Part V]] · [[S53 Knowledge Graph Runtime]] ▶

---

Resume Intelligence is continuously generated, never manually requested.

### 52.1 Pipeline

```mermaid
flowchart LR
    A[Events] --> B[Grouping]
    B --> C[Noise Removal]
    C --> D[Relationship Analysis]
    D --> E[Decision Analysis]
    E --> F[Dependency Analysis]
    F --> G[AI Summary]
    G --> H[Resume Object]
```

Stages A–F are deterministic. Only stage G invokes a model, and it operates on a structured input the deterministic stages have already produced.

### 52.2 Principles

Incremental · evidence-based · cheap to update · expensive reasoning cached · human readable · machine understandable.

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-RES#PLX-RES-010|PLX-RES-010]] | Resume generation **MUST** be incremental. A Resume update **MUST NOT** require reprocessing the full Event history of a Desk. | A, T | §52.2 |
| [[REQ-RES#PLX-RES-011|PLX-RES-011]] | Stages 1–6 of the Resume pipeline **MUST** be independently testable and **MUST** produce a complete structured Resume without invoking a model. Stage 7 (AI Summary) **MUST** be additive prose over that structure. | T | §52, [[S81 Resume Algorithms|§81]] |
| [[REQ-RES#PLX-RES-012|PLX-RES-012]] | Expensive reasoning outputs **MUST** be cached and keyed by the structured input digest, so that identical input never incurs repeated model cost. | T, A | §52.2, [[S68 AI Cost Optimisation|§68]] |
| [[REQ-RES#PLX-RES-013|PLX-RES-013]] | Where stage 7 is unavailable or disabled, the Resume **MUST** still render from the structured output of stages 1–6. | T | §52, [[S33 Desk Entity|§33]] |

---

---

## Requirements defined or cited here

- [[REQ-RES#PLX-RES-010|PLX-RES-010]] — Resume generation **MUST** be incremental. A Resume update **MUST NOT** require reprocessing the full Event hi
- [[REQ-RES#PLX-RES-011|PLX-RES-011]] — Stages 1–6 of the Resume pipeline **MUST** be independently testable and **MUST** produce a complete structure
- [[REQ-RES#PLX-RES-012|PLX-RES-012]] — Expensive reasoning outputs **MUST** be cached and keyed by the structured input digest, so that identical inp
- [[REQ-RES#PLX-RES-013|PLX-RES-013]] — Where stage 7 is unavailable or disabled, the Resume **MUST** still render from the structured output of stage

◀ [[S51 Context Engine]] · [[Part V — Platform Architecture|▲ Part V]] · [[S53 Knowledge Graph Runtime]] ▶
