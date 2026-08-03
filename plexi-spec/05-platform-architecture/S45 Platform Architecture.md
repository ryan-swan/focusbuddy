---
id: S45
section: §45
title: "Platform Architecture"
part: V
type: section
defines:
  - PLX-AI-001
  - PLX-AI-004
  - PLX-API-001
  - PLX-ARC-001
  - PLX-ARC-002
  - PLX-ARC-010
  - PLX-DOM-010
  - PLX-EVT-014
  - PLX-EXT-001
  - PLX-EXT-004
  - PLX-OPS-001
  - PLX-OPS-010
  - PLX-SEC-010
  - PLX-SEC-011
  - PLX-SYN-010
  - PLX-UX-091
tags:
  - section
  - part/v
---

# §45 Platform Architecture

◀ [[S44 Domain Invariants]] · [[Part V — Platform Architecture|▲ Part V]] · [[S46 High-Level System Architecture]] ▶

---

### 45.1 Purpose

The architecture of Plexi must support continuous context preservation, real-time collaboration, AI reasoning and horizontal scalability.

Unlike traditional business applications, Plexi is **not request-driven**. Plexi is **event-driven**.

Every meaningful interaction becomes an immutable Event. Every service reacts to Events. No service owns global state. Instead, global understanding emerges through continuous event processing.

### 45.2 Architectural principles

The platform shall be event-driven, API-first, service-oriented, cloud-native, horizontally scalable, AI-agnostic, offline capable, multi-tenant, observable and extensible.

Every engineering decision must strengthen one or more of these principles.

| # | Principle | Normative consequence | Conflicts with |
|---|---|---|---|
| 1 | Event-driven | `[[Invariants#PLX-INV-02|PLX-INV-02]]`, `[[REQ-EVT#PLX-EVT-014|PLX-EVT-014]]` | — |
| 2 | API-first | `[[REQ-UX#PLX-UX-091|PLX-UX-091]]`, `[[REQ-API#PLX-API-001|PLX-API-001]]` | — |
| 3 | Service-oriented | `[[REQ-ARC#PLX-ARC-001|PLX-ARC-001]]`, `[[REQ-ARC#PLX-ARC-002|PLX-ARC-002]]` | — |
| 4 | Cloud-native | `[[REQ-OPS#PLX-OPS-001|PLX-OPS-001]]` | — |
| 5 | Horizontally scalable | `[[REQ-ARC#PLX-ARC-010|PLX-ARC-010]]` | Principle 6 (see below) |
| 6 | AI-agnostic | `[[REQ-AI#PLX-AI-001|PLX-AI-001]]`–`[[REQ-AI#PLX-AI-004|PLX-AI-004]]` | `[[Risk Register#PLX-RSK-05|PLX-RSK-05]]` |
| 7 | Offline capable | `[[REQ-SYN#PLX-SYN-010|PLX-SYN-010]]`, `[[REQ-DOM#PLX-DOM-010|PLX-DOM-010]]` | Forces CRDT — `[[Risk Register#PLX-RSK-04|PLX-RSK-04]]` |
| 8 | Multi-tenant | `[[REQ-SEC#PLX-SEC-010|PLX-SEC-010]]`, `[[REQ-SEC#PLX-SEC-011|PLX-SEC-011]]` | `[[Risk Register#PLX-RSK-07|PLX-RSK-07]]` |
| 9 | Observable | `[[REQ-OPS#PLX-OPS-010|PLX-OPS-010]]` | — |
| 10 | Extensible | `[[REQ-EXT#PLX-EXT-001|PLX-EXT-001]]` | `[[REQ-EXT#PLX-EXT-004|PLX-EXT-004]]` |

