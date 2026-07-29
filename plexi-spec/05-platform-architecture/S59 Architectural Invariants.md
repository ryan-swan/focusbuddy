---
id: S59
section: §59
title: "Architectural Invariants"
part: V
type: section
defines:
  - PLX-ENG-001
tags:
  - section
  - part/v
---

# §59 Architectural Invariants

◀ [[S58 Performance Requirements]] · [[Part V — Platform Architecture|▲ Part V]] · [[S60 Engineering Principle]] ▶

---

The following rules are absolute. They are registered with enforcement mechanisms in **Appendix B**.

| Invariant | Statement |
|---|---|
| `[[Invariants#PLX-INV-02|PLX-INV-02]]` | Every mutation becomes an Event. |
| `[[Invariants#PLX-INV-08|PLX-INV-08]]` | Every Event is immutable. |
| `[[Invariants#PLX-INV-09|PLX-INV-09]]` | Every recommendation is explainable. |
| `[[Invariants#PLX-INV-03|PLX-INV-03]]` | Every relationship has provenance. |
| `[[Invariants#PLX-INV-10|PLX-INV-10]]` | Every service owns one domain. |
| `[[Invariants#PLX-INV-11|PLX-INV-11]]` | No service bypasses the Event Bus. |
| `[[Invariants#PLX-INV-04|PLX-INV-04]]` | AI never bypasses structured data. |
| `[[Invariants#PLX-INV-12|PLX-INV-12]]` | Workspace Memory is always recoverable. |
| `[[Invariants#PLX-INV-13|PLX-INV-13]]` | Context always survives application changes. |
| `[[Invariants#PLX-INV-05|PLX-INV-05]]` | History is never destroyed (subject to the erasure carve-out, §44.1). |

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-ENG#PLX-ENG-001|PLX-ENG-001]] | Every invariant in Appendix B **MUST** have at least one automated detection test that fails if the invariant is violated. Invariants asserted only in documentation **MUST NOT** be considered enforced. | T, I | §59, new |

---

---

## Requirements defined or cited here

- [[REQ-ENG#PLX-ENG-001|PLX-ENG-001]] — Every invariant in Appendix B **MUST** have at least one automated detection test that fails if the invariant

◀ [[S58 Performance Requirements]] · [[Part V — Platform Architecture|▲ Part V]] · [[S60 Engineering Principle]] ▶
