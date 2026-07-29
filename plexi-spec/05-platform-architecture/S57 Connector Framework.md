---
id: S57
section: §57
title: "Connector Framework"
part: V
type: section
defines:
  - PLX-CON-001
  - PLX-CON-002
  - PLX-CON-003
  - PLX-CON-004
  - PLX-CON-005
  - PLX-CON-006
  - PLX-CON-007
  - PLX-PRIN-002
tags:
  - section
  - part/v
---

# §57 Connector Framework

◀ [[S56 Multi-Agent Architecture]] · [[Part V — Platform Architecture|▲ Part V]] · [[S58 Performance Requirements]] ▶

---

Connectors expose **capabilities**, not interfaces.

Google Drive exposes Read, Write, Search, Permissions and Events — not Google Drive's UI. The same applies to Microsoft 365, GitHub, Slack, Salesforce, Jira, Notion, Obsidian, Dropbox, Figma, Adobe and any future platform.

### 57.1 Capability model

| Capability | Contract |
|---|---|
| `read` | Retrieve object content and metadata by external identifier |
| `write` | Create or update content in the external system |
| `search` | Query the external system's index |
| `permissions` | Read (and where supported, write) the external permission model |
| `events` | Receive change notifications, by webhook or by polling |
| `identity` | Map external principals to Plexi principals |

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-CON#PLX-CON-001|PLX-CON-001]] | Every Connector **MUST** declare which capabilities it implements. Consumers **MUST** query declared capabilities rather than assuming them. | T, I | §57 |
| [[REQ-CON#PLX-CON-002|PLX-CON-002]] | Connectors **MUST** map external permissions into the Plexi permission model, and **MUST NOT** grant a Plexi principal access to external content beyond what the external system grants the linked external principal. | T, A | §57, [[S69 Security Architecture|§69]] |
| [[REQ-CON#PLX-CON-003|PLX-CON-003]] | Where a Connector cannot faithfully represent an external system's permission model, it **MUST** default to the most restrictive interpretation and **MUST** record the limitation in its capability declaration. | I, T | §57, new |
| [[REQ-CON#PLX-CON-004|PLX-CON-004]] | Connector credentials **MUST** be stored in a dedicated credential vault, encrypted with tenant-scoped keys, and **MUST NOT** be readable by any service other than the Connector Service. | T, I | §57, [[S69 Security Architecture|§69]] |
| [[REQ-CON#PLX-CON-005|PLX-CON-005]] | Connector synchronisation **MUST** be resumable from a durable cursor and **MUST** be idempotent. Re-running a sync **MUST NOT** duplicate Objects or Events. | T | §57, new |
| [[REQ-CON#PLX-CON-006|PLX-CON-006]] | Removal of a Connector **MUST NOT** delete previously imported Objects, Relationships, Events or derived context (`[[REQ-PRIN#PLX-PRIN-002|PLX-PRIN-002]]`). | T | §57, [[S04 Vision|§4]] |
| [[REQ-CON#PLX-CON-007|PLX-CON-007]] | Connectors **MUST** implement backoff and rate-limit handling for the external system, and **MUST** surface persistent sync failure as a user-visible state rather than failing silently. | T, D | §57, new |

> **On `[[REQ-CON#PLX-CON-002|PLX-CON-002]]` and `[[REQ-CON#PLX-CON-003|PLX-CON-003]]`.** This is where an integration platform most often creates an accidental data-exposure path. External systems have permission models that do not map cleanly onto one another — Slack channel membership, Drive link-sharing, GitHub org visibility, Salesforce record-level sharing rules. A connector that imports content without faithfully importing its access constraints effectively republishes it to everyone with Desk access. Most-restrictive-on-ambiguity is the only safe default, and the gaps must be declared rather than hidden.

---

---

## Requirements defined or cited here

- [[REQ-CON#PLX-CON-001|PLX-CON-001]] — Every Connector **MUST** declare which capabilities it implements. Consumers **MUST** query declared capabilit
- [[REQ-CON#PLX-CON-002|PLX-CON-002]] — Connectors **MUST** map external permissions into the Plexi permission model, and **MUST NOT** grant a Plexi p
- [[REQ-CON#PLX-CON-003|PLX-CON-003]] — Where a Connector cannot faithfully represent an external system's permission model, it **MUST** default to th
- [[REQ-CON#PLX-CON-004|PLX-CON-004]] — Connector credentials **MUST** be stored in a dedicated credential vault, encrypted with tenant-scoped keys, a
- [[REQ-CON#PLX-CON-005|PLX-CON-005]] — Connector synchronisation **MUST** be resumable from a durable cursor and **MUST** be idempotent. Re-running a
- [[REQ-CON#PLX-CON-006|PLX-CON-006]] — Removal of a Connector **MUST NOT** delete previously imported Objects, Relationships, Events or derived conte
- [[REQ-CON#PLX-CON-007|PLX-CON-007]] — Connectors **MUST** implement backoff and rate-limit handling for the external system, and **MUST** surface pe
- [[REQ-PRIN#PLX-PRIN-002|PLX-PRIN-002]] — The platform **MUST** preserve context independently of the applications that produced it. Removal, replacemen

◀ [[S56 Multi-Agent Architecture]] · [[Part V — Platform Architecture|▲ Part V]] · [[S58 Performance Requirements]] ▶
