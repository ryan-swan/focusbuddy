---
type: entity
entity: Desk
spec_section: §33
tags:
  - entity
  - domain-model
---

# Desk

[[Home|▲ Home]] · [[S33 Desk Entity|§33 — full definition]] · [[S32 Canonical Entity Model|§32 BaseEntity]]

> [!abstract] Canonical schema
> Defined in [[S33 Desk Entity|§33]]. All entities inherit [[S32 Canonical Entity Model|BaseEntity]] — do not invent a separate identity model ([[REQ-DOM#PLX-DOM-010|PLX-DOM-010]]).

## Schema

```typescript
interface Desk extends BaseEntity {
  entityType:         "desk";

  name:               string;
  description:        string;
  purpose:            string;
  archetype:          "personal" | "project" | "team" | "organisation" | "client" | "knowledge";

  members:            DeskMembership[];
  currentObjective:   Objective | null;
  currentStatus:      "draft" | "active" | "paused" | "archived" | "historical";

  workspaceLayout:    LayoutRef;        // per (user, device class) — see PLX-UX-032
  objectIds:          UUID[];           // Objects owned by this Desk
  resumeId:           UUID | null;      // current Resume Object
  contextId:          UUID | null;      // current Context Object
  sessionHistoryRef:  StreamRef;
  graphNodeId:        UUID;

  aiConfiguration:    DeskAiConfig;
  memoryProfile:      MemoryProfile;    // per-layer retention — see §66

  archivedAt:         Timestamp | null;
}

interface Objective {
  statement:    string;
  setBy:        ActorRef;
  setAt:        Timestamp;
  source:       "declared" | "inferred";   // see PLX-PRD-020
  confidence:   ConfidenceBand | null;     // REQUIRED when source is "inferred"
}

interface DeskAiConfig {
  enabled:              boolean;
  allowedModelClasses:  ModelClass[];
  externalDataAllowed:  boolean;      // may agents fetch outside the tenant?
  costCeilingPerMonth:  Money | null; // see PLX-AI-030
  agentIds:             UUID[];
}
```

## Binding requirements

| ID | V | Requirement |
|---|---|---|
| [[REQ-PRD#PLX-PRD-001\|PLX-PRD-001]] | T | Every Object **MUST** belong to exactly one owning Desk. |
| [[REQ-PRD#PLX-PRD-002\|PLX-PRD-002]] | T, D | A Desk **MUST** persist its complete visual layout, including Object positions, sizes, z-order, scroll positions, selections and zoom level, and **MUST** restore it on reopen. |
| [[REQ-PRD#PLX-PRD-003\|PLX-PRD-003]] | T | Desk archetype **MUST** be a mutable attribute. Changing archetype **MUST NOT** require data migration, **MUST NOT** alter Object ownership, and **MUST** emit a `DeskArchetypeChanged` Event. |
| [[REQ-PRD#PLX-PRD-004\|PLX-PRD-004]] | T | Desk state transitions **MUST** follow the state machine in §10.4. Invalid transitions **MUST** be rejected with a machine-readable error identifying the attempted and permitted transitions. |
| [[REQ-PRD#PLX-PRD-005\|PLX-PRD-005]] | T | Archiving or moving a Desk to Historical **MUST NOT** delete Events, Relationships or Decisions, and **MUST NOT** remove the Desk from search for users holding read permission. |
| [[REQ-PRD#PLX-PRD-006\|PLX-PRD-006]] | T, D | A Desk **MUST** carry an explicit, user-editable **Current Objective**. Where absent, the platform **MUST** prompt for one and **MAY** propose a draft derived from Desk activity; a proposed objective **MUST** be marked as unconfirmed until a user accepts it. |
| [[REQ-DOM#PLX-DOM-020\|PLX-DOM-020]] | I, T | No Object type **MUST** receive privileged treatment in storage, permission evaluation, event generation, versioning or Context Health computation. |
| [[REQ-DOM#PLX-DOM-021\|PLX-DOM-021]] | T | `DeskAiConfig.enabled = false` **MUST** disable all AI reasoning for the Desk, including background relationship discovery, embedding generation and Resume summarisation, while leaving deterministic Context Health and Resume assembly operational. |
| [[REQ-DOM#PLX-DOM-022\|PLX-DOM-022]] | T, D | An inferred `Objective` **MUST** carry a confidence band and **MUST** be visually marked as unconfirmed until a user accepts it (`PLX-PRD-006`). |

## Invariants

- [[Invariants#PLX-INV-01|PLX-INV-01]] — Every Object belongs to exactly one owning Desk
