---
type: entity
entity: Event
spec_section: §35
tags:
  - entity
  - domain-model
---

# Event

[[Home|▲ Home]] · [[S35 Event Entity|§35 — full definition]] · [[S32 Canonical Entity Model|§32 BaseEntity]]

> [!abstract] Canonical schema
> Defined in [[S35 Event Entity|§35]]. All entities inherit [[S32 Canonical Entity Model|BaseEntity]] — do not invent a separate identity model ([[REQ-DOM#PLX-DOM-010|PLX-DOM-010]]).

## Schema

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

## Binding requirements

| ID | V | Requirement |
|---|---|---|
| [[REQ-EVT#PLX-EVT-010\|PLX-EVT-010]] | T, I | Events **MUST** be immutable once written. The Event Store **MUST NOT** expose update or delete operations for Event records through any interface, including administrative interfaces. |
| [[REQ-EVT#PLX-EVT-011\|PLX-EVT-011]] | T | Every Event **MUST** carry `correlationId` and, where it was caused by another Event or a command, `causationId`, so that any derived state can be traced to its originating user action. |
| [[REQ-EVT#PLX-EVT-012\|PLX-EVT-012]] | T | Every Event **MUST** carry a snapshot of the permissions in effect at emission, so that historical replay evaluates access against the permissions of the time, not of today. |
| [[REQ-EVT#PLX-EVT-013\|PLX-EVT-013]] | T | Events **MUST** distinguish occurrence time (`timestamp`) from ingestion time (`recordedAt`). Consumers **MUST** order by `sequence` within a partition, never by wall-clock timestamp. |
| [[REQ-EVT#PLX-EVT-014\|PLX-EVT-014]] | T, I | Event emission and the corresponding state mutation **MUST** be atomic. Implementations **MUST** use a transactional outbox or an equivalent mechanism guaranteeing that no state change is committed without its Event, and no Event is published without its state change. |
| [[REQ-EVT#PLX-EVT-015\|PLX-EVT-015]] | T | Every Event consumer **MUST** be idempotent. Consumers **MUST** tolerate at-least-once delivery and duplicate delivery without producing duplicate derived state. |
| [[REQ-EVT#PLX-EVT-040\|PLX-EVT-040]] | T | Every Event **MUST** conform to CloudEvents v1.0.2 structure and **MUST** carry the Plexi extension attributes of §64.1. |
| [[REQ-EVT#PLX-EVT-041\|PLX-EVT-041]] | T, I | Event type names **MUST** be past tense and **MUST** carry an explicit version suffix. Command-shaped event names **MUST** be rejected in CI by a naming lint. |
| [[REQ-EVT#PLX-EVT-042\|PLX-EVT-042]] | T | Producers **MUST** guarantee that `source` + `id` is unique for each distinct Event. |
| [[REQ-EVT#PLX-EVT-043\|PLX-EVT-043]] | T, I | Every Event type **MUST** have a published JSON Schema at a stable `dataschema` URI, versioned, and validated in CI against every producer and consumer. |
| [[REQ-EVT#PLX-EVT-044\|PLX-EVT-044]] | I, T | A breaking change to an Event schema **MUST** be published as a new type version. Existing type versions **MUST NOT** be redefined. |
| [[REQ-EVT#PLX-EVT-045\|PLX-EVT-045]] | T | Large state payloads **MUST** be carried as content digests, not inline (`PLX-DOM-032`). |

## Invariants

- [[Invariants#PLX-INV-02|PLX-INV-02]] — Every meaningful change produces an Event
- [[Invariants#PLX-INV-08|PLX-INV-08]] — Every Event is immutable once written
