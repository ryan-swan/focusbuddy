---
id: S58
section: §58
title: "Performance Requirements"
part: V
type: section
defines:
  - PLX-PERF-001
  - PLX-PERF-002
  - PLX-PERF-010
  - PLX-PERF-011
  - PLX-PERF-012
  - PLX-PERF-020
  - PLX-PERF-021
  - PLX-PERF-022
  - PLX-PERF-030
  - PLX-PERF-031
  - PLX-PERF-040
  - PLX-PERF-041
  - PLX-PERF-042
  - PLX-PERF-050
  - PLX-PERF-060
  - PLX-PERF-070
  - PLX-PERF-071
  - PLX-PERF-072
tags:
  - section
  - part/v
---

# §58 Performance Requirements

◀ [[S57 Connector Framework]] · [[Part V — Platform Architecture|▲ Part V]] · [[S59 Architectural Invariants]] ▶

---

The source specification stated six latency targets without percentiles, measurement points or load conditions. A latency target lacking all three cannot be verified, cannot be alerted on, and cannot be defended in a customer conversation. They are restated below in verifiable form.

**Measurement conventions.** All figures are measured server-side from request ingress to response egress at the Workspace Gateway, excluding client render and network transit, unless stated otherwise. All figures are stated at **reference load**: a tenant of 5,000 users, 50,000 Desks, 5×10⁶ Objects, 10⁸ Events, sustained 500 Events/second, p95 Desk size of 40 Objects. Targets outside reference load are not specified and **MUST** be re-derived.

