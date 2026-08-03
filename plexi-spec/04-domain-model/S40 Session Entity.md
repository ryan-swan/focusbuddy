---
id: S40
section: §40
title: "Session Entity"
part: IV
type: section
defines:
  - PLX-DOM-050
  - PLX-DOM-051
  - PLX-UX-072
tags:
  - section
  - part/iv
---

# §40 Session Entity

◀ [[S39 Resume Entity]] · [[Part IV — Domain Model|▲ Part IV]] · [[S41 Agent Entity]] ▶

---

Sessions represent uninterrupted periods of work. Rather than simply recording activity, Sessions capture cognition.

### 40.1 Schema

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

### 40.2 Behaviour

Sessions generate Workspace Memory, Resume Intelligence, Context Health, Relationship signals, Knowledge Graph updates and AI learning signals.

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-DOM#PLX-DOM-050|PLX-DOM-050]] | `FocusRecord` data (which Object, for how long) **MUST** be classified as presence-class data and **MUST** be subject to the retention constraints of `[[REQ-UX#PLX-UX-072|PLX-UX-072]]`. | T, I | §40, [[S25 Collaboration|§25]] |
| [[REQ-DOM#PLX-DOM-051|PLX-DOM-051]] | Sessions **MUST** be closed by explicit exit, by timeout, or by recovery on next connection. An unclosed Session **MUST NOT** block Resume generation. | T | §40, new |

---

---

## Requirements defined or cited here

- [[REQ-DOM#PLX-DOM-050|PLX-DOM-050]] — `FocusRecord` data (which Object, for how long) **MUST** be classified as presence-class data and **MUST** be
- [[REQ-DOM#PLX-DOM-051|PLX-DOM-051]] — Sessions **MUST** be closed by explicit exit, by timeout, or by recovery on next connection. An unclosed Sessi
- [[REQ-UX#PLX-UX-072|PLX-UX-072]] — Presence data **MUST** be treated as personal data with a defined, tenant-configurable retention period, and *

◀ [[S39 Resume Entity]] · [[Part IV — Domain Model|▲ Part IV]] · [[S41 Agent Entity]] ▶