> **The Conflicts column is the point of this table.** Architectural principle lists are usually written as though the principles are mutually reinforcing. They are not. "Offline capable" and "deterministic conflict resolution" jointly force a CRDT choice that "horizontally scalable" then has to absorb, because CRDT metadata grows with edit history. "AI-agnostic" and "sub-ten-second AI recommendations" pull against each other because the cheapest interchangeable models are not the ones that hit the quality bar. Naming the tensions here means they get resolved deliberately in Appendix F rather than accidentally in a sprint.

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-ARC#PLX-ARC-001|PLX-ARC-001]] | Each service **MUST** own exactly one business capability and **MUST** own its own datastore. No service **MUST** read or write another service's datastore directly. | I, T | §45, [[S46 High-Level System Architecture|§46]] |
| [[REQ-ARC#PLX-ARC-002|PLX-ARC-002]] | Inter-service communication **MUST** occur exclusively through published APIs and Events. Shared-database integration between services **MUST NOT** be used. | I, A | [[S46 High-Level System Architecture|§46]] |
| [[REQ-ARC#PLX-ARC-010|PLX-ARC-010]] | Every service **MUST** be horizontally scalable without coordinated deployment, and **MUST** tolerate concurrent instances of itself processing the same event stream partition set. | T, A | §45 |

---

---

## Requirements defined or cited here

- [[REQ-AI#PLX-AI-001|PLX-AI-001]] — All model invocation **MUST** occur through a single internal abstraction. No service other than the AI Orches
- [[REQ-AI#PLX-AI-004|PLX-AI-004]] — Provider substitution **MUST** be verifiable by an evaluation suite executed against every supported model, wi
- [[REQ-API#PLX-API-001|PLX-API-001]] — Every platform capability **MUST** be reachable through the public API. No capability **MUST** be exclusive to
- [[REQ-ARC#PLX-ARC-001|PLX-ARC-001]] — Each service **MUST** own exactly one business capability and **MUST** own its own datastore. No service **MUS
- [[REQ-ARC#PLX-ARC-002|PLX-ARC-002]] — Inter-service communication **MUST** occur exclusively through published APIs and Events. Shared-database inte
- [[REQ-ARC#PLX-ARC-010|PLX-ARC-010]] — Every service **MUST** be horizontally scalable without coordinated deployment, and **MUST** tolerate concurre
- [[REQ-DOM#PLX-DOM-010|PLX-DOM-010]] — Entity identifiers **MUST** be UUIDv7. Identifiers **MUST** be generable client-side without coordination, so
- [[REQ-EVT#PLX-EVT-014|PLX-EVT-014]] — Event emission and the corresponding state mutation **MUST** be atomic. Implementations **MUST** use a transac
- [[REQ-EXT#PLX-EXT-001|PLX-EXT-001]] — Extensions **MUST** execute within a sandbox with an explicitly granted capability set. Capability grants **MU
- [[REQ-EXT#PLX-EXT-004|PLX-EXT-004]] — Extensions **MUST NOT** exceed the permissions of the principal on whose behalf they act, and permission enfor
- [[REQ-OPS#PLX-OPS-001|PLX-OPS-001]] — Every service **MUST** be deployable as a container with no host-specific dependencies and **MUST** support ro
- [[REQ-OPS#PLX-OPS-010|PLX-OPS-010]] — Every service **MUST** emit metrics, structured logs and distributed traces using OpenTelemetry semantics, wit
- [[REQ-SEC#PLX-SEC-010|PLX-SEC-010]] — Every store — relational, document, event, graph, vector and search — **MUST** enforce tenant isolation at the
- [[REQ-SEC#PLX-SEC-011|PLX-SEC-011]] — Cross-Organisation traversal, search or reasoning **MUST** be impossible by construction. No API, query path,
- [[REQ-SYN#PLX-SYN-010|PLX-SYN-010]] — Offline clients **MUST** be able to create Objects and Events with client-generated identifiers and reconcile
- [[REQ-UX#PLX-UX-091|PLX-UX-091]] — Every capability exposed through the primary interface **MUST** be reachable through the public API (§63), so

◀ [[S44 Domain Invariants]] · [[Part V — Platform Architecture|▲ Part V]] · [[S46 High-Level System Architecture]] ▶
