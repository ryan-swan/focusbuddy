---
id: S21
section: §21
title: "Workspace Navigation"
part: III
type: section
defines:
  - PLX-UX-030
  - PLX-UX-031
  - PLX-UX-032
  - PLX-UX-033
tags:
  - section
  - part/iii
---

# §21 Workspace Navigation

◀ [[S20 Context Health]] · [[Part III — User Experience|▲ Part III]] · [[S22 Search Experience]] ▶

---

Navigation is based on work rather than storage. Users navigate between Desks, not folders.

### 21.1 Global navigation

Home · Desks · People · Knowledge · Search · Automations · Notifications · Settings · AI Assistant

### 21.2 Desk navigation

Within a Desk, navigation is spatial. Objects remain where users placed them. Workspace layout is considered memory.

Moving between Desks restores layout, scroll positions, window states, open conversations, selected Objects, AI discussions and active workflows.

### 21.3 Spatial memory

The platform leverages human spatial memory. People naturally remember *"the proposal was on the left, the spreadsheet was below it, the AI conversation was beside the browser."* Preserving layout preserves cognition.

### 21.4 Requirements

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-UX#PLX-UX-030|PLX-UX-030]] | The platform **MUST NOT** reposition, resize or reflow user-placed Objects on a Desk without explicit user action, except where required by a viewport change, and **MUST** restore the user's canonical layout when the original viewport is restored. | T, D | §21.2, §21.3 |
| [[REQ-UX#PLX-UX-031|PLX-UX-031]] | Desk restoration **MUST** restore layout, scroll positions, window states, open conversations, selected Objects, AI discussions and active workflows to the state recorded in the most recent Session snapshot. | T, D | §21.2 |
| [[REQ-UX#PLX-UX-032|PLX-UX-032]] | Layout **MUST** be persisted per (user, Desk, device class), so that a user's desktop arrangement is not overwritten by their mobile or multi-monitor arrangement. | T | §21, new |
| [[REQ-UX#PLX-UX-033|PLX-UX-033]] | Where layout cannot be fully restored (for example, an Object has been deleted or permission revoked), the platform **MUST** indicate what could not be restored rather than silently omitting it. | D | §21, new |

---

---

## Requirements defined or cited here

- [[REQ-UX#PLX-UX-030|PLX-UX-030]] — The platform **MUST NOT** reposition, resize or reflow user-placed Objects on a Desk without explicit user act
- [[REQ-UX#PLX-UX-031|PLX-UX-031]] — Desk restoration **MUST** restore layout, scroll positions, window states, open conversations, selected Object
- [[REQ-UX#PLX-UX-032|PLX-UX-032]] — Layout **MUST** be persisted per (user, Desk, device class), so that a user's desktop arrangement is not overw
- [[REQ-UX#PLX-UX-033|PLX-UX-033]] — Where layout cannot be fully restored (for example, an Object has been deleted or permission revoked), the pla

◀ [[S20 Context Health]] · [[Part III — User Experience|▲ Part III]] · [[S22 Search Experience]] ▶
