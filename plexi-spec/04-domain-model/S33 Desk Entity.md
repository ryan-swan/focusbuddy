---
id: S33
section: §33
title: "Desk Entity"
part: IV
type: section
defines:
  - PLX-AI-030
  - PLX-DOM-020
  - PLX-DOM-021
  - PLX-DOM-022
  - PLX-PRD-006
  - PLX-PRD-020
  - PLX-UX-032
tags:
  - section
  - part/iv
---

# §33 Desk Entity

◀ [[S32 Canonical Entity Model]] · [[Part IV — Domain Model|▲ Part IV]] · [[S34 Object Entity]] ▶

---

### 33.1 Definition

The Desk is the highest-level contextual container. Unlike folders, Desks possess behaviour. Unlike projects, Desks possess memory. Unlike workspaces, Desks possess intelligence.

### 33.2 Schema

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

### 33.3 Behaviour

A Desk owns Objects, contains Sessions, stores memory, emits Events, hosts Agents, maintains Context and participates in Organisational Intelligence.

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-DOM#PLX-DOM-020|PLX-DOM-020]] | No Object type **MUST** receive privileged treatment in storage, permission evaluation, event generation, versioning or Context Health computation. | I, T | [[S11 Objects|§11]], [[S34 Object Entity|§34]] |
| [[REQ-DOM#PLX-DOM-021|PLX-DOM-021]] | `DeskAiConfig.enabled = false` **MUST** disable all AI reasoning for the Desk, including background relationship discovery, embedding generation and Resume summarisation, while leaving deterministic Context Health and Resume assembly operational. | T | §33, new |
| [[REQ-DOM#PLX-DOM-022|PLX-DOM-022]] | An inferred `Objective` **MUST** carry a confidence band and **MUST** be visually marked as unconfirmed until a user accepts it (`[[REQ-PRD#PLX-PRD-006|PLX-PRD-006]]`). | T, D | §33, [[S12 Context|§12]] |

> **On `[[REQ-DOM#PLX-DOM-021|PLX-DOM-021]]`.** A Desk with AI switched off must still work. Many enterprise and government tenants will require exactly this for at least some Desks — legal matters, HR investigations, M&A. If Resume Intelligence collapses without a model, the product cannot be sold into those segments at all. This is also the strongest argument for the deterministic-first ordering in [[S48 Event Architecture|§48]]: it forces the non-AI path to be genuinely functional rather than a degraded stub.

---

---

## Requirements defined or cited here

- [[REQ-AI#PLX-AI-030|PLX-AI-030]] — Every Organisation and every Desk **MUST** support a configurable AI cost ceiling. Exceeding a ceiling **MUST*
- [[REQ-DOM#PLX-DOM-020|PLX-DOM-020]] — No Object type **MUST** receive privileged treatment in storage, permission evaluation, event generation, vers
- [[REQ-DOM#PLX-DOM-021|PLX-DOM-021]] — `DeskAiConfig.enabled = false` **MUST** disable all AI reasoning for the Desk, including background relationsh
- [[REQ-DOM#PLX-DOM-022|PLX-DOM-022]] — An inferred `Objective` **MUST** carry a confidence band and **MUST** be visually marked as unconfirmed until
- [[REQ-PRD#PLX-PRD-006|PLX-PRD-006]] — A Desk **MUST** carry an explicit, user-editable **Current Objective**. Where absent, the platform **MUST** pr
- [[REQ-PRD#PLX-PRD-020|PLX-PRD-020]] — Cognitive Context values **MUST** be labelled with their acquisition method: `declared` (user-stated), `inferr
- [[REQ-UX#PLX-UX-032|PLX-UX-032]] — Layout **MUST** be persisted per (user, Desk, device class), so that a user's desktop arrangement is not overw

◀ [[S32 Canonical Entity Model]] · [[Part IV — Domain Model|▲ Part IV]] · [[S34 Object Entity]] ▶
