---
id: S29
section: §29
title: "Future Interaction Models"
part: III
type: section
defines:
  - PLX-UX-090
  - PLX-UX-091
tags:
  - section
  - part/iii
---

# §29 Future Interaction Models

◀ [[S28 Mobile Experience]] · [[Part III — User Experience|▲ Part III]] · [[S30 Domain Model]] ▶

---

Plexi is designed to support future interfaces without architectural change: voice-first interaction, augmented reality workspaces, spatial computing, wearables, ambient AI, multi-device workspaces and autonomous agents.

Because context exists independently of presentation, new interfaces become alternative views of the same underlying knowledge system.

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-UX#PLX-UX-090|PLX-UX-090]] | No Context, Relationship, Decision or Resume data **MUST** be stored in a presentation-specific form. Presentation state (layout, viewport, device class) **MUST** be stored separately from semantic state. | I, T | §29 |
| [[REQ-UX#PLX-UX-091|PLX-UX-091]] | Every capability exposed through the primary interface **MUST** be reachable through the public API ([[S63 Canonical API Design|§63]]), so that alternative interfaces are first-class rather than privileged. | T, I | §29, [[S84 Platform SDK|§84]] |

---

---

## Requirements defined or cited here

- [[REQ-UX#PLX-UX-090|PLX-UX-090]] — No Context, Relationship, Decision or Resume data **MUST** be stored in a presentation-specific form. Presenta
- [[REQ-UX#PLX-UX-091|PLX-UX-091]] — Every capability exposed through the primary interface **MUST** be reachable through the public API (§63), so

◀ [[S28 Mobile Experience]] · [[Part III — User Experience|▲ Part III]] · [[S30 Domain Model]] ▶
