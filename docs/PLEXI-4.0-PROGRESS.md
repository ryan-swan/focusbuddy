# Plexi 4.0 Progress

Last updated 2026-07-30.

This document tracks the Plexi 4.0 upgrade, which aligns the shipping product to the normative specification in `plexi-spec` (PLEXI-0001 v2.0). It is the single place to see every deliverable and where it stands, and it is updated as work lands. All work is on the `plexi-4.0` branch of `saasmouth/focusbuddy` and runs alongside the existing product rather than replacing it, so nothing here has shipped to users yet.

The upgrade turns the product from CRUD-on-SQLite into an event-sourced Context OS. Every meaningful state change becomes an immutable Event, and the brain (Context Health, relationships, decisions, resume) is projected from that log. The measure of progress is requirement-to-test traceability: every requirement implemented is cited by a test named for its id, which the harness at `scripts/spec-trace.mjs` counts. Run `npm run spec:trace` for the live number.

## Traceability snapshot

306 of 344 requirements are traceable to a passing test (89.0 percent), up from 2 at the start of the upgrade. Unit, Context Engine, accessibility and live-AI end-to-end specs are green, and both the main and web typechecks are clean. The AI-001 single-model-client refactor is complete with a whole-codebase audit test; live AI is wired and tester-verified end to end (real Claude catch-up summary through the seam, grounded/cached/degrading); a seeded perf environment measures the core operations well under budget at large scale; desk identity plus objective stay visible in the full-screen widget view (UX-010/011); the spatial Canvas has a screen-reader linear list (A11Y-003) released concurrently with the spatial surface (APP-011); the Canvas virtualises off-viewport Objects (APP-012) and persists per-(user, device class) layout live (APP-010 Phase 1 + 2a); and a gap-fill pass closed every remaining buildable requirement with a real artifact (failure-modes doc ARC-021, native-app ADR APP-001/PRIN-003, design-review record PRIN-006/UX-001, DoD gate A11Y-008, SDK conformance EXT-012, unit-economics model AI-031, deterministic-fallback PERF-072, mobile layout isolation UX-081). Complete areas: DOM 20/20, GPH 12/12, SYN 6/6, AGT 16/16, CTX 16/16, SCH 5/5, API 8/8, PRD 36/36, AI 24/24, ARC 6/6, EXT 10/10, PRIN 8/8.

The remaining 38 requirements are the wall, and they are genuinely blocked rather than unbuilt: each needs production instrumentation, cloud infra, live subsystems, a manual voice/mobile pass, or an operator decision, and none can be closed honestly without one of those. They are grouped in the "What is blocked and what it needs" section below. Near-complete: EVT 23/24, RES 11/12, DATA 8/9, ENG 10/11, CON 6/7, A11Y 7/8, APP 9/10, UX 37/40.

| Area | Covered | Remaining needs |
|---|---|---|
| DOM | 20 / 20 | Complete. |
| GPH | 12 / 12 | Complete. |
| SYN | 6 / 6 | Complete. |
| PRD | 36 / 36 | Complete. |
| EVT | 23 / 24 | Encryption-at-rest (infra). |
| AGT | 16 / 16 | Complete. |
| CTX | 16 / 16 | Complete. |
| RES | 11 / 12 | Catch-up calibration (observed data). |
| EXT | 10 / 10 | Complete. SDK conformance proves every public interface has a first-party caller (EXT-012). |
| DATA | 8 / 9 | Backup/PITR (infra). |
| ENG | 10 / 11 | Eval + docs gates done. Remaining: chaos-test infra (ENG-015). |
| API | 8 / 8 | Complete. |
| AI | 24 / 24 | Complete. Live wired + eval framework + single seam + published unit-economics model (AI-031). |
| CON | 6 / 7 | Credential vault (infra). |
| PRIN | 8 / 8 | Complete. Native-app build-vs-integrate ADR (PRIN-003) + design-review record (PRIN-006). |
| ARC | 6 / 6 | Complete. Failure-modes-and-recovery doc per service (ARC-021). |
| SCH | 5 / 5 | Complete. |
| SEC | 11 / 14 | Residency, customer keys, secrets vault (cloud infra). |
| UX | 37 / 40 | Design-review cognitive-load record (001) + mobile layout isolation (081) done. Remaining: mobile Resume/capture (080/082), notification telemetry (042). |
| MET | 11 / 15 | Live telemetry / sampling / cost. |
| APP | 9 / 10 | Layout persistence + virtualisation (012) + APP-010 Phase 1/2a live + linear canvas concurrent (011) + native-app ADR (001). Remaining: APP-002 (whole-app native-interface parity). |
| A11Y | 7 / 8 | Keyboard, reduced-motion, WCAG-AA, 200% zoom, screen-reader linear canvas (003), DoD gate (008) all done. Remaining: voice (007). |
| OPS | 0 / 9 | Deployment, monitoring, SLOs, runbooks (ops infra). |
| PERF | 6 / 18 | Deterministic-fallback (072) + seeded core-op budgets done. Remaining: production-measured latency/throughput targets (instrumentation + load). |

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

