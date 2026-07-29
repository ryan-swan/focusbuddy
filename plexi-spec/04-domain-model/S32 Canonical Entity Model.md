---
id: S32
section: §32
title: "Canonical Entity Model"
part: IV
type: section
defines:
  - PLX-AGT-005
  - PLX-DOM-010
  - PLX-DOM-011
  - PLX-DOM-012
  - PLX-DOM-013
  - PLX-DOM-014
  - PLX-DOM-015
tags:
  - section
  - part/iv
---

# §32 Canonical Entity Model

◀ [[S31 Core Philosophy]] · [[Part IV — Domain Model|▲ Part IV]] · [[S33 Desk Entity]] ▶

---

Every entity inherits from a common base. No entity implements its own incompatible identity model. **Consistency is mandatory.**

### 32.1 BaseEntity

```typescript
interface BaseEntity {
  // Identity
  id:              UUID;            // v7, time-ordered — see PLX-DOM-010
  entityType:      EntityType;      // discriminator; closed enum, extensible via registry
  schemaVersion:   integer;         // schema revision of this entity's payload

  // Tenancy and containment
  organisationId:  UUID;            // tenant boundary — REQUIRED on every entity
  workspaceId:     UUID | null;     // owning Desk; null only for Organisation-scoped entities
  ownerId:         UUID;            // accountable principal (user or service principal)

  // Temporal
  createdAt:       Timestamp;       // RFC 3339, UTC, microsecond precision
  updatedAt:       Timestamp;
  deletedAt:       Timestamp | null; // soft deletion — visibility only, never history

  // Attribution
  createdBy:       ActorRef;
  updatedBy:       ActorRef;

  // Governance
  permissions:     PermissionSet;
  status:          LifecycleState;
  version:         integer;          // optimistic concurrency token

  // Derived / associative (materialised, not authoritative)
  relationships:   RelationshipRef[];
  eventHistory:    EventStreamRef;

  // Extensibility
  metadata:        Map<string, JsonValue>;
  aiMetadata:      AiMetadata;
}

interface ActorRef {
  actorType:  "user" | "agent" | "service" | "connector" | "system";
  actorId:    UUID;
  onBehalfOf: UUID | null;   // REQUIRED when actorType is "agent" — see PLX-AGT-005
}

interface AiMetadata {
  embeddingVersion:  string | null;
  embeddingUpdatedAt: Timestamp | null;
  lastReasonedAt:    Timestamp | null;
  provenance:        "human" | "ai_generated" | "ai_assisted" | "imported";
  confidence:        ConfidenceBand | null;
}
```

### 32.2 Requirements

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-DOM#PLX-DOM-010|PLX-DOM-010]] | Entity identifiers **MUST** be UUIDv7. Identifiers **MUST** be generable client-side without coordination, so that offline creation and later reconciliation are possible without renumbering. | T, I | §32, new |
| [[REQ-DOM#PLX-DOM-011|PLX-DOM-011]] | Every entity **MUST** carry `organisationId`. Every data-access path **MUST** filter on `organisationId` at the persistence layer, not solely in application code. | T, I | §32, [[S69 Security Architecture|§69]] |
| [[REQ-DOM#PLX-DOM-012|PLX-DOM-012]] | Every entity **MUST** carry `schemaVersion`. Readers **MUST** tolerate unknown fields and **MUST** be able to upcast prior schema versions. | T | §32, new |
| [[REQ-DOM#PLX-DOM-013|PLX-DOM-013]] | `relationships` and `eventHistory` on BaseEntity are **materialised references**, not the system of record. The authoritative sources are the Graph Engine and Event Store respectively. Writers **MUST NOT** treat these fields as authoritative. | I, T | §32, new |
| [[REQ-DOM#PLX-DOM-014|PLX-DOM-014]] | `aiMetadata.provenance` **MUST** be set on every entity at creation and **MUST NOT** be downgraded from `ai_generated` to `human` by any subsequent operation. | T | §32, [[S70 AI Governance|§70]], new |
| [[REQ-DOM#PLX-DOM-015|PLX-DOM-015]] | `deletedAt` **MUST** affect visibility only. No process **MUST** interpret a non-null `deletedAt` as authority to remove Events, Relationships or version history. | T | §32, [[S44 Domain Invariants|§44]] R5 |

> **On UUIDv7 (`[[REQ-DOM#PLX-DOM-010|PLX-DOM-010]]`).** This looks like a trivial implementation detail and is not. The platform declares "offline capable" as an architectural principle ([[S45 Platform Architecture|§45]]) and defines client-generated Events. That combination requires identifiers that a disconnected client can mint without collision and that still sort by creation time for event-store locality. UUIDv7 satisfies both; auto-increment integers and UUIDv4 each fail one. Deciding this late means a migration across every table, index and event.

> **On `[[REQ-DOM#PLX-DOM-012|PLX-DOM-012]]` (schema versioning).** An append-only Event Store you can never modify means every schema change is permanent. Ten years from now the platform will still be reading v1 Events. Upcasting must be designed on day one — it cannot be added once there are a billion immutable records in the old shape. See `[[Risk Register#PLX-RSK-02|PLX-RSK-02]]`.

---

---

## Requirements defined or cited here

- [[REQ-AGT#PLX-AGT-005|PLX-AGT-005]] — Every Agent **MUST** have exactly one `actsOnBehalfOf` human principal at any moment. An Agent with no account
- [[REQ-DOM#PLX-DOM-010|PLX-DOM-010]] — Entity identifiers **MUST** be UUIDv7. Identifiers **MUST** be generable client-side without coordination, so
- [[REQ-DOM#PLX-DOM-011|PLX-DOM-011]] — Every entity **MUST** carry `organisationId`. Every data-access path **MUST** filter on `organisationId` at th
- [[REQ-DOM#PLX-DOM-012|PLX-DOM-012]] — Every entity **MUST** carry `schemaVersion`. Readers **MUST** tolerate unknown fields and **MUST** be able to
- [[REQ-DOM#PLX-DOM-013|PLX-DOM-013]] — `relationships` and `eventHistory` on BaseEntity are **materialised references**, not the system of record. Th
- [[REQ-DOM#PLX-DOM-014|PLX-DOM-014]] — `aiMetadata.provenance` **MUST** be set on every entity at creation and **MUST NOT** be downgraded from `ai_ge
- [[REQ-DOM#PLX-DOM-015|PLX-DOM-015]] — `deletedAt` **MUST** affect visibility only. No process **MUST** interpret a non-null `deletedAt` as authority

◀ [[S31 Core Philosophy]] · [[Part IV — Domain Model|▲ Part IV]] · [[S33 Desk Entity]] ▶
