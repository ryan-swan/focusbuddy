---
id: S30
section: §30
title: "Domain Model"
part: IV
type: section
defines:
  - PLX-DOM-001
  - PLX-DOM-002
tags:
  - section
  - part/iv
---

# §30 Domain Model

◀ [[S29 Future Interaction Models]] · [[Part IV — Domain Model|▲ Part IV]] · [[S31 Core Philosophy]] ▶

---

### 30.1 Purpose

The Domain Model defines every permanent concept within Plexi. Everything implemented by engineering must be expressible through this model. **If a feature cannot be represented within the domain model, the feature is incomplete.**

The model is the foundation for backend services, APIs, AI reasoning, event processing, search, permissions, collaboration, Workspace Memory and Organisational Intelligence.

Every engineering decision should reinforce the Domain Model rather than bypass it.

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-DOM#PLX-DOM-001|PLX-DOM-001]] | Every persisted concept **MUST** be expressible through the entities defined in Part IV. Introduction of a new persisted concept **MUST** proceed by amendment to this Part, not by ad-hoc storage. | I | §30 |
| [[REQ-DOM#PLX-DOM-002|PLX-DOM-002]] | No service **MUST** persist domain state outside the entity model, including in caches used as systems of record, in blob metadata, or in message payloads treated as durable. | I, A | §30, new |

---

---

## Requirements defined or cited here

- [[REQ-DOM#PLX-DOM-001|PLX-DOM-001]] — Every persisted concept **MUST** be expressible through the entities defined in Part IV. Introduction of a new
- [[REQ-DOM#PLX-DOM-002|PLX-DOM-002]] — No service **MUST** persist domain state outside the entity model, including in caches used as systems of reco

◀ [[S29 Future Interaction Models]] · [[Part IV — Domain Model|▲ Part IV]] · [[S31 Core Philosophy]] ▶
