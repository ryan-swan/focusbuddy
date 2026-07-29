---
id: S44
section: §44
title: "Domain Invariants"
part: IV
type: section
defines:
  - PLX-SEC-030
tags:
  - section
  - part/iv
---

# §44 Domain Invariants

◀ [[S43 Entity Relationships]] · [[Part IV — Domain Model|▲ Part IV]] · [[S45 Platform Architecture]] ▶

---

The following rules can never be violated. They are registered formally in **Appendix B** with enforcement mechanisms and detection tests.

| Source rule | Invariant | Statement |
|---|---|---|
| Rule 1 | `[[Invariants#PLX-INV-01|PLX-INV-01]]` | Every Object belongs to exactly one owning Desk. Objects may appear in many Desks; ownership remains singular. |
| Rule 2 | `[[Invariants#PLX-INV-02|PLX-INV-02]]` | Every meaningful change produces an Event. No silent mutations. |
| Rule 3 | `[[Invariants#PLX-INV-03|PLX-INV-03]]` | Relationships always include provenance. Every connection must be explainable. |
| Rule 4 | `[[Invariants#PLX-INV-04|PLX-INV-04]]` | AI never bypasses structured data. Structured truth precedes generated interpretation. |
| Rule 5 | `[[Invariants#PLX-INV-05|PLX-INV-05]]` | Nothing deletes organisational memory. Deletion affects visibility, never history. |
| Rule 6 | `[[Invariants#PLX-INV-06|PLX-INV-06]]` | Permissions propagate through relationships. No Object can expose information beyond the owner's permissions. |
| Rule 7 | `[[Invariants#PLX-INV-07|PLX-INV-07]]` | Everything remains inspectable. Every recommendation, summary, AI conclusion, relationship, decision and event. Users must always be able to ask *why*, and the platform must always answer. |

### 44.1 The one carve-out

`[[Invariants#PLX-INV-05|PLX-INV-05]]` has exactly one lawful exception, and it must be stated here rather than discovered later:

> **Erasure carve-out.** Where a data subject exercises a valid right to erasure under applicable data-protection law, and no overriding legal basis for retention applies, the platform **MUST** render the affected personal data permanently unrecoverable. This is executed by **cryptographic erasure** — destruction of the per-subject key material — rather than by mutation or deletion of Event records. The Event records remain; their personal-data payloads become permanently undecryptable. The erasure action itself **MUST** be recorded as an Event.

This preserves the invariant's engineering intent (the log is append-only and never rewritten) while satisfying a legal obligation the invariant as originally written could not survive. See `[[REQ-SEC#PLX-SEC-030|PLX-SEC-030]]`, §69.7 and `[[Risk Register#PLX-RSK-01|PLX-RSK-01]]`.

---

---

## Requirements defined or cited here

- [[REQ-SEC#PLX-SEC-030|PLX-SEC-030]] — The platform **MUST** implement cryptographic erasure for personal data: per-subject key material, destroyed o

◀ [[S43 Entity Relationships]] · [[Part IV — Domain Model|▲ Part IV]] · [[S45 Platform Architecture]] ▶
