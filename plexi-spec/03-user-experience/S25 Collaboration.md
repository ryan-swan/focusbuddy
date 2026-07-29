---
id: S25
section: §25
title: "Collaboration"
part: III
type: section
defines:
  - PLX-UX-070
  - PLX-UX-071
  - PLX-UX-072
tags:
  - section
  - part/iii
---

# §25 Collaboration

◀ [[S24 AI Experience]] · [[Part III — User Experience|▲ Part III]] · [[S26 Notifications]] ▶

---

Collaboration should feel like multiple people sharing one physical workspace.

### 25.1 Shared presence

Users naturally understand who is here, who recently worked here, what changed and where attention is focused — without constant interruptions.

**Presence indicators:** Working · Viewing · Reviewing · Commenting · Waiting · Offline

### 25.2 Shared context

Rather than notifying users about every edit, Plexi updates shared understanding.

| Traditional software | Plexi |
|---|---|
| *"John updated the spreadsheet."* | *"John's update changes the expected delivery date by three days and affects two client proposals."* |

Meaning matters more than activity.

### 25.3 Collaborative Resume

When multiple users work inside the same Desk, Resume Intelligence includes Team Progress, Major Decisions, Outstanding Questions, Cross-Team Dependencies, Recent AI Insights and Suggested Coordination.

### 25.4 Requirements

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-UX#PLX-UX-070|PLX-UX-070]] | Presence information **MUST** be permission-scoped. A user **MUST NOT** be shown the presence of another user on an Object they cannot themselves see. | T | §25.1, [[S44 Domain Invariants|§44]] R6 |
| [[REQ-UX#PLX-UX-071|PLX-UX-071]] | Change communication **MUST** be expressed in terms of consequence where consequence is derivable, and **MUST** fall back to factual activity description where it is not. It **MUST NOT** fabricate consequence. | T, D | §25.2 |
| [[REQ-UX#PLX-UX-072|PLX-UX-072]] | Presence data **MUST** be treated as personal data with a defined, tenant-configurable retention period, and **MUST NOT** be retained in the Event Store beyond that period in identifiable form. | T, I | §25.1, new |

> **On `[[REQ-UX#PLX-UX-072|PLX-UX-072]]`.** Presence, focus and dwell telemetry are the raw material of employee monitoring. Whatever the intent, a system that permanently records who looked at what and for how long is one legal request away from being an evidence corpus, and in several jurisdictions is subject to works-council consultation before deployment. Presence should be ephemeral by default and its retention a deliberate, per-tenant, auditable choice. See `[[Risk Register#PLX-RSK-12|PLX-RSK-12]]`.

---

---

## Requirements defined or cited here

- [[REQ-UX#PLX-UX-070|PLX-UX-070]] — Presence information **MUST** be permission-scoped. A user **MUST NOT** be shown the presence of another user
- [[REQ-UX#PLX-UX-071|PLX-UX-071]] — Change communication **MUST** be expressed in terms of consequence where consequence is derivable, and **MUST*
- [[REQ-UX#PLX-UX-072|PLX-UX-072]] — Presence data **MUST** be treated as personal data with a defined, tenant-configurable retention period, and *

◀ [[S24 AI Experience]] · [[Part III — User Experience|▲ Part III]] · [[S26 Notifications]] ▶
