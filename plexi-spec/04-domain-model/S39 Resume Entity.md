---
id: S39
section: §39
title: "Resume Entity"
part: IV
type: section
defines:
  - PLX-RES-001
  - PLX-RES-002
  - PLX-RES-003
  - PLX-RES-004
tags:
  - section
  - part/iv
---

# §39 Resume Entity

◀ [[S38 Context Entity]] · [[Part IV — Domain Model|▲ Part IV]] · [[S40 Session Entity]] ▶

---

The Resume Object is generated continuously and represents the current understanding of a Desk.

### 39.1 Schema

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

Unlike traditional summaries, Resume Objects remain **versioned**. Users can compare today's understanding against yesterday's.

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-RES#PLX-RES-001|PLX-RES-001]] | Resume Objects **MUST** be versioned and diffable against any prior Resume for the same Desk and user. | T, D | §39 |
| [[REQ-RES#PLX-RES-002|PLX-RES-002]] | Every Resume **MUST** record the Event identifiers from which it was derived. A Resume assertion not traceable to Events **MUST NOT** be emitted. | T | §39, §7.9 |
| [[REQ-RES#PLX-RES-003|PLX-RES-003]] | `estimatedCatchup` **MUST** be expressed as a range with a stated basis, not a bare point value. | T, D | [[S14 Resume Intelligence|§14]], new |
| [[REQ-RES#PLX-RES-004|PLX-RES-004]] | Where `forUserId` is null, the Resume **MUST** be permission-filtered at render time per viewing user; a collaborative Resume **MUST NOT** be materialised in a form that leaks non-permitted content. | T | §25.3, new |

---

---

## Requirements defined or cited here

- [[REQ-RES#PLX-RES-001|PLX-RES-001]] — Resume Objects **MUST** be versioned and diffable against any prior Resume for the same Desk and user.
- [[REQ-RES#PLX-RES-002|PLX-RES-002]] — Every Resume **MUST** record the Event identifiers from which it was derived. A Resume assertion not traceable
- [[REQ-RES#PLX-RES-003|PLX-RES-003]] — `estimatedCatchup` **MUST** be expressed as a range with a stated basis, not a bare point value.
- [[REQ-RES#PLX-RES-004|PLX-RES-004]] — Where `forUserId` is null, the Resume **MUST** be permission-filtered at render time per viewing user; a colla

◀ [[S38 Context Entity]] · [[Part IV — Domain Model|▲ Part IV]] · [[S40 Session Entity]] ▶
