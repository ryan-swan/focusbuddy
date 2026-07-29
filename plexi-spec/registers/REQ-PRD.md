---
type: requirement-register
area: PRD
domain: "Product model"
count: 36
tags:
  - requirements
  - area/prd
---

# REQ-PRD — Product model

36 normative requirements. Identifiers are permanent and never reused.

> [!important] For Claude Code
> Every requirement below is binding. Cite the ID in the test name that verifies it (`test_plx_prd_001_*`) so [[S74 Definition of Done|§74]] gate 13 (requirement-to-test traceability) can be machine-checked.

| ID | § | V | Summary |
|---|---|---|---|
| [[#PLX-PRD-001]] | §10 | T | Every Object MUST belong to exactly one owning Desk. |
| [[#PLX-PRD-002]] | §10 | T, D | A Desk MUST persist its complete visual layout, including Object positions, sizes, z-order, scroll positions, selections and zoom  |
| [[#PLX-PRD-003]] | §10 | T | Desk archetype MUST be a mutable attribute. Changing archetype MUST NOT require data migration, MUST NOT alter Object ownership, a |
| [[#PLX-PRD-004]] | §10 | T | Desk state transitions MUST follow the state machine in §10.4. Invalid transitions MUST be rejected with a machine-readable error  |
| [[#PLX-PRD-005]] | §10 | T | Archiving or moving a Desk to Historical MUST NOT delete Events, Relationships or Decisions, and MUST NOT remove the Desk from sea |
| [[#PLX-PRD-006]] | §10 | T, D | A Desk MUST carry an explicit, user-editable Current Objective. Where absent, the platform MUST prompt for one and MAY propose a d |
| [[#PLX-PRD-010]] | §11 | I, T | All Object types MUST use the universal Object schema (§34). Type-specific data MUST be carried in the typed payload, not by exten |
| [[#PLX-PRD-011]] | §11 | T | The Object type registry MUST be extensible at runtime without redeployment of the Object Service, and extension-registered types  |
| [[#PLX-PRD-012]] | §11 | T | Deletion of an Object MUST remove it from default visibility and search results while retaining its Events, Relationships and vers |
| [[#PLX-PRD-013]] | §11 | D, I | The platform MUST present users with an accurate, plain-language statement of what deletion does and does not remove, at the point |
| [[#PLX-PRD-014]] | §11 | T, A | Every Object MUST carry semantic embeddings maintained within PLX-PERF-020 of a content-changing Event, or be explicitly excluded  |
| [[#PLX-PRD-020]] | §12 | T | Cognitive Context values MUST be labelled with their acquisition method: declared (user-stated), inferred (model-derived), or abse |
| [[#PLX-PRD-021]] | §12 | T, D | Inferred Cognitive Context MUST carry a confidence score and MUST be visually distinguished from declared Cognitive Context wherev |
| [[#PLX-PRD-022]] | §12 | T, D | Inferred Cognitive Context below the platform confidence threshold MUST NOT be displayed as an assertion. It MAY be offered as a q |
| [[#PLX-PRD-023]] | §12 | D | The platform MUST provide a low-friction affordance for a user to declare their current question and expected next action, and MUS |
| [[#PLX-PRD-030]] | §13 | I, D | Workspace Memory capture MUST be automatic. The platform MUST NOT expose any user action whose function is to save context. |
| [[#PLX-PRD-031]] | §13 | T | A Session snapshot MUST be written on Desk exit, on session timeout, and at intervals not exceeding 60 seconds during active work, |
| [[#PLX-PRD-032]] | §13 | T | Context compression MUST NOT delete, alter or render unreadable any Event in the Event Store. Compression MUST produce a derived s |
| [[#PLX-PRD-033]] | §13 | T, D | Every compressed summary MUST be expandable to the underlying Event set on user request. |
| [[#PLX-PRD-034]] | §13 | T, I | Memory layers (§66) MUST carry independent, tenant-configurable retention policies, and retention policy application MUST emit an  |
| [[#PLX-PRD-040]] | §14 | T, D | Resume generation MUST be continuous and automatic. The platform MUST NOT require a user to request a Resume. |
| [[#PLX-PRD-041]] | §14 | T | Every Resume assertion MUST carry references to the Events that support it. |
| [[#PLX-PRD-042]] | §14 | T, D | Resume Objects MUST be versioned and comparable, so that a user can diff the current understanding against any prior Resume for th |
| [[#PLX-PRD-043]] | §14 | T, A | Estimated catch-up time MUST be presented with an accuracy qualifier, and its calibration MUST be tracked as PLX-MET-003. |
| [[#PLX-PRD-044]] | §14 | T, D | Where the Resume Engine has insufficient signal to produce a confident summary, it MUST state that plainly rather than emitting a  |
| [[#PLX-PRD-050]] | §15 | T | Every Relationship MUST carry provenance: discovery method, creating actor or system, evidence references, and confidence. |
| [[#PLX-PRD-051]] | §15 | T | AI-discovered Relationships MUST be stored as provisional and MUST NOT influence Context Health, Resume content or permission eval |
| [[#PLX-PRD-052]] | §15 | T | Promotion of a provisional Relationship to confirmed by threshold MUST emit a RelationshipConfirmed Event recording the threshold  |
| [[#PLX-PRD-053]] | §15 | D | The platform MUST NOT require a user to manually construct graph structure in order to receive relationship-derived intelligence. |
| [[#PLX-PRD-060]] | §16 | T | Sharing an Object into an additional Desk MUST NOT change its owning Desk. |
| [[#PLX-PRD-061]] | §16 | T | Where an Object appears in multiple Desks with differing permissions, the most restrictive applicable permission MUST govern for a |
| [[#PLX-PRD-062]] | §16 | D | The synchronisation mode of a shared Object MUST be visible to every user who can see the Object, so that no user edits a Snapshot |
| [[#PLX-PRD-063]] | §16 | T | Federated Objects MUST record all owners explicitly, and a change of the owner set MUST emit an Event and require approval from th |
| [[#PLX-PRD-070]] | §17 | T | Cross-Desk awareness statements MUST be permission-filtered per recipient. A statement MUST NOT be rendered if doing so would disc |
| [[#PLX-PRD-071]] | §17 | T, I | Where a cross-Desk dependency exists but the recipient lacks permission to see its subject, the platform MUST either suppress the  |
| [[#PLX-PRD-072]] | §17 | T | Departure of a user (deactivation) MUST NOT remove Objects, Decisions, Relationships or Events they authored, and MUST trigger an  |

---

### PLX-PRD-001

Every Object **MUST** belong to exactly one owning Desk.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S10 The Desk|§10]] |
| **Derives from** | [[S10 The Desk|§10]], [[S44 Domain Invariants|§44]] R1 |
| **Test name** | `test_plx_prd_001` |

### PLX-PRD-002

A Desk **MUST** persist its complete visual layout, including Object positions, sizes, z-order, scroll positions, selections and zoom level, and **MUST** restore it on reopen.

| | |
|---|---|
| **Verification** | `T, D` |
| **Defined in** | [[S10 The Desk|§10]] |
| **Derives from** | §10.2, [[S21 Workspace Navigation|§21]] |
| **Test name** | `test_plx_prd_002` |

### PLX-PRD-003

Desk archetype **MUST** be a mutable attribute. Changing archetype **MUST NOT** require data migration, **MUST NOT** alter Object ownership, and **MUST** emit a `DeskArchetypeChanged` Event.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S10 The Desk|§10]] |
| **Derives from** | §10.3, new |
| **Test name** | `test_plx_prd_003` |

### PLX-PRD-004

Desk state transitions **MUST** follow the state machine in §10.4. Invalid transitions **MUST** be rejected with a machine-readable error identifying the attempted and permitted transitions.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S10 The Desk|§10]] |
| **Derives from** | §10.4 |
| **Test name** | `test_plx_prd_004` |

### PLX-PRD-005

Archiving or moving a Desk to Historical **MUST NOT** delete Events, Relationships or Decisions, and **MUST NOT** remove the Desk from search for users holding read permission.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S10 The Desk|§10]] |
| **Derives from** | §10.4, [[S44 Domain Invariants|§44]] R5 |
| **Test name** | `test_plx_prd_005` |

### PLX-PRD-006

A Desk **MUST** carry an explicit, user-editable **Current Objective**. Where absent, the platform **MUST** prompt for one and **MAY** propose a draft derived from Desk activity; a proposed objective **MUST** be marked as unconfirmed until a user accepts it.

| | |
|---|---|
| **Verification** | `T, D` |
| **Defined in** | [[S10 The Desk|§10]] |
| **Derives from** | [[S19 Cognitive Design Principles|§19]], [[S33 Desk Entity|§33]] |
| **Test name** | `test_plx_prd_006` |

### PLX-PRD-010

All Object types **MUST** use the universal Object schema ([[S34 Object Entity|§34]]). Type-specific data **MUST** be carried in the typed payload, not by extending the base schema.

| | |
|---|---|
| **Verification** | `I, T` |
| **Defined in** | [[S11 Objects|§11]] |
| **Derives from** | [[S11 Objects|§11]], [[S34 Object Entity|§34]] |
| **Test name** | `test_plx_prd_010` |

### PLX-PRD-011

The Object type registry **MUST** be extensible at runtime without redeployment of the Object Service, and extension-registered types **MUST** receive identical permission, event, versioning and Context Health handling to built-in types.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S11 Objects|§11]] |
| **Derives from** | §11.3, [[S83 Marketplace Architecture|§83]] |
| **Test name** | `test_plx_prd_011` |

### PLX-PRD-012

Deletion of an Object **MUST** remove it from default visibility and search results while retaining its Events, Relationships and version history.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S11 Objects|§11]] |
| **Derives from** | §11.4, [[S44 Domain Invariants|§44]] R5 |
| **Test name** | `test_plx_prd_012` |

### PLX-PRD-013

The platform **MUST** present users with an accurate, plain-language statement of what deletion does and does not remove, at the point of deletion.

| | |
|---|---|
| **Verification** | `D, I` |
| **Defined in** | [[S11 Objects|§11]] |
| **Derives from** | §11.4, new |
| **Test name** | `test_plx_prd_013` |

### PLX-PRD-014

Every Object **MUST** carry semantic embeddings maintained within `[[REQ-PERF#PLX-PERF-020|PLX-PERF-020]]` of a content-changing Event, or be explicitly excluded from semantic indexing by policy with the exclusion recorded.

| | |
|---|---|
| **Verification** | `T, A` |
| **Defined in** | [[S11 Objects|§11]] |
| **Derives from** | §11.2, [[S54 Search Architecture|§54]] |
| **Test name** | `test_plx_prd_014` |

### PLX-PRD-020

Cognitive Context values **MUST** be labelled with their acquisition method: `declared` (user-stated), `inferred` (model-derived), or `absent`.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S12 Context|§12]] |
| **Derives from** | [[S12 Context|§12]], new |
| **Test name** | `test_plx_prd_020` |

### PLX-PRD-021

Inferred Cognitive Context **MUST** carry a confidence score and **MUST** be visually distinguished from declared Cognitive Context wherever displayed.

| | |
|---|---|
| **Verification** | `T, D` |
| **Defined in** | [[S12 Context|§12]] |
| **Derives from** | [[S12 Context|§12]], new |
| **Test name** | `test_plx_prd_021` |

### PLX-PRD-022

Inferred Cognitive Context below the platform confidence threshold **MUST NOT** be displayed as an assertion. It **MAY** be offered as a question to the user.

| | |
|---|---|
| **Verification** | `T, D` |
| **Defined in** | [[S12 Context|§12]] |
| **Derives from** | [[S12 Context|§12]], new |
| **Test name** | `test_plx_prd_022` |

### PLX-PRD-023

The platform **MUST** provide a low-friction affordance for a user to declare their current question and expected next action, and **MUST NOT** require it.

| | |
|---|---|
| **Verification** | `D` |
| **Defined in** | [[S12 Context|§12]] |
| **Derives from** | [[S12 Context|§12]], [[S40 Session Entity|§40]] |
| **Test name** | `test_plx_prd_023` |

### PLX-PRD-030

Workspace Memory capture **MUST** be automatic. The platform **MUST NOT** expose any user action whose function is to save context.

| | |
|---|---|
| **Verification** | `I, D` |
| **Defined in** | [[S13 Workspace Memory|§13]] |
| **Derives from** | §13.2 |
| **Test name** | `test_plx_prd_030` |

### PLX-PRD-031

A Session snapshot **MUST** be written on Desk exit, on session timeout, and at intervals not exceeding 60 seconds during active work, so that context survives unexpected client termination.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S13 Workspace Memory|§13]] |
| **Derives from** | §13.3, new |
| **Test name** | `test_plx_prd_031` |

### PLX-PRD-032

Context compression **MUST NOT** delete, alter or render unreadable any Event in the Event Store. Compression **MUST** produce a derived summary artefact that references the compressed Events by identifier.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S13 Workspace Memory|§13]] |
| **Derives from** | §13.4, [[S49 Event Store|§49]] |
| **Test name** | `test_plx_prd_032` |

### PLX-PRD-033

Every compressed summary **MUST** be expandable to the underlying Event set on user request.

| | |
|---|---|
| **Verification** | `T, D` |
| **Defined in** | [[S13 Workspace Memory|§13]] |
| **Derives from** | §13.4, [[S23 Resume Experience|§23]] |
| **Test name** | `test_plx_prd_033` |

### PLX-PRD-034

Memory layers ([[S66 Workspace Memory Architecture|§66]]) **MUST** carry independent, tenant-configurable retention policies, and retention policy application **MUST** emit an auditable Event.

| | |
|---|---|
| **Verification** | `T, I` |
| **Defined in** | [[S13 Workspace Memory|§13]] |
| **Derives from** | [[S66 Workspace Memory Architecture|§66]] |
| **Test name** | `test_plx_prd_034` |

### PLX-PRD-040

Resume generation **MUST** be continuous and automatic. The platform **MUST NOT** require a user to request a Resume.

| | |
|---|---|
| **Verification** | `T, D` |
| **Defined in** | [[S14 Resume Intelligence|§14]] |
| **Derives from** | [[S14 Resume Intelligence|§14]], [[S52 Resume Engine|§52]] |
| **Test name** | `test_plx_prd_040` |

### PLX-PRD-041

Every Resume assertion **MUST** carry references to the Events that support it.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S14 Resume Intelligence|§14]] |
| **Derives from** | [[S14 Resume Intelligence|§14]], §7.9 |
| **Test name** | `test_plx_prd_041` |

### PLX-PRD-042

Resume Objects **MUST** be versioned and comparable, so that a user can diff the current understanding against any prior Resume for the same Desk.

| | |
|---|---|
| **Verification** | `T, D` |
| **Defined in** | [[S14 Resume Intelligence|§14]] |
| **Derives from** | [[S39 Resume Entity|§39]] |
| **Test name** | `test_plx_prd_042` |

### PLX-PRD-043

Estimated catch-up time **MUST** be presented with an accuracy qualifier, and its calibration **MUST** be tracked as `[[REQ-MET#PLX-MET-003|PLX-MET-003]]`.

| | |
|---|---|
| **Verification** | `T, A` |
| **Defined in** | [[S14 Resume Intelligence|§14]] |
| **Derives from** | §14.2, new |
| **Test name** | `test_plx_prd_043` |

### PLX-PRD-044

Where the Resume Engine has insufficient signal to produce a confident summary, it **MUST** state that plainly rather than emitting a low-confidence narrative.

| | |
|---|---|
| **Verification** | `T, D` |
| **Defined in** | [[S14 Resume Intelligence|§14]] |
| **Derives from** | [[S14 Resume Intelligence|§14]], §7.10 |
| **Test name** | `test_plx_prd_044` |

### PLX-PRD-050

Every Relationship **MUST** carry provenance: discovery method, creating actor or system, evidence references, and confidence.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S15 Knowledge Graph|§15]] |
| **Derives from** | §15.3, [[S36 Relationship Entity|§36]], [[S44 Domain Invariants|§44]] R3 |
| **Test name** | `test_plx_prd_050` |

### PLX-PRD-051

AI-discovered Relationships **MUST** be stored as `provisional` and **MUST NOT** influence Context Health, Resume content or permission evaluation until confirmed by a user or until confidence exceeds the configured tenant threshold.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S15 Knowledge Graph|§15]] |
| **Derives from** | §15.2, [[S36 Relationship Entity|§36]] |
| **Test name** | `test_plx_prd_051` |

### PLX-PRD-052

Promotion of a provisional Relationship to confirmed by threshold **MUST** emit a `RelationshipConfirmed` Event recording the threshold and the confidence at promotion.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S15 Knowledge Graph|§15]] |
| **Derives from** | [[S36 Relationship Entity|§36]], new |
| **Test name** | `test_plx_prd_052` |

### PLX-PRD-053

The platform **MUST NOT** require a user to manually construct graph structure in order to receive relationship-derived intelligence.

| | |
|---|---|
| **Verification** | `D` |
| **Defined in** | [[S15 Knowledge Graph|§15]] |
| **Derives from** | §6.8 |
| **Test name** | `test_plx_prd_053` |

### PLX-PRD-060

Sharing an Object into an additional Desk **MUST NOT** change its owning Desk.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S16 Shared Objects|§16]] |
| **Derives from** | §16.2, [[S44 Domain Invariants|§44]] R1 |
| **Test name** | `test_plx_prd_060` |

### PLX-PRD-061

Where an Object appears in multiple Desks with differing permissions, the **most restrictive** applicable permission **MUST** govern for a given user.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S16 Shared Objects|§16]] |
| **Derives from** | [[S16 Shared Objects|§16]], [[S44 Domain Invariants|§44]] R6, new |
| **Test name** | `test_plx_prd_061` |

### PLX-PRD-062

The synchronisation mode of a shared Object **MUST** be visible to every user who can see the Object, so that no user edits a Snapshot believing it is a Live Reference.

| | |
|---|---|
| **Verification** | `D` |
| **Defined in** | [[S16 Shared Objects|§16]] |
| **Derives from** | §16.1, new |
| **Test name** | `test_plx_prd_062` |

### PLX-PRD-063

Federated Objects **MUST** record all owners explicitly, and a change of the owner set **MUST** emit an Event and require approval from the existing owner set per tenant policy.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S16 Shared Objects|§16]] |
| **Derives from** | §16.1, new |
| **Test name** | `test_plx_prd_063` |

### PLX-PRD-070

Cross-Desk awareness statements **MUST** be permission-filtered per recipient. A statement **MUST NOT** be rendered if doing so would disclose the existence, name, or attributes of an Object, Desk or Decision the recipient is not permitted to know exists.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S17 Organisational Intelligence|§17]] |
| **Derives from** | §17.2, [[S44 Domain Invariants|§44]] R6 |
| **Test name** | `test_plx_prd_070` |

### PLX-PRD-071

Where a cross-Desk dependency exists but the recipient lacks permission to see its subject, the platform **MUST** either suppress the statement entirely or render a permission-safe form that discloses no protected attribute, according to tenant policy. The chosen behaviour **MUST** be configurable and auditable.

| | |
|---|---|
| **Verification** | `T, I` |
| **Defined in** | [[S17 Organisational Intelligence|§17]] |
| **Derives from** | §17.2, new |
| **Test name** | `test_plx_prd_071` |

### PLX-PRD-072

Departure of a user (deactivation) **MUST NOT** remove Objects, Decisions, Relationships or Events they authored, and **MUST** trigger an ownership reassignment workflow for Objects they owned.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S17 Organisational Intelligence|§17]] |
| **Derives from** | §17.3, new |
| **Test name** | `test_plx_prd_072` |
