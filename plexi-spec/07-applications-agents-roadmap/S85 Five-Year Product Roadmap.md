---
id: S85
section: §85
title: "Five-Year Product Roadmap"
part: VII
type: section
defines:
  - PLX-ENG-030
tags:
  - section
  - part/vii
---

# §85 Five-Year Product Roadmap

◀ [[S84 Platform SDK]] · [[Part VII — Applications, Agents, Algorithms & Roadmap|▲ Part VII]] · [[S86 Product Success Metrics]] ▶

---

### 85.1 Phases

| Phase | Theme | Core outcomes |
|---|---|---|
| **1** | Foundation | Desk architecture · Workspace Canvas · Object model · Event platform · Workspace Memory · Resume Intelligence · Authentication · Core integrations · Primary AI assistant |
| **2** | Organisational Memory | Knowledge Graph · relationship discovery · Decision objects · meeting intelligence · Context Health · cross-Desk awareness · advanced search |
| **3** | Autonomous Assistance | Specialist AI agents · workflow automation · research assistance · decision recommendations · meeting preparation · knowledge maintenance |
| **4** | Organisational Intelligence | Predictive dependency analysis · cross-team optimisation · knowledge quality scoring · portfolio insights · executive dashboards · enterprise governance |
| **5** | Context Operating System | Ambient AI · continuous organisational reasoning · adaptive workspaces · cross-device continuity · autonomous agent coordination · deep enterprise integrations · industry intelligence packs |

At Phase 5, Plexi is no longer perceived as a productivity application. It becomes the primary operating environment through which organisations understand, coordinate and execute work.

### 85.2 Architectural prerequisites by phase

The roadmap above is a sequence of product outcomes. Certain architectural decisions cannot be sequenced with it — they are foreclosing choices that must be made **before Phase 1 ships**, because retrofitting them is disproportionately expensive or effectively impossible once data exists.

| Must be resolved before | Item | Risk | Why it cannot wait |
|---|---|---|---|
| First production Event | Per-subject encryption for erasure | `[[Risk Register#PLX-RSK-01|PLX-RSK-01]]` | Data written unencrypted cannot be retroactively protected |
| First production Event | Event schema versioning and upcasting | `[[Risk Register#PLX-RSK-02|PLX-RSK-02]]` | Every Event ever written must remain readable |
| First production Event | Identifier scheme (UUIDv7) | — | Migration touches every table, index and event |
| First production Event | Event partition key strategy | `[[Risk Register#PLX-RSK-08|PLX-RSK-08]]` | Repartitioning a populated log is a rebuild |
| First production Event | Permission snapshot on Events | — | Cannot be reconstructed after the fact |
| Phase 1 design | CRDT selection and compaction strategy | `[[Risk Register#PLX-RSK-04|PLX-RSK-04]]` | Determines client architecture and offline capability |
| Phase 1 design | Tenant isolation model per store | `[[Risk Register#PLX-RSK-07|PLX-RSK-07]]` | Determines graph and event store topology |
| Phase 1 design | Canvas accessible equivalent | `[[Risk Register#PLX-RSK-13|PLX-RSK-13]]` | Cannot be retrofitted to a spatial metaphor convincingly |
| Phase 1 exit | Unit economics model | `[[Risk Register#PLX-RSK-05|PLX-RSK-05]]` | Determines whether the business model survives scale |
| Phase 2 entry | Relationship-existence confidentiality policy | `[[Risk Register#PLX-RSK-09|PLX-RSK-09]]` | Cross-Desk awareness is the feature that exposes it |
| Phase 3 entry | Prompt injection architecture | `[[Risk Register#PLX-RSK-10|PLX-RSK-10]]` | Agents with tools and external content is the trigger condition |
| Phase 4 entry | Regulatory classification | `[[Risk Register#PLX-RSK-11|PLX-RSK-11]]` | Executive dashboards and contribution analysis approach worker-management territory |

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-ENG#PLX-ENG-030|PLX-ENG-030]] | Every item in §85.2 **MUST** be resolved, with the resolution recorded as an ADR, before the stated milestone. A milestone **MUST NOT** be declared complete with an open foreclosing decision. | I | §85, new |

> **On §85.2.** This table is the most practically useful thing this consolidation adds. A phased roadmap creates an entirely reasonable instinct to defer anything not needed for the current phase. That instinct is correct for features and wrong for foreclosing decisions — the ones where the cost of changing your mind rises by orders of magnitude once data exists. Encryption-for-erasure and event schema versioning are the two clearest examples: both are perhaps a fortnight of design work now, and both are effectively unfixable after eighteen months of production events.

---

---

## Requirements defined or cited here

- [[REQ-ENG#PLX-ENG-030|PLX-ENG-030]] — Every item in §85.2 **MUST** be resolved, with the resolution recorded as an ADR, before the stated milestone.

◀ [[S84 Platform SDK]] · [[Part VII — Applications, Agents, Algorithms & Roadmap|▲ Part VII]] · [[S86 Product Success Metrics]] ▶
