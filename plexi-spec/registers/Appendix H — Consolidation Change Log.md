---
type: appendix
appendix: H
title: "Consolidation Change Log"
tags:
  - appendix
---

# Appendix H — Consolidation Change Log

[[Home|▲ Home]]

---

This appendix records every change made in consolidating the seven v1.0 Parts into this edition, so that nothing has been silently altered, invented or dropped.

### H.1 Structural changes

| # | Change | Rationale |
|---|---|---|
| 1 | **Table of contents regenerated from body numbering.** The v1.0 front matter TOC described a six-part document with section ranges that diverged from the body from Part III onward (TOC: III = [[S18 User Experience Philosophy|§18]]–23, IV = [[S24 AI Experience|§24]]–30, V = [[S31 Core Philosophy|§31]]–38, VI = [[S39 Resume Entity|§39]]–42; body: III = [[S18 User Experience Philosophy|§18]]–29, IV = [[S30 Domain Model|§30]]–44, V = [[S45 Platform Architecture|§45]]–60, VI = [[S61 Purpose|§61]]–75, VII = [[S76 Native Application Philosophy|§76]]–87). | The body numbering is continuous and non-overlapping across all seven Parts and is therefore authoritative. **No section has been renumbered.** |
| 2 | Part titles aligned to body content. TOC called Part V "Technical Architecture"; the body is "Event-Driven Architecture & Platform Engineering", restated here as "Platform Architecture". | Titles now match content. |
| 3 | [[S00 Conventions, requirement identifiers and verification|§0]] Conventions added. | RFC 2119 language, requirement identifiers and verification methods were used implicitly throughout but never defined. |
| 4 | Appendices A–H added. | Requirement index, invariant register, glossary, catalogues, risk register, references and this log did not exist. |
| 5 | [[S88 Part VIII — Forward Reference|§88]] added as a forward reference for the undrafted Part VIII. | Several requirements reference Part VIII deliverables; they are now enumerated rather than dangling. |

### H.2 Defect corrections

| # | Defect | Correction |
|---|---|---|
| 1 | [[S46 High-Level System Architecture|§46]] architecture diagram placed the Connector Service downstream of the AI Orchestrator, implying connectors are reachable only through AI. | Connector Service redrawn as a peer service reachable both by the AI Orchestrator (as a tool surface) and directly from the Event Bus (for deterministic sync). Contradicted [[S57 Connector Framework|§57]] and would have made non-AI integration impossible. |
| 2 | [[S26 Notifications|§26]] notification categories (seven) contradicted [[S06 Product Philosophy|§6]] Philosophy 7 ("notifications are failures"). | Reconciled via the explicit escalation ladder in §26.2. Both statements retained; the mechanism connecting them is now stated. |
| 3 | [[S44 Domain Invariants|§44]] Rule 1 (singular ownership) and Rule 6 (permissions propagate) did not resolve the multi-Desk permission composition case. | `[[REQ-PRD#PLX-PRD-061|PLX-PRD-061]]` states most-restrictive-wins. Flagged as a decision requiring confirmation (`[[Risk Register#PLX-RSK-09|PLX-RSK-09]]`). |
| 4 | [[S50 Synchronisation Engine|§50]] stated "Operational Transformation or CRDT" — a non-decision. | CRDT selected (`[[REQ-SYN#PLX-SYN-001|PLX-SYN-001]]`), forced by Architectural Principle 7 (offline capable). Rationale recorded in §50.3, consequences in `[[Risk Register#PLX-RSK-04|PLX-RSK-04]]`. |
| 5 | [[S58 Performance Requirements|§58]] performance targets lacked percentiles, measurement points and load conditions. | Restated with p50/p95/p99, explicit measurement points and a defined reference load. The six original figures are preserved as p99 targets and marked in bold. |
| 6 | [[S20 Context Health|§20]] Context Health described as a property of the Object, while its definition is relative to a user's understanding. | Clarified as per-(user, Object) (`[[REQ-UX#PLX-UX-020|PLX-UX-020]]`, `[[REQ-DOM#PLX-DOM-030|PLX-DOM-030]]`). Cost consequence recorded as `[[Risk Register#PLX-RSK-03|PLX-RSK-03]]`. |
| 7 | `Live Activity` modelled as a peer Context Health state, which would have overwritten `Attention Required`. | Modelled as an orthogonal presence overlay (`[[REQ-UX#PLX-UX-023|PLX-UX-023]]`). |
| 8 | Three overlapping, non-identical relationship vocabularies (§15.1, §36.2, §65.2). | Reconciled into the single closed registry of Appendix E, with reconciliation notes. |
| 9 | Two overlapping Object type lists (§11.3, §34.3). | Union registered in Appendix C.1 with differences noted. |
| 10 | [[S27 Accessibility|§27]] accessibility listed features with no conformance target. | WCAG 2.2 Level AA set as the target (`[[REQ-A11Y#PLX-A11Y-001|PLX-A11Y-001]]`), with testable requirements. |
| 11 | [[S08 Success Criteria|§8]] success criteria were unmeasurable statements of intent. | Converted to instrumented metrics `[[REQ-MET#PLX-MET-001|PLX-MET-001]]`–`[[REQ-MET#PLX-MET-011|PLX-MET-011]]` with definitions, baseline methods and targets. |
| 12 | [[S64 Event Contracts|§64]] event envelope was bespoke. | Aligned to CloudEvents v1.0.2 with Plexi extension attributes; every original field preserved. |

