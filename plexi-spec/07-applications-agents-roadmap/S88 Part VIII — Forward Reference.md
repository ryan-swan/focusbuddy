---
id: S88
section: §88
title: "Part VIII — Forward Reference"
part: VII
type: section
defines:
  - PLX-AI-031
  - PLX-AI-045
  - PLX-DATA-006
  - PLX-ENG-015
  - PLX-ENG-030
  - PLX-OPS-002
  - PLX-SEC-031
  - PLX-UX-063
tags:
  - section
  - part/vii
---

# §88 Part VIII — Forward Reference

◀ [[S87 Long-Term Vision]] · [[Part VII — Applications, Agents, Algorithms & Roadmap|▲ Part VII]]

---

Part VIII is **not yet drafted**. Its stated scope is: Implementation Strategy, Engineering Milestones, Governance, Risk Management, Product Principles, Open Research Topics and the complete Technical Appendix.

The following items are recorded here as **required Part VIII content**, because they are referenced by requirements in Parts I–VII and are currently undischarged:

| Item | Referenced by | Status |
|---|---|---|
| Competitive analysis with named products and capability mapping | §3.1 | `[[Risk Register#PLX-RSK-14|PLX-RSK-14]]` |
| Full resolution of every open issue in Appendix F | Throughout | 14 open |
| Engineering milestone plan mapped to §85.2 prerequisites | `[[REQ-ENG#PLX-ENG-030|PLX-ENG-030]]` | Required |
| Tenant isolation decision per store | `[[REQ-OPS#PLX-OPS-002|PLX-OPS-002]]`, `[[Risk Register#PLX-RSK-07|PLX-RSK-07]]` | Required before Phase 1 |
| Unit economics model | `[[REQ-AI#PLX-AI-031|PLX-AI-031]]`, `[[Risk Register#PLX-RSK-05|PLX-RSK-05]]` | Required before Phase 1 exit |
| Regulatory classification assessment per target jurisdiction | `[[REQ-AI#PLX-AI-045|PLX-AI-045]]`, `[[Risk Register#PLX-RSK-11|PLX-RSK-11]]` | Required before Phase 4 |
| Threat model and abuse cases | `[[REQ-ENG#PLX-ENG-015|PLX-ENG-015]]`, `[[Risk Register#PLX-RSK-10|PLX-RSK-10]]` | Required before Phase 3 |
| Data inventory and records of processing | `[[REQ-SEC#PLX-SEC-031|PLX-SEC-031]]`, `[[REQ-DATA#PLX-DATA-006|PLX-DATA-006]]` | Required before first production tenant |
| Calibration methodology for confidence scores | `[[REQ-UX#PLX-UX-063|PLX-UX-063]]`, `[[Risk Register#PLX-RSK-06|PLX-RSK-06]]` | Required before confidence display GA |
| Open research topics: materiality modelling, catch-up estimation, relationship inference quality | [[S80 Context Engine Algorithms|§80]], [[S81 Resume Algorithms|§81]] | Required |

---

---

## Requirements defined or cited here

- [[REQ-AI#PLX-AI-031|PLX-AI-031]] — The platform **MUST** report fully loaded AI cost per active user per tenant (`PLX-MET-011`) and **MUST** publ
- [[REQ-AI#PLX-AI-045|PLX-AI-045]] — The platform **MUST** maintain, per deployed AI capability, a record sufficient to support regulatory obligati
- [[REQ-DATA#PLX-DATA-006|PLX-DATA-006]] — Personal data **MUST** be catalogued per store, with its lawful basis, retention period and erasure mechanism
- [[REQ-ENG#PLX-ENG-015|PLX-ENG-015]] — Chaos testing **MUST** include AI provider unavailability, Event Bus partition loss, consumer lag and derived-
- [[REQ-ENG#PLX-ENG-030|PLX-ENG-030]] — Every item in §85.2 **MUST** be resolved, with the resolution recorded as an ADR, before the stated milestone.
- [[REQ-OPS#PLX-OPS-002|PLX-OPS-002]] — The tenant isolation model (`silo`, `pool` or `bridge`) **MUST** be an explicit, recorded per-deployment decis
- [[REQ-SEC#PLX-SEC-031|PLX-SEC-031]] — The platform **MUST** maintain a data inventory identifying every location personal data is stored, including
- [[REQ-UX#PLX-UX-063|PLX-UX-063]] — Confidence scores presented to users **MUST** be derived from a documented, calibrated methodology. Uncalibrat

◀ [[S87 Long-Term Vision]] · [[Part VII — Applications, Agents, Algorithms & Roadmap|▲ Part VII]]