### Native applications, accessibility and performance

| Deliverable | Status | Commit | What it gives us |
|---|---|---|---|
| Single model-client seam (AI-001) | Done | a6562e9 | One module value-imports the provider SDK; every other module uses the seam, enforced by a whole-codebase audit test. |
| Live resume summary through the seam | Done | 5e1d7e5 | Real Claude catch-up summary grounded in the structured resume, digest-cached, degrading honestly without a key. Tester-verified end to end. |
| Seeded perf environment + benchmark | Done | f620987 | Small/medium/large workspace seeds and a percentile harness; core operations measured well under budget at large scale (7 reqs; CTX and SCH complete). |
| Full-screen desk identity + objective (UX-010/011) | Done | 81e0b78 | Desk title and objective stay visible in the full-screen widget view, in single and grid modes. |
| Accessible brand-ink palette, WCAG-AA (A11Y-001/006) | Done | 6652ef0 | Home and Desk pass axe with zero serious or critical findings, including at 200% zoom, via same-hue accessible ink tokens. |
| Screen-reader linear canvas (A11Y-003) | Done | 137711e | The spatial canvas exposes an equivalent ordered, keyboard-navigable list of its objects in a visually-hidden landmark. |
| Desk layout persistence store (APP-010 data layer) | Done | 6275924 | Per-(user, desk, device class) position, size, z-order, scroll, selection and zoom, with an exact round-trip (PRD-002). |
| Desk camera + selection overlay, live (APP-010 Phase 1) | Done | f371408 | Per-(user, device class) camera + selection restored on Desk open, saved on user action, via a new IPC bridge (ADR-0006). Reentrancy-safe (loadToken). Camera-owner-approved; tester + e2e verified. |
| Opt-in per-device Object-geometry overlay (APP-010 Phase 2a) | Done | 39777c6 | Opt-in "customise this device's layout" per Desk (default off = no change). When on, a user's position/size changes for eligible top-level Objects route to their personal overlay, stay private (never sync), and restore on reopen; sections, section children, pinned and z-order stay shared. Section-owner-confirmed; tester + e2e verified (opted-in move leaves the shared base untouched). |
| Off-viewport Canvas virtualisation (APP-012) | Done | 6c98b44 | Mounts only the objects the camera can see, so desk-open cost tracks visible count, not total. Owner-approved (camera + link owners), tester-verified end to end. |
| Per-widget Context Health frames (UX-022 at object level) | Done | 78741ed | A widget wears a coloured frame + labelled dot for how it changed since last visit (current/changed/attention/decision-risk). Made real by wiring widgets as first-class event producers (content-only), widget-id health derivation and materialityForWidget. Tester-verified. |
| Decision creation + live decision-risk frame | Done | 8b9d7ca | Right-click "Flag as a decision" creates a human-owned Decision (undoable) referencing the widget + desk; a later content change turns the frame red and names the decision. Activates the previously-dormant decision-risk surface. decisions:* IPC + preload. Tester-verified. |

### Planned and deferred

