---
id: S71
section: §71
title: "Deployment Architecture"
part: VI
type: section
defines:
  - PLX-OPS-001
  - PLX-OPS-002
  - PLX-OPS-003
  - PLX-OPS-004
  - PLX-SEC-025
tags:
  - section
  - part/vi
---

# §71 Deployment Architecture

◀ [[S70 AI Governance]] · [[Part VI — Data, APIs, Security & Engineering Standards|▲ Part VI]] · [[S72 Observability]] ▶

---

The platform **MUST** support single tenant, multi tenant, regional deployment, enterprise private cloud, government cloud, hybrid cloud and edge deployment.

**Infrastructure:** containers · Kubernetes · autoscaling · service mesh · distributed cache · global CDN · regional storage · observability platform.

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-OPS#PLX-OPS-001|PLX-OPS-001]] | Every service **MUST** be deployable as a container with no host-specific dependencies and **MUST** support rolling deployment without downtime. | T, D | §71 |
| [[REQ-OPS#PLX-OPS-002|PLX-OPS-002]] | The tenant isolation model (`silo`, `pool` or `bridge`) **MUST** be an explicit, recorded per-deployment decision, and the chosen model **MUST** be documented per store, not only per platform. | I | §71, [[S42 Organisation Entity|§42]], new |
| [[REQ-OPS#PLX-OPS-003|PLX-OPS-003]] | Regional deployment **MUST** enforce data residency for storage, processing, backups and AI inference (`[[REQ-SEC#PLX-SEC-025|PLX-SEC-025]]`). | T, I | §71 |
| [[REQ-OPS#PLX-OPS-004|PLX-OPS-004]] | Every deployment topology offered commercially **MUST** be continuously exercised in CI. A topology that is not tested **MUST NOT** be offered. | T, I | §71, new |

> **On `[[REQ-OPS#PLX-OPS-002|PLX-OPS-002]]` and `[[REQ-OPS#PLX-OPS-004|PLX-OPS-004]]`.** Offering seven deployment topologies before Phase 1 has shipped is a commitment to seven test matrices, seven upgrade paths and seven security postures. The AWS silo/pool/bridge framing is the useful decomposition: it is entirely reasonable to pool the stateless services while siloing the graph and event stores, but that must be a stated position per store rather than an emergent one. Government cloud and edge in particular carry compliance and operational burdens that do not belong in a Phase 1 scope. Tracked as `[[Risk Register#PLX-RSK-07|PLX-RSK-07]]`.

---

---

## Requirements defined or cited here

- [[REQ-OPS#PLX-OPS-001|PLX-OPS-001]] — Every service **MUST** be deployable as a container with no host-specific dependencies and **MUST** support ro
- [[REQ-OPS#PLX-OPS-002|PLX-OPS-002]] — The tenant isolation model (`silo`, `pool` or `bridge`) **MUST** be an explicit, recorded per-deployment decis
- [[REQ-OPS#PLX-OPS-003|PLX-OPS-003]] — Regional deployment **MUST** enforce data residency for storage, processing, backups and AI inference (`PLX-SE
- [[REQ-OPS#PLX-OPS-004|PLX-OPS-004]] — Every deployment topology offered commercially **MUST** be continuously exercised in CI. A topology that is no
- [[REQ-SEC#PLX-SEC-025|PLX-SEC-025]] — Data residency **MUST** be enforceable per Organisation, including for AI inference. A tenant with an EU resid

◀ [[S70 AI Governance]] · [[Part VI — Data, APIs, Security & Engineering Standards|▲ Part VI]] · [[S72 Observability]] ▶
