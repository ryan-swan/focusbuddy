---
id: S35
section: §35
title: "Event Entity"
part: IV
type: section
defines:
  - PLX-EVT-010
  - PLX-EVT-011
  - PLX-EVT-012
  - PLX-EVT-013
  - PLX-EVT-014
  - PLX-EVT-015
tags:
  - section
  - part/iv
---

# §35 Event Entity

◀ [[S34 Object Entity]] · [[Part IV — Domain Model|▲ Part IV]] · [[S36 Relationship Entity]] ▶

---

### 35.1 Philosophy

Events are immutable. State is temporary. **Events are permanent.** Everything meaningful becomes an Event.

### 35.2 Schema

The domain-level shape below is normative for reasoning about Events. The **wire contract** — including CloudEvents alignment — is §64.

```typescript
interface Event {
  id:               UUID;             // UUIDv7, client-generable
  eventType:        EventTypeName;    // past tense, PascalCase — see §64
  schemaVersion:    integer;
  timestamp:        Timestamp;        // RFC 3339, UTC — occurrence time
  recordedAt:       Timestamp;        // ingestion time; differs from timestamp when offline

  actor:            ActorRef;
  organisationId:   UUID;
  deskId:           UUID | null;
  objectId:         UUID | null;

  previousState:    JsonValue | null; // digest-referenced for large payloads
  currentState:     JsonValue | null;
  changeSummary:    string | null;

  correlationId:    UUID;             // groups a causal chain
  causationId:      UUID | null;      // the event or command that caused this one
  source:           string;           // URI-reference identifying the emitter
  sequence:         integer;          // monotonic per partition key

  permissions:      PermissionSet;    // snapshot at emission — see PLX-EVT-012
  confidence:       ConfidenceBand | null;
  metadata:         Map<string, JsonValue>;
}
```

### 35.3 Event types

Created · Updated · Deleted · Shared · Viewed · Moved · Resized · Linked · Commented · Mentioned · Approved · Rejected · Assigned · Completed · Paused · Resumed · Merged · Split · Imported · Exported · Connected · Disconnected · Generated · AI Suggested · AI Accepted · AI Rejected

These are **verb stems**. The full past-tense event names formed from them, reconciled with [[S64 Event Contracts|§64]] and [[S48 Event Architecture|§48]], are catalogued in **Appendix D**.

### 35.4 Principles

Events never change. Events are append-only. Events provide perfect audit history. Events enable Workspace Memory, Resume Intelligence and AI reasoning.

### 35.5 Requirements

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-EVT#PLX-EVT-010|PLX-EVT-010]] | Events **MUST** be immutable once written. The Event Store **MUST NOT** expose update or delete operations for Event records through any interface, including administrative interfaces. | T, I | §35.4, [[S49 Event Store|§49]] |
| [[REQ-EVT#PLX-EVT-011|PLX-EVT-011]] | Every Event **MUST** carry `correlationId` and, where it was caused by another Event or a command, `causationId`, so that any derived state can be traced to its originating user action. | T | §35.2, new |
| [[REQ-EVT#PLX-EVT-012|PLX-EVT-012]] | Every Event **MUST** carry a snapshot of the permissions in effect at emission, so that historical replay evaluates access against the permissions of the time, not of today. | T | §35.2, new |
| [[REQ-EVT#PLX-EVT-013|PLX-EVT-013]] | Events **MUST** distinguish occurrence time (`timestamp`) from ingestion time (`recordedAt`). Consumers **MUST** order by `sequence` within a partition, never by wall-clock timestamp. | T | §35.2, new |
| [[REQ-EVT#PLX-EVT-014|PLX-EVT-014]] | Event emission and the corresponding state mutation **MUST** be atomic. Implementations **MUST** use a transactional outbox or an equivalent mechanism guaranteeing that no state change is committed without its Event, and no Event is published without its state change. | T, I | [[S48 Event Architecture|§48]], new |
| [[REQ-EVT#PLX-EVT-015|PLX-EVT-015]] | Every Event consumer **MUST** be idempotent. Consumers **MUST** tolerate at-least-once delivery and duplicate delivery without producing duplicate derived state. | T | [[S48 Event Architecture|§48]], new |

> **On `[[REQ-EVT#PLX-EVT-012|PLX-EVT-012]]`.** Replay is listed as a core capability ([[S49 Event Store|§49]]). Replaying history without also replaying the permission context of that history means a replay run today can surface, into a derived view, information that the requesting user was never entitled to see. Permission snapshots on the Event are the only reliable fix, and they must be there from the first Event ever written.

> **On `[[REQ-EVT#PLX-EVT-014|PLX-EVT-014]]`.** "Every mutation becomes an event" (`[[Invariants#PLX-INV-02|PLX-INV-02]]`) is trivially violated by any process that writes to a database and then publishes to a bus, because the process can die between the two. The transactional outbox pattern is the standard resolution and needs to be in the service template from the start rather than discovered after the first divergence incident.

---

---

## Requirements defined or cited here

- [[REQ-EVT#PLX-EVT-010|PLX-EVT-010]] — Events **MUST** be immutable once written. The Event Store **MUST NOT** expose update or delete operations for
- [[REQ-EVT#PLX-EVT-011|PLX-EVT-011]] — Every Event **MUST** carry `correlationId` and, where it was caused by another Event or a command, `causationI
- [[REQ-EVT#PLX-EVT-012|PLX-EVT-012]] — Every Event **MUST** carry a snapshot of the permissions in effect at emission, so that historical replay eval
- [[REQ-EVT#PLX-EVT-013|PLX-EVT-013]] — Events **MUST** distinguish occurrence time (`timestamp`) from ingestion time (`recordedAt`). Consumers **MUST
- [[REQ-EVT#PLX-EVT-014|PLX-EVT-014]] — Event emission and the corresponding state mutation **MUST** be atomic. Implementations **MUST** use a transac
- [[REQ-EVT#PLX-EVT-015|PLX-EVT-015]] — Every Event consumer **MUST** be idempotent. Consumers **MUST** tolerate at-least-once delivery and duplicate

◀ [[S34 Object Entity]] · [[Part IV — Domain Model|▲ Part IV]] · [[S36 Relationship Entity]] ▶