| Deliverable | Status | Blocking decision |
|---|---|---|
| Remaining UX presence/visual rules | Planned | Mostly UI-verification; the data-side logic is done. |
| APP-010 Phase 2b (z-order + section-child geometry) | Planned | Phase 1 (camera + selection, f371408) and Phase 2a (opt-in per-device position/size overlay, 39777c6) are shipped and live. Phase 2b would add per-user z-order and per-user section-child geometry (the section engine makes the latter non-trivial, section-owner). Neither is exercisable until a second spatial device-class client (tablet) exists, so it is deferred. No workspaceSync change or migration was needed for 2a (per-user moves simply never reach the widgets table). |
| Backup / restore / PITR procedures | Planned | DATA-005; partly exists in the shipping app. |
| Production performance budgets | Deferred | Seeded env measures under budget (f620987); the remaining PERF requirements need production instrumentation to claim honestly (PERF, CTX-014, RES-022). |
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
| ADR-0005 | Deployment topology: Plexi stays local-first (Electron + on-device SQLite); Vercel/Fly stay sync and web infrastructure, not a cloud app backend; cloud-only requirements deferred. | Accepted (operator-delegated), overridable before merge. |
| ADR-0006 | Desk layout source of record: `widgets` keeps the shared base geometry (collaboration, sections, links, snapshots unchanged); `desk_layouts` is a per-(user, device class) overlay that wins when present. Phase 1 = camera + selection overlay (now); Phase 2 = object-geometry overlay + section reconciliation + migration (scheduled epic). | Accepted (operator-delegated), overridable before merge. |
| ADR-0007 | Native applications (Canvas, Office editors) justified against the §76.3 build-versus-integrate test: affirmative on contextual continuity and first-class graph participation; cost/licensing/owning-the-surface rejected as invalid. Platform does not position as a replacement for specialist apps (APP-001, PRIN-003). | Accepted (operator-delegated), overridable before merge. |

## Decisions still owned by the operator

These are foreclosing decisions from the spec risk register. They have been flagged rather than settled silently, and each is cheapest to decide now, before any production data exists on the new schema.

Three of the five foreclosing decisions are now recorded: tenant isolation (ADR-0002), cryptographic erasure and key management (ADR-0003), and schema evolution (ADR-0004). The two identifier and permission-snapshot decisions of §85.2 were settled in the Event Store foundation.

What remains open is not required for the desktop build: the partition-load model (RSK-08), the cloud multi-tenant topology (siloed versus pooled graph and vector stores), and data residency and customer-managed keys. The last operator call is when and how the branch merges toward the shipping product, since it is a large architectural addition that currently runs beside the existing paths.

## What is blocked and what it needs

The upgrade has reached 306/344 (89 percent) purely through code, tests and documentation. A gap-fill pass closed every remaining requirement that was buildable now with a real artifact. The remaining 38 are genuinely blocked, not merely unbuilt: each needs a resource or decision that code alone cannot supply, and faking any of them would violate the no-fakery rule. They fall into five clusters.

### 1. Production instrumentation under a defined load (about 18)
The remaining PERF targets (production-measured p50/p95/p99 latency and throughput), MET-001/002/007/011 (resume accuracy, context-reconstruction time, search reduction, infra cost per active user), RES-022 (catch-up calibration against observed reconstruction time), UX-042 (interruptive-notification volume per release). A unit test cannot honestly assert a production p99 or a real active-user cost. What is done at this level is done: the seeded benchmark measures core operations under dev-scale load, PERF-072's deterministic fallback is proven, and the AI unit-economics model plus a cost calculator that reads real recorded invocations exist. To close the rest I need a built instance running under the spec §58 reference load with real telemetry, and acceptance that staging numbers may stand in until GA.

### 2. Cloud and security infrastructure (about 15)
OPS-001 through OPS-014 (containerised deploy, per-deployment isolation model, regional residency, topology-in-CI, OpenTelemetry, production SLIs and error budgets, per-tenant AI-cost observability, content-free logs, event/consumer lag alerts), SEC-024/025/026 (managed secrets vault with automatic rotation, data residency, customer-managed keys), CON-004 (connector credential vault), EVT-032 (event-store encryption at rest with tenant-scoped keys), DATA-005 (backup/restore/PITR exercised). These need the hosting, KMS and vault environment and the cloud-topology decisions still open in the risk register (RSK-08 and the cloud ADRs). They are deferred by ADR-0005, which keeps the product local-first; the local-applicable parts (secrets in the OS keychain, crypto-erasure of personal data in payloads, a desktop backup path) already exist.

