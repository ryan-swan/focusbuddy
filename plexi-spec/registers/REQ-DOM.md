---
type: requirement-register
area: DOM
domain: "Domain model"
count: 20
tags:
  - requirements
  - area/dom
---

# REQ-DOM — Domain model

20 normative requirements. Identifiers are permanent and never reused.

> [!important] For Claude Code
> Every requirement below is binding. Cite the ID in the test name that verifies it (`test_plx_dom_001_*`) so [[S74 Definition of Done|§74]] gate 13 (requirement-to-test traceability) can be machine-checked.

| ID | § | V | Summary |
|---|---|---|---|
| [[#PLX-DOM-001]] | §30 | I | Every persisted concept MUST be expressible through the entities defined in Part IV. Introduction of a new persisted concept MUST  |
| [[#PLX-DOM-002]] | §30 | I, A | No service MUST persist domain state outside the entity model, including in caches used as systems of record, in blob metadata, or |
| [[#PLX-DOM-010]] | §32 | T, I | Entity identifiers MUST be UUIDv7. Identifiers MUST be generable client-side without coordination, so that offline creation and la |
| [[#PLX-DOM-011]] | §32 | T, I | Every entity MUST carry organisationId. Every data-access path MUST filter on organisationId at the persistence layer, not solely  |
| [[#PLX-DOM-012]] | §32 | T | Every entity MUST carry schemaVersion. Readers MUST tolerate unknown fields and MUST be able to upcast prior schema versions. |
| [[#PLX-DOM-013]] | §32 | I, T | relationships and eventHistory on BaseEntity are materialised references, not the system of record. The authoritative sources are  |
| [[#PLX-DOM-014]] | §32 | T | aiMetadata.provenance MUST be set on every entity at creation and MUST NOT be downgraded from ai_generated to human by any subsequ |
| [[#PLX-DOM-015]] | §32 | T | deletedAt MUST affect visibility only. No process MUST interpret a non-null deletedAt as authority to remove Events, Relationships |
| [[#PLX-DOM-020]] | §33 | I, T | No Object type MUST receive privileged treatment in storage, permission evaluation, event generation, versioning or Context Health |
| [[#PLX-DOM-021]] | §33 | T | DeskAiConfig.enabled = false MUST disable all AI reasoning for the Desk, including background relationship discovery, embedding ge |
| [[#PLX-DOM-022]] | §33 | T, D | An inferred Objective MUST carry a confidence band and MUST be visually marked as unconfirmed until a user accepts it (PLX-PRD-006 |
| [[#PLX-DOM-030]] | §34 | T, I | Context Health MUST NOT be stored as a scalar attribute on the Object entity. It MUST be computed or materialised per (user, Objec |
| [[#PLX-DOM-031]] | §34 | T | DeskPresence.effectivePermissions MUST be computed as the most restrictive intersection of the owning Desk permissions and the pre |
| [[#PLX-DOM-032]] | §34 | T, A | Large Object content MUST be stored out-of-band via contentRef and MUST NOT be embedded in Event payloads. Events MUST reference c |
| [[#PLX-DOM-040]] | §37 | T | decisionOwner and every Approval.approver MUST be a human principal. An Agent or service principal MUST NOT be recorded as a Decis |
| [[#PLX-DOM-041]] | §37 | T, D | aiCommentary MUST be stored and displayed as advisory. It MUST NOT be rendered in a manner that implies it constitutes the Decisio |
| [[#PLX-DOM-042]] | §37 | T | Superseding a Decision MUST set supersededById, MUST create a DecisionSuperseded Event, and MUST trigger Context Health re-evaluat |
| [[#PLX-DOM-043]] | §37 | T, I | Rejected alternatives MUST be retained permanently. The record of what was *not* chosen, and why, MUST NOT be pruned by any retent |
| [[#PLX-DOM-050]] | §40 | T, I | FocusRecord data (which Object, for how long) MUST be classified as presence-class data and MUST be subject to the retention const |
| [[#PLX-DOM-051]] | §40 | T | Sessions MUST be closed by explicit exit, by timeout, or by recovery on next connection. An unclosed Session MUST NOT block Resume |

---

### PLX-DOM-001

Every persisted concept **MUST** be expressible through the entities defined in Part IV. Introduction of a new persisted concept **MUST** proceed by amendment to this Part, not by ad-hoc storage.

| | |
|---|---|
| **Verification** | `I` |
| **Defined in** | [[S30 Domain Model|§30]] |
| **Derives from** | [[S30 Domain Model|§30]] |
| **Test name** | `test_plx_dom_001` |

### PLX-DOM-002

No service **MUST** persist domain state outside the entity model, including in caches used as systems of record, in blob metadata, or in message payloads treated as durable.

| | |
|---|---|
| **Verification** | `I, A` |
| **Defined in** | [[S30 Domain Model|§30]] |
| **Derives from** | [[S30 Domain Model|§30]], new |
| **Test name** | `test_plx_dom_002` |

### PLX-DOM-010

Entity identifiers **MUST** be UUIDv7. Identifiers **MUST** be generable client-side without coordination, so that offline creation and later reconciliation are possible without renumbering.

| | |
|---|---|
| **Verification** | `T, I` |
| **Defined in** | [[S32 Canonical Entity Model|§32]] |
| **Derives from** | [[S32 Canonical Entity Model|§32]], new |
| **Test name** | `test_plx_dom_010` |

### PLX-DOM-011

Every entity **MUST** carry `organisationId`. Every data-access path **MUST** filter on `organisationId` at the persistence layer, not solely in application code.

| | |
|---|---|
| **Verification** | `T, I` |
| **Defined in** | [[S32 Canonical Entity Model|§32]] |
| **Derives from** | [[S32 Canonical Entity Model|§32]], [[S69 Security Architecture|§69]] |
| **Test name** | `test_plx_dom_011` |

### PLX-DOM-012

Every entity **MUST** carry `schemaVersion`. Readers **MUST** tolerate unknown fields and **MUST** be able to upcast prior schema versions.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S32 Canonical Entity Model|§32]] |
| **Derives from** | [[S32 Canonical Entity Model|§32]], new |
| **Test name** | `test_plx_dom_012` |

### PLX-DOM-013

`relationships` and `eventHistory` on BaseEntity are **materialised references**, not the system of record. The authoritative sources are the Graph Engine and Event Store respectively. Writers **MUST NOT** treat these fields as authoritative.

| | |
|---|---|
| **Verification** | `I, T` |
| **Defined in** | [[S32 Canonical Entity Model|§32]] |
| **Derives from** | [[S32 Canonical Entity Model|§32]], new |
| **Test name** | `test_plx_dom_013` |

### PLX-DOM-014

`aiMetadata.provenance` **MUST** be set on every entity at creation and **MUST NOT** be downgraded from `ai_generated` to `human` by any subsequent operation.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S32 Canonical Entity Model|§32]] |
| **Derives from** | [[S32 Canonical Entity Model|§32]], [[S70 AI Governance|§70]], new |
| **Test name** | `test_plx_dom_014` |

### PLX-DOM-015

`deletedAt` **MUST** affect visibility only. No process **MUST** interpret a non-null `deletedAt` as authority to remove Events, Relationships or version history.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S32 Canonical Entity Model|§32]] |
| **Derives from** | [[S32 Canonical Entity Model|§32]], [[S44 Domain Invariants|§44]] R5 |
| **Test name** | `test_plx_dom_015` |

### PLX-DOM-020

No Object type **MUST** receive privileged treatment in storage, permission evaluation, event generation, versioning or Context Health computation.

| | |
|---|---|
| **Verification** | `I, T` |
| **Defined in** | [[S33 Desk Entity|§33]] |
| **Derives from** | [[S11 Objects|§11]], [[S34 Object Entity|§34]] |
| **Test name** | `test_plx_dom_020` |

### PLX-DOM-021

`DeskAiConfig.enabled = false` **MUST** disable all AI reasoning for the Desk, including background relationship discovery, embedding generation and Resume summarisation, while leaving deterministic Context Health and Resume assembly operational.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S33 Desk Entity|§33]] |
| **Derives from** | [[S33 Desk Entity|§33]], new |
| **Test name** | `test_plx_dom_021` |

### PLX-DOM-022

An inferred `Objective` **MUST** carry a confidence band and **MUST** be visually marked as unconfirmed until a user accepts it (`[[REQ-PRD#PLX-PRD-006|PLX-PRD-006]]`).

| | |
|---|---|
| **Verification** | `T, D` |
| **Defined in** | [[S33 Desk Entity|§33]] |
| **Derives from** | [[S33 Desk Entity|§33]], [[S12 Context|§12]] |
| **Test name** | `test_plx_dom_022` |

### PLX-DOM-030

Context Health **MUST NOT** be stored as a scalar attribute on the Object entity. It **MUST** be computed or materialised per (user, Object) pair (`[[REQ-UX#PLX-UX-020|PLX-UX-020]]`).

| | |
|---|---|
| **Verification** | `T, I` |
| **Defined in** | [[S34 Object Entity|§34]] |
| **Derives from** | §20.1, [[S34 Object Entity|§34]] |
| **Test name** | `test_plx_dom_030` |

### PLX-DOM-031

`DeskPresence.effectivePermissions` **MUST** be computed as the most restrictive intersection of the owning Desk permissions and the presenting Desk permissions (`[[REQ-PRD#PLX-PRD-061|PLX-PRD-061]]`).

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S34 Object Entity|§34]] |
| **Derives from** | [[S16 Shared Objects|§16]], [[S34 Object Entity|§34]] |
| **Test name** | `test_plx_dom_031` |

### PLX-DOM-032

Large Object content **MUST** be stored out-of-band via `contentRef` and **MUST NOT** be embedded in Event payloads. Events **MUST** reference content by immutable digest.

| | |
|---|---|
| **Verification** | `T, A` |
| **Defined in** | [[S34 Object Entity|§34]] |
| **Derives from** | [[S34 Object Entity|§34]], [[S64 Event Contracts|§64]], new |
| **Test name** | `test_plx_dom_032` |

### PLX-DOM-040

`decisionOwner` and every `Approval.approver` **MUST** be a human principal. An Agent or service principal **MUST NOT** be recorded as a Decision owner or approver.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S37 Decision Entity|§37]] |
| **Derives from** | §37.4, §7.7 |
| **Test name** | `test_plx_dom_040` |

### PLX-DOM-041

`aiCommentary` **MUST** be stored and displayed as advisory. It **MUST NOT** be rendered in a manner that implies it constitutes the Decision, the rationale of record, or an approval.

| | |
|---|---|
| **Verification** | `T, D` |
| **Defined in** | [[S37 Decision Entity|§37]] |
| **Derives from** | §37.4 |
| **Test name** | `test_plx_dom_041` |

### PLX-DOM-042

Superseding a Decision **MUST** set `supersededById`, **MUST** create a `DecisionSuperseded` Event, and **MUST** trigger Context Health re-evaluation for every Object referencing the superseded Decision.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S37 Decision Entity|§37]] |
| **Derives from** | [[S37 Decision Entity|§37]], [[S20 Context Health|§20]] |
| **Test name** | `test_plx_dom_042` |

### PLX-DOM-043

Rejected `alternatives` **MUST** be retained permanently. The record of what was *not* chosen, and why, **MUST NOT** be pruned by any retention or compression process.

| | |
|---|---|
| **Verification** | `T, I` |
| **Defined in** | [[S37 Decision Entity|§37]] |
| **Derives from** | §37.2, new |
| **Test name** | `test_plx_dom_043` |

### PLX-DOM-050

`FocusRecord` data (which Object, for how long) **MUST** be classified as presence-class data and **MUST** be subject to the retention constraints of `[[REQ-UX#PLX-UX-072|PLX-UX-072]]`.

| | |
|---|---|
| **Verification** | `T, I` |
| **Defined in** | [[S40 Session Entity|§40]] |
| **Derives from** | [[S40 Session Entity|§40]], [[S25 Collaboration|§25]] |
| **Test name** | `test_plx_dom_050` |

### PLX-DOM-051

Sessions **MUST** be closed by explicit exit, by timeout, or by recovery on next connection. An unclosed Session **MUST NOT** block Resume generation.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S40 Session Entity|§40]] |
| **Derives from** | [[S40 Session Entity|§40]], new |
| **Test name** | `test_plx_dom_051` |
