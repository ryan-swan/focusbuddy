---
id: S69
section: §69
title: "Security Architecture"
part: VI
type: section
defines:
  - PLX-DOM-014
  - PLX-DOM-032
  - PLX-PERF-021
  - PLX-SEC-020
  - PLX-SEC-021
  - PLX-SEC-022
  - PLX-SEC-023
  - PLX-SEC-024
  - PLX-SEC-025
  - PLX-SEC-026
  - PLX-SEC-027
  - PLX-SEC-030
  - PLX-SEC-031
  - PLX-SEC-032
  - PLX-SEC-033
  - PLX-UX-062
  - PLX-UX-072
tags:
  - section
  - part/vi
---

# §69 Security Architecture

◀ [[S68 AI Cost Optimisation]] · [[Part VI — Data, APIs, Security & Engineering Standards|▲ Part VI]] · [[S70 AI Governance]] ▶

---

Security is foundational, not optional.

### 69.1 Principles

Least privilege · zero trust · encryption everywhere · audit everything · never trust client input · explicit permissions · transparent AI.

### 69.2 Authentication

OAuth 2.1 · OIDC · SAML 2.0 · passwordless · MFA · enterprise SSO.

### 69.3 Authorisation

Role-Based Access Control · Attribute-Based Access Control · Object-level permissions · Desk-level permissions · Organisation policies · inherited permissions · temporary permissions.

### 69.4 Encryption

TLS 1.3 in transit · AES-256 at rest · encrypted secrets · encrypted backups · key rotation.

