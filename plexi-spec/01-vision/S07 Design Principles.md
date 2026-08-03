---
id: S7
section: §7
title: "Design Principles"
part: I
type: section
defines:
  - PLX-PRIN-006
  - PLX-PRIN-007
  - PLX-PRIN-008
tags:
  - section
  - part/i
---

# §7 Design Principles

◀ [[S06 Product Philosophy]] · [[Part I — Vision|▲ Part I]] · [[S08 Success Criteria]] ▶

---

Every feature **MUST** satisfy these principles, and conformance **MUST** be recorded at design review.

1. Context over location.
2. Relationships over hierarchy.
3. Events over mutable state.
4. Desks over folders.
5. Objects over documents.
6. Understanding over storage.
7. AI assists; humans decide.
8. Explainability is mandatory.
9. Every recommendation requires evidence.
10. Trust grows through transparency.

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-PRIN#PLX-PRIN-006|PLX-PRIN-006]] | Every feature design **MUST** record, at design review, which of the ten design principles it advances and which it places under tension. Designs placing a principle under tension **MUST** record the mitigation. | I | §7 |
| [[REQ-PRIN#PLX-PRIN-007|PLX-PRIN-007]] | Every user-visible AI recommendation **MUST** be accompanied by machine-retrievable evidence consisting of references to specific Objects, Events, Decisions or Relationships. A recommendation for which no such evidence exists **MUST NOT** be displayed. | T, D | §7.9, [[S24 AI Experience|§24]] |
| [[REQ-PRIN#PLX-PRIN-008|PLX-PRIN-008]] | Every inferred Relationship, Context Health transition and Resume assertion **MUST** be traceable by the user to the Events that produced it, through no more than three interactions from the point of display. | D | §7.8, [[S23 Resume Experience|§23]] |

---

---

## Requirements defined or cited here

- [[REQ-PRIN#PLX-PRIN-006|PLX-PRIN-006]] — Every feature design **MUST** record, at design review, which of the ten design principles it advances and whi
- [[REQ-PRIN#PLX-PRIN-007|PLX-PRIN-007]] — Every user-visible AI recommendation **MUST** be accompanied by machine-retrievable evidence consisting of ref
- [[REQ-PRIN#PLX-PRIN-008|PLX-PRIN-008]] — Every inferred Relationship, Context Health transition and Resume assertion **MUST** be traceable by the user

◀ [[S06 Product Philosophy]] · [[Part I — Vision|▲ Part I]] · [[S08 Success Criteria]] ▶
