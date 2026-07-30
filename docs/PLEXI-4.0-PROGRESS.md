# Plexi 4.0 Progress

Last updated 2026-07-30.

This document tracks the Plexi 4.0 upgrade, which aligns the shipping product to the normative specification in `plexi-spec` (PLEXI-0001 v2.0). It is the single place to see every deliverable and where it stands, and it is updated as work lands. All work is on the `plexi-4.0` branch of `saasmouth/focusbuddy` and runs alongside the existing product rather than replacing it, so nothing here has shipped to users yet.

The upgrade turns the product from CRUD-on-SQLite into an event-sourced Context OS. Every meaningful state change becomes an immutable Event, and the brain (Context Health, relationships, decisions, resume) is projected from that log. The measure of progress is requirement-to-test traceability: every requirement implemented is cited by a test named for its id, which the harness at `scripts/spec-trace.mjs` counts. Run `npm run spec:trace` for the live number.

## Traceability snapshot

175 of 344 requirements are traceable to a passing test (50.9 percent), up from 2 at the start of the upgrade. 190 spec-cited unit tests plus the Context Engine end-to-end specs are green, and both the main and web typechecks are clean.

| Area | Covered | Notes |
|---|---|---|
| DOM (domain) | 20 / 20 | Complete. Identity, deletion, provenance, schema versioning, uniform object handling, canonical entity model, sessions. |
| PRD (product) | 35 / 36 | Object model, desk lifecycle/sharing, memory, resume, awareness, deactivation. Remaining is visual-layout persistence (shipping app). |
| EVT (events) | 23 / 24 | Contract, store, processing soundness, schema evolution, schema registry. Remaining is encryption-at-rest (deployment). |
| AI | 20 / 24 | Orchestrator, routing, prompt scoping, accounting, caches, ceilings, advisory guards. Remaining are live-eval/regulatory (AI-004/031/045). |
| CTX (context) | 15 / 16 | Materiality, health, propagation, freshness, versioned context objects. Remaining is a performance-budget verification. |
| GPH (graph) | 11 / 12 | Relationships, traversal, isolation, replay. Remaining is async community detection. |
| RES (resume) | 10 / 12 | Deterministic pipeline. Remaining are AI-summary calibration and permission-filtered render. |
| SEC (security) | 9 / 14 | Isolation, permissions, erasure. Remaining are residency, customer keys, secrets vault. |
| DATA | 6 / 9 | Projections, inventory, retention, store ownership. Remaining are backup/PITR procedures. |
| ENG | 5 / 11 | Traceability, invariant detection, contract + replay tests. Remaining need CI/chaos/eval infrastructure. |
| ARC | 4 / 6 | Store ownership, service boundaries, concurrency, deterministic degradation. Remaining need service-contract publishing. |
| UX | 16 / 40 | Health states, resume card, disclosure path, evidence, confidence, provenance. Remaining are UI-presence and visual rules. |
| APP | 1 / 10 | Foundational touches only. |
| A11Y, AGT, API, CON, EXT, MET, OPS, PERF, PRIN, SCH, SYN | 0 | Need UI, live subsystems, production instrumentation, or a cloud backend. |

## Deliverables

Status values are Done, meaning built and covered by passing tests and, where it touched the live app, verified end to end; In progress; Deferred, meaning blocked on an operator decision named in the decisions section; and Planned.

### Foundation

| Deliverable | Status | Commit | What it gives us |
|---|---|---|---|
| Spec vault as contract of record | Done | 35adf39 | The normative spec and its machine index live in the repo. |
| Traceability harness + UUIDv7 ids | Done | 91581e8 | `npm run spec:trace` gauges alignment; client-generable time-ordered ids (DOM-010). |
| Append-only Event Store | Done | efb407a | Immutable log, CloudEvents envelope, transactional outbox, 15 EVT requirements. |

### The brain

| Deliverable | Status | Commit | What it gives us |
|---|---|---|---|
| Context Engine keystone | Done | 314611f | Deterministic materiality scoring and inferred-context provenance (no AI on the path). |
| Relationship entity | Done | edf79c4 | Evidence-backed graph edges, closed type registry, provisional-to-confirmed lifecycle. |
| Context Health propagation | Done | 8402629 | Bounded, cycle-safe, incremental propagation with visible truncation and auditable transitions. |
| Decision entity + alerts | Done | 31a6049 | Human-only ownership, advisory-only AI commentary, Decision-Risk that names the decision. |
| Context freshness + tunable thresholds | Done | 64d4d36 | Per-user freshness that decays with change not time and can never become a leaderboard. |
| Resume Engine | Done | 57b8f17 | Deterministic, model-optional catch-up pipeline, source-traceable and incremental. |

### Live and visible

| Deliverable | Status | Commit | What it gives us |
|---|---|---|---|
| Live Event emission + Context Health wire | Done | e456b50 | Desk create/update/delete emit real Events; honest per-user health. |
| Renderer surfaces (desk health strip) | Done | f872a30, 55991cf, 3f6c19e | The canvas shows what changed since last visit and related desks needing attention. |
| Event-sourced graph + projection rebuild | Done | 949c23b | The graph is a projection provably rebuildable from the log (validates ADR-0001). |

### Domain model