### 69.5 Requirements

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-SEC#PLX-SEC-020|PLX-SEC-020]] | Authorisation **MUST** be evaluated at the data-access layer of every service. Gateway-level authorisation alone **MUST NOT** be relied upon. | T, I | §69 |
| [[REQ-SEC#PLX-SEC-021|PLX-SEC-021]] | Every authorisation decision **MUST** be auditable, recording principal, resource, decision, policy evaluated and timestamp. | T | §69 |
| [[REQ-SEC#PLX-SEC-022|PLX-SEC-022]] | Temporary permissions **MUST** carry an explicit expiry and **MUST** be revoked automatically. Permission grants without expiry **MUST** be an explicit, audited administrative action. | T | §69.3, new |
| [[REQ-SEC#PLX-SEC-023|PLX-SEC-023]] | Permission changes **MUST** propagate to derived stores — search index, vector index, graph, materialised Context Health — within `[[REQ-PERF#PLX-PERF-021|PLX-PERF-021]]`, and stale permission state **MUST** fail closed. | T, A | §69, new |
| [[REQ-SEC#PLX-SEC-024|PLX-SEC-024]] | All secrets **MUST** be stored in a managed vault with automatic rotation. Secrets **MUST NOT** appear in configuration files, environment variables in images, logs, Event payloads or prompts. | T, I | §69.4 |
| [[REQ-SEC#PLX-SEC-025|PLX-SEC-025]] | Data residency **MUST** be enforceable per Organisation, including for AI inference. A tenant with an EU residency requirement **MUST NOT** have content dispatched to a model endpoint outside the permitted region. | T, I | [[S71 Deployment Architecture|§71]], new |
| [[REQ-SEC#PLX-SEC-026|PLX-SEC-026]] | The platform **MUST** support customer-managed encryption keys for tenants requiring them, with key revocation rendering tenant data inaccessible. | T, I | §69, new |
| [[REQ-SEC#PLX-SEC-027|PLX-SEC-027]] | AI-generated content **MUST** be marked as such in storage and in every export (`[[REQ-UX#PLX-UX-062|PLX-UX-062]]`, `[[REQ-DOM#PLX-DOM-014|PLX-DOM-014]]`). | T | [[S70 AI Governance|§70]], [[S24 AI Experience|§24]] |

### 69.6 Privacy and data protection

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-SEC#PLX-SEC-030|PLX-SEC-030]] | The platform **MUST** implement cryptographic erasure for personal data: per-subject key material, destroyed on valid erasure request, rendering that subject's personal data permanently unrecoverable without modifying any Event record (§44.1). | T, I | [[S49 Event Store|§49]], new |
| [[REQ-SEC#PLX-SEC-031|PLX-SEC-031]] | The platform **MUST** maintain a data inventory identifying every location personal data is stored, including derived stores, caches, prompt logs, embeddings and backups, and **MUST** ensure erasure reaches all of them. | I, A | §69, new |
| [[REQ-SEC#PLX-SEC-032|PLX-SEC-032]] | Data subject access requests **MUST** be servicable within the statutory period, including data held in Event history, embeddings and AI memory. | D, A | §69, new |
| [[REQ-SEC#PLX-SEC-033|PLX-SEC-033]] | Presence, focus and dwell telemetry **MUST** be retained under the presence retention class (`[[REQ-UX#PLX-UX-072|PLX-UX-072]]`) and **MUST NOT** be repurposed for performance management or monitoring without an explicit, separately-consented tenant configuration. | I, T | [[S25 Collaboration|§25]], new |

### 69.7 On cryptographic erasure

`[[Invariants#PLX-INV-05|PLX-INV-05]]` ("history is never destroyed") and the right to erasure under GDPR Article 17 and equivalent regimes cannot both be satisfied by an event store that literally never removes anything. This is a well-known problem in event-sourced systems, and it has a well-established resolution.

The approach: **encrypt personal data in Event payloads under a per-data-subject key**, held separately from the events. To erase, destroy the key. Every Event record remains, byte-identical, append-only, with its position in the log intact. The payload becomes permanently undecryptable. Replay still works; the erased fields render as unavailable.

This preserves the engineering property that matters (the log is never rewritten, so no historical reconstruction is invalidated) while satisfying the legal obligation. It has three consequences that must be designed for from the beginning:

1. Personal data **must** be identified at write time and routed through the subject key. Data written unencrypted before the scheme exists cannot be retroactively protected.
2. Key management becomes a system of record with its own availability and backup requirements — losing a subject key is indistinguishable from erasing that subject.
3. Personal data must not be smeared across every Event payload, which is a second reason for digest-referenced content (`[[REQ-DOM#PLX-DOM-032|PLX-DOM-032]]`).

Retrofitting this is close to impossible at scale. It is `[[Risk Register#PLX-RSK-01|PLX-RSK-01]]` and is required before the first production Event is written.

---

---

## Requirements defined or cited here

- [[REQ-DOM#PLX-DOM-014|PLX-DOM-014]] — `aiMetadata.provenance` **MUST** be set on every entity at creation and **MUST NOT** be downgraded from `ai_ge
- [[REQ-DOM#PLX-DOM-032|PLX-DOM-032]] — Large Object content **MUST** be stored out-of-band via `contentRef` and **MUST NOT** be embedded in Event pay
- [[REQ-PERF#PLX-PERF-021|PLX-PERF-021]] — Context Health update — propagated impact (depth 2–N, within bound) — p50 120 ms, p95 350 ms, p99 **500 ms**.
- [[REQ-SEC#PLX-SEC-020|PLX-SEC-020]] — Authorisation **MUST** be evaluated at the data-access layer of every service. Gateway-level authorisation alo
- [[REQ-SEC#PLX-SEC-021|PLX-SEC-021]] — Every authorisation decision **MUST** be auditable, recording principal, resource, decision, policy evaluated
- [[REQ-SEC#PLX-SEC-022|PLX-SEC-022]] — Temporary permissions **MUST** carry an explicit expiry and **MUST** be revoked automatically. Permission gran
- [[REQ-SEC#PLX-SEC-023|PLX-SEC-023]] — Permission changes **MUST** propagate to derived stores — search index, vector index, graph, materialised Cont
- [[REQ-SEC#PLX-SEC-024|PLX-SEC-024]] — All secrets **MUST** be stored in a managed vault with automatic rotation. Secrets **MUST NOT** appear in conf
- [[REQ-SEC#PLX-SEC-025|PLX-SEC-025]] — Data residency **MUST** be enforceable per Organisation, including for AI inference. A tenant with an EU resid
- [[REQ-SEC#PLX-SEC-026|PLX-SEC-026]] — The platform **MUST** support customer-managed encryption keys for tenants requiring them, with key revocation
- [[REQ-SEC#PLX-SEC-027|PLX-SEC-027]] — AI-generated content **MUST** be marked as such in storage and in every export (`PLX-UX-062`, `PLX-DOM-014`).
- [[REQ-SEC#PLX-SEC-030|PLX-SEC-030]] — The platform **MUST** implement cryptographic erasure for personal data: per-subject key material, destroyed o
- [[REQ-SEC#PLX-SEC-031|PLX-SEC-031]] — The platform **MUST** maintain a data inventory identifying every location personal data is stored, including
- [[REQ-SEC#PLX-SEC-032|PLX-SEC-032]] — Data subject access requests **MUST** be servicable within the statutory period, including data held in Event
- [[REQ-SEC#PLX-SEC-033|PLX-SEC-033]] — Presence, focus and dwell telemetry **MUST** be retained under the presence retention class (`PLX-UX-072`) and
- [[REQ-UX#PLX-UX-062|PLX-UX-062]] — AI-generated content **MUST** be visually and programmatically distinguishable from human-authored content at
- [[REQ-UX#PLX-UX-072|PLX-UX-072]] — Presence data **MUST** be treated as personal data with a defined, tenant-configurable retention period, and *

◀ [[S68 AI Cost Optimisation]] · [[Part VI — Data, APIs, Security & Engineering Standards|▲ Part VI]] · [[S70 AI Governance]] ▶
