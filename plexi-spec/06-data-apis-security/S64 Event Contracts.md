---
id: S64
section: §64
title: "Event Contracts"
part: VI
type: section
defines:
  - PLX-DOM-032
  - PLX-EVT-040
  - PLX-EVT-041
  - PLX-EVT-042
  - PLX-EVT-043
  - PLX-EVT-044
  - PLX-EVT-045
tags:
  - section
  - part/vi
---

# §64 Event Contracts

◀ [[S63 Canonical API Design]] · [[Part VI — Data, APIs, Security & Engineering Standards|▲ Part VI]] · [[S65 Knowledge Graph Schema]] ▶

---

Events represent facts. Facts never change.

### 64.1 Canonical envelope

The source specification defined a bespoke envelope. This consolidation aligns it with **CloudEvents v1.0.2** while preserving every original field, because an interoperable envelope costs nothing at design time and is expensive to adopt later — and because Connectors, marketplace extensions and enterprise event buses will expect a standard shape.

```json
{
  "specversion": "1.0",
  "id": "018f3c2a-7b41-7c9e-9f2d-3a1b5c8d4e6f",
  "source": "/plexi/org/{organisationId}/service/object-service",
  "type": "com.plexi.object.updated.v1",
  "time": "2026-07-29T04:15:22.481Z",
  "subject": "object/{objectId}",
  "datacontenttype": "application/json",
  "dataschema": "https://schemas.plexi.dev/events/object.updated.v1.json",

  "plexiorganisationid": "018f3c2a-...",
  "plexideskid":         "018f3c2a-...",
  "plexiobjectid":       "018f3c2a-...",
  "plexiactor":          "user:018f3c2a-...",
  "plexicorrelationid":  "018f3c2a-...",
  "plexicausationid":    "018f3c2a-...",
  "plexicategory":       "user",
  "plexisequence":       184223,
  "plexirecordedat":     "2026-07-29T04:15:22.612Z",
  "plexischemaversion":  1,

  "data": {
    "previousState":  { "$digest": "sha256:9f2c..." },
    "currentState":   { "$digest": "sha256:1a7e..." },
    "changeSummary":  "Section 4 pricing table updated",
    "permissions":    { "$ref": "permissionset/018f3c2a-..." },
    "confidence":     null,
    "metadata":       {}
  }
}
```

CloudEvents requires `id`, `source`, `specversion` and `type`, and requires that producers ensure `source` + `id` is unique for each distinct event — which is precisely the guarantee an offline-capable client with locally generated identifiers needs. Extension attribute names are lowercase alphanumerics per the specification's naming rules, hence `plexideskid` rather than `plexiDeskId`.

### 64.2 Event naming

**Past tense only.** Events are facts about things that have happened.

| Correct | Incorrect |
|---|---|
| `DeskCreated` | `CreateDesk` |
| `ObjectShared` | `UpdateDocument` |
| `DecisionApproved` | `ModifyRelationship` |
| `RelationshipDiscovered` | |
| `ResumeGenerated` | |
| `AgentCompletedTask` | |

**Commands are requests. Events are facts.** The wire `type` uses reverse-DNS with an explicit version suffix: `com.plexi.<aggregate>.<pasttenseverb>.v<n>`.

### 64.3 Requirements

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-EVT#PLX-EVT-040|PLX-EVT-040]] | Every Event **MUST** conform to CloudEvents v1.0.2 structure and **MUST** carry the Plexi extension attributes of §64.1. | T | §64, new |
| [[REQ-EVT#PLX-EVT-041|PLX-EVT-041]] | Event type names **MUST** be past tense and **MUST** carry an explicit version suffix. Command-shaped event names **MUST** be rejected in CI by a naming lint. | T, I | §64.2 |
| [[REQ-EVT#PLX-EVT-042|PLX-EVT-042]] | Producers **MUST** guarantee that `source` + `id` is unique for each distinct Event. | T | §64, RFC/CE |
| [[REQ-EVT#PLX-EVT-043|PLX-EVT-043]] | Every Event type **MUST** have a published JSON Schema at a stable `dataschema` URI, versioned, and validated in CI against every producer and consumer. | T, I | §64, new |
| [[REQ-EVT#PLX-EVT-044|PLX-EVT-044]] | A breaking change to an Event schema **MUST** be published as a new type version. Existing type versions **MUST NOT** be redefined. | I, T | §64, [[S49 Event Store|§49]] |
| [[REQ-EVT#PLX-EVT-045|PLX-EVT-045]] | Large state payloads **MUST** be carried as content digests, not inline (`[[REQ-DOM#PLX-DOM-032|PLX-DOM-032]]`). | T | §64, [[S34 Object Entity|§34]] |

---

---

## Requirements defined or cited here

- [[REQ-DOM#PLX-DOM-032|PLX-DOM-032]] — Large Object content **MUST** be stored out-of-band via `contentRef` and **MUST NOT** be embedded in Event pay
- [[REQ-EVT#PLX-EVT-040|PLX-EVT-040]] — Every Event **MUST** conform to CloudEvents v1.0.2 structure and **MUST** carry the Plexi extension attributes
- [[REQ-EVT#PLX-EVT-041|PLX-EVT-041]] — Event type names **MUST** be past tense and **MUST** carry an explicit version suffix. Command-shaped event na
- [[REQ-EVT#PLX-EVT-042|PLX-EVT-042]] — Producers **MUST** guarantee that `source` + `id` is unique for each distinct Event.
- [[REQ-EVT#PLX-EVT-043|PLX-EVT-043]] — Every Event type **MUST** have a published JSON Schema at a stable `dataschema` URI, versioned, and validated
- [[REQ-EVT#PLX-EVT-044|PLX-EVT-044]] — A breaking change to an Event schema **MUST** be published as a new type version. Existing type versions **MUS
- [[REQ-EVT#PLX-EVT-045|PLX-EVT-045]] — Large state payloads **MUST** be carried as content digests, not inline (`PLX-DOM-032`).

◀ [[S63 Canonical API Design]] · [[Part VI — Data, APIs, Security & Engineering Standards|▲ Part VI]] · [[S65 Knowledge Graph Schema]] ▶
