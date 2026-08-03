---
type: entity
entity: Resume
spec_section: §39
tags:
  - entity
  - domain-model
---

# Resume

[[Home|▲ Home]] · [[S39 Resume Entity|§39 — full definition]] · [[S32 Canonical Entity Model|§32 BaseEntity]]

> [!abstract] Canonical schema
> Defined in [[S39 Resume Entity|§39]]. All entities inherit [[S32 Canonical Entity Model|BaseEntity]] — do not invent a separate identity model ([[REQ-DOM#PLX-DOM-010|PLX-DOM-010]]).

## Schema

```typescript
interface Resume extends BaseEntity {
  entityType:          "resume";

  deskId:              UUID;
  forUserId:           UUID | null;   // null = collaborative Desk-level resume (§25.3)

  currentObjective:    Objective | null;
  summary:             string;
  progress:            ProgressItem[];
  changes:             ChangeItem[];
  decisionIds:         UUID[];
  risks:               RiskNote[];
  dependencyIds:       UUID[];
  recommendedActions:  Recommendation[];

  estimatedCatchup:    CatchupEstimate | null;
  confidence:          ConfidenceBand;

  generatedAt:         Timestamp;
  reviewedAt:          Timestamp | null;
  supersedesId:        UUID | null;    // prior Resume — enables diffing
  sourceEventIds:      UUID[];         // REQUIRED — PLX-RES-002
}

interface CatchupEstimate {
  point:      Duration;
  lowerBound: Duration;
  upperBound: Duration;
  basis:      "modelled" | "historical" | "heuristic";
}
```

## Binding requirements

| ID | V | Requirement |
|---|---|---|
| [[REQ-RES#PLX-RES-001\|PLX-RES-001]] | T, D | Resume Objects **MUST** be versioned and diffable against any prior Resume for the same Desk and user. |
| [[REQ-RES#PLX-RES-002\|PLX-RES-002]] | T | Every Resume **MUST** record the Event identifiers from which it was derived. A Resume assertion not traceable to Events **MUST NOT** be emitted. |
| [[REQ-RES#PLX-RES-003\|PLX-RES-003]] | T, D | `estimatedCatchup` **MUST** be expressed as a range with a stated basis, not a bare point value. |
| [[REQ-RES#PLX-RES-004\|PLX-RES-004]] | T | Where `forUserId` is null, the Resume **MUST** be permission-filtered at render time per viewing user; a collaborative Resume **MUST NOT** be materialised in a form that leaks non-permitted content. |

## Invariants

- [[Invariants#PLX-INV-07|PLX-INV-07]] — Everything remains inspectable
