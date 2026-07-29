---
id: S24
section: §24
title: "AI Experience"
part: III
type: section
defines:
  - PLX-UX-060
  - PLX-UX-061
  - PLX-UX-062
  - PLX-UX-063
tags:
  - section
  - part/iii
---

# §24 AI Experience

◀ [[S23 Resume Experience]] · [[Part III — User Experience|▲ Part III]] · [[S25 Collaboration]] ▶

---

AI exists inside the workspace, not beside it.

### 24.1 AI roles

Assistant · Researcher · Analyst · Writer · Reviewer · Developer · Coordinator · Observer · Summariser · Relationship Explorer · Knowledge Curator · Workflow Builder

### 24.2 AI principles

AI observes continuously. AI interrupts rarely. AI explains always. AI asks permission before major actions. AI never conceals evidence.

### 24.3 Recommendation structure

Every recommendation includes: Recommendation · Confidence · Reasoning · Evidence · Related Objects · Affected Desks · Potential Risks · Suggested Next Steps.

### 24.4 AI memory

AI memory belongs to the **Desk**, not the conversation. When a conversation ends, understanding remains; the conversation history becomes one Object among many.

### 24.5 Requirements

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-UX#PLX-UX-060|PLX-UX-060]] | Every AI recommendation presented to a user **MUST** carry all eight fields of §24.3. A recommendation missing evidence **MUST NOT** be displayed. | T | §24.3, §7.9 |
| [[REQ-UX#PLX-UX-061|PLX-UX-061]] | AI **MUST** obtain explicit user confirmation before any action that mutates an Object, changes a permission, sends an external communication, or incurs cost above the tenant-configured threshold. | T, D | §24.2 |
| [[REQ-UX#PLX-UX-062|PLX-UX-062]] | AI-generated content **MUST** be visually and programmatically distinguishable from human-authored content at every point of display and in every export. | T, D | §24, [[S70 AI Governance|§70]], new |
| [[REQ-UX#PLX-UX-063|PLX-UX-063]] | Confidence scores presented to users **MUST** be derived from a documented, calibrated methodology. Uncalibrated model self-report **MUST NOT** be surfaced as a confidence score. | A, I | §24.3, new |

> **On `[[REQ-UX#PLX-UX-063|PLX-UX-063]]`.** This specification asks for a confidence score in the Resume Card, on every Relationship, on every recommendation and on every Context Object. That is the right instinct — Design Principle 10 says trust grows through transparency. But a language model's self-reported confidence is not calibrated to observed accuracy, and displaying it as though it were converts a trust-building feature into a trust-destroying one the first time a user notices that "92% confident" and "wrong" co-occur regularly. Either calibrate against outcomes and publish the method, or display a coarse ordinal band with an honest definition. Tracked as `[[Risk Register#PLX-RSK-06|PLX-RSK-06]]`.

> **On `[[REQ-UX#PLX-UX-062|PLX-UX-062]]`.** Beyond product hygiene, this is now a regulatory matter in the EU. Transparency obligations attaching to AI-generated content are in force under the AI Act, and Plexi generates user-facing text continuously and by design. Building the provenance flag in from the first commit costs almost nothing; retrofitting it across every surface and export path later is a multi-quarter programme. See `[[Risk Register#PLX-RSK-11|PLX-RSK-11]]`.

---

---

## Requirements defined or cited here

- [[REQ-UX#PLX-UX-060|PLX-UX-060]] — Every AI recommendation presented to a user **MUST** carry all eight fields of §24.3. A recommendation missing
- [[REQ-UX#PLX-UX-061|PLX-UX-061]] — AI **MUST** obtain explicit user confirmation before any action that mutates an Object, changes a permission,
- [[REQ-UX#PLX-UX-062|PLX-UX-062]] — AI-generated content **MUST** be visually and programmatically distinguishable from human-authored content at
- [[REQ-UX#PLX-UX-063|PLX-UX-063]] — Confidence scores presented to users **MUST** be derived from a documented, calibrated methodology. Uncalibrat

◀ [[S23 Resume Experience]] · [[Part III — User Experience|▲ Part III]] · [[S25 Collaboration]] ▶
