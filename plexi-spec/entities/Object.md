---
type: entity
entity: Object
spec_section: §34
tags:
  - entity
  - domain-model
---

# Object

[[Home|▲ Home]] · [[S34 Object Entity|§34 — full definition]] · [[S32 Canonical Entity Model|§32 BaseEntity]]

> [!abstract] Canonical schema
> Defined in [[S34 Object Entity|§34]]. All entities inherit [[S32 Canonical Entity Model|BaseEntity]] — do not invent a separate identity model ([[REQ-DOM#PLX-DOM-010|PLX-DOM-010]]).

## Schema

```typescript
interface PlexiObject extends BaseEntity {
  entityType:        "object";

  objectType:        ObjectTypeId;      // registry-resolved; see PLX-PRD-011
  title:             string;
  deskId:            UUID;              // owning Desk — exactly one (PLX-INV-01)

  presentIn:         DeskPresence[];    // additional Desks this Object appears in
  currentState:      JsonValue;         // type-specific payload
  contentRef:        BlobRef | null;    // large content stored out-of-band

  embeddings:        EmbeddingRef[];
  graphNodeId:       UUID;
  lifecycleState:    "created" | "referenced" | "shared" | "modified"
                     | "versioned" | "archived" | "deleted";

  // Context Health is per-user and is NOT stored on the Object — see PLX-DOM-030
}

interface DeskPresence {
  deskId:            UUID;
  syncMode:          "independent" | "snapshot" | "linked" | "live" | "federated" | "streaming";
  addedBy:           ActorRef;
  addedAt:           Timestamp;
  effectivePermissions: PermissionSet;   // intersection — see PLX-PRD-061
}
```

## Binding requirements

| ID | V | Requirement |
|---|---|---|
| [[REQ-PRD#PLX-PRD-010\|PLX-PRD-010]] | I, T | All Object types **MUST** use the universal Object schema (§34). Type-specific data **MUST** be carried in the typed payload, not by extending the base schema. |
| [[REQ-PRD#PLX-PRD-011\|PLX-PRD-011]] | T | The Object type registry **MUST** be extensible at runtime without redeployment of the Object Service, and extension-registered types **MUST** receive identical permission, event, versioning and Context Health handling to built-in types. |
| [[REQ-PRD#PLX-PRD-012\|PLX-PRD-012]] | T | Deletion of an Object **MUST** remove it from default visibility and search results while retaining its Events, Relationships and version history. |
| [[REQ-PRD#PLX-PRD-013\|PLX-PRD-013]] | D, I | The platform **MUST** present users with an accurate, plain-language statement of what deletion does and does not remove, at the point of deletion. |
| [[REQ-PRD#PLX-PRD-014\|PLX-PRD-014]] | T, A | Every Object **MUST** carry semantic embeddings maintained within `PLX-PERF-020` of a content-changing Event, or be explicitly excluded from semantic indexing by policy with the exclusion recorded. |
| [[REQ-DOM#PLX-DOM-030\|PLX-DOM-030]] | T, I | Context Health **MUST NOT** be stored as a scalar attribute on the Object entity. It **MUST** be computed or materialised per (user, Object) pair (`PLX-UX-020`). |
| [[REQ-DOM#PLX-DOM-031\|PLX-DOM-031]] | T | `DeskPresence.effectivePermissions` **MUST** be computed as the most restrictive intersection of the owning Desk permissions and the presenting Desk permissions (`PLX-PRD-061`). |
| [[REQ-DOM#PLX-DOM-032\|PLX-DOM-032]] | T, A | Large Object content **MUST** be stored out-of-band via `contentRef` and **MUST NOT** be embedded in Event payloads. Events **MUST** reference content by immutable digest. |

## Invariants

- [[Invariants#PLX-INV-01|PLX-INV-01]] — Every Object belongs to exactly one owning Desk
- [[Invariants#PLX-INV-05|PLX-INV-05]] — Nothing deletes organisational memory
