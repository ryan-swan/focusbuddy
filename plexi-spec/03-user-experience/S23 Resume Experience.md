---
id: S23
section: §23
title: "Resume Experience"
part: III
type: section
defines:
  - PLX-UX-050
  - PLX-UX-051
  - PLX-UX-052
tags:
  - section
  - part/iii
---

# §23 Resume Experience

◀ [[S22 Search Experience]] · [[Part III — User Experience|▲ Part III]] · [[S24 AI Experience]] ▶

---

Resume Intelligence is the default entry point for every Desk. Users never arrive at an empty workspace.

### 23.1 Resume Card

Every Desk opens with: Objective · Progress · Important Changes · Outstanding Decisions · Dependencies · Suggested Actions · Estimated Catch-up Time · Confidence Score.

### 23.2 Progressive disclosure

```mermaid
flowchart LR
    A[Summary] --> B[Details]
    B --> C[Evidence]
    C --> D[History]
    D --> E[Raw Events]
```

The majority of users should never need to inspect raw Events — but the path **must** exist and **must** be reachable, because the guarantee that it exists is what makes the summary trustworthy.

### 23.3 Requirements

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-UX#PLX-UX-050|PLX-UX-050]] | Every Desk open **MUST** present a Resume Card. Where no changes have occurred, it **MUST** state so explicitly rather than rendering empty. | T, D | §23 |
| [[REQ-UX#PLX-UX-051|PLX-UX-051]] | The disclosure path Summary → Details → Evidence → History → Raw Events **MUST** be complete and navigable for every Resume assertion. | D | §23.2 |
| [[REQ-UX#PLX-UX-052|PLX-UX-052]] | The Resume Card **MUST** display a confidence score, and the meaning of the score **MUST** be documented in-product in plain language. | D, I | §23.1, [[S55 AI Orchestration|§55]] |

---

---

## Requirements defined or cited here

- [[REQ-UX#PLX-UX-050|PLX-UX-050]] — Every Desk open **MUST** present a Resume Card. Where no changes have occurred, it **MUST** state so explicitl
- [[REQ-UX#PLX-UX-051|PLX-UX-051]] — The disclosure path Summary → Details → Evidence → History → Raw Events **MUST** be complete and navigable for
- [[REQ-UX#PLX-UX-052|PLX-UX-052]] — The Resume Card **MUST** display a confidence score, and the meaning of the score **MUST** be documented in-pr

◀ [[S22 Search Experience]] · [[Part III — User Experience|▲ Part III]] · [[S24 AI Experience]] ▶
