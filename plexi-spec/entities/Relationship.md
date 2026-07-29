---
type: entity
entity: Relationship
spec_section: §36
tags:
  - entity
  - domain-model
---

# Relationship

[[Home|▲ Home]] · [[S36 Relationship Entity|§36 — full definition]] · [[S32 Canonical Entity Model|§32 BaseEntity]]

> [!abstract] Canonical schema
> Defined in [[S36 Relationship Entity|§36]]. All entities inherit [[S32 Canonical Entity Model|BaseEntity]] — do not invent a separate identity model ([[REQ-DOM#PLX-DOM-010|PLX-DOM-010]]).

## Schema

```typescript
interface Relationship extends BaseEntity {
  entityType:        "relationship";

  sourceEntityId:    UUID;
  sourceEntityType:  EntityType;
  targetEntityId:    UUID;
  targetEntityType:  EntityType;

  relationshipType:  RelationshipTypeId;   // see Appendix E
  directed:          boolean;

  strength:          number;               // 0.0–1.0, traversal weight
  confidence:        number;               // 0.0–1.0, calibrated — see PLX-UX-063
  state:             "provisional" | "confirmed" | "rejected" | "superseded";

  evidence:          EvidenceRef[];        // REQUIRED, non-empty — PLX-INV-03
  discoveryMethod:   "user" | "ai" | "integration" | "import"
                     | "workflow" | "automation" | "system_rule";

  permissionScope:   PermissionSet;
  confirmedBy:       ActorRef | null;
  confirmedAt:       Timestamp | null;
}

interface EvidenceRef {
  kind:      "event" | "object" | "decision" | "meeting" | "message" | "external";
  ref:       UUID | URI;
  excerpt:   string | null;    // human-readable justification
  weight:    number;           // contribution to confidence
}
```

## Binding requirements

| ID | V | Requirement |
|---|---|---|
| [[REQ-GPH#PLX-GPH-001\|PLX-GPH-001]] | T | Every Relationship **MUST** carry at least one `EvidenceRef`. A Relationship with an empty evidence set **MUST** be rejected at write time. |
| [[REQ-GPH#PLX-GPH-002\|PLX-GPH-002]] | T | Provisional Relationships **MUST NOT** contribute to Context Health propagation, Resume content, search ranking or permission evaluation. |
| [[REQ-GPH#PLX-GPH-003\|PLX-GPH-003]] | T | Relationship confidence **MUST** be recalculated when supporting evidence is superseded or invalidated, and a Relationship whose confidence falls below the tenant threshold **MUST** revert to provisional. |
| [[REQ-GPH#PLX-GPH-004\|PLX-GPH-004]] | D | Users **MUST NOT** be required to construct graph structure manually to obtain relationship-derived intelligence. Manual curation **MUST** be available as confirmation and correction. |
| [[REQ-GPH#PLX-GPH-005\|PLX-GPH-005]] | T | A rejected Relationship **MUST** be retained with state `rejected` and **MUST NOT** be re-proposed on identical evidence. |
| [[REQ-GPH#PLX-GPH-020\|PLX-GPH-020]] | T, I | The relationship type vocabulary **MUST** be a single closed registry (Appendix E). Services **MUST NOT** introduce edge types outside the registry; extension-defined types **MUST** be registered before use. |
| [[REQ-GPH#PLX-GPH-021\|PLX-GPH-021]] | T | Every edge **MUST** carry a permission scope, and traversal **MUST** evaluate it (`PLX-GPH-010`). |
| [[REQ-GPH#PLX-GPH-022\|PLX-GPH-022]] | T | Node and edge writes **MUST** carry the `correlationId` of the originating Event, so that any graph state is traceable to the user action that produced it. |

## Invariants

- [[Invariants#PLX-INV-03|PLX-INV-03]] — Every Relationship has provenance
