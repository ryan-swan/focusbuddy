---
id: S6
section: §6
title: "Product Philosophy"
part: I
type: section
defines:
  - PLX-DOM-020
  - PLX-ENG-010
  - PLX-GPH-004
  - PLX-PRIN-003
  - PLX-UX-042
tags:
  - section
  - part/i
---

# §6 Product Philosophy

◀ [[S05 Mission]] · [[Part I — Vision|▲ Part I]] · [[S07 Design Principles]] ▶

---

The following statements govern every engineering decision. Each is restated with its testable consequence — a philosophy that cannot be violated by any concrete decision is decoration.

| # | Philosophy | Testable consequence |
|---|---|---|
| 1 | **Context is the product.** Not documents. Not AI. Not dashboards. Context. | A feature that adds capability while reducing the accuracy or freshness of Context is rejected (`[[REQ-ENG#PLX-ENG-010|PLX-ENG-010]]`). |
| 2 | **Applications remain specialists.** Plexi does not replace software; it connects software. | Native application builds require recorded justification (`[[REQ-PRIN#PLX-PRIN-003|PLX-PRIN-003]]`). |
| 3 | **The Desk is the atomic unit.** Everything belongs to a Desk. | No Object may exist without exactly one owning Desk (`[[Invariants#PLX-INV-01|PLX-INV-01]]`). |
| 4 | **Objects are first-class.** Documents, widgets, tables, AI conversations, decisions and agents are equal citizens. | No Object type receives privileged storage, permission or event handling (`[[REQ-DOM#PLX-DOM-020|PLX-DOM-020]]`). |
| 5 | **Everything meaningful becomes an Event.** History creates understanding; understanding creates intelligence. | No state mutation may occur without a corresponding Event (`[[Invariants#PLX-INV-02|PLX-INV-02]]`). |
| 6 | **AI explains. AI does not own truth.** Truth belongs to structured data. | AI output may not be the sole source of a stored fact (`[[Invariants#PLX-INV-04|PLX-INV-04]]`). |
| 7 | **The system should feel calm.** Notifications are failures. Awareness is preferred over interruption. | Interruptive notification volume is a tracked regression metric (`[[REQ-UX#PLX-UX-042|PLX-UX-042]]`). |
| 8 | **Understanding should emerge naturally.** Users do not manually build graphs. | Relationship discovery is automatic; user curation is confirmation, not construction (`[[REQ-GPH#PLX-GPH-004|PLX-GPH-004]]`). |

---

---

## Requirements defined or cited here

- [[REQ-DOM#PLX-DOM-020|PLX-DOM-020]] — No Object type **MUST** receive privileged treatment in storage, permission evaluation, event generation, vers
- [[REQ-ENG#PLX-ENG-010|PLX-ENG-010]] — Every change **MUST** be evaluated against §6 Philosophy 1: a change that increases functionality while reduci
- [[REQ-GPH#PLX-GPH-004|PLX-GPH-004]] — Users **MUST NOT** be required to construct graph structure manually to obtain relationship-derived intelligen
- [[REQ-PRIN#PLX-PRIN-003|PLX-PRIN-003]] — The platform **MUST NOT** position itself as a replacement for specialist applications. Native applications **
- [[REQ-UX#PLX-UX-042|PLX-UX-042]] — Interruptive notification volume per active user **MUST** be instrumented and reported per release as a regres

◀ [[S05 Mission]] · [[Part I — Vision|▲ Part I]] · [[S07 Design Principles]] ▶