### H.3 Requirements added during consolidation

Requirements marked `Src: new` in the body were added because they were implied by existing statements but not stated, or were required to make an existing statement testable. They are grouped by rationale:

**Made an existing statement testable:** `[[REQ-PRIN#PLX-PRIN-004|PLX-PRIN-004]]`, `[[REQ-PRD#PLX-PRD-013|PLX-PRD-013]]`, `[[REQ-PRD#PLX-PRD-043|PLX-PRD-043]]`, `[[REQ-RES#PLX-RES-003|PLX-RES-003]]`, `[[REQ-MET#PLX-MET-012|PLX-MET-012]]`, `[[REQ-MET#PLX-MET-013|PLX-MET-013]]`, `[[REQ-PERF#PLX-PERF-070|PLX-PERF-070]]`–`[[REQ-PERF#PLX-PERF-072|PLX-PERF-072]]`, `[[REQ-ENG#PLX-ENG-021|PLX-ENG-021]]`.

**Closed a security or privacy gap:** `[[REQ-PRD#PLX-PRD-061|PLX-PRD-061]]`, `[[REQ-PRD#PLX-PRD-071|PLX-PRD-071]]`, `[[REQ-SEC#PLX-SEC-011|PLX-SEC-011]]`, `[[REQ-SEC#PLX-SEC-022|PLX-SEC-022]]`–`[[REQ-SEC#PLX-SEC-027|PLX-SEC-027]]`, `[[REQ-SEC#PLX-SEC-030|PLX-SEC-030]]`–`[[REQ-SEC#PLX-SEC-033|PLX-SEC-033]]`, `[[REQ-EVT#PLX-EVT-012|PLX-EVT-012]]`, `[[REQ-EVT#PLX-EVT-033|PLX-EVT-033]]`, `[[REQ-EVT#PLX-EVT-034|PLX-EVT-034]]`, `[[REQ-SCH#PLX-SCH-002|PLX-SCH-002]]`, `[[REQ-API#PLX-API-004|PLX-API-004]]`, `[[REQ-API#PLX-API-008|PLX-API-008]]`, `[[REQ-AGT#PLX-AGT-012|PLX-AGT-012]]`, `[[REQ-AGT#PLX-AGT-014|PLX-AGT-014]]`, `[[REQ-AGT#PLX-AGT-023|PLX-AGT-023]]`, `[[REQ-CON#PLX-CON-003|PLX-CON-003]]`, `[[REQ-EXT#PLX-EXT-006|PLX-EXT-006]]`, `[[REQ-OPS#PLX-OPS-013|PLX-OPS-013]]`, `[[REQ-UX#PLX-UX-070|PLX-UX-070]]`, `[[REQ-UX#PLX-UX-072|PLX-UX-072]]`, `[[REQ-APP#PLX-APP-030|PLX-APP-030]]`, `[[REQ-APP#PLX-APP-040|PLX-APP-040]]`.

**Closed a correctness gap that would cause production defects:** `[[REQ-EVT#PLX-EVT-014|PLX-EVT-014]]`, `[[REQ-EVT#PLX-EVT-015|PLX-EVT-015]]`, `[[REQ-EVT#PLX-EVT-022|PLX-EVT-022]]`, `[[REQ-EVT#PLX-EVT-024|PLX-EVT-024]]`, `[[REQ-EVT#PLX-EVT-035|PLX-EVT-035]]`, `[[REQ-EVT#PLX-EVT-036|PLX-EVT-036]]`, `[[REQ-DOM#PLX-DOM-010|PLX-DOM-010]]`, `[[REQ-DOM#PLX-DOM-012|PLX-DOM-012]]`, `[[REQ-DOM#PLX-DOM-032|PLX-DOM-032]]`, `[[REQ-CTX#PLX-CTX-013|PLX-CTX-013]]`, `[[REQ-CTX#PLX-CTX-021|PLX-CTX-021]]`, `[[REQ-CTX#PLX-CTX-026|PLX-CTX-026]]`, `[[REQ-GPH#PLX-GPH-003|PLX-GPH-003]]`, `[[REQ-GPH#PLX-GPH-005|PLX-GPH-005]]`, `[[REQ-GPH#PLX-GPH-012|PLX-GPH-012]]`, `[[REQ-SYN#PLX-SYN-002|PLX-SYN-002]]`, `[[REQ-SYN#PLX-SYN-011|PLX-SYN-011]]`, `[[REQ-SYN#PLX-SYN-012|PLX-SYN-012]]`, `[[REQ-CON#PLX-CON-005|PLX-CON-005]]`, `[[REQ-CON#PLX-CON-007|PLX-CON-007]]`, `[[REQ-DATA#PLX-DATA-002|PLX-DATA-002]]`, `[[REQ-OPS#PLX-OPS-014|PLX-OPS-014]]`, `[[REQ-APP#PLX-APP-012|PLX-APP-012]]`.

