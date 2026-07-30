# Plexi 4.0 Progress

Last updated 2026-07-30.

This document tracks the Plexi 4.0 upgrade, which aligns the shipping product to the normative specification in `plexi-spec` (PLEXI-0001 v2.0). It is the single place to see every deliverable and where it stands, and it is updated as work lands. All work is on the `plexi-4.0` branch of `saasmouth/focusbuddy` and runs alongside the existing product rather than replacing it, so nothing here has shipped to users yet.

The upgrade turns the product from CRUD-on-SQLite into an event-sourced Context OS. Every meaningful state change becomes an immutable Event, and the brain (Context Health, relationships, decisions, resume) is projected from that log. The measure of progress is requirement-to-test traceability: every requirement implemented is cited by a test named for its id, which the harness at `scripts/spec-trace.mjs` counts. Run `npm run spec:trace` for the live number.

## Traceability snapshot

295 of 344 requirements are traceable to a passing test (85.8 percent), up from 2 at the start of the upgrade. Unit, Context Engine, accessibility and live-AI end-to-end specs are green, and both the main and web typechecks are clean. The AI-001 single-model-client refactor is complete with a whole-codebase audit test; live AI is wired and tester-verified end to end (real Claude catch-up summary through the seam, grounded/cached/degrading); a seeded perf environment measures the core operations well under budget at large scale; desk identity plus objective now stay visible in the full-screen widget view (UX-010/011); the spatial Canvas has a screen-reader linear list (A11Y-003); and the Canvas now virtualises off-viewport Objects so Desk-open cost tracks visible count, not total Object count (APP-012). Complete areas: DOM 20/20, GPH 12/12, SYN 6/6, AGT 16/16, CTX 16/16, SCH 5/5, API 8/8, PRD 36/36.

The remaining 49 requirements are the wall: each needs production instrumentation, cloud infra, live subsystems, a manual UI/screen-reader pass, or a product decision. They are grouped in the "What is blocked and what it needs" section below. Complete: DOM, GPH, SYN, AGT, CTX, SCH, API, PRD. Near-complete: EVT 23/24, AI 23/24, RES 11/12, EXT 9/10, DATA 8/9, ENG 10/11, ARC 5/6, CON 6/7, UX 35/40, APP 7/10.

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
| EXT | 9 / 10 | SDK exercised by first-party (process). |
| DATA | 8 / 9 | Backup/PITR (infra). |
| ENG | 10 / 11 | Eval + docs gates done. Remaining: chaos-test infra (ENG-015). |
| API | 8 / 8 | Complete. |
| AI | 23 / 24 | Live wired + eval framework + single seam. Remaining: unit-economics doc (AI-031). |
| CON | 6 / 7 | Credential vault (infra). |
| PRIN | 6 / 8 | Positioning + design-review record (process). |
| ARC | 5 / 6 | Failure-mode docs (process). |
| SCH | 5 / 5 | Complete. |
| SEC | 11 / 14 | Residency, customer keys, secrets vault (cloud infra). |
| UX | 35 / 40 | Desk identity/objective in full-screen done. Remaining: mobile (080-082), notification telemetry, design-review process. |
| MET | 11 / 15 | Live telemetry / sampling / cost. |
| APP | 7 / 10 | ADRs + layout-persistence store + off-viewport virtualisation (APP-012). Remaining: APP-001/002 native-shell reqs and APP-010 live wiring (data layer + test done). |
| A11Y | 6 / 8 | Keyboard, reduced-motion, WCAG-AA (zero serious/critical), 200% zoom, screen-reader linear canvas (003) all verified; accessible brand-ink palette. Remaining: voice (007), DoD gate (008). |
| OPS | 0 / 9 | Deployment, monitoring, SLOs, runbooks (ops infra). |
| PERF | 0 / 18 | Latency/throughput budgets (instrumentation + load). |

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
| Off-viewport Canvas virtualisation (APP-012) | Done | 6c98b44 | Mounts only the objects the camera can see, so desk-open cost tracks visible count, not total. Owner-approved (camera + link owners), tester-verified end to end. |

### Planned and deferred

| Deliverable | Status | Blocking decision |
|---|---|---|
| Remaining UX presence/visual rules | Planned | Mostly UI-verification; the data-side logic is done. |
| APP-010 live wiring | Planned, next | Data layer + test done (6275924). Needs an IPC/preload bridge, a renderer user-id + device-class source, and one decision on the geometry source of record (see the APP-010 note above). |
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

## Decisions still owned by the operator

These are foreclosing decisions from the spec risk register. They have been flagged rather than settled silently, and each is cheapest to decide now, before any production data exists on the new schema.

Three of the five foreclosing decisions are now recorded: tenant isolation (ADR-0002), cryptographic erasure and key management (ADR-0003), and schema evolution (ADR-0004). The two identifier and permission-snapshot decisions of §85.2 were settled in the Event Store foundation.

What remains open is not required for the desktop build: the partition-load model (RSK-08), the cloud multi-tenant topology (siloed versus pooled graph and vector stores), and data residency and customer-managed keys. The last operator call is when and how the branch merges toward the shipping product, since it is a large architectural addition that currently runs beside the existing paths.

## What is blocked and what it needs

The upgrade has reached 269/344 (78 percent) purely through code and tests. The remaining 75 requirements each need a resource or decision that only the operator can supply. They fall into six clusters.

