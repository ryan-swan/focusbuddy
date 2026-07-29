---
id: S82
section: §82
title: "Collaboration Framework"
part: VII
type: section
defines:
  - PLX-RES-004
  - PLX-SEC-033
  - PLX-UX-085
  - PLX-UX-086
tags:
  - section
  - part/vii
---

# §82 Collaboration Framework

◀ [[S81 Resume Algorithms]] · [[Part VII — Applications, Agents, Algorithms & Roadmap|▲ Part VII]] · [[S83 Marketplace Architecture]] ▶

---

Collaboration focuses on **shared understanding**, not simultaneous editing.

### 82.1 Awareness

Users should know who is active, who reviewed changes, who approved work, who is waiting and who requires attention — without unnecessary interruption.

### 82.2 Shared context

When multiple users work within one Desk, Resume Intelligence becomes collaborative. Recommendations account for the team's combined activity. The platform reflects the team's understanding rather than each individual's activity alone.

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-UX#PLX-UX-085|PLX-UX-085]] | Collaborative Resume content **MUST** be permission-filtered per viewing user at render time (`[[REQ-RES#PLX-RES-004|PLX-RES-004]]`). | T | §82, [[S25 Collaboration|§25]] |
| [[REQ-UX#PLX-UX-086|PLX-UX-086]] | Team awareness data **MUST NOT** be aggregated into individual activity reports without explicit tenant configuration, subject to `[[REQ-SEC#PLX-SEC-033|PLX-SEC-033]]`. | I, T | §82, new |

---

---

## Requirements defined or cited here

- [[REQ-RES#PLX-RES-004|PLX-RES-004]] — Where `forUserId` is null, the Resume **MUST** be permission-filtered at render time per viewing user; a colla
- [[REQ-SEC#PLX-SEC-033|PLX-SEC-033]] — Presence, focus and dwell telemetry **MUST** be retained under the presence retention class (`PLX-UX-072`) and
- [[REQ-UX#PLX-UX-085|PLX-UX-085]] — Collaborative Resume content **MUST** be permission-filtered per viewing user at render time (`PLX-RES-004`).
- [[REQ-UX#PLX-UX-086|PLX-UX-086]] — Team awareness data **MUST NOT** be aggregated into individual activity reports without explicit tenant config

◀ [[S81 Resume Algorithms]] · [[Part VII — Applications, Agents, Algorithms & Roadmap|▲ Part VII]] · [[S83 Marketplace Architecture]] ▶
