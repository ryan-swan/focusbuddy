---
id: S19
section: §19
title: "Cognitive Design Principles"
part: III
type: section
defines:
  - PLX-UX-010
  - PLX-UX-011
  - PLX-UX-012
  - PLX-UX-013
  - PLX-UX-014
  - PLX-UX-015
tags:
  - section
  - part/iii
---

# §19 Cognitive Design Principles

◀ [[S18 User Experience Philosophy]] · [[Part III — User Experience|▲ Part III]] · [[S20 Context Health]] ▶

---

The interface continuously answers six questions. These are not aspirations — each maps to a persistent, always-available interface affordance.

| # | Question | Answered by | Requirement |
|---|---|---|---|
| 1 | **Where am I?** | Persistent Desk identity in the primary chrome | `[[REQ-UX#PLX-UX-010|PLX-UX-010]]` |
| 2 | **Why am I here?** | Desk Current Objective, always visible | `[[REQ-UX#PLX-UX-011|PLX-UX-011]]` |
| 3 | **What changed?** | Resume Card change list, available without user action | `[[REQ-UX#PLX-UX-012|PLX-UX-012]]` |
| 4 | **What matters?** | Materiality-ranked ordering; significance distinguished from activity | `[[REQ-UX#PLX-UX-013|PLX-UX-013]]` |
| 5 | **What should I do next?** | Evidence-based Suggested Next Action | `[[REQ-UX#PLX-UX-014|PLX-UX-014]]` |
| 6 | **Why?** | Evidence disclosure on every recommendation | `[[REQ-UX#PLX-UX-015|PLX-UX-015]]` |

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-UX#PLX-UX-010|PLX-UX-010]] | The active Desk identity **MUST** be visible at all times in every view, without user action, including full-screen Object views. | D | §19.1 |
| [[REQ-UX#PLX-UX-011|PLX-UX-011]] | The Desk Current Objective **MUST** be visible or retrievable in a single interaction from any view within the Desk. | D | §19.2 |
| [[REQ-UX#PLX-UX-012|PLX-UX-012]] | Changes since the user's last review **MUST** be available on Desk open without the user performing any investigative action. | T, D | §19.3 |
| [[REQ-UX#PLX-UX-013|PLX-UX-013]] | Ordering of changes presented to the user **MUST** be by materiality score ([[S80 Context Engine Algorithms|§80]]), not chronology. Chronological ordering **MUST** be available as an explicit alternative view. | T, D | §19.4 |
| [[REQ-UX#PLX-UX-014|PLX-UX-014]] | Every Desk **MUST** present a Suggested Next Action derived from evidence, or explicitly state that no action is recommended. It **MUST NOT** present a fabricated or filler suggestion. | T, D | §19.5 |
| [[REQ-UX#PLX-UX-015|PLX-UX-015]] | Every recommendation, Context Health transition and Resume assertion **MUST** expose its evidence within one interaction from the point of display. | D | §19.6, [[S07 Design Principles|§7]] |

---

---

## Requirements defined or cited here

- [[REQ-UX#PLX-UX-010|PLX-UX-010]] — The active Desk identity **MUST** be visible at all times in every view, without user action, including full-s
- [[REQ-UX#PLX-UX-011|PLX-UX-011]] — The Desk Current Objective **MUST** be visible or retrievable in a single interaction from any view within the
- [[REQ-UX#PLX-UX-012|PLX-UX-012]] — Changes since the user's last review **MUST** be available on Desk open without the user performing any invest
- [[REQ-UX#PLX-UX-013|PLX-UX-013]] — Ordering of changes presented to the user **MUST** be by materiality score (§80), not chronology. Chronologica
- [[REQ-UX#PLX-UX-014|PLX-UX-014]] — Every Desk **MUST** present a Suggested Next Action derived from evidence, or explicitly state that no action
- [[REQ-UX#PLX-UX-015|PLX-UX-015]] — Every recommendation, Context Health transition and Resume assertion **MUST** expose its evidence within one i

◀ [[S18 User Experience Philosophy]] · [[Part III — User Experience|▲ Part III]] · [[S20 Context Health]] ▶