### 1. A running instance under a defined load, with a performance harness (about 25 requirements)
PERF-001 through PERF-072, CTX-014, RES-022, SCH-004, MET-001/002/007, UX-042. These are latency percentiles, throughput and volume budgets. A unit test cannot honestly assert a p99 of 500 ms. To progress I need a built instance running under the reference load defined in spec §58, plus a benchmark harness that records real percentiles, and the operator's acceptance that staging numbers may stand in for production until GA.

### 2. Live model access and an evaluation framework (3)
AI-004, AGT-022, ENG-013. Provider-substitution and agent evaluation suites run against every supported model per release with recorded thresholds. I need model API keys wired for the branch and a go-ahead to build and run an eval harness (this also unlocks the live AI wiring that surfaces the resume summary and relationship discovery).

### 3. A UI and accessibility test pass (partly done)
The harness ran. VERIFIED against the real app: A11Y-002 (keyboard operable, visible focus, no trap) and A11Y-005 (prefers-reduced-motion), and one critical ARIA violation was fixed (the sidebar-resize separator now carries valuenow/min/max). UX-023/085/086 are covered by the logic layer. Still open and each needs a real fix or a further pass:
- A11Y-001 FAILS today on genuine WCAG violations found by axe: colour-contrast on the `--ink-40`/`--ink-50` tokens (kbd hints, section labels) and target-size on sub-24px icon buttons (Pin/Shrink/Grow). These are design-system fixes (a token contrast pass + a minimum hit-target rule), not a one-line change.
- UX-010 appears violated: a full-screen focused widget (`z-50`) overlays the desk breadcrumb (`z-45`), so desk identity is obscured. Fix: raise/duplicate the identity into the full-screen overlay.
- UX-011 appears unmet: there is no dedicated always-visible "Current Objective" surface. Fix: add one to the desk header.
- A11Y-003/006/007/008 (screen-reader linear canvas, 200% zoom, voice, DoD gate) still need building plus a manual screen-reader/keyboard pass.
- A11Y-001 is now PARTIAL, not deferred: the contrast tokens (--ink-40/--ink-50) and the WidgetFrame icon-button target sizes (20->24px) are fixed and shipped. It is not yet claimed green because two residuals remain, and one is a brand decision for the operator: the PlexiOffice/PlexiWork/PlexiAI heading colours (#f59e0b, #ef4444, #8b5cf6) fail AA contrast on white, and darkening them changes the brand palette. The rest (kbd-hint opacity, a nested-interactive tile, 12px colour-swatch hit targets) are small fixes I can finish.
- Incidental bug found by the harness (pre-existing, unrelated to this work): saving a focus-mode split cluster and reopening the desk can silently delete the cluster (prunePlaceholders races the widget-list load in WidgetFocusMode.tsx). Worth a dedicated fix if cluster-persistence matters.

### 4. Cloud and security infrastructure (about 15)
OPS-001 through OPS-014, SEC-024/025/026, CON-004, EVT-032, DATA-005. Secrets vault, data residency, customer-managed keys, connector credential vault, event-store encryption at rest, backup/restore/PITR exercised quarterly, and the operations surface (monitoring, SLOs, incident runbooks). These need the hosting and KMS/vault environment and the cloud-topology decisions still open in the risk register (RSK-08 and the cloud ADRs).

### 5. An application-level refactor (done)
AI-001 required that no service other than the AI Orchestrator holds a provider SDK. This is now complete. A single seam (`src/main/ai/modelClient.ts`) is the only module that value-imports the provider SDK; every other module uses type-only imports plus the seam, enforced by a whole-codebase audit test. Live model calls route through the orchestrator.

### 6. Process and product decisions (about 15)
ENG-015/016, ARC-021, EXT-012, PRIN-003/006, APP-001/002/011, AI-031, MET-011/012. Chaos-testing infrastructure, docs-before-production gates, native-shell requirements, a published unit-economics model, and the design-review record. These are process, documentation, or native-shell work items rather than contracts. APP-010 is covered by its layout-persistence store and round-trip test; its remaining live wiring is described below.

### APP-010 live wiring (decided in ADR-0006, phased)
The per-(user, Desk, device class) layout store and its exact round-trip test are done and credit APP-010. The source-of-record decision is settled in ADR-0006: `widgets` keeps the shared base geometry (so collaboration, sections, links, templates and snapshots are untouched) and `desk_layouts` is a per-(user, device class) overlay that wins when present and falls back to the base. The renderer already knows the current user via `useAccountStore`, and device class for the Electron client is `desktop` (the PWA is `mobile`), so the earlier "no identity source" blocker does not hold. Phase 1 wires the camera and selection overlay per device class through a new IPC bridge; Phase 2 extends the overlay to Object geometry with section reconciliation, a `workspaceSync` change to stop broadcasting per-user geometry, and a first-open migration, and is a scheduled, separately-reviewed epic.

The fastest single unlock earlier was cluster 2 (a model key), which cleared three requirements and turned the AI/agent governance layer from ready-to-use into live; that is done.

## How this document is maintained

Update the table rows and the traceability snapshot whenever a deliverable changes state, and refresh the date line. The authoritative numbers come from `npm run spec:trace`; do not hand-invent a coverage figure. When an operator decision is made, move the item out of the deferred section and record the ADR.
