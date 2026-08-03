---
id: S22
section: §22
title: "Search Experience"
part: III
type: section
defines:
  - PLX-MET-007
  - PLX-UX-040
  - PLX-UX-041
tags:
  - section
  - part/iii
---

# §22 Search Experience

◀ [[S21 Workspace Navigation]] · [[Part III — User Experience|▲ Part III]] · [[S23 Resume Experience]] ▶

---

### 22.1 Philosophy

Users should search less over time. Relationships should surface information before searching becomes necessary. Search volume per active Desk-hour (`[[REQ-MET#PLX-MET-007|PLX-MET-007]]`) is therefore a metric to be **driven down**, not up.

### 22.2 Search types

Keyword · Semantic · Relationship · Decision · People · Workspace · Timeline · AI

### 22.3 Contextual search

Search results adapt to the active Desk. Searching for *"pricing"* inside a Client Desk prioritises the client proposal, pricing spreadsheet, finance discussion, relevant Decisions and associated AI conversations — rather than unrelated organisational content.

### 22.4 Requirements

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-UX#PLX-UX-040|PLX-UX-040]] | Search results **MUST** be ranked with the active Desk as a ranking input. The same query issued from two different Desks **MUST** be permitted to produce different orderings. | T | §22.3, [[S54 Search Architecture|§54]] |
| [[REQ-UX#PLX-UX-041|PLX-UX-041]] | Search **MUST** apply permission filtering as the first stage of the ranking pipeline, before any relevance computation, and **MUST NOT** disclose the existence of non-permitted results through result counts, pagination totals or ranking artefacts. | T | [[S54 Search Architecture|§54]], [[S44 Domain Invariants|§44]] R6 |

---

---

## Requirements defined or cited here

- [[REQ-MET#PLX-MET-007|PLX-MET-007]] — Search reduction — Searches per active Desk-hour Baseline: Search telemetry. Target: ↓ over tenant lifetime.
- [[REQ-UX#PLX-UX-040|PLX-UX-040]] — Search results **MUST** be ranked with the active Desk as a ranking input. The same query issued from two diff
- [[REQ-UX#PLX-UX-041|PLX-UX-041]] — Search **MUST** apply permission filtering as the first stage of the ranking pipeline, before any relevance co

◀ [[S21 Workspace Navigation]] · [[Part III — User Experience|▲ Part III]] · [[S23 Resume Experience]] ▶
