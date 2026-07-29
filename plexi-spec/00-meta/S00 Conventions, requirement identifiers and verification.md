---
id: S0
section: §0
title: "Conventions, requirement identifiers and verification"
part: 0
type: section
defines: None
tags:
  - section
  - part/0
---

# §0 Conventions, requirement identifiers and verification

[[Home|▲ Home]] · [[S01 Executive Summary]] ▶

---

### 0.1 Requirement language

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**, **SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **NOT RECOMMENDED**, **MAY** and **OPTIONAL** in this document are to be interpreted as described in [BCP 14](https://www.rfc-editor.org/info/bcp14) ([RFC 2119](https://www.rfc-editor.org/rfc/rfc2119), [RFC 8174](https://www.rfc-editor.org/rfc/rfc8174)) **when, and only when, they appear in all capitals**.

This qualification matters. RFC 8174 exists precisely because specifications that use lowercase "must" and "should" as ordinary English create genuine ambiguity about what is binding. In this document, narrative prose uses these words in their ordinary sense and binds nothing; only capitalised keywords inside requirement rows are normative.

### 0.2 Requirement identifier scheme

Every normative requirement carries a stable identifier of the form:

```
PLX-<AREA>-<NNN>
```

`<AREA>` is a three- to four-letter domain code. `<NNN>` is a zero-padded ordinal, assigned once and **never reused**. If a requirement is withdrawn, its identifier is marked `WITHDRAWN` in Appendix A and the number is retired — it is never reassigned to different content. This is what makes the identifiers safe to cite in test names, commit messages, ADRs, contracts and audit evidence.

| Area code | Domain | Source parts |
|---|---|---|
| `PRIN` | Foundational principles and philosophy | I |
| `PRD` | Product model | II |
| `UX` | User experience and interaction | III |
| `A11Y` | Accessibility | III |
| `DOM` | Domain model and entities | IV |
| `ARC` | Platform and service architecture | V |
| `EVT` | Event architecture, event store, event contracts | V, VI |
| `SYN` | Synchronisation and conflict resolution | V |
| `CTX` | Context Engine | V, VII |
| `RES` | Resume Engine | V, VII |
| `GPH` | Knowledge Graph runtime and schema | V, VI |
| `SCH` | Search | V |
| `AI` | AI orchestration, prompting, cost, governance | V, VI |
| `AGT` | Agents and multi-agent coordination | V, VII |
| `CON` | Connector framework | V |
| `APP` | Native workspace applications | VII |
| `EXT` | Marketplace and SDK | VII |
| `DATA` | Data architecture and persistence | VI |
| `API` | API design and contracts | VI |
| `SEC` | Security, identity, authorisation, privacy | VI |
| `OPS` | Deployment and observability | VI |
| `ENG` | Engineering standards and definition of done | VI |
| `PERF` | Performance and service level objectives | V |
| `MET` | Product and platform metrics | I, VII |

Two further identifier spaces exist and are **not** requirements:

| Prefix | Meaning |
|---|---|
| `PLX-INV-nn` | **Invariant.** A property that must hold at all times, across all code paths, for the platform to be correct. Invariants are stronger than requirements: a requirement describes something the system does, an invariant describes something the system can never stop doing. Registered in Appendix B. |
| `PLX-RSK-nn` | **Open issue or architectural risk.** A recorded tension, deferred decision or external constraint. Registered in Appendix F. Each carries an owner and a required-by milestone. |

### 0.3 Verification methods

Every requirement declares how conformance is demonstrated. A requirement without a verification method is not a requirement — it is an aspiration.

| Code | Method | Meaning |
|---|---|---|
| **T** | Test | Automated test asserts the behaviour. Passes in CI. Failure blocks merge. |
| **A** | Analysis | Demonstrated by measurement, load test, model, cost analysis or formal argument against recorded data. |
| **I** | Inspection | Demonstrated by review of code, schema, configuration or documentation against a checklist. |
| **D** | Demonstration | Demonstrated by observed operation of the system, including manual and assistive-technology walkthroughs. |

Where two codes are listed (e.g. **T, A**) both are required.

### 0.4 Requirement table format

```
| ID | Requirement | V | Src |
```

`V` is the verification method. `Src` is the section of the v1.0 source drafts from which the requirement derives, so that every normative statement is traceable back to authored intent. Requirements marked `Src: new` are **additions made during consolidation** — they were implied but not stated, or are needed to make an existing requirement testable. Every such addition is listed in Appendix H so that nothing has been silently invented.

### 0.5 Terminology conventions

Capitalised domain terms — **Desk**, **Object**, **Event**, **Relationship**, **Decision**, **Context**, **Resume**, **Session**, **Agent**, **Organisation**, **Context Health**, **Workspace Memory** — always refer to the entities defined in Part IV, never to their ordinary-English senses. Lowercase uses are ordinary English. Appendix C is the authoritative glossary.

"Platform" means the Plexi system as a whole. "Service" means one of the deployable units defined in §47. "Tenant" means one Organisation as an isolation boundary.

### 0.6 Spelling and units

British/Australian spelling is used throughout (organisation, synchronisation, authorisation), consistent with the source drafts. Schema field names, event type names and API identifiers use the spellings given in their normative code blocks and are **not** subject to this convention — where a schema field is `organisationId`, that is the literal wire identifier.

Durations are milliseconds (ms) or seconds (s). Latency figures are stated as percentiles (p50, p95, p99) with an explicit measurement point and load condition; a latency requirement without all three is not verifiable and is not used in this document.

### 0.7 Precedence

Where statements conflict, precedence is:

1. Invariants (Appendix B)
2. Requirement rows (`PLX-*`)
3. Normative code blocks and schemas
4. Narrative prose
5. Diagrams

Diagrams are illustrative. Where a diagram and a requirement disagree, the requirement governs and the diagram is a defect to be raised.

---

---

[[Home|▲ Home]] · [[S01 Executive Summary]] ▶
