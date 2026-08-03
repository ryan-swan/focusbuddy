---
id: S66
section: §66
title: "Workspace Memory Architecture"
part: VI
type: section
defines:
  - PLX-DATA-010
  - PLX-DATA-011
  - PLX-DATA-012
  - PLX-DOM-043
  - PLX-UX-072
tags:
  - section
  - part/vi
---

# §66 Workspace Memory Architecture

◀ [[S65 Knowledge Graph Schema]] · [[Part VI — Data, APIs, Security & Engineering Standards|▲ Part VI]] · [[S67 AI Prompt Framework]] ▶

---

Workspace Memory exists independently from conversations.

### 66.1 Memory layers

| Layer | Scope | Default retention | Erasure class |
|---|---|---|---|
| **Operational** | Current work | Until Desk archived | Derived — rebuildable |
| **Short-term** | Current session | 30 days, tenant-configurable | Presence-class (`[[REQ-UX#PLX-UX-072|PLX-UX-072]]`) |
| **Long-term** | Historical understanding | Indefinite | Subject to erasure carve-out (§44.1) |
| **Organisational** | Cross-Desk understanding | Indefinite | Subject to erasure carve-out |
| **AI** | Reasoning history, prompt optimisation, relationship discovery | Tenant-configurable, default 12 months | Derived — rebuildable |

Each memory layer has independent retention policies.

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-DATA#PLX-DATA-010|PLX-DATA-010]] | Each memory layer **MUST** carry an independent, tenant-configurable retention policy, and policy application **MUST** emit an auditable Event. | T, I | §66 |
| [[REQ-DATA#PLX-DATA-011|PLX-DATA-011]] | AI memory **MUST** be classified as derived and rebuildable. Loss of AI memory **MUST NOT** cause loss of Objects, Events, Relationships or Decisions. | T, I | §66, new |
| [[REQ-DATA#PLX-DATA-012|PLX-DATA-012]] | Retention policies **MUST NOT** be capable of pruning Decision `alternatives` (`[[REQ-DOM#PLX-DOM-043|PLX-DOM-043]]`) or Event records (`[[Invariants#PLX-INV-05|PLX-INV-05]]`). | T | §66, [[S37 Decision Entity|§37]] |

---

---

## Requirements defined or cited here

- [[REQ-DATA#PLX-DATA-010|PLX-DATA-010]] — Each memory layer **MUST** carry an independent, tenant-configurable retention policy, and policy application
- [[REQ-DATA#PLX-DATA-011|PLX-DATA-011]] — AI memory **MUST** be classified as derived and rebuildable. Loss of AI memory **MUST NOT** cause loss of Obje
- [[REQ-DATA#PLX-DATA-012|PLX-DATA-012]] — Retention policies **MUST NOT** be capable of pruning Decision `alternatives` (`PLX-DOM-043`) or Event records
- [[REQ-DOM#PLX-DOM-043|PLX-DOM-043]] — Rejected `alternatives` **MUST** be retained permanently. The record of what was *not* chosen, and why, **MUST
- [[REQ-UX#PLX-UX-072|PLX-UX-072]] — Presence data **MUST** be treated as personal data with a defined, tenant-configurable retention period, and *

◀ [[S65 Knowledge Graph Schema]] · [[Part VI — Data, APIs, Security & Engineering Standards|▲ Part VI]] · [[S67 AI Prompt Framework]] ▶
