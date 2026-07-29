---
id: S72
section: §72
title: "Observability"
part: VI
type: section
defines:
  - PLX-OPS-010
  - PLX-OPS-011
  - PLX-OPS-012
  - PLX-OPS-013
  - PLX-OPS-014
tags:
  - section
  - part/vi
---

# §72 Observability

◀ [[S71 Deployment Architecture]] · [[Part VI — Data, APIs, Security & Engineering Standards|▲ Part VI]] · [[S73 Engineering Standards]] ▶

---

Every service exposes latency, error rate, queue depth, event throughput, token usage, cache hit rate, graph traversal time, Resume generation time, search latency and user interaction metrics.

**Dashboards:** Engineering · Operations · AI · Infrastructure · Customer Success · Security · Product.

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-OPS#PLX-OPS-010|PLX-OPS-010]] | Every service **MUST** emit metrics, structured logs and distributed traces using OpenTelemetry semantics, with `correlationId` propagated end to end from user action through every derived effect. | T, I | §72 |
| [[REQ-OPS#PLX-OPS-011|PLX-OPS-011]] | Every target in [[S58 Performance Requirements|§58]] **MUST** have a corresponding production SLI, an alert threshold and an error budget. | I, A | [[S58 Performance Requirements|§58]], §72 |
| [[REQ-OPS#PLX-OPS-012|PLX-OPS-012]] | AI cost and token usage **MUST** be observable per tenant, per Desk, per prompt type and per model. | T | §72, [[S68 AI Cost Optimisation|§68]] |
| [[REQ-OPS#PLX-OPS-013|PLX-OPS-013]] | Logs **MUST NOT** contain Object content, personal data or prompt content. Content **MUST** be referenced by identifier and digest. | T, I | §72, new |
| [[REQ-OPS#PLX-OPS-014|PLX-OPS-014]] | Event Store lag, derived-store rebuild lag and consumer lag per partition **MUST** be measured and alerted, as these are the platform's primary silent-failure modes. | T, I | §72, new |

> **On `[[REQ-OPS#PLX-OPS-014|PLX-OPS-014]]`.** In an event-driven architecture with six derived stores, the characteristic failure is not a crash — it is a consumer falling behind, or dying quietly, while every health check stays green and the API keeps returning stale answers with full confidence. For Plexi specifically this presents as the Resume being subtly out of date, which is indistinguishable to a user from the product simply being wrong. Consumer lag per partition is the metric that catches it.

---

---

## Requirements defined or cited here

- [[REQ-OPS#PLX-OPS-010|PLX-OPS-010]] — Every service **MUST** emit metrics, structured logs and distributed traces using OpenTelemetry semantics, wit
- [[REQ-OPS#PLX-OPS-011|PLX-OPS-011]] — Every target in §58 **MUST** have a corresponding production SLI, an alert threshold and an error budget.
- [[REQ-OPS#PLX-OPS-012|PLX-OPS-012]] — AI cost and token usage **MUST** be observable per tenant, per Desk, per prompt type and per model.
- [[REQ-OPS#PLX-OPS-013|PLX-OPS-013]] — Logs **MUST NOT** contain Object content, personal data or prompt content. Content **MUST** be referenced by i
- [[REQ-OPS#PLX-OPS-014|PLX-OPS-014]] — Event Store lag, derived-store rebuild lag and consumer lag per partition **MUST** be measured and alerted, as

◀ [[S71 Deployment Architecture]] · [[Part VI — Data, APIs, Security & Engineering Standards|▲ Part VI]] · [[S73 Engineering Standards]] ▶
