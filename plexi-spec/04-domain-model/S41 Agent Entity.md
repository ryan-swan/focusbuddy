---
id: S41
section: §41
title: "Agent Entity"
part: IV
type: section
defines:
  - PLX-AGT-001
  - PLX-AGT-002
  - PLX-AGT-003
  - PLX-AGT-004
  - PLX-AGT-005
  - PLX-AGT-006
tags:
  - section
  - part/iv
---

# §41 Agent Entity

◀ [[S40 Session Entity]] · [[Part IV — Domain Model|▲ Part IV]] · [[S42 Organisation Entity]] ▶

---

Agents behave as contextual collaborators. They are never independent users. They operate within explicit boundaries.

### 41.1 Schema

```typescript
interface Agent extends BaseEntity {
  entityType:          "agent";

  name:                string;
  agentClass:          AgentClassId;     // see §78
  capabilities:        Capability[];

  deskId:              UUID | null;      // null = organisation-scoped
  memoryScope:         "task" | "session" | "desk" | "organisation";
  permissions:         PermissionSet;    // MUST be a subset — PLX-AGT-001
  actsOnBehalfOf:      UUID;             // human principal — PLX-AGT-005

  tools:               ToolBinding[];
  currentTaskId:       UUID | null;
  knowledgeSources:    KnowledgeSourceRef[];
  conversationIds:     UUID[];

  performanceMetrics:  AgentMetrics;
  auditStreamRef:      StreamRef;

  costCeiling:         Money | null;
  suspended:           boolean;
}
```

### 41.2 Agent rules

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-AGT#PLX-AGT-001|PLX-AGT-001]] | An Agent's effective permissions **MUST** be a subset of the permissions of the principal on whose behalf it acts. Permission checks **MUST** be enforced at the data-access layer, not only at the orchestration layer. | T | §41.2, [[S69 Security Architecture|§69]] |
| [[REQ-AGT#PLX-AGT-002|PLX-AGT-002]] | Every Agent action **MUST** emit an Event attributed to the Agent, with `onBehalfOf` populated. | T | §41.2 |
| [[REQ-AGT#PLX-AGT-003|PLX-AGT-003]] | Agents **MUST NOT** create Relationships in `confirmed` state. Agent-created Relationships **MUST** be `provisional`. | T | §41.2, [[S36 Relationship Entity|§36]] |
| [[REQ-AGT#PLX-AGT-004|PLX-AGT-004]] | Agents **MUST NOT** assert organisational facts not derivable from structured platform data. Assertions **MUST** carry evidence references (`[[Invariants#PLX-INV-04|PLX-INV-04]]`). | T, A | §41.2, [[S70 AI Governance|§70]] |
| [[REQ-AGT#PLX-AGT-005|PLX-AGT-005]] | Every Agent **MUST** have exactly one `actsOnBehalfOf` human principal at any moment. An Agent with no accountable human principal **MUST** be suspended. | T | §41, new |
| [[REQ-AGT#PLX-AGT-006|PLX-AGT-006]] | Agent cost consumption **MUST** be metered against `costCeiling` and against the owning Desk's `costCeilingPerMonth`; exceeding either **MUST** suspend the Agent and emit an Event, not silently degrade output quality. | T, A | §41, [[S68 AI Cost Optimisation|§68]], new |

> **On `[[REQ-AGT#PLX-AGT-005|PLX-AGT-005]]`.** Accountability cannot be held by software. When an Agent takes an action that turns out to be wrong — a proposal sent, a permission changed, a Decision marked implemented — an auditor will ask who authorised it. "The Workspace Agent did" is not an answer that survives a regulatory review or a court. Every autonomous action must trace to a human who granted the authority.

---

---

## Requirements defined or cited here

- [[REQ-AGT#PLX-AGT-001|PLX-AGT-001]] — An Agent's effective permissions **MUST** be a subset of the permissions of the principal on whose behalf it a
- [[REQ-AGT#PLX-AGT-002|PLX-AGT-002]] — Every Agent action **MUST** emit an Event attributed to the Agent, with `onBehalfOf` populated.
- [[REQ-AGT#PLX-AGT-003|PLX-AGT-003]] — Agents **MUST NOT** create Relationships in `confirmed` state. Agent-created Relationships **MUST** be `provis
- [[REQ-AGT#PLX-AGT-004|PLX-AGT-004]] — Agents **MUST NOT** assert organisational facts not derivable from structured platform data. Assertions **MUST
- [[REQ-AGT#PLX-AGT-005|PLX-AGT-005]] — Every Agent **MUST** have exactly one `actsOnBehalfOf` human principal at any moment. An Agent with no account
- [[REQ-AGT#PLX-AGT-006|PLX-AGT-006]] — Agent cost consumption **MUST** be metered against `costCeiling` and against the owning Desk's `costCeilingPer

◀ [[S40 Session Entity]] · [[Part IV — Domain Model|▲ Part IV]] · [[S42 Organisation Entity]] ▶
