---
id: S65
section: §65
title: "Knowledge Graph Schema"
part: VI
type: section
defines:
  - PLX-GPH-010
  - PLX-GPH-020
  - PLX-GPH-021
  - PLX-GPH-022
tags:
  - section
  - part/vi
---

# §65 Knowledge Graph Schema

◀ [[S64 Event Contracts]] · [[Part VI — Data, APIs, Security & Engineering Standards|▲ Part VI]] · [[S66 Workspace Memory Architecture]] ▶

---

### 65.1 Node types

Organisation · Department · Team · Desk · User · Object · Decision · Workflow · Meeting · Agent · Conversation · Application · Integration · Automation · Knowledge Card · Policy

### 65.2 Edge types

Owns · Contains · Created · DependsOn · Supports · References · AssignedTo · Approves · Mentions · Duplicates · ConflictsWith · GeneratedBy · Explains · EvidenceFor · EvidenceAgainst · DerivedFrom · Uses · Updates · Blocks

The consolidated catalogue reconciling §15.1, §36.2 and §65.2 — which are three overlapping but non-identical lists in the source — is **Appendix E**.

### 65.3 Edge properties

Every edge carries: Weight · Confidence · Evidence · Discovery Method · Created · Updated · Owner · Permission Scope.

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-GPH#PLX-GPH-020|PLX-GPH-020]] | The relationship type vocabulary **MUST** be a single closed registry (Appendix E). Services **MUST NOT** introduce edge types outside the registry; extension-defined types **MUST** be registered before use. | T, I | §65, new |
| [[REQ-GPH#PLX-GPH-021|PLX-GPH-021]] | Every edge **MUST** carry a permission scope, and traversal **MUST** evaluate it (`[[REQ-GPH#PLX-GPH-010|PLX-GPH-010]]`). | T | §65 |
| [[REQ-GPH#PLX-GPH-022|PLX-GPH-022]] | Node and edge writes **MUST** carry the `correlationId` of the originating Event, so that any graph state is traceable to the user action that produced it. | T | §65, new |

---

---

## Requirements defined or cited here

- [[REQ-GPH#PLX-GPH-010|PLX-GPH-010]] — Graph traversal **MUST** be permission-filtered. Traversal **MUST NOT** cross an edge into a node the requesti
- [[REQ-GPH#PLX-GPH-020|PLX-GPH-020]] — The relationship type vocabulary **MUST** be a single closed registry (Appendix E). Services **MUST NOT** intr
- [[REQ-GPH#PLX-GPH-021|PLX-GPH-021]] — Every edge **MUST** carry a permission scope, and traversal **MUST** evaluate it (`PLX-GPH-010`).
- [[REQ-GPH#PLX-GPH-022|PLX-GPH-022]] — Node and edge writes **MUST** carry the `correlationId` of the originating Event, so that any graph state is t

◀ [[S64 Event Contracts]] · [[Part VI — Data, APIs, Security & Engineering Standards|▲ Part VI]] · [[S66 Workspace Memory Architecture]] ▶
