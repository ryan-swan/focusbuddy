---
type: entity
entity: Session
spec_section: §40
tags:
  - entity
  - domain-model
---

# Session

[[Home|▲ Home]] · [[S40 Session Entity|§40 — full definition]] · [[S32 Canonical Entity Model|§32 BaseEntity]]

> [!abstract] Canonical schema
> Defined in [[S40 Session Entity|§40]]. All entities inherit [[S32 Canonical Entity Model|BaseEntity]] — do not invent a separate identity model ([[REQ-DOM#PLX-DOM-010|PLX-DOM-010]]).

## Schema

```typescript
interface Session extends BaseEntity {
  entityType:          "session";

  deskId:              UUID;
  userId:              UUID;
  deviceClass:         "desktop" | "mobile" | "tablet" | "voice" | "xr" | "api";

  startedAt:           Timestamp;
  endedAt:             Timestamp | null;
  duration:            Duration | null;

  openObjectIds:       UUID[];
  objectFocus:         FocusRecord[];
  workspaceLayout:     LayoutSnapshot;

  currentQuestion:     CognitiveField | null;
  expectedNextAction:  CognitiveField | null;

  aiConversationIds:   UUID[];
  bookmarks:           BookmarkRef[];
  notes:               string | null;
  sessionSummary:      string | null;

  retentionClass:      "presence" | "operational" | "historical";  // PLX-UX-072
}
```

## Binding requirements

| ID | V | Requirement |
|---|---|---|
| [[REQ-DOM#PLX-DOM-050\|PLX-DOM-050]] | T, I | `FocusRecord` data (which Object, for how long) **MUST** be classified as presence-class data and **MUST** be subject to the retention constraints of `PLX-UX-072`. |
| [[REQ-DOM#PLX-DOM-051\|PLX-DOM-051]] | T | Sessions **MUST** be closed by explicit exit, by timeout, or by recovery on next connection. An unclosed Session **MUST NOT** block Resume generation. |
| [[REQ-PRD#PLX-PRD-031\|PLX-PRD-031]] | T | A Session snapshot **MUST** be written on Desk exit, on session timeout, and at intervals not exceeding 60 seconds during active work, so that context survives unexpected client termination. |
| [[REQ-UX#PLX-UX-072\|PLX-UX-072]] | T, I | Presence data **MUST** be treated as personal data with a defined, tenant-configurable retention period, and **MUST NOT** be retained in the Event Store beyond that period in identifiable form. |
