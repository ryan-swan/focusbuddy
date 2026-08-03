---
id: S51
section: §51
title: "Context Engine"
part: V
type: section
defines:
  - PLX-CTX-010
  - PLX-CTX-011
  - PLX-CTX-012
  - PLX-CTX-013
  - PLX-CTX-014
  - PLX-PERF-020
  - PLX-PERF-021
tags:
  - section
  - part/v
---

# §51 Context Engine

◀ [[S50 Synchronisation Engine]] · [[Part V — Platform Architecture|▲ Part V]] · [[S52 Resume Engine]] ▶

---

The Context Engine is the most important service in Plexi. It transforms activity into meaning.

### 51.1 Responsibilities

Calculate Context Health · identify stale understanding · detect dependency changes · calculate materiality · generate attention scores · trigger Resume updates · identify organisational impact.

### 51.2 Inputs and outputs

| Inputs | Outputs |
|---|---|
| Events | Context Health |
| Relationships | Resume updates |
| Sessions | Relationship changes |
| Knowledge Graph | Dependency warnings |
| Object metadata | AI reasoning requests |
| User activity | Materiality scores |
| Permissions | Attention items |

### 51.3 Materiality

Not every change matters. The Context Engine evaluates significance.

| Change | Consequence |
|---|---|
| Correcting a spelling error | No Context Health change |
| Changing a launch date | Proposal Context Health updated → Marketing Desk updated → Sales Desk updated → Executive Dashboard updated → Resume regenerated |

### 51.4 Requirements

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-CTX#PLX-CTX-010|PLX-CTX-010]] | Materiality scoring **MUST** be deterministic and reproducible. Given identical inputs, it **MUST** produce an identical score. | T | §51, [[S48 Event Architecture|§48]] |
| [[REQ-CTX#PLX-CTX-011|PLX-CTX-011]] | Materiality scoring **MUST NOT** require an AI model call in its primary path. AI **MAY** be used to enrich explanation after scoring completes. | T, A | [[S48 Event Architecture|§48]], §51 |
| [[REQ-CTX#PLX-CTX-012|PLX-CTX-012]] | Materiality thresholds **MUST** be tenant-configurable and **MUST** be recorded on each scoring Event, so that a change in threshold is distinguishable from a change in behaviour when auditing historical decisions. | T, I | §51, new |
| [[REQ-CTX#PLX-CTX-013|PLX-CTX-013]] | The Context Engine **MUST** bound dependency propagation by configured maximum depth and maximum fan-out. Where a propagation is truncated by either bound, the truncation **MUST** be recorded and **MUST** be visible in the resulting attention record. | T, A | §51, [[S80 Context Engine Algorithms|§80]] |
| [[REQ-CTX#PLX-CTX-014|PLX-CTX-014]] | Context Health computation **MUST** meet `[[REQ-PERF#PLX-PERF-020|PLX-PERF-020]]` for direct impact and `[[REQ-PERF#PLX-PERF-021|PLX-PERF-021]]` for propagated impact. These are separate budgets and **MUST NOT** be conflated. | A | [[S58 Performance Requirements|§58]], new |

> **On `[[REQ-CTX#PLX-CTX-013|PLX-CTX-013]]`.** The source specification asks for cross-Desk propagation in under 500 ms while also describing an organisation-wide graph in which a pricing change reaches Marketing, Sales and the Executive Dashboard. In a mature tenant, a central Object — a pricing model, a brand policy, a master contract template — will have thousands of dependent Objects. Unbounded propagation on the synchronous path cannot meet any latency target, and worse, it makes the p99 of a common operation dependent on the *shape of the customer's data*, which is not something engineering can control. Bounded synchronous propagation with an asynchronous tail is the only structure that holds. Silent truncation, however, is worse than slow propagation: a user who is told "nothing else is affected" when in fact propagation stopped at depth three has been actively misled. Hence the visibility clause. See `[[Risk Register#PLX-RSK-03|PLX-RSK-03]]`.

---

---

## Requirements defined or cited here

- [[REQ-CTX#PLX-CTX-010|PLX-CTX-010]] — Materiality scoring **MUST** be deterministic and reproducible. Given identical inputs, it **MUST** produce an
- [[REQ-CTX#PLX-CTX-011|PLX-CTX-011]] — Materiality scoring **MUST NOT** require an AI model call in its primary path. AI **MAY** be used to enrich ex
- [[REQ-CTX#PLX-CTX-012|PLX-CTX-012]] — Materiality thresholds **MUST** be tenant-configurable and **MUST** be recorded on each scoring Event, so that
- [[REQ-CTX#PLX-CTX-013|PLX-CTX-013]] — The Context Engine **MUST** bound dependency propagation by configured maximum depth and maximum fan-out. Wher
- [[REQ-CTX#PLX-CTX-014|PLX-CTX-014]] — Context Health computation **MUST** meet `PLX-PERF-020` for direct impact and `PLX-PERF-021` for propagated im
- [[REQ-PERF#PLX-PERF-020|PLX-PERF-020]] — Context Health update — direct impact (depth 0–1) — p50 60 ms, p95 180 ms, p99 **250 ms**. Measured: Event ing
- [[REQ-PERF#PLX-PERF-021|PLX-PERF-021]] — Context Health update — propagated impact (depth 2–N, within bound) — p50 120 ms, p95 350 ms, p99 **500 ms**.

◀ [[S50 Synchronisation Engine]] · [[Part V — Platform Architecture|▲ Part V]] · [[S52 Resume Engine]] ▶