### 3. Chaos-test infrastructure (1)
ENG-015: chaos testing across AI provider unavailability, event-bus partition loss, consumer lag and derived-store divergence. The AI-unavailability arm is already covered in spirit by the deterministic fallback (PERF-072) and the resume degradation tests, but the bus/partition/lag arms need a distributed failure-injection harness that the local-first build has no bus to exercise.

### 4. Voice and remaining mobile features (3)
A11Y-007 (voice interaction, dictation and transcription for Resume review, Decision approval and Object capture), UX-080 (Resume review and Decision approval fully functional on mobile with evidence disclosure), UX-082 (objects captured on mobile attributed to a Desk at capture time). These are real feature builds, speech recognition/synthesis and mobile-app surfaces, sizeable rather than blocked, and best scheduled deliberately. UX-081 (mobile layout never overwrites desktop) is already done.

### 5. Whole-app native-interface parity (1)
APP-002: every native application understands Desk context, Relationships, Workspace Memory, AI, permissions and Events, and uses the same public platform interfaces as marketplace extensions. The interfaces exist and are proven exercised (EXT-012), and ADR-0007 records the build-versus-integrate justification (APP-001), but crediting APP-002 honestly needs a per-application integration audit rather than a single test, which is its own scoped pass.

### Application-level refactor and process artifacts (done this arc)
AI-001 (single model seam), ARC-021 (failure-modes doc), APP-001/PRIN-003 (native-app ADR), PRIN-006/UX-001 (design-review record), A11Y-008 (DoD gate), EXT-012 (SDK conformance), AI-031 (unit-economics model) and PERF-072 (deterministic fallback) are all complete with real artifacts and gate tests, so the earlier "process and product decisions" cluster is closed apart from the items above.

### APP-010 live wiring (decided in ADR-0006, phased)
The per-(user, Desk, device class) layout store and its exact round-trip test are done and credit APP-010. The source-of-record decision is settled in ADR-0006: `widgets` keeps the shared base geometry (so collaboration, sections, links, templates and snapshots are untouched) and `desk_layouts` is a per-(user, device class) overlay that wins when present and falls back to the base. The renderer already knows the current user via `useAccountStore`, and device class for the Electron client is `desktop` (the PWA is `mobile`), so the earlier "no identity source" blocker does not hold. Phase 1 is shipped (f371408): a new IPC bridge restores the camera and selection overlay per device class on Desk open and persists it on user action, so a Desk reopens where the user left it and a tablet never overwrites a desktop arrangement (UX-032). It was reviewed by canvas-camera-owner (two reentrancy race fixes applied on review) and verified against the built app by plexidesk-tester and a durable e2e spec. Phase 2a is shipped (39777c6): an opt-in "customise this device's layout" per Desk that routes a user's position/size changes for eligible top-level Objects to their personal overlay when opted in, so they stay private and restore on reopen, while sections, section children, pinned Objects and z-order stay shared. It needed no `workspaceSync` change and no migration, because per-user moves simply never reach the `widgets` table and so never enter the sync pipeline, and existing table geometry is the shared base. It was confirmed by section-owner and verified against the built app by plexidesk-tester through the real UI. Phase 2b (per-user z-order and per-user section-child geometry) is deferred because neither is exercisable until a second spatial device-class client exists.

The fastest single unlock earlier was cluster 2 (a model key), which cleared three requirements and turned the AI/agent governance layer from ready-to-use into live; that is done.

## How this document is maintained

Update the table rows and the traceability snapshot whenever a deliverable changes state, and refresh the date line. The authoritative numbers come from `npm run spec:trace`; do not hand-invent a coverage figure. When an operator decision is made, move the item out of the deferred section and record the ADR.
