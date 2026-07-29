---
type: requirement-register
area: PERF
domain: "Performance"
count: 18
tags:
  - requirements
  - area/perf
---

# REQ-PERF — Performance

18 normative requirements. Identifiers are permanent and never reused.

> [!important] For Claude Code
> Every requirement below is binding. Cite the ID in the test name that verifies it (`test_plx_perf_001_*`) so [[S74 Definition of Done|§74]] gate 13 (requirement-to-test traceability) can be machine-checked.

| ID | § | V | Summary |
|---|---|---|---|
| [[#PLX-PERF-001]] | §58 | A | Desk open — first meaningful paint of Resume Card and layout — p50 600 ms, p95 1.5 s, p99 2.0 s. Measured: Gateway ingress → last  |
| [[#PLX-PERF-002]] | §58 | A | Desk open — full Object hydration — p50 1.5 s, p95 3.5 s, p99 5.0 s. Measured: Gateway ingress → all in-viewport Objects interacti |
| [[#PLX-PERF-010]] | §58 | A | Object open (in-Desk) — p50 150 ms, p95 400 ms, p99 800 ms. Measured: Gateway ingress → content available. |
| [[#PLX-PERF-011]] | §58 | A | Resume generation — deterministic stages 1–6 — p50 400 ms, p95 1.2 s, p99 2.0 s. Measured: Trigger Event → structured Resume persi |
| [[#PLX-PERF-012]] | §58 | A | Resume generation — including AI summary (stage 7) — p50 1.5 s, p95 3.5 s, p99 5.0 s. Measured: Trigger Event → Resume Object comp |
| [[#PLX-PERF-020]] | §58 | A | Context Health update — direct impact (depth 0–1) — p50 60 ms, p95 180 ms, p99 250 ms. Measured: Event ingestion → health state co |
| [[#PLX-PERF-021]] | §58 | A | Context Health update — propagated impact (depth 2–N, within bound) — p50 120 ms, p95 350 ms, p99 500 ms. Measured: Event ingestio |
| [[#PLX-PERF-022]] | §58 | A | Graph traversal, permission-filtered, depth ≤ 3 — p50 40 ms, p95 120 ms, p99 250 ms. Measured: Query ingress → result set. |
| [[#PLX-PERF-030]] | §58 | A | Event ingestion to Event Store durability — p50 15 ms, p95 50 ms, p99 120 ms. Measured: Emission → fsync acknowledged. |
| [[#PLX-PERF-031]] | §58 | A | Event Store → bus delivery to first subscriber — p50 20 ms, p95 80 ms, p99 200 ms. Measured: Store commit → subscriber receipt. |
| [[#PLX-PERF-040]] | §58 | A | Search, AI re-ranking disabled — p50 80 ms, p95 200 ms, p99 300 ms. Measured: Query ingress → ranked results. |
| [[#PLX-PERF-041]] | §58 | A | Semantic index freshness after content-changing Event — p50 2 s, p95 10 s, p99 30 s. Measured: Event → embedding queryable. |
| [[#PLX-PERF-042]] | §58 | A | Search, including AI re-ranking — p50 400 ms, p95 900 ms, p99 1.5 s. Measured: Query ingress → re-ranked results. |
| [[#PLX-PERF-050]] | §58 | A | AI recommendation, end to end — p50 2.5 s, p95 6 s, p99 10 s. Measured: Request → recommendation with evidence rendered. |
| [[#PLX-PERF-060]] | §58 | A | Authorisation decision — p50 3 ms, p95 10 ms, p99 25 ms. Measured: Policy query → decision. |
| [[#PLX-PERF-070]] | §58 | I, A | Every target in §58 MUST be continuously measured in production and alerted on. A target without production instrumentation MUST N |
| [[#PLX-PERF-071]] | §58 | I | Performance targets MUST be re-derived and republished whenever reference load assumptions change by more than one order of magnit |
| [[#PLX-PERF-072]] | §58 | T, A | Operations with an AI component MUST have a deterministic fallback that meets the corresponding non-AI target, so that AI latency  |

---

### PLX-PERF-001

Desk open — first meaningful paint of Resume Card and layout — p50 600 ms, p95 1.5 s, p99 **2.0 s**. Measured: Gateway ingress → last byte of initial payload.

| | |
|---|---|
| **Verification** | `A` |
| **Defined in** | [[S58 Performance Requirements|§58]] |
| **Derives from** | [[S58 Performance Requirements|§58]] |
| **Test name** | `test_plx_perf_001` |

### PLX-PERF-002

Desk open — full Object hydration — p50 1.5 s, p95 3.5 s, p99 5.0 s. Measured: Gateway ingress → all in-viewport Objects interactive.

| | |
|---|---|
| **Verification** | `A` |
| **Defined in** | [[S58 Performance Requirements|§58]] |
| **Derives from** | [[S58 Performance Requirements|§58]] |
| **Test name** | `test_plx_perf_002` |

### PLX-PERF-010

Object open (in-Desk) — p50 150 ms, p95 400 ms, p99 800 ms. Measured: Gateway ingress → content available.

| | |
|---|---|
| **Verification** | `A` |
| **Defined in** | [[S58 Performance Requirements|§58]] |
| **Derives from** | [[S58 Performance Requirements|§58]] |
| **Test name** | `test_plx_perf_010` |

### PLX-PERF-011

Resume generation — deterministic stages 1–6 — p50 400 ms, p95 1.2 s, p99 2.0 s. Measured: Trigger Event → structured Resume persisted.

| | |
|---|---|
| **Verification** | `A` |
| **Defined in** | [[S58 Performance Requirements|§58]] |
| **Derives from** | [[S58 Performance Requirements|§58]] |
| **Test name** | `test_plx_perf_011` |

### PLX-PERF-012

Resume generation — including AI summary (stage 7) — p50 1.5 s, p95 3.5 s, p99 **5.0 s**. Measured: Trigger Event → Resume Object complete.

| | |
|---|---|
| **Verification** | `A` |
| **Defined in** | [[S58 Performance Requirements|§58]] |
| **Derives from** | [[S58 Performance Requirements|§58]] |
| **Test name** | `test_plx_perf_012` |

### PLX-PERF-020

Context Health update — direct impact (depth 0–1) — p50 60 ms, p95 180 ms, p99 **250 ms**. Measured: Event ingestion → health state committed.

| | |
|---|---|
| **Verification** | `A` |
| **Defined in** | [[S58 Performance Requirements|§58]] |
| **Derives from** | [[S58 Performance Requirements|§58]] |
| **Test name** | `test_plx_perf_020` |

### PLX-PERF-021

Context Health update — propagated impact (depth 2–N, within bound) — p50 120 ms, p95 350 ms, p99 **500 ms**. Measured: Event ingestion → all in-bound propagation committed.

| | |
|---|---|
| **Verification** | `A` |
| **Defined in** | [[S58 Performance Requirements|§58]] |
| **Derives from** | [[S58 Performance Requirements|§58]] |
| **Test name** | `test_plx_perf_021` |

### PLX-PERF-022

Graph traversal, permission-filtered, depth ≤ 3 — p50 40 ms, p95 120 ms, p99 250 ms. Measured: Query ingress → result set.

| | |
|---|---|
| **Verification** | `A` |
| **Defined in** | [[S58 Performance Requirements|§58]] |
| **Derives from** | [[S58 Performance Requirements|§58]] |
| **Test name** | `test_plx_perf_022` |

### PLX-PERF-030

Event ingestion to Event Store durability — p50 15 ms, p95 50 ms, p99 120 ms. Measured: Emission → fsync acknowledged.

| | |
|---|---|
| **Verification** | `A` |
| **Defined in** | [[S58 Performance Requirements|§58]] |
| **Derives from** | [[S58 Performance Requirements|§58]] |
| **Test name** | `test_plx_perf_030` |

### PLX-PERF-031

Event Store → bus delivery to first subscriber — p50 20 ms, p95 80 ms, p99 200 ms. Measured: Store commit → subscriber receipt.

| | |
|---|---|
| **Verification** | `A` |
| **Defined in** | [[S58 Performance Requirements|§58]] |
| **Derives from** | [[S58 Performance Requirements|§58]] |
| **Test name** | `test_plx_perf_031` |

### PLX-PERF-040

Search, AI re-ranking disabled — p50 80 ms, p95 200 ms, p99 **300 ms**. Measured: Query ingress → ranked results.

| | |
|---|---|
| **Verification** | `A` |
| **Defined in** | [[S58 Performance Requirements|§58]] |
| **Derives from** | [[S58 Performance Requirements|§58]] |
| **Test name** | `test_plx_perf_040` |

### PLX-PERF-041

Semantic index freshness after content-changing Event — p50 2 s, p95 10 s, p99 30 s. Measured: Event → embedding queryable.

| | |
|---|---|
| **Verification** | `A` |
| **Defined in** | [[S58 Performance Requirements|§58]] |
| **Derives from** | [[S58 Performance Requirements|§58]] |
| **Test name** | `test_plx_perf_041` |

### PLX-PERF-042

Search, including AI re-ranking — p50 400 ms, p95 900 ms, p99 1.5 s. Measured: Query ingress → re-ranked results.

| | |
|---|---|
| **Verification** | `A` |
| **Defined in** | [[S58 Performance Requirements|§58]] |
| **Derives from** | [[S58 Performance Requirements|§58]] |
| **Test name** | `test_plx_perf_042` |

### PLX-PERF-050

AI recommendation, end to end — p50 2.5 s, p95 6 s, p99 **10 s**. Measured: Request → recommendation with evidence rendered.

| | |
|---|---|
| **Verification** | `A` |
| **Defined in** | [[S58 Performance Requirements|§58]] |
| **Derives from** | [[S58 Performance Requirements|§58]] |
| **Test name** | `test_plx_perf_050` |

### PLX-PERF-060

Authorisation decision — p50 3 ms, p95 10 ms, p99 25 ms. Measured: Policy query → decision.

| | |
|---|---|
| **Verification** | `A` |
| **Defined in** | [[S58 Performance Requirements|§58]] |
| **Derives from** | [[S58 Performance Requirements|§58]] |
| **Test name** | `test_plx_perf_060` |

### PLX-PERF-070

Every target in [[S58 Performance Requirements|§58]] **MUST** be continuously measured in production and alerted on. A target without production instrumentation **MUST NOT** be claimed as met.

| | |
|---|---|
| **Verification** | `I, A` |
| **Defined in** | [[S58 Performance Requirements|§58]] |
| **Derives from** | [[S58 Performance Requirements|§58]], new |
| **Test name** | `test_plx_perf_070` |

### PLX-PERF-071

Performance targets **MUST** be re-derived and republished whenever reference load assumptions change by more than one order of magnitude in any dimension.

| | |
|---|---|
| **Verification** | `I` |
| **Defined in** | [[S58 Performance Requirements|§58]] |
| **Derives from** | [[S58 Performance Requirements|§58]], new |
| **Test name** | `test_plx_perf_071` |

### PLX-PERF-072

Operations with an AI component **MUST** have a deterministic fallback that meets the corresponding non-AI target, so that AI latency degradation cannot breach a user-facing budget.

| | |
|---|---|
| **Verification** | `T, A` |
| **Defined in** | [[S58 Performance Requirements|§58]] |
| **Derives from** | [[S58 Performance Requirements|§58]], [[S48 Event Architecture|§48]], new |
| **Test name** | `test_plx_perf_072` |
