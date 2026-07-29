---
id: S34
section: §34
title: "Object Entity"
part: IV
type: section
defines:
  - PLX-DOM-030
  - PLX-DOM-031
  - PLX-DOM-032
  - PLX-PRD-011
  - PLX-PRD-061
  - PLX-UX-020
tags:
  - section
  - part/iv
---

# §34 Object Entity

◀ [[S33 Desk Entity]] · [[Part IV — Domain Model|▲ Part IV]] · [[S35 Event Entity]] ▶

---

### 34.1 Definition

Objects represent everything users interact with. Objects are first-class citizens. No Object type receives architectural preference.

### 34.2 Schema

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

### 34.3 Supported Object types

Document · Spreadsheet · Presentation · Canvas · Widget · Table · Task · Decision · Conversation · Meeting · Recording · Prompt · AI Conversation · Automation · Workflow · Terminal · Code Editor · Diagram · Knowledge Card · API Connection · Dashboard · External Application · Bookmark · Media · Timeline

Reconciled against §11.3 in **Appendix C**; the two source lists differ and the union is authoritative.

### 34.4 Behaviour

Every Object can emit Events, receive Events, be shared, be versioned, participate in AI reasoning, and belong to multiple contextual relationships.

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-DOM#PLX-DOM-030|PLX-DOM-030]] | Context Health **MUST NOT** be stored as a scalar attribute on the Object entity. It **MUST** be computed or materialised per (user, Object) pair (`[[REQ-UX#PLX-UX-020|PLX-UX-020]]`). | T, I | §20.1, §34 |
| [[REQ-DOM#PLX-DOM-031|PLX-DOM-031]] | `DeskPresence.effectivePermissions` **MUST** be computed as the most restrictive intersection of the owning Desk permissions and the presenting Desk permissions (`[[REQ-PRD#PLX-PRD-061|PLX-PRD-061]]`). | T | [[S16 Shared Objects|§16]], §34 |
| [[REQ-DOM#PLX-DOM-032|PLX-DOM-032]] | Large Object content **MUST** be stored out-of-band via `contentRef` and **MUST NOT** be embedded in Event payloads. Events **MUST** reference content by immutable digest. | T, A | §34, [[S64 Event Contracts|§64]], new |

> **On `[[REQ-DOM#PLX-DOM-032|PLX-DOM-032]]`.** An append-only, never-deleted Event Store that carries full document bodies in `previousState` / `currentState` grows without bound at the rate of content churn, not the rate of meaningful change. At enterprise scale this is the difference between an event store measured in gigabytes and one measured in petabytes — and it makes crypto-shredding for erasure (§69.7) far harder, because personal data ends up smeared across every event payload rather than confined to referenced blobs. Digest references, not payloads.

---

---

## Requirements defined or cited here

- [[REQ-DOM#PLX-DOM-030|PLX-DOM-030]] — Context Health **MUST NOT** be stored as a scalar attribute on the Object entity. It **MUST** be computed or m
- [[REQ-DOM#PLX-DOM-031|PLX-DOM-031]] — `DeskPresence.effectivePermissions` **MUST** be computed as the most restrictive intersection of the owning De
- [[REQ-DOM#PLX-DOM-032|PLX-DOM-032]] — Large Object content **MUST** be stored out-of-band via `contentRef` and **MUST NOT** be embedded in Event pay
- [[REQ-PRD#PLX-PRD-011|PLX-PRD-011]] — The Object type registry **MUST** be extensible at runtime without redeployment of the Object Service, and ext
- [[REQ-PRD#PLX-PRD-061|PLX-PRD-061]] — Where an Object appears in multiple Desks with differing permissions, the **most restrictive** applicable perm
- [[REQ-UX#PLX-UX-020|PLX-UX-020]] — Context Health **MUST** be evaluated per (user, Object) pair, relative to that user's last review point.

◀ [[S33 Desk Entity]] · [[Part IV — Domain Model|▲ Part IV]] · [[S35 Event Entity]] ▶
