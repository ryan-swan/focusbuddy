---
id: S84
section: §84
title: "Platform SDK"
part: VII
type: section
defines:
  - PLX-API-005
  - PLX-APP-002
  - PLX-EXT-010
  - PLX-EXT-011
  - PLX-EXT-012
tags:
  - section
  - part/vii
---

# §84 Platform SDK

◀ [[S83 Marketplace Architecture]] · [[Part VII — Applications, Agents, Algorithms & Roadmap|▲ Part VII]] · [[S85 Five-Year Product Roadmap]] ▶

---

The SDK exposes stable interfaces for creating Objects, publishing Events, reading graph relationships, executing workflows, invoking AI agents, building connectors, creating visual components and managing permissions.

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-EXT#PLX-EXT-010|PLX-EXT-010]] | The SDK **MUST** be versioned with a published support and deprecation policy of not less than 12 months (`[[REQ-API#PLX-API-005|PLX-API-005]]`). | I | §84 |
| [[REQ-EXT#PLX-EXT-011|PLX-EXT-011]] | The SDK **MUST** be backward compatible within a major version. Breaking changes **MUST** require a major version increment. | T, I | §84 |
| [[REQ-EXT#PLX-EXT-012|PLX-EXT-012]] | Every SDK interface **MUST** be exercised by at least one first-party application, so that the SDK's capability is continuously proven rather than asserted (`[[REQ-APP#PLX-APP-002|PLX-APP-002]]`). | T, I | §84, new |

---

---

## Requirements defined or cited here

- [[REQ-API#PLX-API-005|PLX-API-005]] — APIs **MUST** be versioned. A breaking change **MUST** require a new version; prior versions **MUST** be suppo
- [[REQ-APP#PLX-APP-002|PLX-APP-002]] — Every native application **MUST** understand Desk context, Relationships, Workspace Memory, AI, permissions an
- [[REQ-EXT#PLX-EXT-010|PLX-EXT-010]] — The SDK **MUST** be versioned with a published support and deprecation policy of not less than 12 months (`PLX
- [[REQ-EXT#PLX-EXT-011|PLX-EXT-011]] — The SDK **MUST** be backward compatible within a major version. Breaking changes **MUST** require a major vers
- [[REQ-EXT#PLX-EXT-012|PLX-EXT-012]] — Every SDK interface **MUST** be exercised by at least one first-party application, so that the SDK's capabilit

◀ [[S83 Marketplace Architecture]] · [[Part VII — Applications, Agents, Algorithms & Roadmap|▲ Part VII]] · [[S85 Five-Year Product Roadmap]] ▶