**Resolved a stated ambiguity:** `[[REQ-PRD#PLX-PRD-003|PLX-PRD-003]]`, `[[REQ-PRD#PLX-PRD-020|PLX-PRD-020]]`–`[[REQ-PRD#PLX-PRD-023|PLX-PRD-023]]`, `[[REQ-DOM#PLX-DOM-021|PLX-DOM-021]]`, `[[REQ-AI#PLX-AI-002|PLX-AI-002]]`–`[[REQ-AI#PLX-AI-004|PLX-AI-004]]`, `[[REQ-UX#PLX-UX-063|PLX-UX-063]]`, `[[REQ-OPS#PLX-OPS-002|PLX-OPS-002]]`.

**Protected the product thesis against predictable erosion:** `[[REQ-MET#PLX-MET-013|PLX-MET-013]]` (attention precision gate), `[[REQ-MET#PLX-MET-021|PLX-MET-021]]` (engagement metrics prohibited), `[[REQ-CTX#PLX-CTX-031|PLX-CTX-031]]` (freshness not comparative), `[[REQ-UX#PLX-UX-045|PLX-UX-045]]` (suppression inspectable), `[[REQ-APP#PLX-APP-002|PLX-APP-002]]` and `[[REQ-EXT#PLX-EXT-012|PLX-EXT-012]]` (first-party uses public SDK), `[[REQ-ENG#PLX-ENG-030|PLX-ENG-030]]` (foreclosing decisions gated).

**Added regulatory obligation:** `[[REQ-UX#PLX-UX-062|PLX-UX-062]]`, `[[REQ-AI#PLX-AI-045|PLX-AI-045]]`, `[[REQ-AI#PLX-AI-046|PLX-AI-046]]`, `[[REQ-DATA#PLX-DATA-006|PLX-DATA-006]]`, `[[REQ-SEC#PLX-SEC-025|PLX-SEC-025]]`.

### H.4 Content preserved verbatim in substance

Every philosophy, principle, definition, list, example, pipeline and manifesto statement from the source drafts is present. Where source text was expressed as a fragment list, it has been rendered as prose or as a table without loss of items. Where a source example illustrated a concept (the pricing-spreadsheet propagation chain, the "John updated the spreadsheet" contrast, the context compression example, the Resume panel sample), it is retained.

The staccato rhetorical style of the source drafts has been retained in narrative sections that carry the product argument — [[S01 Executive Summary|§1]], [[S06 Product Philosophy|§6]], [[S60 Engineering Principle|§60]], [[S75 Engineering Manifesto|§75]], [[S87 Long-Term Vision|§87]] in particular — and replaced with specification prose in sections that carry engineering obligation, per the brief.

### H.5 Open editorial items

| # | Item | Needs |
|---|---|---|
| 1 | Object registry contains near-duplicate entries: Chat/Conversation, Voice Recording/Recording, Video/Media, Table/Database Table (Appendix C.1). | Product decision on whether these are distinct types. |
| 2 | `DependsOn` and `Requires` retained as distinct relationship types (Appendix E.1). | Product decision on whether the distinction is operationally meaningful. |
| 3 | Part VIII undrafted; ten items enumerated in [[S88 Part VIII — Forward Reference|§88]] are referenced by requirements in Parts I–VII. | Drafting. |
| 4 | Requirement-to-test traceability (`[[REQ-ENG#PLX-ENG-021|PLX-ENG-021]]`) is specified but no test suite exists. | Implementation. |
| 5 | Reference load figures in [[S58 Performance Requirements|§58]] are stated assumptions, not measured. | Validation against a real tenant profile, then republication per `[[REQ-PERF#PLX-PERF-071|PLX-PERF-071]]`. |

---

*End of PLEXI-0001 v2.0.*
