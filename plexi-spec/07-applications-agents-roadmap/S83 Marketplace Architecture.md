---
id: S83
section: §83
title: "Marketplace Architecture"
part: VII
type: section
defines:
  - PLX-AI-030
  - PLX-APP-002
  - PLX-EXT-001
  - PLX-EXT-002
  - PLX-EXT-003
  - PLX-EXT-004
  - PLX-EXT-005
  - PLX-EXT-006
  - PLX-EXT-007
  - PLX-GPH-020
  - PLX-PRD-011
tags:
  - section
  - part/vii
---

# §83 Marketplace Architecture

◀ [[S82 Collaboration Framework]] · [[Part VII — Applications, Agents, Algorithms & Roadmap|▲ Part VII]] · [[S84 Platform SDK]] ▶

---

The platform exposes a secure extension framework.

### 83.1 Extension types

Object types · AI Agents · Connectors · Automations · Visualisations · Search providers · Export formats · Workflow templates · Industry packs · Compliance packs.

### 83.2 Principles

Extensions cannot bypass permissions, audit logging, event generation, security policies, the Context Engine or the Knowledge Graph. Every extension participates within the same architecture as native functionality.

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-EXT#PLX-EXT-001|PLX-EXT-001]] | Extensions **MUST** execute within a sandbox with an explicitly granted capability set. Capability grants **MUST** be reviewed by the installing Organisation and **MUST** be revocable. | T, I | §83 |
| [[REQ-EXT#PLX-EXT-002|PLX-EXT-002]] | Extensions **MUST** use the same public platform interfaces as first-party applications (`[[REQ-APP#PLX-APP-002|PLX-APP-002]]`). No private interface **MUST** exist for first-party use. | I, T | §83, [[S77 Native Workspace Applications|§77]] |
| [[REQ-EXT#PLX-EXT-003|PLX-EXT-003]] | Extension actions **MUST** emit Events attributed to the extension, with `onBehalfOf` recording the authorising principal. | T | §83 |
| [[REQ-EXT#PLX-EXT-004|PLX-EXT-004]] | Extensions **MUST NOT** exceed the permissions of the principal on whose behalf they act, and permission enforcement **MUST** occur at the data-access layer, not in extension code. | T, A | §83, [[S69 Security Architecture|§69]] |
| [[REQ-EXT#PLX-EXT-005|PLX-EXT-005]] | Extension-registered Object types and Relationship types **MUST** be registered in the platform registries (`[[REQ-PRD#PLX-PRD-011|PLX-PRD-011]]`, `[[REQ-GPH#PLX-GPH-020|PLX-GPH-020]]`) and **MUST** receive identical platform treatment to built-in types. | T | §83, [[S11 Objects|§11]] |
| [[REQ-EXT#PLX-EXT-006|PLX-EXT-006]] | Extensions **MUST** declare their data egress. An extension that transmits tenant content externally **MUST** disclose destinations at install time and **MUST** be blockable by Organisation policy. | T, I | §83, new |
| [[REQ-EXT#PLX-EXT-007|PLX-EXT-007]] | Extension resource and cost consumption **MUST** be metered and attributable, and **MUST** be subject to the Organisation cost ceiling (`[[REQ-AI#PLX-AI-030|PLX-AI-030]]`). | T | §83, [[S68 AI Cost Optimisation|§68]], new |

> **On `[[REQ-EXT#PLX-EXT-006|PLX-EXT-006]]`.** A marketplace on a platform that holds an organisation's complete decision history and reasoning is a materially higher-stakes marketplace than one on a note-taking app. The install-time question a security team will ask is not "what can this do?" but "where does our data go?" — and it needs a machine-readable answer, enforced, not a paragraph in a listing.

---

---

## Requirements defined or cited here

- [[REQ-AI#PLX-AI-030|PLX-AI-030]] — Every Organisation and every Desk **MUST** support a configurable AI cost ceiling. Exceeding a ceiling **MUST*
- [[REQ-APP#PLX-APP-002|PLX-APP-002]] — Every native application **MUST** understand Desk context, Relationships, Workspace Memory, AI, permissions an
- [[REQ-EXT#PLX-EXT-001|PLX-EXT-001]] — Extensions **MUST** execute within a sandbox with an explicitly granted capability set. Capability grants **MU
- [[REQ-EXT#PLX-EXT-002|PLX-EXT-002]] — Extensions **MUST** use the same public platform interfaces as first-party applications (`PLX-APP-002`). No pr
- [[REQ-EXT#PLX-EXT-003|PLX-EXT-003]] — Extension actions **MUST** emit Events attributed to the extension, with `onBehalfOf` recording the authorisin
- [[REQ-EXT#PLX-EXT-004|PLX-EXT-004]] — Extensions **MUST NOT** exceed the permissions of the principal on whose behalf they act, and permission enfor
- [[REQ-EXT#PLX-EXT-005|PLX-EXT-005]] — Extension-registered Object types and Relationship types **MUST** be registered in the platform registries (`P
- [[REQ-EXT#PLX-EXT-006|PLX-EXT-006]] — Extensions **MUST** declare their data egress. An extension that transmits tenant content externally **MUST**
- [[REQ-EXT#PLX-EXT-007|PLX-EXT-007]] — Extension resource and cost consumption **MUST** be metered and attributable, and **MUST** be subject to the O
- [[REQ-GPH#PLX-GPH-020|PLX-GPH-020]] — The relationship type vocabulary **MUST** be a single closed registry (Appendix E). Services **MUST NOT** intr
- [[REQ-PRD#PLX-PRD-011|PLX-PRD-011]] — The Object type registry **MUST** be extensible at runtime without redeployment of the Object Service, and ext

◀ [[S82 Collaboration Framework]] · [[Part VII — Applications, Agents, Algorithms & Roadmap|▲ Part VII]] · [[S84 Platform SDK]] ▶
