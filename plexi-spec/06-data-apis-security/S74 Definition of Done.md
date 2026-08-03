---
id: S74
section: §74
title: "Definition of Done"
part: VI
type: section
defines:
  - PLX-A11Y-008
  - PLX-AI-031
  - PLX-ENG-020
  - PLX-ENG-021
  - PLX-EVT-043
  - PLX-OPS-010
  - PLX-SEC-020
tags:
  - section
  - part/vi
---

# §74 Definition of Done

◀ [[S73 Engineering Standards]] · [[Part VI — Data, APIs, Security & Engineering Standards|▲ Part VI]] · [[S75 Engineering Manifesto]] ▶

---

No feature is complete unless it includes **all** of the following. Each item is a blocking gate, not a checklist aspiration.

| # | Gate | Evidence |
|---|---|---|
| 1 | Implementation | Merged to main |
| 2 | Automated tests | Unit, integration and contract tests passing in CI |
| 3 | Documentation | §73.3 set complete for affected services |
| 4 | API updates | Versioned contract published and validated |
| 5 | Event definitions | JSON Schema published at stable `dataschema` URI (`[[REQ-EVT#PLX-EVT-043|PLX-EVT-043]]`) |
| 6 | Permissions | Authorisation implemented at data-access layer and tested (`[[REQ-SEC#PLX-SEC-020|PLX-SEC-020]]`) |
| 7 | Telemetry | Metrics, traces and logs emitted per `[[REQ-OPS#PLX-OPS-010|PLX-OPS-010]]` |
| 8 | Performance validation | Measured against the applicable [[S58 Performance Requirements|§58]] target at reference load |
| 9 | Accessibility review | No open WCAG 2.2 AA defect (`[[REQ-A11Y#PLX-A11Y-008|PLX-A11Y-008]]`) |
| 10 | AI behaviour review | Evaluation suite passing; evidence and confidence behaviour verified |
| 11 | Security review | Threat model updated; authorisation and data-handling reviewed |
| 12 | **Invariant tests** | Every invariant the feature could violate has a passing detection test |
| 13 | **Requirement traceability** | Every `PLX-*` requirement the feature implements is linked to its verifying test |
| 14 | **Cost impact** | AI and infrastructure cost delta measured (`[[REQ-AI#PLX-AI-031|PLX-AI-031]]`) |

Items 12–14 are additions made during consolidation. Item 13 in particular is what turns this document from a description into a contract: without a link from requirement to test, the requirement index is a list of intentions.

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-ENG#PLX-ENG-020|PLX-ENG-020]] | A feature **MUST NOT** be marked done with any §74 gate unmet. Exceptions **MUST** be recorded as accepted risk with a named owner and a remediation date. | I | §74 |
| [[REQ-ENG#PLX-ENG-021|PLX-ENG-021]] | Requirement-to-test traceability **MUST** be machine-checkable. CI **MUST** report any `PLX-*` requirement with no linked verifying test. | T, I | §74, new |

---

---

## Requirements defined or cited here

- [[REQ-A11Y#PLX-A11Y-008|PLX-A11Y-008]] — Accessibility review **MUST** be a blocking item in the Definition of Done (§74). A feature **MUST NOT** be ma
- [[REQ-AI#PLX-AI-031|PLX-AI-031]] — The platform **MUST** report fully loaded AI cost per active user per tenant (`PLX-MET-011`) and **MUST** publ
- [[REQ-ENG#PLX-ENG-020|PLX-ENG-020]] — A feature **MUST NOT** be marked done with any §74 gate unmet. Exceptions **MUST** be recorded as accepted ris
- [[REQ-ENG#PLX-ENG-021|PLX-ENG-021]] — Requirement-to-test traceability **MUST** be machine-checkable. CI **MUST** report any `PLX-*` requirement wit
- [[REQ-EVT#PLX-EVT-043|PLX-EVT-043]] — Every Event type **MUST** have a published JSON Schema at a stable `dataschema` URI, versioned, and validated
- [[REQ-OPS#PLX-OPS-010|PLX-OPS-010]] — Every service **MUST** emit metrics, structured logs and distributed traces using OpenTelemetry semantics, wit
- [[REQ-SEC#PLX-SEC-020|PLX-SEC-020]] — Authorisation **MUST** be evaluated at the data-access layer of every service. Gateway-level authorisation alo

◀ [[S73 Engineering Standards]] · [[Part VI — Data, APIs, Security & Engineering Standards|▲ Part VI]] · [[S75 Engineering Manifesto]] ▶
