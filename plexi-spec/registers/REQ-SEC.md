---
type: requirement-register
area: SEC
domain: "Security & privacy"
count: 14
tags:
  - requirements
  - area/sec
---

# REQ-SEC — Security & privacy

14 normative requirements. Identifiers are permanent and never reused.

> [!important] For Claude Code
> Every requirement below is binding. Cite the ID in the test name that verifies it (`test_plx_sec_010_*`) so [[S74 Definition of Done|§74]] gate 13 (requirement-to-test traceability) can be machine-checked.

| ID | § | V | Summary |
|---|---|---|---|
| [[#PLX-SEC-010]] | §42 | T, I | Every store — relational, document, event, graph, vector and search — MUST enforce tenant isolation at the storage layer, includin |
| [[#PLX-SEC-011]] | §42 | T, A | Cross-Organisation traversal, search or reasoning MUST be impossible by construction. No API, query path, agent tool or administra |
| [[#PLX-SEC-020]] | §69 | T, I | Authorisation MUST be evaluated at the data-access layer of every service. Gateway-level authorisation alone MUST NOT be relied up |
| [[#PLX-SEC-021]] | §69 | T | Every authorisation decision MUST be auditable, recording principal, resource, decision, policy evaluated and timestamp. |
| [[#PLX-SEC-022]] | §69 | T | Temporary permissions MUST carry an explicit expiry and MUST be revoked automatically. Permission grants without expiry MUST be an |
| [[#PLX-SEC-023]] | §69 | T, A | Permission changes MUST propagate to derived stores — search index, vector index, graph, materialised Context Health — within PLX- |
| [[#PLX-SEC-024]] | §69 | T, I | All secrets MUST be stored in a managed vault with automatic rotation. Secrets MUST NOT appear in configuration files, environment |
| [[#PLX-SEC-025]] | §69 | T, I | Data residency MUST be enforceable per Organisation, including for AI inference. A tenant with an EU residency requirement MUST NO |
| [[#PLX-SEC-026]] | §69 | T, I | The platform MUST support customer-managed encryption keys for tenants requiring them, with key revocation rendering tenant data i |
| [[#PLX-SEC-027]] | §69 | T | AI-generated content MUST be marked as such in storage and in every export (PLX-UX-062, PLX-DOM-014). |
| [[#PLX-SEC-030]] | §69 | T, I | The platform MUST implement cryptographic erasure for personal data: per-subject key material, destroyed on valid erasure request, |
| [[#PLX-SEC-031]] | §69 | I, A | The platform MUST maintain a data inventory identifying every location personal data is stored, including derived stores, caches,  |
| [[#PLX-SEC-032]] | §69 | D, A | Data subject access requests MUST be servicable within the statutory period, including data held in Event history, embeddings and  |
| [[#PLX-SEC-033]] | §69 | I, T | Presence, focus and dwell telemetry MUST be retained under the presence retention class (PLX-UX-072) and MUST NOT be repurposed fo |

---

### PLX-SEC-010

Every store — relational, document, event, graph, vector and search — **MUST** enforce tenant isolation at the storage layer, including namespace or row-level security in the graph and vector stores.

| | |
|---|---|
| **Verification** | `T, I` |
| **Defined in** | [[S42 Organisation Entity|§42]] |
| **Derives from** | [[S42 Organisation Entity|§42]], [[S69 Security Architecture|§69]] |
| **Test name** | `test_plx_sec_010` |

### PLX-SEC-011

Cross-Organisation traversal, search or reasoning **MUST** be impossible by construction. No API, query path, agent tool or administrative interface **MUST** be capable of returning data from more than one `organisationId` in a single result.

| | |
|---|---|
| **Verification** | `T, A` |
| **Defined in** | [[S42 Organisation Entity|§42]] |
| **Derives from** | [[S42 Organisation Entity|§42]], new |
| **Test name** | `test_plx_sec_011` |

### PLX-SEC-020

Authorisation **MUST** be evaluated at the data-access layer of every service. Gateway-level authorisation alone **MUST NOT** be relied upon.

| | |
|---|---|
| **Verification** | `T, I` |
| **Defined in** | [[S69 Security Architecture|§69]] |
| **Derives from** | [[S69 Security Architecture|§69]] |
| **Test name** | `test_plx_sec_020` |

### PLX-SEC-021

Every authorisation decision **MUST** be auditable, recording principal, resource, decision, policy evaluated and timestamp.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S69 Security Architecture|§69]] |
| **Derives from** | [[S69 Security Architecture|§69]] |
| **Test name** | `test_plx_sec_021` |

### PLX-SEC-022

Temporary permissions **MUST** carry an explicit expiry and **MUST** be revoked automatically. Permission grants without expiry **MUST** be an explicit, audited administrative action.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S69 Security Architecture|§69]] |
| **Derives from** | §69.3, new |
| **Test name** | `test_plx_sec_022` |

### PLX-SEC-023

Permission changes **MUST** propagate to derived stores — search index, vector index, graph, materialised Context Health — within `[[REQ-PERF#PLX-PERF-021|PLX-PERF-021]]`, and stale permission state **MUST** fail closed.

| | |
|---|---|
| **Verification** | `T, A` |
| **Defined in** | [[S69 Security Architecture|§69]] |
| **Derives from** | [[S69 Security Architecture|§69]], new |
| **Test name** | `test_plx_sec_023` |

### PLX-SEC-024

All secrets **MUST** be stored in a managed vault with automatic rotation. Secrets **MUST NOT** appear in configuration files, environment variables in images, logs, Event payloads or prompts.

| | |
|---|---|
| **Verification** | `T, I` |
| **Defined in** | [[S69 Security Architecture|§69]] |
| **Derives from** | §69.4 |
| **Test name** | `test_plx_sec_024` |

### PLX-SEC-025

Data residency **MUST** be enforceable per Organisation, including for AI inference. A tenant with an EU residency requirement **MUST NOT** have content dispatched to a model endpoint outside the permitted region.

| | |
|---|---|
| **Verification** | `T, I` |
| **Defined in** | [[S69 Security Architecture|§69]] |
| **Derives from** | [[S71 Deployment Architecture|§71]], new |
| **Test name** | `test_plx_sec_025` |

### PLX-SEC-026

The platform **MUST** support customer-managed encryption keys for tenants requiring them, with key revocation rendering tenant data inaccessible.

| | |
|---|---|
| **Verification** | `T, I` |
| **Defined in** | [[S69 Security Architecture|§69]] |
| **Derives from** | [[S69 Security Architecture|§69]], new |
| **Test name** | `test_plx_sec_026` |

### PLX-SEC-027

AI-generated content **MUST** be marked as such in storage and in every export (`[[REQ-UX#PLX-UX-062|PLX-UX-062]]`, `[[REQ-DOM#PLX-DOM-014|PLX-DOM-014]]`).

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S69 Security Architecture|§69]] |
| **Derives from** | [[S70 AI Governance|§70]], [[S24 AI Experience|§24]] |
| **Test name** | `test_plx_sec_027` |

### PLX-SEC-030

The platform **MUST** implement cryptographic erasure for personal data: per-subject key material, destroyed on valid erasure request, rendering that subject's personal data permanently unrecoverable without modifying any Event record (§44.1).

| | |
|---|---|
| **Verification** | `T, I` |
| **Defined in** | [[S69 Security Architecture|§69]] |
| **Derives from** | [[S49 Event Store|§49]], new |
| **Test name** | `test_plx_sec_030` |

### PLX-SEC-031

The platform **MUST** maintain a data inventory identifying every location personal data is stored, including derived stores, caches, prompt logs, embeddings and backups, and **MUST** ensure erasure reaches all of them.

| | |
|---|---|
| **Verification** | `I, A` |
| **Defined in** | [[S69 Security Architecture|§69]] |
| **Derives from** | [[S69 Security Architecture|§69]], new |
| **Test name** | `test_plx_sec_031` |

### PLX-SEC-032

Data subject access requests **MUST** be servicable within the statutory period, including data held in Event history, embeddings and AI memory.

| | |
|---|---|
| **Verification** | `D, A` |
| **Defined in** | [[S69 Security Architecture|§69]] |
| **Derives from** | [[S69 Security Architecture|§69]], new |
| **Test name** | `test_plx_sec_032` |

### PLX-SEC-033

Presence, focus and dwell telemetry **MUST** be retained under the presence retention class (`[[REQ-UX#PLX-UX-072|PLX-UX-072]]`) and **MUST NOT** be repurposed for performance management or monitoring without an explicit, separately-consented tenant configuration.

| | |
|---|---|
| **Verification** | `I, T` |
| **Defined in** | [[S69 Security Architecture|§69]] |
| **Derives from** | [[S25 Collaboration|§25]], new |
| **Test name** | `test_plx_sec_033` |
