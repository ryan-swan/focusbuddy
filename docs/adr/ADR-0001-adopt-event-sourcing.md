# ADR-0001 — Adopt event sourcing as the Plexi 4.0 foundation

Status: ACCEPTED (operator decision, 2026-07-29)
Relates to spec risks: PLX-RSK-01, RSK-02, RSK-03, RSK-05, RSK-08 and spec decisions ADR-01, ADR-02, ADR-03, ADR-05 (which remain OPEN and are narrowed, not closed, by this record).

## Context

The build-vs-spec gap analysis found that the current product is CRUD-on-SQLite, while the spec (PLEXI-0001 v2.0) is built on an append-only Event Store as the system of record. A single substrate difference cascades: the Context Engine (CTX 16/16 Missing), the Event area (EVT 17/24 Missing), Resume (RES architecturally divergent), the Knowledge Graph, and most Metrics all assume Events exist. Without an Event Store, those areas cannot be honestly built to spec.

Per the spec's hard rule, this foreclosing decision was surfaced to the operator rather than settled by an implementation detail. The operator chose to adopt event sourcing now and build the Event Store first.

## Decision

Plexi 4.0 adopts event sourcing. Every meaningful state change emits an immutable Event, and the Event Store is the system of record from which derived state (Context Health, Resume, the relationship graph, metrics) is projected.

Implementation shape, aligned to the binding contracts:
- Append-only, immutable Event Store. No interface, including database-level, may update or delete an Event (PLX-EVT-010, PLX-EVT-030). Enforced by SQLite triggers, not convention.
- CloudEvents v1.0.2 envelope with the Plexi extension attributes of spec §64.1 (PLX-EVT-040).
- Past-tense, reverse-DNS, version-suffixed event type names; command-shaped names rejected (PLX-EVT-041).
- Correlation and causation ids on every Event; occurrence time (timestamp) distinct from ingestion time (recordedAt); ordering by per-partition monotonic sequence, never wall clock (PLX-EVT-011, 013, 022).
- A permission snapshot carried on each Event so replay evaluates access against the permissions of the time (PLX-EVT-012, 033).
- Transactional outbox: state mutation and its Event commit atomically, or not at all (PLX-EVT-014).
- Idempotent consumers tolerant of at-least-once and duplicate delivery (PLX-EVT-015).
- Large state carried as content digests, not inline (PLX-EVT-045, PLX-DOM-032); a maximum payload size is enforced, oversized Events rejected (PLX-EVT-036).

## Sequencing

The first Event Store lives in the desktop app over SQLite (local-first), as the real substrate the Context, Resume, and Graph engines consume. The multi-tenant, encrypted-at-rest, horizontally-partitioned server-side store (PLX-EVT-032, the full §49/§71 topology) is a later phase. New ids are UUIDv7 (PLX-DOM-010, already landed). The event pipeline is deterministic-first: deterministic processing completes before any AI is invoked, and AI unavailability never blocks Event processing (PLX-EVT-020/021).

## Still open (do not settle silently)

- Erasure vs immutable history (spec ADR-01 / RSK-01): resolved in principle by per-subject encryption keys and crypto-shred (PLX-EVT-034); the key-management design is not yet built.
- Schema evolution / upcasting (ADR-02 / RSK-02, PLX-EVT-035): the upcasting layer and JSON-schema registry (PLX-EVT-043/044) are deferred to a following increment.
- Partition key and hot-spot load modelling (ADR-03 / RSK-08, PLX-EVT-022): the deskId-or-objectId hybrid is implemented, but the large-Organisation-Desk load model is not yet done.
- Tenant isolation model per store (ADR-05 / RSK-05).

## Consequences

The Event Store becomes the spine of 4.0. It unblocks the Context Engine, Resume, Knowledge Graph, and the understanding metrics. It also obligates every future state-mutating feature to emit its Event, which the traceability harness (PLX-ENG-021) and, in time, the outbox gate will enforce.
