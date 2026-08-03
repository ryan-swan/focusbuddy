---
type: entity
entity: Agent
spec_section: §41
tags:
  - entity
  - domain-model
---

# Agent

[[Home|▲ Home]] · [[S41 Agent Entity|§41 — full definition]] · [[S32 Canonical Entity Model|§32 BaseEntity]]

> [!abstract] Canonical schema
> Defined in [[S41 Agent Entity|§41]]. All entities inherit [[S32 Canonical Entity Model|BaseEntity]] — do not invent a separate identity model ([[REQ-DOM#PLX-DOM-010|PLX-DOM-010]]).

## Schema

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

## Binding requirements

| ID | V | Requirement |
|---|---|---|
| [[REQ-AGT#PLX-AGT-001\|PLX-AGT-001]] | T | An Agent's effective permissions **MUST** be a subset of the permissions of the principal on whose behalf it acts. Permission checks **MUST** be enforced at the data-access layer, not only at the orchestration layer. |
| [[REQ-AGT#PLX-AGT-002\|PLX-AGT-002]] | T | Every Agent action **MUST** emit an Event attributed to the Agent, with `onBehalfOf` populated. |
| [[REQ-AGT#PLX-AGT-003\|PLX-AGT-003]] | T | Agents **MUST NOT** create Relationships in `confirmed` state. Agent-created Relationships **MUST** be `provisional`. |
| [[REQ-AGT#PLX-AGT-004\|PLX-AGT-004]] | T, A | Agents **MUST NOT** assert organisational facts not derivable from structured platform data. Assertions **MUST** carry evidence references (`PLX-INV-04`). |
| [[REQ-AGT#PLX-AGT-005\|PLX-AGT-005]] | T | Every Agent **MUST** have exactly one `actsOnBehalfOf` human principal at any moment. An Agent with no accountable human principal **MUST** be suspended. |
| [[REQ-AGT#PLX-AGT-006\|PLX-AGT-006]] | T, A | Agent cost consumption **MUST** be metered against `costCeiling` and against the owning Desk's `costCeilingPerMonth`; exceeding either **MUST** suspend the Agent and emit an Event, not silently degrade output quality. |
| [[REQ-AGT#PLX-AGT-010\|PLX-AGT-010]] | T | Inter-agent messages **MUST** conform to the `AgentMessage` schema and **MUST** be validated on both send and receive. Free-text-only inter-agent communication **MUST NOT** be permitted. |
| [[REQ-AGT#PLX-AGT-011\|PLX-AGT-011]] | T | Agent replies **MUST** validate against the `expectedOutput` schema. A non-conforming reply **MUST** be rejected and retried or failed, never passed downstream. |
| [[REQ-AGT#PLX-AGT-012\|PLX-AGT-012]] | T, I | `context` **MUST** be passed by reference. Inlining content into inter-agent messages **MUST NOT** be used, so that permission evaluation occurs at dereference time against the acting principal. |
| [[REQ-AGT#PLX-AGT-013\|PLX-AGT-013]] | T | Every agent message and reply **MUST** be recorded in the agent audit stream with full lineage via `correlationId` and `causationId`. |
| [[REQ-AGT#PLX-AGT-014\|PLX-AGT-014]] | T | Agent-to-agent delegation **MUST** propagate `onBehalfOf` unchanged and **MUST NOT** permit permission escalation through delegation depth. Delegation depth **MUST** be bounded and the bound **MUST** be enforced. |
| [[REQ-AGT#PLX-AGT-015\|PLX-AGT-015]] | I | No Agent **MUST** hold more than one specialisation. An Agent performing unrelated responsibilities **MUST** be decomposed. |
| [[REQ-AGT#PLX-AGT-020\|PLX-AGT-020]] | T, A | Every Agent class **MUST** declare its permitted tool set, and tool invocation **MUST** be permission-checked at the tool boundary against the acting principal, not trusted from the model's request. |
| [[REQ-AGT#PLX-AGT-021\|PLX-AGT-021]] | T, I | The Research Agent **MUST NOT** transmit tenant content to external systems unless the Desk's `externalDataAllowed` is true, and every external transmission **MUST** be logged with its destination and content digest. |
| [[REQ-AGT#PLX-AGT-022\|PLX-AGT-022]] | T | Every Agent **MUST** have a defined evaluation suite with recorded pass thresholds, executed per release (`PLX-ENG-013`). |
| [[REQ-AGT#PLX-AGT-023\|PLX-AGT-023]] | T | Agent memory scope **MUST** be enforced at retrieval. An Agent with `memoryScope: "desk"` **MUST NOT** retrieve content from another Desk, even where the acting principal has permission to it. |

## Invariants

- [[Invariants#PLX-INV-04|PLX-INV-04]] — AI never bypasses structured data
