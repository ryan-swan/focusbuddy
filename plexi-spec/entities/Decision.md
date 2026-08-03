---
type: entity
entity: Decision
spec_section: §37
tags:
  - entity
  - domain-model
---

# Decision

[[Home|▲ Home]] · [[S37 Decision Entity|§37 — full definition]] · [[S32 Canonical Entity Model|§32 BaseEntity]]

> [!abstract] Canonical schema
> Defined in [[S37 Decision Entity|§37]]. All entities inherit [[S32 Canonical Entity Model|BaseEntity]] — do not invent a separate identity model ([[REQ-DOM#PLX-DOM-010|PLX-DOM-010]]).

## Schema

```typescript
interface Decision extends BaseEntity {
  entityType:        "decision";

  title:             string;
  description:       string;
  decisionStatement: string;            // what was actually decided

  decisionOwner:     ActorRef;          // MUST be a human — PLX-DOM-040
  decisionDate:      Timestamp | null;
  state:             "proposed" | "under_review" | "approved" | "implemented"
                     | "superseded" | "cancelled" | "archived";

  confidence:        ConfidenceBand | null;
  evidence:          EvidenceRef[];
  alternatives:      Alternative[];
  risks:             RiskNote[];

  relatedObjectIds:  UUID[];
  affectedDeskIds:   UUID[];
  dependencyIds:     UUID[];
  approvals:         Approval[];

  aiCommentary:      AiCommentary[];    // advisory only — never authoritative
  supersededById:    UUID | null;
  history:           StreamRef;
}

interface Alternative {
  statement:   string;
  rejectedFor: string;
  evidence:    EvidenceRef[];
}

interface Approval {
  approver:    ActorRef;     // MUST be a human principal
  state:       "pending" | "granted" | "declined";
  at:          Timestamp | null;
  rationale:   string | null;
}
```

## Binding requirements

| ID | V | Requirement |
|---|---|---|
| [[REQ-DOM#PLX-DOM-040\|PLX-DOM-040]] | T | `decisionOwner` and every `Approval.approver` **MUST** be a human principal. An Agent or service principal **MUST NOT** be recorded as a Decision owner or approver. |
| [[REQ-DOM#PLX-DOM-041\|PLX-DOM-041]] | T, D | `aiCommentary` **MUST** be stored and displayed as advisory. It **MUST NOT** be rendered in a manner that implies it constitutes the Decision, the rationale of record, or an approval. |
| [[REQ-DOM#PLX-DOM-042\|PLX-DOM-042]] | T | Superseding a Decision **MUST** set `supersededById`, **MUST** create a `DecisionSuperseded` Event, and **MUST** trigger Context Health re-evaluation for every Object referencing the superseded Decision. |
| [[REQ-DOM#PLX-DOM-043\|PLX-DOM-043]] | T, I | Rejected `alternatives` **MUST** be retained permanently. The record of what was *not* chosen, and why, **MUST NOT** be pruned by any retention or compression process. |
| [[REQ-APP#PLX-APP-020\|PLX-APP-020]] | T, D | The Decision Tracker **MUST** require a recorded alternative-considered entry, or an explicit statement that none was considered, before a Decision may move to `approved`. |

## Invariants

- [[Invariants#PLX-INV-07|PLX-INV-07]] — Everything remains inspectable
