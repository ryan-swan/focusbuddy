---
id: S81
section: §81
title: "Resume Algorithms"
part: VII
type: section
defines:
  - PLX-MET-003
  - PLX-RES-013
  - PLX-RES-020
  - PLX-RES-021
  - PLX-RES-022
  - PLX-RES-023
  - PLX-UX-051
tags:
  - section
  - part/vii
---

# §81 Resume Algorithms

◀ [[S80 Context Engine Algorithms]] · [[Part VII — Applications, Agents, Algorithms & Roadmap|▲ Part VII]] · [[S82 Collaboration Framework]] ▶

---

Resume Intelligence should feel concise while remaining complete.

| Stage | Operation | Deterministic | Testable independently |
|---|---|---|---|
| 1 | Collect Events | Yes | Yes |
| 2 | Group related activity | Yes | Yes |
| 3 | Remove low-value events | Yes | Yes |
| 4 | Identify decisions | Yes | Yes |
| 5 | Calculate organisational impact | Yes | Yes |
| 6 | Generate summary | **No — model** | Yes, against fixtures |
| 7 | Estimate catch-up time | Yes | Yes |
| 8 | Recommend next actions | Mixed | Yes |

Every stage **MUST** be independently testable.

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-RES#PLX-RES-020|PLX-RES-020]] | Each Resume stage **MUST** be independently testable with recorded fixtures, and stage outputs **MUST** be inspectable in non-production environments. | T | §81 |
| [[REQ-RES#PLX-RES-021|PLX-RES-021]] | Stages 1–5 and 7 **MUST** complete without model invocation. A Resume **MUST** be renderable from these stages alone (`[[REQ-RES#PLX-RES-013|PLX-RES-013]]`). | T | §81, [[S52 Resume Engine|§52]] |
| [[REQ-RES#PLX-RES-022|PLX-RES-022]] | Catch-up estimation (stage 7) **MUST** be calibrated against observed reconstruction time (`[[REQ-MET#PLX-MET-003|PLX-MET-003]]`) and recalibrated at least quarterly per tenant. | A | §81, [[S14 Resume Intelligence|§14]] |
| [[REQ-RES#PLX-RES-023|PLX-RES-023]] | Noise removal (stage 3) **MUST** be reversible: removed Events **MUST** remain reachable through the disclosure path of `[[REQ-UX#PLX-UX-051|PLX-UX-051]]`. | T | §81, [[S23 Resume Experience|§23]] |

---

---

## Requirements defined or cited here

- [[REQ-MET#PLX-MET-003|PLX-MET-003]] — Catch-up estimate calibration — Absolute error between estimated catch-up time and observed reconstruction tim
- [[REQ-RES#PLX-RES-013|PLX-RES-013]] — Where stage 7 is unavailable or disabled, the Resume **MUST** still render from the structured output of stage
- [[REQ-RES#PLX-RES-020|PLX-RES-020]] — Each Resume stage **MUST** be independently testable with recorded fixtures, and stage outputs **MUST** be ins
- [[REQ-RES#PLX-RES-021|PLX-RES-021]] — Stages 1–5 and 7 **MUST** complete without model invocation. A Resume **MUST** be renderable from these stages
- [[REQ-RES#PLX-RES-022|PLX-RES-022]] — Catch-up estimation (stage 7) **MUST** be calibrated against observed reconstruction time (`PLX-MET-003`) and
- [[REQ-RES#PLX-RES-023|PLX-RES-023]] — Noise removal (stage 3) **MUST** be reversible: removed Events **MUST** remain reachable through the disclosur
- [[REQ-UX#PLX-UX-051|PLX-UX-051]] — The disclosure path Summary → Details → Evidence → History → Raw Events **MUST** be complete and navigable for

◀ [[S80 Context Engine Algorithms]] · [[Part VII — Applications, Agents, Algorithms & Roadmap|▲ Part VII]] · [[S82 Collaboration Framework]] ▶
