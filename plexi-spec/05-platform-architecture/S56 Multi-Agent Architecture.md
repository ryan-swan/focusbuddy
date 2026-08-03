---
id: S56
section: §56
title: "Multi-Agent Architecture"
part: V
type: section
defines:
  - PLX-AGT-005
  - PLX-AGT-010
  - PLX-AGT-011
  - PLX-AGT-012
  - PLX-AGT-013
  - PLX-AGT-014
  - PLX-AGT-015
tags:
  - section
  - part/v
---

# §56 Multi-Agent Architecture

◀ [[S55 AI Orchestration]] · [[Part V — Platform Architecture|▲ Part V]] · [[S57 Connector Framework]] ▶

---

Agents behave as **specialists**, not generalists.

### 56.1 Example agents

Resume Agent · Relationship Agent · Search Agent · Research Agent · Developer Agent · Project Agent · Meeting Agent · Decision Agent · Automation Agent · Compliance Agent

### 56.2 Agent communication

Agents communicate through **structured messages**, never natural language alone.

```typescript
interface AgentMessage {
  messageId:          UUID;
  correlationId:      UUID;
  causationId:        UUID | null;

  from:               AgentRef;
  to:                 AgentRef;

  task:               TaskSpec;
  context:            ContextRef[];       // references, not inlined content
  evidence:           EvidenceRef[];
  confidence:         number;             // 0.0–1.0

  expectedOutput:     OutputSchemaRef;    // schema the reply MUST validate against
  requiredPermissions: PermissionSet;
  onBehalfOf:         UUID;               // human principal — PLX-AGT-005
  deadline:           Timestamp;
  costBudget:         Money;
}
```

Every interaction becomes auditable.

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-AGT#PLX-AGT-010|PLX-AGT-010]] | Inter-agent messages **MUST** conform to the `AgentMessage` schema and **MUST** be validated on both send and receive. Free-text-only inter-agent communication **MUST NOT** be permitted. | T | §56 |
| [[REQ-AGT#PLX-AGT-011|PLX-AGT-011]] | Agent replies **MUST** validate against the `expectedOutput` schema. A non-conforming reply **MUST** be rejected and retried or failed, never passed downstream. | T | §56, new |
| [[REQ-AGT#PLX-AGT-012|PLX-AGT-012]] | `context` **MUST** be passed by reference. Inlining content into inter-agent messages **MUST NOT** be used, so that permission evaluation occurs at dereference time against the acting principal. | T, I | §56, new |
| [[REQ-AGT#PLX-AGT-013|PLX-AGT-013]] | Every agent message and reply **MUST** be recorded in the agent audit stream with full lineage via `correlationId` and `causationId`. | T | §56 |
| [[REQ-AGT#PLX-AGT-014|PLX-AGT-014]] | Agent-to-agent delegation **MUST** propagate `onBehalfOf` unchanged and **MUST NOT** permit permission escalation through delegation depth. Delegation depth **MUST** be bounded and the bound **MUST** be enforced. | T | §56, new |
| [[REQ-AGT#PLX-AGT-015|PLX-AGT-015]] | No Agent **MUST** hold more than one specialisation. An Agent performing unrelated responsibilities **MUST** be decomposed. | I | [[S79 Agent Collaboration|§79]] |

> **On `[[REQ-AGT#PLX-AGT-012|PLX-AGT-012]]` and `[[REQ-AGT#PLX-AGT-014|PLX-AGT-014]]`.** Passing content by reference rather than by value is what keeps the permission model coherent across a delegation chain. Passing by value means a downstream agent holds content whose access it never had to justify, and the chain's effective permission becomes the union of every hop rather than the intersection — which is precisely backwards. Bounded delegation depth closes the complementary hole: without it, a chain of agents each legitimately delegating can traverse arbitrarily far from the original authorisation.

---

---

## Requirements defined or cited here

- [[REQ-AGT#PLX-AGT-005|PLX-AGT-005]] — Every Agent **MUST** have exactly one `actsOnBehalfOf` human principal at any moment. An Agent with no account
- [[REQ-AGT#PLX-AGT-010|PLX-AGT-010]] — Inter-agent messages **MUST** conform to the `AgentMessage` schema and **MUST** be validated on both send and
- [[REQ-AGT#PLX-AGT-011|PLX-AGT-011]] — Agent replies **MUST** validate against the `expectedOutput` schema. A non-conforming reply **MUST** be reject
- [[REQ-AGT#PLX-AGT-012|PLX-AGT-012]] — `context` **MUST** be passed by reference. Inlining content into inter-agent messages **MUST NOT** be used, so
- [[REQ-AGT#PLX-AGT-013|PLX-AGT-013]] — Every agent message and reply **MUST** be recorded in the agent audit stream with full lineage via `correlatio
- [[REQ-AGT#PLX-AGT-014|PLX-AGT-014]] — Agent-to-agent delegation **MUST** propagate `onBehalfOf` unchanged and **MUST NOT** permit permission escalat
- [[REQ-AGT#PLX-AGT-015|PLX-AGT-015]] — No Agent **MUST** hold more than one specialisation. An Agent performing unrelated responsibilities **MUST** b

◀ [[S55 AI Orchestration]] · [[Part V — Platform Architecture|▲ Part V]] · [[S57 Connector Framework]] ▶
