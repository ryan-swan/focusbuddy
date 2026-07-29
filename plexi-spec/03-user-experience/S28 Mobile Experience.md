---
id: S28
section: §28
title: "Mobile Experience"
part: III
type: section
defines:
  - PLX-UX-032
  - PLX-UX-080
  - PLX-UX-081
  - PLX-UX-082
tags:
  - section
  - part/iii
---

# §28 Mobile Experience

◀ [[S27 Accessibility]] · [[Part III — User Experience|▲ Part III]] · [[S29 Future Interaction Models]] ▶

---

Mobile is not a reduced desktop. It is a contextual companion.

Primary mobile use cases: Review Resume · Approve Decisions · Capture Ideas · Voice Notes · Quick Search · Relationship Discovery · Meeting Preparation · Status Review.

The desktop remains the primary production environment.

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-UX#PLX-UX-080|PLX-UX-080]] | Resume review and Decision approval **MUST** be fully functional on mobile, including evidence disclosure to at least the Evidence level of §23.2. | T, D | §28 |
| [[REQ-UX#PLX-UX-081|PLX-UX-081]] | Mobile **MUST NOT** be required to render or restore the spatial Canvas layout. Mobile layout state **MUST NOT** overwrite desktop layout state (`[[REQ-UX#PLX-UX-032|PLX-UX-032]]`). | T | §28, [[S21 Workspace Navigation|§21]] |
| [[REQ-UX#PLX-UX-082|PLX-UX-082]] | Objects captured on mobile **MUST** be attributed to a Desk at capture time, with a user-configurable default capture Desk. | T, D | §28, [[S44 Domain Invariants|§44]] R1 |

---

---

## Requirements defined or cited here

- [[REQ-UX#PLX-UX-032|PLX-UX-032]] — Layout **MUST** be persisted per (user, Desk, device class), so that a user's desktop arrangement is not overw
- [[REQ-UX#PLX-UX-080|PLX-UX-080]] — Resume review and Decision approval **MUST** be fully functional on mobile, including evidence disclosure to a
- [[REQ-UX#PLX-UX-081|PLX-UX-081]] — Mobile **MUST NOT** be required to render or restore the spatial Canvas layout. Mobile layout state **MUST NOT
- [[REQ-UX#PLX-UX-082|PLX-UX-082]] — Objects captured on mobile **MUST** be attributed to a Desk at capture time, with a user-configurable default

◀ [[S27 Accessibility]] · [[Part III — User Experience|▲ Part III]] · [[S29 Future Interaction Models]] ▶
