---
id: S42
section: §42
title: "Organisation Entity"
part: IV
type: section
defines:
  - PLX-SEC-010
  - PLX-SEC-011
  - PLX-SEC-025
  - PLX-SEC-030
tags:
  - section
  - part/iv
---

# §42 Organisation Entity

◀ [[S41 Agent Entity]] · [[Part IV — Domain Model|▲ Part IV]] · [[S43 Entity Relationships]] ▶

---

The Organisation Entity is the highest contextual boundary and **the tenant isolation boundary**.

### 42.1 Schema

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

Organisations own policies. Desks own work. Objects own content. Relationships own understanding.

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-SEC#PLX-SEC-010|PLX-SEC-010]] | Every store — relational, document, event, graph, vector and search — **MUST** enforce tenant isolation at the storage layer, including namespace or row-level security in the graph and vector stores. | T, I | §42, [[S69 Security Architecture|§69]] |
| [[REQ-SEC#PLX-SEC-011|PLX-SEC-011]] | Cross-Organisation traversal, search or reasoning **MUST** be impossible by construction. No API, query path, agent tool or administrative interface **MUST** be capable of returning data from more than one `organisationId` in a single result. | T, A | §42, new |

> **On `[[REQ-SEC#PLX-SEC-011|PLX-SEC-011]]` and the graph.** Tenant isolation in a graph database is materially harder than in a relational one, because traversal is the primary access pattern and a single unbounded traversal can walk out of its namespace. This is the single most likely place for a cross-tenant leak in this architecture. Pool-model graph storage with application-level filtering is not sufficient for enterprise assurance; either the graph is namespaced per tenant at the engine level, or the isolation model is `silo` for the graph specifically. This must be decided before the graph is populated — see `[[Risk Register#PLX-RSK-07|PLX-RSK-07]]`.

---

---

## Requirements defined or cited here

- [[REQ-SEC#PLX-SEC-010|PLX-SEC-010]] — Every store — relational, document, event, graph, vector and search — **MUST** enforce tenant isolation at the
- [[REQ-SEC#PLX-SEC-011|PLX-SEC-011]] — Cross-Organisation traversal, search or reasoning **MUST** be impossible by construction. No API, query path,
- [[REQ-SEC#PLX-SEC-025|PLX-SEC-025]] — Data residency **MUST** be enforceable per Organisation, including for AI inference. A tenant with an EU resid
- [[REQ-SEC#PLX-SEC-030|PLX-SEC-030]] — The platform **MUST** implement cryptographic erasure for personal data: per-subject key material, destroyed o

◀ [[S41 Agent Entity]] · [[Part IV — Domain Model|▲ Part IV]] · [[S43 Entity Relationships]] ▶
