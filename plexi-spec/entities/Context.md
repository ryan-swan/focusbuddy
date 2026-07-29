---
type: entity
entity: Context
spec_section: §38
tags:
  - entity
  - domain-model
---

# Context

[[Home|▲ Home]] · [[S38 Context Entity|§38 — full definition]] · [[S32 Canonical Entity Model|§32 BaseEntity]]

> [!abstract] Canonical schema
> Defined in [[S38 Context Entity|§38]]. All entities inherit [[S32 Canonical Entity Model|BaseEntity]] — do not invent a separate identity model ([[REQ-DOM#PLX-DOM-010|PLX-DOM-010]]).

## Schema

```typescript
interface Context extends BaseEntity {
  entityType:          "context";

  deskId:              UUID;
  currentGoal:         Objective | null;
  currentQuestion:     CognitiveField | null;
  recentActivity:      ActivityRef[];
  recentDecisionIds:   UUID[];
  pendingWorkIds:      UUID[];
  dependencyIds:       UUID[];
  attentionItems:      AttentionItem[];

  riskLevel:           "none" | "low" | "medium" | "high";
  suggestedNextAction: Recommendation | null;
  estimatedResumeTime: Duration | null;
  confidence:          ConfidenceBand | null;

  generatedAt:         Timestamp;
  reviewedAt:          Timestamp | null;
  reviewedBy:          ActorRef | null;
}

interface CognitiveField {
  value:      string;
  source:     "declared" | "inferred";   // PLX-PRD-020
  confidence: ConfidenceBand | null;     // REQUIRED when inferred
  evidence:   EvidenceRef[];             // REQUIRED when inferred
}
```

## Binding requirements

| ID | V | Requirement |
|---|---|---|
| [[REQ-CTX#PLX-CTX-001\|PLX-CTX-001]] | T | Context Objects **MUST** be versioned and retained. Superseded Context Objects **MUST** remain retrievable for audit. |
| [[REQ-CTX#PLX-CTX-002\|PLX-CTX-002]] | T | Every field in a Context Object derived from inference **MUST** carry source, confidence and evidence (`CognitiveField`). |
| [[REQ-PRD#PLX-PRD-020\|PLX-PRD-020]] | T | Cognitive Context values **MUST** be labelled with their acquisition method: `declared` (user-stated), `inferred` (model-derived), or `absent`. |
| [[REQ-PRD#PLX-PRD-021\|PLX-PRD-021]] | T, D | Inferred Cognitive Context **MUST** carry a confidence score and **MUST** be visually distinguished from declared Cognitive Context wherever displayed. |
| [[REQ-PRD#PLX-PRD-022\|PLX-PRD-022]] | T, D | Inferred Cognitive Context below the platform confidence threshold **MUST NOT** be displayed as an assertion. It **MAY** be offered as a question to the user. |
| [[REQ-PRD#PLX-PRD-023\|PLX-PRD-023]] | D | The platform **MUST** provide a low-friction affordance for a user to declare their current question and expected next action, and **MUST NOT** require it. |
