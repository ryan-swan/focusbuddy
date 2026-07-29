---
type: entity
entity: Organisation
spec_section: §42
tags:
  - entity
  - domain-model
---

# Organisation

[[Home|▲ Home]] · [[S42 Organisation Entity|§42 — full definition]] · [[S32 Canonical Entity Model|§32 BaseEntity]]

> [!abstract] Canonical schema
> Defined in [[S42 Organisation Entity|§42]]. All entities inherit [[S32 Canonical Entity Model|BaseEntity]] — do not invent a separate identity model ([[REQ-DOM#PLX-DOM-010|PLX-DOM-010]]).

## Schema

```typescript
interface Organisation {
  id:                  UUID;
  name:                string;

  teamIds:             UUID[];
  userIds:             UUID[];
  deskIds:             UUID[];
  graphNamespace:      string;          // isolation namespace — PLX-SEC-010

  policies:            Policy[];
  aiPolicies:          AiPolicy[];
  securityRules:       SecurityRule[];
  integrationIds:      UUID[];
  auditConfiguration:  AuditConfig;
  retentionPolicies:   RetentionPolicy[];

  dataResidency:       RegionCode[];    // PLX-SEC-025
  isolationModel:      "silo" | "pool" | "bridge";   // PLX-RSK-07
  encryptionKeyRef:    KeyRef;          // tenant root key — PLX-SEC-030
}
```

## Binding requirements

| ID | V | Requirement |
|---|---|---|
| [[REQ-SEC#PLX-SEC-010\|PLX-SEC-010]] | T, I | Every store — relational, document, event, graph, vector and search — **MUST** enforce tenant isolation at the storage layer, including namespace or row-level security in the graph and vector stores. |
| [[REQ-SEC#PLX-SEC-011\|PLX-SEC-011]] | T, A | Cross-Organisation traversal, search or reasoning **MUST** be impossible by construction. No API, query path, agent tool or administrative interface **MUST** be capable of returning data from more than one `organisationId` in a single result. |
| [[REQ-DATA#PLX-DATA-004\|PLX-DATA-004]] | T, I | Every store **MUST** enforce tenant isolation at the storage layer (`PLX-SEC-010`), including graph namespaces and vector-index partitions. |

## Invariants

- [[Invariants#PLX-INV-06|PLX-INV-06]] — Permissions propagate through relationships