| ID | Operation | p50 | p95 | p99 | Measurement point | V |
|---|---|---|---|---|---|---|
| [[REQ-PERF#PLX-PERF-001|PLX-PERF-001]] | Desk open — first meaningful paint of Resume Card and layout | 600 ms | 1.5 s | **2.0 s** | Gateway ingress → last byte of initial payload | A |
| [[REQ-PERF#PLX-PERF-002|PLX-PERF-002]] | Desk open — full Object hydration | 1.5 s | 3.5 s | 5.0 s | Gateway ingress → all in-viewport Objects interactive | A |
| [[REQ-PERF#PLX-PERF-010|PLX-PERF-010]] | Object open (in-Desk) | 150 ms | 400 ms | 800 ms | Gateway ingress → content available | A |
| [[REQ-PERF#PLX-PERF-011|PLX-PERF-011]] | Resume generation — deterministic stages 1–6 | 400 ms | 1.2 s | 2.0 s | Trigger Event → structured Resume persisted | A |
| [[REQ-PERF#PLX-PERF-012|PLX-PERF-012]] | Resume generation — including AI summary (stage 7) | 1.5 s | 3.5 s | **5.0 s** | Trigger Event → Resume Object complete | A |
| [[REQ-PERF#PLX-PERF-020|PLX-PERF-020]] | Context Health update — direct impact (depth 0–1) | 60 ms | 180 ms | **250 ms** | Event ingestion → health state committed | A |
| [[REQ-PERF#PLX-PERF-021|PLX-PERF-021]] | Context Health update — propagated impact (depth 2–N, within bound) | 120 ms | 350 ms | **500 ms** | Event ingestion → all in-bound propagation committed | A |
| [[REQ-PERF#PLX-PERF-022|PLX-PERF-022]] | Graph traversal, permission-filtered, depth ≤ 3 | 40 ms | 120 ms | 250 ms | Query ingress → result set | A |
| [[REQ-PERF#PLX-PERF-030|PLX-PERF-030]] | Event ingestion to Event Store durability | 15 ms | 50 ms | 120 ms | Emission → fsync acknowledged | A |
| [[REQ-PERF#PLX-PERF-031|PLX-PERF-031]] | Event Store → bus delivery to first subscriber | 20 ms | 80 ms | 200 ms | Store commit → subscriber receipt | A |
| [[REQ-PERF#PLX-PERF-040|PLX-PERF-040]] | Search, AI re-ranking disabled | 80 ms | 200 ms | **300 ms** | Query ingress → ranked results | A |
| [[REQ-PERF#PLX-PERF-041|PLX-PERF-041]] | Semantic index freshness after content-changing Event | 2 s | 10 s | 30 s | Event → embedding queryable | A |
| [[REQ-PERF#PLX-PERF-042|PLX-PERF-042]] | Search, including AI re-ranking | 400 ms | 900 ms | 1.5 s | Query ingress → re-ranked results | A |
| [[REQ-PERF#PLX-PERF-050|PLX-PERF-050]] | AI recommendation, end to end | 2.5 s | 6 s | **10 s** | Request → recommendation with evidence rendered | A |
| [[REQ-PERF#PLX-PERF-060|PLX-PERF-060]] | Authorisation decision | 3 ms | 10 ms | 25 ms | Policy query → decision | A |

Bolded p99 figures are the six targets carried forward from the source specification; the surrounding percentiles and the additional rows are added to make them verifiable.

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-PERF#PLX-PERF-070|PLX-PERF-070]] | Every target in §58 **MUST** be continuously measured in production and alerted on. A target without production instrumentation **MUST NOT** be claimed as met. | I, A | §58, new |
| [[REQ-PERF#PLX-PERF-071|PLX-PERF-071]] | Performance targets **MUST** be re-derived and republished whenever reference load assumptions change by more than one order of magnitude in any dimension. | I | §58, new |
| [[REQ-PERF#PLX-PERF-072|PLX-PERF-072]] | Operations with an AI component **MUST** have a deterministic fallback that meets the corresponding non-AI target, so that AI latency degradation cannot breach a user-facing budget. | T, A | §58, [[S48 Event Architecture|§48]], new |

> **On `[[REQ-PERF#PLX-PERF-050|PLX-PERF-050]]` (AI recommendation ≤ 10 s at p99).** This is achievable, but only with the deterministic-first ordering of [[S48 Event Architecture|§48]] and aggressive caching per §68. It is not achievable if the recommendation path includes an unbounded graph traversal, a multi-agent round trip and an uncached large-model call. The 10-second figure should be understood as a budget to be allocated across stages — roughly: retrieval 1 s, deterministic analysis 1 s, model call 6 s, rendering 2 s — not as headroom.

---

---

## Requirements defined or cited here

- [[REQ-PERF#PLX-PERF-001|PLX-PERF-001]] — Desk open — first meaningful paint of Resume Card and layout — p50 600 ms, p95 1.5 s, p99 **2.0 s**. Measured:
- [[REQ-PERF#PLX-PERF-002|PLX-PERF-002]] — Desk open — full Object hydration — p50 1.5 s, p95 3.5 s, p99 5.0 s. Measured: Gateway ingress → all in-viewpo
- [[REQ-PERF#PLX-PERF-010|PLX-PERF-010]] — Object open (in-Desk) — p50 150 ms, p95 400 ms, p99 800 ms. Measured: Gateway ingress → content available.
- [[REQ-PERF#PLX-PERF-011|PLX-PERF-011]] — Resume generation — deterministic stages 1–6 — p50 400 ms, p95 1.2 s, p99 2.0 s. Measured: Trigger Event → str
- [[REQ-PERF#PLX-PERF-012|PLX-PERF-012]] — Resume generation — including AI summary (stage 7) — p50 1.5 s, p95 3.5 s, p99 **5.0 s**. Measured: Trigger Ev
- [[REQ-PERF#PLX-PERF-020|PLX-PERF-020]] — Context Health update — direct impact (depth 0–1) — p50 60 ms, p95 180 ms, p99 **250 ms**. Measured: Event ing
- [[REQ-PERF#PLX-PERF-021|PLX-PERF-021]] — Context Health update — propagated impact (depth 2–N, within bound) — p50 120 ms, p95 350 ms, p99 **500 ms**.
- [[REQ-PERF#PLX-PERF-022|PLX-PERF-022]] — Graph traversal, permission-filtered, depth ≤ 3 — p50 40 ms, p95 120 ms, p99 250 ms. Measured: Query ingress →
- [[REQ-PERF#PLX-PERF-030|PLX-PERF-030]] — Event ingestion to Event Store durability — p50 15 ms, p95 50 ms, p99 120 ms. Measured: Emission → fsync ackno
- [[REQ-PERF#PLX-PERF-031|PLX-PERF-031]] — Event Store → bus delivery to first subscriber — p50 20 ms, p95 80 ms, p99 200 ms. Measured: Store commit → su
- [[REQ-PERF#PLX-PERF-040|PLX-PERF-040]] — Search, AI re-ranking disabled — p50 80 ms, p95 200 ms, p99 **300 ms**. Measured: Query ingress → ranked resul
- [[REQ-PERF#PLX-PERF-041|PLX-PERF-041]] — Semantic index freshness after content-changing Event — p50 2 s, p95 10 s, p99 30 s. Measured: Event → embeddi
- [[REQ-PERF#PLX-PERF-042|PLX-PERF-042]] — Search, including AI re-ranking — p50 400 ms, p95 900 ms, p99 1.5 s. Measured: Query ingress → re-ranked resul
- [[REQ-PERF#PLX-PERF-050|PLX-PERF-050]] — AI recommendation, end to end — p50 2.5 s, p95 6 s, p99 **10 s**. Measured: Request → recommendation with evid
- [[REQ-PERF#PLX-PERF-060|PLX-PERF-060]] — Authorisation decision — p50 3 ms, p95 10 ms, p99 25 ms. Measured: Policy query → decision.
- [[REQ-PERF#PLX-PERF-070|PLX-PERF-070]] — Every target in §58 **MUST** be continuously measured in production and alerted on. A target without productio
- [[REQ-PERF#PLX-PERF-071|PLX-PERF-071]] — Performance targets **MUST** be re-derived and republished whenever reference load assumptions change by more
- [[REQ-PERF#PLX-PERF-072|PLX-PERF-072]] — Operations with an AI component **MUST** have a deterministic fallback that meets the corresponding non-AI tar

◀ [[S57 Connector Framework]] · [[Part V — Platform Architecture|▲ Part V]] · [[S59 Architectural Invariants]] ▶