| Deliverable | Status | Commit | What it gives us |
|---|---|---|---|
| Universal Object model + runtime type registry | Done | 55c04af | One object schema with type data in a typed payload (PRD-010); types register at runtime (PRD-011); no type is privileged in storage/permission/event/versioning/health (DOM-020); materialised refs are not the source of record (DOM-013); inferred objectives stay unconfirmed until accepted (DOM-022). |
| Desk model — lifecycle, archetype, sharing, presence | Done | e12ea6e | State machine with machine-readable invalid-transition errors (PRD-004); mutable archetype, no migration (PRD-003); sharing keeps owning desk (PRD-060); most-restrictive effective permissions (PRD-061/DOM-031); visible sync mode (PRD-062); federated owner approval (PRD-063). |
| Workspace Memory | Done | 4de43ce | Automatic capture with no save action (PRD-030); session snapshots (PRD-031); non-destructive, expandable compression (PRD-032/033); auditable retention that never prunes Events (PRD-034); embed-or-record-exclusion (PRD-014); optional intent (PRD-023). |
| Resume-PRD, cross-desk awareness, deactivation | Done | 66a362b | Continuous automatic resume that states insufficiency plainly (PRD-040/044); permission-filtered awareness that never leaks a hidden subject (PRD-070/071); deactivation keeps authored records and reassigns ownership (PRD-072). |
| Foundational standards | Done | 1a5ef92 | Canonical entity model (DOM-001/002); single-owner stores (DATA-001/ARC-001/002); concurrency via idempotency (ARC-010); versioned Context Objects (CTX-001); sessions (DOM-051); machine-checkable traceability + invariant-detection registry (ENG-001/021). |
| AI Orchestrator + governance | Done | 8812495 | Single model abstraction with capability-aware routing (AI-001/002/003), permission-scoped prompt assembly (AI-006/010/012), invocation accounting (AI-007/013/020), digest caches (AI-021/022), cost ceilings (AI-030), advisory + human-in-loop guards (AI-040/041/042/046). |
| Resume Card + presentation logic | Done | 9d9075b | Complete disclosure path (UX-051), materiality ordering (UX-013), evidence per assertion (UX-014/015), documented calibrated confidence (UX-052/063), semantic/presentation separation (UX-090). |

### Security and privacy

| Deliverable | Status | Commit | What it gives us |
|---|---|---|---|
| AI governance | Done | 1497482 | Provenance that never downgrades, structured grounding, digest cache, proposal-not-write, deterministic fallback. |
| Graph idempotency + curation | Done | 6b37506 | Replay-safe writes; auto-discovery with human confirm/correct. |
| Tenant isolation + permission-filtered traversal | Done | 195e9a4 | Org-bound graph, no cross-org results, no existence leak through counts (ADR-0002, INV-06). |
| Isolation across all stores + permission expiry/audit | Done | db7b4a0 | Event and decision stores org-bound; grants expire and fail closed; auditable authorisation. |
| Cryptographic erasure + data inventory + DSAR | Done | e430e7a | Real right-to-erasure that keeps the audit trail (ADR-0003, §44.1). |
| Event-processing soundness | Done | 5504a7e | Historical-permission replay, out-of-order and duplicate tolerance, encrypted event payloads. |
| Schema evolution / upcasting | Done | 6e4103b | Read-time, versioned, chained upcasting; never fabricates absence; wired into the store read path (ADR-0004). |
| Event JSON-Schema registry + validation | Done | be62f77 | Every produced Event type has a published, versioned schema at a stable dataschema URI; a dependency-free validator; the test suite is the CI gate that fails on an unschema'd or malformed producer (EVT-043/044). |

### Planned and deferred

| Deliverable | Status | Blocking decision |
|---|---|---|
| Live AI wiring (resume summary + relationship discovery) | Planned, next | Needs a live model key; the whole governance/orchestrator layer is ready. |
| Resume AI summary (stage 6) surfaced in UI | Planned | Depends on live AI wiring. |
| Remaining UX presence/visual rules | Planned | Mostly UI-verification; the data-side logic is done. |
| Backup / restore / PITR procedures | Planned | DATA-005; partly exists in the shipping app. |
| Performance budgets | Deferred | Need production instrumentation to claim honestly (PERF, CTX-014, RES-022). |
| Cross-org sync / cloud topology, partition load | Deferred | RSK-08 and cloud ADRs, foreclosing; do not bind the desktop build. |
| Residency, customer-managed keys, secrets vault | Deferred | Cloud/enterprise scope (SEC-024/025/026). |
| Merge plexi-4.0 toward the shipping product | Deferred | Operator decision on timing and rollout. |

## Architectural decisions

| ADR | Decision | Status |
|---|---|---|
| ADR-0001 | Adopt event sourcing as the 4.0 foundation. | Accepted (operator). |
| ADR-0002 | Tenant isolation for the desktop build: organisationId enforced at the store layer by construction. Cloud topology left open. | Accepted (operator-delegated), overridable before merge. |
| ADR-0003 | Cryptographic erasure with per-subject keys for the desktop build. Cloud KMS left open. | Accepted (operator-delegated), overridable before merge. |
| ADR-0004 | Event schema evolution: read-time, versioned, chained upcasting; never fabricate absence. | Accepted (operator-delegated), overridable before merge. |

## Decisions still owned by the operator

These are foreclosing decisions from the spec risk register. They have been flagged rather than settled silently, and each is cheapest to decide now, before any production data exists on the new schema.

Three of the five foreclosing decisions are now recorded: tenant isolation (ADR-0002), cryptographic erasure and key management (ADR-0003), and schema evolution (ADR-0004). The two identifier and permission-snapshot decisions of §85.2 were settled in the Event Store foundation.

What remains open is not required for the desktop build: the partition-load model (RSK-08), the cloud multi-tenant topology (siloed versus pooled graph and vector stores), and data residency and customer-managed keys. The last operator call is when and how the branch merges toward the shipping product, since it is a large architectural addition that currently runs beside the existing paths.

## How this document is maintained

Update the table rows and the traceability snapshot whenever a deliverable changes state, and refresh the date line. The authoritative numbers come from `npm run spec:trace`; do not hand-invent a coverage figure. When an operator decision is made, move the item out of the deferred section and record the ADR.
