---
id: S16
section: §16
title: "Shared Objects"
part: II
type: section
defines:
  - PLX-PRD-060
  - PLX-PRD-061
  - PLX-PRD-062
  - PLX-PRD-063
tags:
  - section
  - part/ii
---

# §16 Shared Objects

◀ [[S15 Knowledge Graph]] · [[Part II — Product Model|▲ Part II]] · [[S17 Organisational Intelligence]] ▶

---

Objects may exist across multiple Desks simultaneously. Sharing never duplicates understanding — only presentation.

### 16.1 Synchronisation modes

| Mode | Semantics |
|---|---|
| **Independent Copy** | A completely separate Object. Future edits are isolated. |
| **Snapshot** | Static copy. The original continues independently. |
| **Live Reference** | One canonical Object. Every Desk sees identical content. |
| **Federated Object** | Multiple owners. Shared editing. Shared history. Independent presentation. |

[[S50 Synchronisation Engine|§50]] extends this set with **Linked** and **Streaming** modes for the synchronisation runtime.

### 16.2 Ownership

Ownership never changes because an Object is shared. Ownership remains explicit. Permissions remain explicit. History remains immutable.

### 16.3 Requirements

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-PRD#PLX-PRD-060|PLX-PRD-060]] | Sharing an Object into an additional Desk **MUST NOT** change its owning Desk. | T | §16.2, [[S44 Domain Invariants|§44]] R1 |
| [[REQ-PRD#PLX-PRD-061|PLX-PRD-061]] | Where an Object appears in multiple Desks with differing permissions, the **most restrictive** applicable permission **MUST** govern for a given user. | T | §16, [[S44 Domain Invariants|§44]] R6, new |
| [[REQ-PRD#PLX-PRD-062|PLX-PRD-062]] | The synchronisation mode of a shared Object **MUST** be visible to every user who can see the Object, so that no user edits a Snapshot believing it is a Live Reference. | D | §16.1, new |
| [[REQ-PRD#PLX-PRD-063|PLX-PRD-063]] | Federated Objects **MUST** record all owners explicitly, and a change of the owner set **MUST** emit an Event and require approval from the existing owner set per tenant policy. | T | §16.1, new |

> **On `[[REQ-PRD#PLX-PRD-061|PLX-PRD-061]]`.** [[S44 Domain Invariants|§44]] Rule 1 says ownership is singular; [[S44 Domain Invariants|§44]] Rule 6 says permissions propagate through relationships. Neither states what happens when the same Object is reachable through two Desks with different ACLs. Left unresolved, this is the platform's most likely source of a data-exposure incident. Most-restrictive-wins is the safe default and is now stated normatively; the alternative (owning-Desk-governs) is defensible but **must** be a recorded decision, not an accident of implementation order. Tracked as `[[Risk Register#PLX-RSK-09|PLX-RSK-09]]`.

---

---

## Requirements defined or cited here

- [[REQ-PRD#PLX-PRD-060|PLX-PRD-060]] — Sharing an Object into an additional Desk **MUST NOT** change its owning Desk.
- [[REQ-PRD#PLX-PRD-061|PLX-PRD-061]] — Where an Object appears in multiple Desks with differing permissions, the **most restrictive** applicable perm
- [[REQ-PRD#PLX-PRD-062|PLX-PRD-062]] — The synchronisation mode of a shared Object **MUST** be visible to every user who can see the Object, so that
- [[REQ-PRD#PLX-PRD-063|PLX-PRD-063]] — Federated Objects **MUST** record all owners explicitly, and a change of the owner set **MUST** emit an Event

◀ [[S15 Knowledge Graph]] · [[Part II — Product Model|▲ Part II]] · [[S17 Organisational Intelligence]] ▶
