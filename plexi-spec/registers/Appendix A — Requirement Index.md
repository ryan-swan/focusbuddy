---
type: appendix
appendix: A
title: "Requirement Index"
tags:
  - appendix
---

# Appendix A — Requirement Index

[[Home|▲ Home]]

---

**344 normative requirements** across 24 areas. Identifiers are permanent and are never reused (§0.2). Verification codes: **T** test · **A** analysis · **I** inspection · **D** demonstration (§0.3).

## A.1 Requirements by area

| Area | Domain | Count |
|---|---|---|
| `PRIN` | Foundational principles | 8 |
| `PRD` | Product model | 36 |
| `UX` | User experience | 40 |
| `A11Y` | Accessibility | 8 |
| `DOM` | Domain model | 20 |
| `ARC` | Platform & service architecture | 6 |
| `EVT` | Events, event store & contracts | 24 |
| `SYN` | Synchronisation | 6 |
| `CTX` | Context Engine | 16 |
| `RES` | Resume Engine | 12 |
| `GPH` | Knowledge Graph | 12 |
| `SCH` | Search | 5 |
| `AI` | AI orchestration & governance | 24 |
| `AGT` | Agents | 16 |
| `CON` | Connectors | 7 |
| `APP` | Native applications | 10 |
| `EXT` | Marketplace & SDK | 10 |
| `DATA` | Data architecture | 9 |
| `API` | API design | 8 |
| `SEC` | Security & privacy | 14 |
| `OPS` | Deployment & observability | 9 |
| `ENG` | Engineering standards | 11 |
| `PERF` | Performance | 18 |
| `MET` | Metrics | 15 |
| | **Total** | **344** |

## A.2 Full index

### PRIN — Foundational principles

| ID | § | Requirement | V |
|---|---|---|---|
| **[[REQ-PRIN#PLX-PRIN-001|PLX-PRIN-001]]** | [[S01 Executive Summary|§1]] | The platform MUST NOT require a user to perform any manual action whose sole purpose is to preserve context for their own future return. Saving, … | T, D |
| **[[REQ-PRIN#PLX-PRIN-002|PLX-PRIN-002]]** | [[S01 Executive Summary|§1]] | The platform MUST preserve context independently of the applications that produced it. Removal, replacement or deprecation of a Connector MUST NOT … | T |
| **[[REQ-PRIN#PLX-PRIN-003|PLX-PRIN-003]]** | [[S01 Executive Summary|§1]] | The platform MUST NOT position itself as a replacement for specialist applications. Native applications MUST be justified against the … | I |
| **[[REQ-PRIN#PLX-PRIN-004|PLX-PRIN-004]]** | [[S04 Vision|§4]] | Context, relationships, decisions and history MUST be exportable in a documented, machine-readable, vendor-neutral format sufficient to reconstruct … | T |
| **[[REQ-PRIN#PLX-PRIN-005|PLX-PRIN-005]]** | [[S04 Vision|§4]] | The platform MUST NOT make context durability contingent on a specific AI model, vendor or version. Withdrawal of any model provider MUST NOT … | A, I |
| **[[REQ-PRIN#PLX-PRIN-006|PLX-PRIN-006]]** | [[S07 Design Principles|§7]] | Every feature design MUST record, at design review, which of the ten design principles it advances and which it places under tension. Designs placing … | I |
| **[[REQ-PRIN#PLX-PRIN-007|PLX-PRIN-007]]** | [[S07 Design Principles|§7]] | Every user-visible AI recommendation MUST be accompanied by machine-retrievable evidence consisting of references to specific Objects, Events, … | T, D |
| **[[REQ-PRIN#PLX-PRIN-008|PLX-PRIN-008]]** | [[S07 Design Principles|§7]] | Every inferred Relationship, Context Health transition and Resume assertion MUST be traceable by the user to the Events that produced it, through no … | D |

### PRD — Product model

| ID | § | Requirement | V |
|---|---|---|---|
| **[[REQ-PRD#PLX-PRD-001|PLX-PRD-001]]** | [[S10 The Desk|§10]] | Every Object MUST belong to exactly one owning Desk. | T |
| **[[REQ-PRD#PLX-PRD-002|PLX-PRD-002]]** | [[S10 The Desk|§10]] | A Desk MUST persist its complete visual layout, including Object positions, sizes, z-order, scroll positions, selections and zoom level, and MUST … | T, D |
| **[[REQ-PRD#PLX-PRD-003|PLX-PRD-003]]** | [[S10 The Desk|§10]] | Desk archetype MUST be a mutable attribute. Changing archetype MUST NOT require data migration, MUST NOT alter Object ownership, and MUST emit a … | T |
| **[[REQ-PRD#PLX-PRD-004|PLX-PRD-004]]** | [[S10 The Desk|§10]] | Desk state transitions MUST follow the state machine in §10.4. Invalid transitions MUST be rejected with a machine-readable error identifying the … | T |
| **[[REQ-PRD#PLX-PRD-005|PLX-PRD-005]]** | [[S10 The Desk|§10]] | Archiving or moving a Desk to Historical MUST NOT delete Events, Relationships or Decisions, and MUST NOT remove the Desk from search for users … | T |
| **[[REQ-PRD#PLX-PRD-006|PLX-PRD-006]]** | [[S10 The Desk|§10]] | A Desk MUST carry an explicit, user-editable Current Objective. Where absent, the platform MUST prompt for one and MAY propose a draft derived from … | T, D |
| **[[REQ-PRD#PLX-PRD-010|PLX-PRD-010]]** | [[S11 Objects|§11]] | All Object types MUST use the universal Object schema ([[S34 Object Entity|§34]]). Type-specific data MUST be carried in the typed payload, not by extending the base … | I, T |
| **[[REQ-PRD#PLX-PRD-011|PLX-PRD-011]]** | [[S11 Objects|§11]] | The Object type registry MUST be extensible at runtime without redeployment of the Object Service, and extension-registered types MUST receive … | T |
| **[[REQ-PRD#PLX-PRD-012|PLX-PRD-012]]** | [[S11 Objects|§11]] | Deletion of an Object MUST remove it from default visibility and search results while retaining its Events, Relationships and version history. | T |
| **[[REQ-PRD#PLX-PRD-013|PLX-PRD-013]]** | [[S11 Objects|§11]] | The platform MUST present users with an accurate, plain-language statement of what deletion does and does not remove, at the point of deletion. | D, I |
| **[[REQ-PRD#PLX-PRD-014|PLX-PRD-014]]** | [[S11 Objects|§11]] | Every Object MUST carry semantic embeddings maintained within [[REQ-PERF#PLX-PERF-020|PLX-PERF-020]] of a content-changing Event, or be explicitly excluded from semantic … | T, A |
| **[[REQ-PRD#PLX-PRD-020|PLX-PRD-020]]** | [[S12 Context|§12]] | Cognitive Context values MUST be labelled with their acquisition method: declared (user-stated), inferred (model-derived), or absent. | T |
| **[[REQ-PRD#PLX-PRD-021|PLX-PRD-021]]** | [[S12 Context|§12]] | Inferred Cognitive Context MUST carry a confidence score and MUST be visually distinguished from declared Cognitive Context wherever displayed. | T, D |
| **[[REQ-PRD#PLX-PRD-022|PLX-PRD-022]]** | [[S12 Context|§12]] | Inferred Cognitive Context below the platform confidence threshold MUST NOT be displayed as an assertion. It MAY be offered as a question to the user. | T, D |
| **[[REQ-PRD#PLX-PRD-023|PLX-PRD-023]]** | [[S12 Context|§12]] | The platform MUST provide a low-friction affordance for a user to declare their current question and expected next action, and MUST NOT require it. | D |
| **[[REQ-PRD#PLX-PRD-030|PLX-PRD-030]]** | [[S13 Workspace Memory|§13]] | Workspace Memory capture MUST be automatic. The platform MUST NOT expose any user action whose function is to save context. | I, D |
| **[[REQ-PRD#PLX-PRD-031|PLX-PRD-031]]** | [[S13 Workspace Memory|§13]] | A Session snapshot MUST be written on Desk exit, on session timeout, and at intervals not exceeding 60 seconds during active work, so that context … | T |
| **[[REQ-PRD#PLX-PRD-032|PLX-PRD-032]]** | [[S13 Workspace Memory|§13]] | Context compression MUST NOT delete, alter or render unreadable any Event in the Event Store. Compression MUST produce a derived summary artefact … | T |
| **[[REQ-PRD#PLX-PRD-033|PLX-PRD-033]]** | [[S13 Workspace Memory|§13]] | Every compressed summary MUST be expandable to the underlying Event set on user request. | T, D |
| **[[REQ-PRD#PLX-PRD-034|PLX-PRD-034]]** | [[S13 Workspace Memory|§13]] | Memory layers ([[S66 Workspace Memory Architecture|§66]]) MUST carry independent, tenant-configurable retention policies, and retention policy application MUST emit an auditable Event. | T, I |
| **[[REQ-PRD#PLX-PRD-040|PLX-PRD-040]]** | [[S14 Resume Intelligence|§14]] | Resume generation MUST be continuous and automatic. The platform MUST NOT require a user to request a Resume. | T, D |
| **[[REQ-PRD#PLX-PRD-041|PLX-PRD-041]]** | [[S14 Resume Intelligence|§14]] | Every Resume assertion MUST carry references to the Events that support it. | T |
| **[[REQ-PRD#PLX-PRD-042|PLX-PRD-042]]** | [[S14 Resume Intelligence|§14]] | Resume Objects MUST be versioned and comparable, so that a user can diff the current understanding against any prior Resume for the same Desk. | T, D |
| **[[REQ-PRD#PLX-PRD-043|PLX-PRD-043]]** | [[S14 Resume Intelligence|§14]] | Estimated catch-up time MUST be presented with an accuracy qualifier, and its calibration MUST be tracked as [[REQ-MET#PLX-MET-003|PLX-MET-003]]. | T, A |
| **[[REQ-PRD#PLX-PRD-044|PLX-PRD-044]]** | [[S14 Resume Intelligence|§14]] | Where the Resume Engine has insufficient signal to produce a confident summary, it MUST state that plainly rather than emitting a low-confidence … | T, D |
| **[[REQ-PRD#PLX-PRD-050|PLX-PRD-050]]** | [[S15 Knowledge Graph|§15]] | Every Relationship MUST carry provenance: discovery method, creating actor or system, evidence references, and confidence. | T |
| **[[REQ-PRD#PLX-PRD-051|PLX-PRD-051]]** | [[S15 Knowledge Graph|§15]] | AI-discovered Relationships MUST be stored as provisional and MUST NOT influence Context Health, Resume content or permission evaluation until … | T |
| **[[REQ-PRD#PLX-PRD-052|PLX-PRD-052]]** | [[S15 Knowledge Graph|§15]] | Promotion of a provisional Relationship to confirmed by threshold MUST emit a RelationshipConfirmed Event recording the threshold and the confidence … | T |
| **[[REQ-PRD#PLX-PRD-053|PLX-PRD-053]]** | [[S15 Knowledge Graph|§15]] | The platform MUST NOT require a user to manually construct graph structure in order to receive relationship-derived intelligence. | D |
| **[[REQ-PRD#PLX-PRD-060|PLX-PRD-060]]** | [[S16 Shared Objects|§16]] | Sharing an Object into an additional Desk MUST NOT change its owning Desk. | T |
| **[[REQ-PRD#PLX-PRD-061|PLX-PRD-061]]** | [[S16 Shared Objects|§16]] | Where an Object appears in multiple Desks with differing permissions, the most restrictive applicable permission MUST govern for a given user. | T |
| **[[REQ-PRD#PLX-PRD-062|PLX-PRD-062]]** | [[S16 Shared Objects|§16]] | The synchronisation mode of a shared Object MUST be visible to every user who can see the Object, so that no user edits a Snapshot believing it is a … | D |
| **[[REQ-PRD#PLX-PRD-063|PLX-PRD-063]]** | [[S16 Shared Objects|§16]] | Federated Objects MUST record all owners explicitly, and a change of the owner set MUST emit an Event and require approval from the existing owner … | T |
| **[[REQ-PRD#PLX-PRD-070|PLX-PRD-070]]** | [[S17 Organisational Intelligence|§17]] | Cross-Desk awareness statements MUST be permission-filtered per recipient. A statement MUST NOT be rendered if doing so would disclose the existence, … | T |
| **[[REQ-PRD#PLX-PRD-071|PLX-PRD-071]]** | [[S17 Organisational Intelligence|§17]] | Where a cross-Desk dependency exists but the recipient lacks permission to see its subject, the platform MUST either suppress the statement entirely … | T, I |
| **[[REQ-PRD#PLX-PRD-072|PLX-PRD-072]]** | [[S17 Organisational Intelligence|§17]] | Departure of a user (deactivation) MUST NOT remove Objects, Decisions, Relationships or Events they authored, and MUST trigger an ownership … | T |

### UX — User experience

| ID | § | Requirement | V |
|---|---|---|---|
| **[[REQ-UX#PLX-UX-001|PLX-UX-001]]** | [[S18 User Experience Philosophy|§18]] | Every feature proposal MUST state, at design review, the cognitive load it removes. A proposal that adds capability without removing load MUST be … | I |
| **[[REQ-UX#PLX-UX-010|PLX-UX-010]]** | [[S19 Cognitive Design Principles|§19]] | The active Desk identity MUST be visible at all times in every view, without user action, including full-screen Object views. | D |
| **[[REQ-UX#PLX-UX-011|PLX-UX-011]]** | [[S19 Cognitive Design Principles|§19]] | The Desk Current Objective MUST be visible or retrievable in a single interaction from any view within the Desk. | D |
| **[[REQ-UX#PLX-UX-012|PLX-UX-012]]** | [[S19 Cognitive Design Principles|§19]] | Changes since the user's last review MUST be available on Desk open without the user performing any investigative action. | T, D |
| **[[REQ-UX#PLX-UX-013|PLX-UX-013]]** | [[S19 Cognitive Design Principles|§19]] | Ordering of changes presented to the user MUST be by materiality score ([[S80 Context Engine Algorithms|§80]]), not chronology. Chronological ordering MUST be available as an explicit … | T, D |
| **[[REQ-UX#PLX-UX-014|PLX-UX-014]]** | [[S19 Cognitive Design Principles|§19]] | Every Desk MUST present a Suggested Next Action derived from evidence, or explicitly state that no action is recommended. It MUST NOT present a … | T, D |
| **[[REQ-UX#PLX-UX-015|PLX-UX-015]]** | [[S19 Cognitive Design Principles|§19]] | Every recommendation, Context Health transition and Resume assertion MUST expose its evidence within one interaction from the point of display. | D |
| **[[REQ-UX#PLX-UX-020|PLX-UX-020]]** | [[S20 Context Health|§20]] | Context Health MUST be evaluated per (user, Object) pair, relative to that user's last review point. | T |
| **[[REQ-UX#PLX-UX-021|PLX-UX-021]]** | [[S20 Context Health|§20]] | Context Health transitions MUST be driven by materiality score ([[S80 Context Engine Algorithms|§80]]), not by raw change detection. A non-material change MUST NOT produce an … | T |
| **[[REQ-UX#PLX-UX-022|PLX-UX-022]]** | [[S20 Context Health|§20]] | Context Health MUST propagate across confirmed Relationships. Propagation depth MUST be bounded by configuration, and the bound MUST be recorded in … | T, A |
| **[[REQ-UX#PLX-UX-023|PLX-UX-023]]** | [[S20 Context Health|§20]] | Presence (Live Activity) MUST be modelled orthogonally to Context Health state and MUST NOT overwrite an Attention Required or Decision Risk state. | T |
| **[[REQ-UX#PLX-UX-024|PLX-UX-024]]** | [[S20 Context Health|§20]] | Every Context Health transition MUST record the triggering Event, the materiality score, and the propagation path, and this record MUST be … | T |
| **[[REQ-UX#PLX-UX-025|PLX-UX-025]]** | [[S20 Context Health|§20]] | Transition to Decision Risk MUST identify the specific Decision or Decisions at risk and the specific change believed to invalidate them. A Decision … | T |
| **[[REQ-UX#PLX-UX-030|PLX-UX-030]]** | [[S21 Workspace Navigation|§21]] | The platform MUST NOT reposition, resize or reflow user-placed Objects on a Desk without explicit user action, except where required by a viewport … | T, D |
| **[[REQ-UX#PLX-UX-031|PLX-UX-031]]** | [[S21 Workspace Navigation|§21]] | Desk restoration MUST restore layout, scroll positions, window states, open conversations, selected Objects, AI discussions and active workflows to … | T, D |
| **[[REQ-UX#PLX-UX-032|PLX-UX-032]]** | [[S21 Workspace Navigation|§21]] | Layout MUST be persisted per (user, Desk, device class), so that a user's desktop arrangement is not overwritten by their mobile or multi-monitor … | T |
| **[[REQ-UX#PLX-UX-033|PLX-UX-033]]** | [[S21 Workspace Navigation|§21]] | Where layout cannot be fully restored (for example, an Object has been deleted or permission revoked), the platform MUST indicate what could not be … | D |
| **[[REQ-UX#PLX-UX-040|PLX-UX-040]]** | [[S22 Search Experience|§22]] | Search results MUST be ranked with the active Desk as a ranking input. The same query issued from two different Desks MUST be permitted to produce … | T |
| **[[REQ-UX#PLX-UX-041|PLX-UX-041]]** | [[S22 Search Experience|§22]] | Search MUST apply permission filtering as the first stage of the ranking pipeline, before any relevance computation, and MUST NOT disclose the … | T |
| **[[REQ-UX#PLX-UX-042|PLX-UX-042]]** | [[S26 Notifications|§26]] | Interruptive notification volume per active user MUST be instrumented and reported per release as a regression metric. | A |
| **[[REQ-UX#PLX-UX-043|PLX-UX-043]]** | [[S26 Notifications|§26]] | Every notification emitted MUST record the escalation layer it entered at and the trigger that escalated it. Notifications emitted without a recorded … | T, I |
| **[[REQ-UX#PLX-UX-044|PLX-UX-044]]** | [[S26 Notifications|§26]] | The Security category MUST be exempt from user-configurable suppression. All other categories MUST be user-suppressible. | T |
| **[[REQ-UX#PLX-UX-045|PLX-UX-045]]** | [[S26 Notifications|§26]] | A user MUST be able to view, in one place, every signal the platform chose *not* to escalate to them in a given period, so that suppression remains … | D |
| **[[REQ-UX#PLX-UX-050|PLX-UX-050]]** | [[S23 Resume Experience|§23]] | Every Desk open MUST present a Resume Card. Where no changes have occurred, it MUST state so explicitly rather than rendering empty. | T, D |
| **[[REQ-UX#PLX-UX-051|PLX-UX-051]]** | [[S23 Resume Experience|§23]] | The disclosure path Summary → Details → Evidence → History → Raw Events MUST be complete and navigable for every Resume assertion. | D |
| **[[REQ-UX#PLX-UX-052|PLX-UX-052]]** | [[S23 Resume Experience|§23]] | The Resume Card MUST display a confidence score, and the meaning of the score MUST be documented in-product in plain language. | D, I |
| **[[REQ-UX#PLX-UX-060|PLX-UX-060]]** | [[S24 AI Experience|§24]] | Every AI recommendation presented to a user MUST carry all eight fields of §24.3. A recommendation missing evidence MUST NOT be displayed. | T |
| **[[REQ-UX#PLX-UX-061|PLX-UX-061]]** | [[S24 AI Experience|§24]] | AI MUST obtain explicit user confirmation before any action that mutates an Object, changes a permission, sends an external communication, or incurs … | T, D |
| **[[REQ-UX#PLX-UX-062|PLX-UX-062]]** | [[S24 AI Experience|§24]] | AI-generated content MUST be visually and programmatically distinguishable from human-authored content at every point of display and in every export. | T, D |
| **[[REQ-UX#PLX-UX-063|PLX-UX-063]]** | [[S24 AI Experience|§24]] | Confidence scores presented to users MUST be derived from a documented, calibrated methodology. Uncalibrated model self-report MUST NOT be surfaced … | A, I |
| **[[REQ-UX#PLX-UX-070|PLX-UX-070]]** | [[S25 Collaboration|§25]] | Presence information MUST be permission-scoped. A user MUST NOT be shown the presence of another user on an Object they cannot themselves see. | T |
| **[[REQ-UX#PLX-UX-071|PLX-UX-071]]** | [[S25 Collaboration|§25]] | Change communication MUST be expressed in terms of consequence where consequence is derivable, and MUST fall back to factual activity description … | T, D |
| **[[REQ-UX#PLX-UX-072|PLX-UX-072]]** | [[S25 Collaboration|§25]] | Presence data MUST be treated as personal data with a defined, tenant-configurable retention period, and MUST NOT be retained in the Event Store … | T, I |
| **[[REQ-UX#PLX-UX-080|PLX-UX-080]]** | [[S28 Mobile Experience|§28]] | Resume review and Decision approval MUST be fully functional on mobile, including evidence disclosure to at least the Evidence level of §23.2. | T, D |
| **[[REQ-UX#PLX-UX-081|PLX-UX-081]]** | [[S28 Mobile Experience|§28]] | Mobile MUST NOT be required to render or restore the spatial Canvas layout. Mobile layout state MUST NOT overwrite desktop layout state ([[REQ-UX#PLX-UX-032|PLX-UX-032]]). | T |
| **[[REQ-UX#PLX-UX-082|PLX-UX-082]]** | [[S28 Mobile Experience|§28]] | Objects captured on mobile MUST be attributed to a Desk at capture time, with a user-configurable default capture Desk. | T, D |
| **[[REQ-UX#PLX-UX-085|PLX-UX-085]]** | [[S82 Collaboration Framework|§82]] | Collaborative Resume content MUST be permission-filtered per viewing user at render time ([[REQ-RES#PLX-RES-004|PLX-RES-004]]). | T |
| **[[REQ-UX#PLX-UX-086|PLX-UX-086]]** | [[S82 Collaboration Framework|§82]] | Team awareness data MUST NOT be aggregated into individual activity reports without explicit tenant configuration, subject to [[REQ-SEC#PLX-SEC-033|PLX-SEC-033]]. | I, T |
| **[[REQ-UX#PLX-UX-090|PLX-UX-090]]** | [[S29 Future Interaction Models|§29]] | No Context, Relationship, Decision or Resume data MUST be stored in a presentation-specific form. Presentation state (layout, viewport, device class) … | I, T |
| **[[REQ-UX#PLX-UX-091|PLX-UX-091]]** | [[S29 Future Interaction Models|§29]] | Every capability exposed through the primary interface MUST be reachable through the public API ([[S63 Canonical API Design|§63]]), so that alternative interfaces are first-class … | T, I |

### A11Y — Accessibility

| ID | § | Requirement | V |
|---|---|---|---|
| **[[REQ-A11Y#PLX-A11Y-001|PLX-A11Y-001]]** | [[S27 Accessibility|§27]] | The platform MUST conform to WCAG 2.2 Level AA. Conformance MUST be verified per release against the published success criteria. | T, D, I |
| **[[REQ-A11Y#PLX-A11Y-002|PLX-A11Y-002]]** | [[S27 Accessibility|§27]] | Every function MUST be operable by keyboard alone, with a visible focus indicator and no keyboard trap. | T, D |
| **[[REQ-A11Y#PLX-A11Y-003|PLX-A11Y-003]]** | [[S27 Accessibility|§27]] | The spatial Canvas MUST provide an equivalent non-spatial, linear, screen-reader-navigable representation of Desk contents, structure and Object … | T, D |
| **[[REQ-A11Y#PLX-A11Y-004|PLX-A11Y-004]]** | [[S27 Accessibility|§27]] | Context Health states MUST be distinguishable without reliance on colour, using shape, text, or iconography in addition to colour. | T, D |
| **[[REQ-A11Y#PLX-A11Y-005|PLX-A11Y-005]]** | [[S27 Accessibility|§27]] | The platform MUST honour prefers-reduced-motion and provide an in-product reduced-motion setting that suppresses non-essential animation, including … | T, D |
| **[[REQ-A11Y#PLX-A11Y-006|PLX-A11Y-006]]** | [[S27 Accessibility|§27]] | Interface text and layout MUST remain functional at 200% zoom and at user-configured text scaling, without loss of content or functionality. | T, D |
| **[[REQ-A11Y#PLX-A11Y-007|PLX-A11Y-007]]** | [[S27 Accessibility|§27]] | Voice interaction, dictation and transcription MUST be available for Resume review, Decision approval and Object capture. | D |
| **[[REQ-A11Y#PLX-A11Y-008|PLX-A11Y-008]]** | [[S27 Accessibility|§27]] | Accessibility review MUST be a blocking item in the Definition of Done ([[S74 Definition of Done|§74]]). A feature MUST NOT be marked done with an open Level AA defect. | I |

### DOM — Domain model

| ID | § | Requirement | V |
|---|---|---|---|
| **[[REQ-DOM#PLX-DOM-001|PLX-DOM-001]]** | [[S30 Domain Model|§30]] | Every persisted concept MUST be expressible through the entities defined in Part IV. Introduction of a new persisted concept MUST proceed by … | I |
| **[[REQ-DOM#PLX-DOM-002|PLX-DOM-002]]** | [[S30 Domain Model|§30]] | No service MUST persist domain state outside the entity model, including in caches used as systems of record, in blob metadata, or in message … | I, A |
| **[[REQ-DOM#PLX-DOM-010|PLX-DOM-010]]** | [[S32 Canonical Entity Model|§32]] | Entity identifiers MUST be UUIDv7. Identifiers MUST be generable client-side without coordination, so that offline creation and later reconciliation … | T, I |
| **[[REQ-DOM#PLX-DOM-011|PLX-DOM-011]]** | [[S32 Canonical Entity Model|§32]] | Every entity MUST carry organisationId. Every data-access path MUST filter on organisationId at the persistence layer, not solely in application code. | T, I |
| **[[REQ-DOM#PLX-DOM-012|PLX-DOM-012]]** | [[S32 Canonical Entity Model|§32]] | Every entity MUST carry schemaVersion. Readers MUST tolerate unknown fields and MUST be able to upcast prior schema versions. | T |
| **[[REQ-DOM#PLX-DOM-013|PLX-DOM-013]]** | [[S32 Canonical Entity Model|§32]] | relationships and eventHistory on BaseEntity are materialised references, not the system of record. The authoritative sources are the Graph Engine … | I, T |
| **[[REQ-DOM#PLX-DOM-014|PLX-DOM-014]]** | [[S32 Canonical Entity Model|§32]] | aiMetadata.provenance MUST be set on every entity at creation and MUST NOT be downgraded from ai_generated to human by any subsequent operation. | T |
| **[[REQ-DOM#PLX-DOM-015|PLX-DOM-015]]** | [[S32 Canonical Entity Model|§32]] | deletedAt MUST affect visibility only. No process MUST interpret a non-null deletedAt as authority to remove Events, Relationships or version history. | T |
| **[[REQ-DOM#PLX-DOM-020|PLX-DOM-020]]** | [[S33 Desk Entity|§33]] | No Object type MUST receive privileged treatment in storage, permission evaluation, event generation, versioning or Context Health computation. | I, T |
| **[[REQ-DOM#PLX-DOM-021|PLX-DOM-021]]** | [[S33 Desk Entity|§33]] | DeskAiConfig.enabled = false MUST disable all AI reasoning for the Desk, including background relationship discovery, embedding generation and Resume … | T |
| **[[REQ-DOM#PLX-DOM-022|PLX-DOM-022]]** | [[S33 Desk Entity|§33]] | An inferred Objective MUST carry a confidence band and MUST be visually marked as unconfirmed until a user accepts it ([[REQ-PRD#PLX-PRD-006|PLX-PRD-006]]). | T, D |
| **[[REQ-DOM#PLX-DOM-030|PLX-DOM-030]]** | [[S34 Object Entity|§34]] | Context Health MUST NOT be stored as a scalar attribute on the Object entity. It MUST be computed or materialised per (user, Object) pair … | T, I |
| **[[REQ-DOM#PLX-DOM-031|PLX-DOM-031]]** | [[S34 Object Entity|§34]] | DeskPresence.effectivePermissions MUST be computed as the most restrictive intersection of the owning Desk permissions and the presenting Desk … | T |
| **[[REQ-DOM#PLX-DOM-032|PLX-DOM-032]]** | [[S34 Object Entity|§34]] | Large Object content MUST be stored out-of-band via contentRef and MUST NOT be embedded in Event payloads. Events MUST reference content by immutable … | T, A |
| **[[REQ-DOM#PLX-DOM-040|PLX-DOM-040]]** | [[S37 Decision Entity|§37]] | decisionOwner and every Approval.approver MUST be a human principal. An Agent or service principal MUST NOT be recorded as a Decision owner or … | T |
| **[[REQ-DOM#PLX-DOM-041|PLX-DOM-041]]** | [[S37 Decision Entity|§37]] | aiCommentary MUST be stored and displayed as advisory. It MUST NOT be rendered in a manner that implies it constitutes the Decision, the rationale of … | T, D |
| **[[REQ-DOM#PLX-DOM-042|PLX-DOM-042]]** | [[S37 Decision Entity|§37]] | Superseding a Decision MUST set supersededById, MUST create a DecisionSuperseded Event, and MUST trigger Context Health re-evaluation for every … | T |
| **[[REQ-DOM#PLX-DOM-043|PLX-DOM-043]]** | [[S37 Decision Entity|§37]] | Rejected alternatives MUST be retained permanently. The record of what was *not* chosen, and why, MUST NOT be pruned by any retention or compression … | T, I |
| **[[REQ-DOM#PLX-DOM-050|PLX-DOM-050]]** | [[S40 Session Entity|§40]] | FocusRecord data (which Object, for how long) MUST be classified as presence-class data and MUST be subject to the retention constraints of … | T, I |
| **[[REQ-DOM#PLX-DOM-051|PLX-DOM-051]]** | [[S40 Session Entity|§40]] | Sessions MUST be closed by explicit exit, by timeout, or by recovery on next connection. An unclosed Session MUST NOT block Resume generation. | T |

### ARC — Platform & service architecture

| ID | § | Requirement | V |
|---|---|---|---|
| **[[REQ-ARC#PLX-ARC-001|PLX-ARC-001]]** | [[S45 Platform Architecture|§45]] | Each service MUST own exactly one business capability and MUST own its own datastore. No service MUST read or write another service's datastore … | I, T |
| **[[REQ-ARC#PLX-ARC-002|PLX-ARC-002]]** | [[S45 Platform Architecture|§45]] | Inter-service communication MUST occur exclusively through published APIs and Events. Shared-database integration between services MUST NOT be used. | I, A |
| **[[REQ-ARC#PLX-ARC-010|PLX-ARC-010]]** | [[S45 Platform Architecture|§45]] | Every service MUST be horizontally scalable without coordinated deployment, and MUST tolerate concurrent instances of itself processing the same … | T, A |
| **[[REQ-ARC#PLX-ARC-020|PLX-ARC-020]]** | [[S47 Service Architecture|§47]] | Every service MUST publish an OpenAPI or equivalent machine-readable contract, and an AsyncAPI or equivalent Event contract, versioned and validated … | T, I |
| **[[REQ-ARC#PLX-ARC-021|PLX-ARC-021]]** | [[S47 Service Architecture|§47]] | Every service MUST document its failure modes and recovery procedures before production deployment ([[S73 Engineering Standards|§73]]). | I |
| **[[REQ-ARC#PLX-ARC-022|PLX-ARC-022]]** | [[S47 Service Architecture|§47]] | No service MUST require synchronous availability of the AI Orchestrator to serve its core capability. Loss of AI availability MUST degrade the … | T, A |

### EVT — Events, event store & contracts

| ID | § | Requirement | V |
|---|---|---|---|
| **[[REQ-EVT#PLX-EVT-010|PLX-EVT-010]]** | [[S35 Event Entity|§35]] | Events MUST be immutable once written. The Event Store MUST NOT expose update or delete operations for Event records through any interface, including … | T, I |
| **[[REQ-EVT#PLX-EVT-011|PLX-EVT-011]]** | [[S35 Event Entity|§35]] | Every Event MUST carry correlationId and, where it was caused by another Event or a command, causationId, so that any derived state can be traced to … | T |
| **[[REQ-EVT#PLX-EVT-012|PLX-EVT-012]]** | [[S35 Event Entity|§35]] | Every Event MUST carry a snapshot of the permissions in effect at emission, so that historical replay evaluates access against the permissions of the … | T |
| **[[REQ-EVT#PLX-EVT-013|PLX-EVT-013]]** | [[S35 Event Entity|§35]] | Events MUST distinguish occurrence time (timestamp) from ingestion time (recordedAt). Consumers MUST order by sequence within a partition, never by … | T |
| **[[REQ-EVT#PLX-EVT-014|PLX-EVT-014]]** | [[S35 Event Entity|§35]] | Event emission and the corresponding state mutation MUST be atomic. Implementations MUST use a transactional outbox or an equivalent mechanism … | T, I |
| **[[REQ-EVT#PLX-EVT-015|PLX-EVT-015]]** | [[S35 Event Entity|§35]] | Every Event consumer MUST be idempotent. Consumers MUST tolerate at-least-once delivery and duplicate delivery without producing duplicate derived … | T |
| **[[REQ-EVT#PLX-EVT-020|PLX-EVT-020]]** | [[S48 Event Architecture|§48]] | Deterministic processing of an Event MUST complete before any AI reasoning is invoked on that Event. AI invocation MUST NOT be a precondition for any … | T, A |
| **[[REQ-EVT#PLX-EVT-021|PLX-EVT-021]]** | [[S48 Event Architecture|§48]] | Failure or unavailability of AI reasoning MUST NOT prevent Event processing, Context Health computation or Resume generation from completing. | T |
| **[[REQ-EVT#PLX-EVT-022|PLX-EVT-022]]** | [[S48 Event Architecture|§48]] | The Event Bus MUST preserve ordering within a partition. The partition key MUST be deskId for Desk-scoped Events and objectId for Object-scoped … | T, A |
| **[[REQ-EVT#PLX-EVT-023|PLX-EVT-023]]** | [[S48 Event Architecture|§48]] | Every Event MUST be assigned to exactly one of the categories in §48.2, and the category MUST be carried on the wire. | T |
| **[[REQ-EVT#PLX-EVT-024|PLX-EVT-024]]** | [[S48 Event Architecture|§48]] | Consumers MUST handle out-of-order delivery across partitions and MUST NOT assume global total ordering. | T |
| **[[REQ-EVT#PLX-EVT-030|PLX-EVT-030]]** | [[S49 Event Store|§49]] | The Event Store MUST be immutable and append-only. No interface, including administrative and database-level access, MUST permit update or deletion … | T, I |
| **[[REQ-EVT#PLX-EVT-031|PLX-EVT-031]]** | [[S49 Event Store|§49]] | The Event Store MUST support full and selective replay, reconstructing the state of any Desk at any point in its history. | T |
| **[[REQ-EVT#PLX-EVT-032|PLX-EVT-032]]** | [[S49 Event Store|§49]] | The Event Store MUST be time-indexed and tenant-isolated, and MUST be encrypted at rest with tenant-scoped key material. | T, I |
| **[[REQ-EVT#PLX-EVT-033|PLX-EVT-033]]** | [[S49 Event Store|§49]] | Replay MUST evaluate access against the permission snapshot carried on each Event ([[REQ-EVT#PLX-EVT-012|PLX-EVT-012]]), not against current permissions. | T |
| **[[REQ-EVT#PLX-EVT-034|PLX-EVT-034]]** | [[S49 Event Store|§49]] | Personal data within Event payloads MUST be stored under per-subject encryption keys such that destruction of the key renders that data permanently … | T, I |
| **[[REQ-EVT#PLX-EVT-035|PLX-EVT-035]]** | [[S49 Event Store|§49]] | Event schema evolution MUST be supported by an upcasting layer. Readers MUST be able to interpret every schema version ever written. Upcasters MUST … | T, I |
| **[[REQ-EVT#PLX-EVT-036|PLX-EVT-036]]** | [[S49 Event Store|§49]] | The platform MUST define and enforce a maximum Event payload size, and MUST reject oversized Events rather than truncating them. Large content MUST … | T |
| **[[REQ-EVT#PLX-EVT-040|PLX-EVT-040]]** | [[S64 Event Contracts|§64]] | Every Event MUST conform to CloudEvents v1.0.2 structure and MUST carry the Plexi extension attributes of §64.1. | T |
| **[[REQ-EVT#PLX-EVT-041|PLX-EVT-041]]** | [[S64 Event Contracts|§64]] | Event type names MUST be past tense and MUST carry an explicit version suffix. Command-shaped event names MUST be rejected in CI by a naming lint. | T, I |
| **[[REQ-EVT#PLX-EVT-042|PLX-EVT-042]]** | [[S64 Event Contracts|§64]] | Producers MUST guarantee that source + id is unique for each distinct Event. | T |
| **[[REQ-EVT#PLX-EVT-043|PLX-EVT-043]]** | [[S64 Event Contracts|§64]] | Every Event type MUST have a published JSON Schema at a stable dataschema URI, versioned, and validated in CI against every producer and consumer. | T, I |
| **[[REQ-EVT#PLX-EVT-044|PLX-EVT-044]]** | [[S64 Event Contracts|§64]] | A breaking change to an Event schema MUST be published as a new type version. Existing type versions MUST NOT be redefined. | I, T |
| **[[REQ-EVT#PLX-EVT-045|PLX-EVT-045]]** | [[S64 Event Contracts|§64]] | Large state payloads MUST be carried as content digests, not inline ([[REQ-DOM#PLX-DOM-032|PLX-DOM-032]]). | T |

### SYN — Synchronisation

| ID | § | Requirement | V |
|---|---|---|---|
| **[[REQ-SYN#PLX-SYN-001|PLX-SYN-001]]** | [[S50 Synchronisation Engine|§50]] | Collaborative text and rich-text Objects MUST use a CRDT with proven convergence, selected to support offline editing and reconnection without a … | I, T |
| **[[REQ-SYN#PLX-SYN-002|PLX-SYN-002]]** | [[S50 Synchronisation Engine|§50]] | The chosen CRDT implementation MUST have a defined garbage-collection or compaction strategy for tombstones and history metadata, and its growth … | A |
| **[[REQ-SYN#PLX-SYN-003|PLX-SYN-003]]** | [[S50 Synchronisation Engine|§50]] | Conflict resolution MUST be deterministic for every data class in §50.2. AI MUST NOT participate in conflict resolution for any class marked … | T |
| **[[REQ-SYN#PLX-SYN-010|PLX-SYN-010]]** | [[S50 Synchronisation Engine|§50]] | Offline clients MUST be able to create Objects and Events with client-generated identifiers and reconcile on reconnection without renumbering, … | T |
| **[[REQ-SYN#PLX-SYN-011|PLX-SYN-011]]** | [[S50 Synchronisation Engine|§50]] | On reconnection, an offline client's Events MUST be ingested with their original timestamp preserved and a distinct recordedAt, and downstream … | T |
| **[[REQ-SYN#PLX-SYN-012|PLX-SYN-012]]** | [[S50 Synchronisation Engine|§50]] | Where an offline edit cannot be merged (a Workflow or Decision class conflict), the platform MUST surface the conflict to the user with both versions … | T, D |

### CTX — Context Engine

| ID | § | Requirement | V |
|---|---|---|---|
| **[[REQ-CTX#PLX-CTX-001|PLX-CTX-001]]** | [[S38 Context Entity|§38]] | Context Objects MUST be versioned and retained. Superseded Context Objects MUST remain retrievable for audit. | T |
| **[[REQ-CTX#PLX-CTX-002|PLX-CTX-002]]** | [[S38 Context Entity|§38]] | Every field in a Context Object derived from inference MUST carry source, confidence and evidence (CognitiveField). | T |
| **[[REQ-CTX#PLX-CTX-010|PLX-CTX-010]]** | [[S51 Context Engine|§51]] | Materiality scoring MUST be deterministic and reproducible. Given identical inputs, it MUST produce an identical score. | T |
| **[[REQ-CTX#PLX-CTX-011|PLX-CTX-011]]** | [[S51 Context Engine|§51]] | Materiality scoring MUST NOT require an AI model call in its primary path. AI MAY be used to enrich explanation after scoring completes. | T, A |
| **[[REQ-CTX#PLX-CTX-012|PLX-CTX-012]]** | [[S51 Context Engine|§51]] | Materiality thresholds MUST be tenant-configurable and MUST be recorded on each scoring Event, so that a change in threshold is distinguishable from … | T, I |
| **[[REQ-CTX#PLX-CTX-013|PLX-CTX-013]]** | [[S51 Context Engine|§51]] | The Context Engine MUST bound dependency propagation by configured maximum depth and maximum fan-out. Where a propagation is truncated by either … | T, A |
| **[[REQ-CTX#PLX-CTX-014|PLX-CTX-014]]** | [[S51 Context Engine|§51]] | Context Health computation MUST meet [[REQ-PERF#PLX-PERF-020|PLX-PERF-020]] for direct impact and [[REQ-PERF#PLX-PERF-021|PLX-PERF-021]] for propagated impact. These are separate budgets and MUST NOT … | A |
| **[[REQ-CTX#PLX-CTX-020|PLX-CTX-020]]** | [[S80 Context Engine Algorithms|§80]] | Materiality scoring MUST be a pure function of its declared inputs — deterministic, reproducible and free of model invocation ([[REQ-CTX#PLX-CTX-010|PLX-CTX-010]], … | T |
| **[[REQ-CTX#PLX-CTX-021|PLX-CTX-021]]** | [[S80 Context Engine Algorithms|§80]] | The materiality function and its weights MUST be versioned, and the version MUST be recorded on every scoring Event, so that historical scores remain … | T |
| **[[REQ-CTX#PLX-CTX-022|PLX-CTX-022]]** | [[S80 Context Engine Algorithms|§80]] | Materiality weights MUST be tunable per tenant without code deployment, and every tuning change MUST emit an auditable Event. | T, I |
| **[[REQ-CTX#PLX-CTX-023|PLX-CTX-023]]** | [[S80 Context Engine Algorithms|§80]] | Propagation MUST be incremental. A change MUST NOT trigger recalculation of unaffected graph regions. | A, T |
| **[[REQ-CTX#PLX-CTX-024|PLX-CTX-024]]** | [[S80 Context Engine Algorithms|§80]] | Propagation MUST be bounded by maximum depth and maximum fan-out, both tenant-configurable, and truncation MUST be recorded and visible ([[REQ-CTX#PLX-CTX-013|PLX-CTX-013]]). | T, A |
| **[[REQ-CTX#PLX-CTX-025|PLX-CTX-025]]** | [[S80 Context Engine Algorithms|§80]] | Synchronous propagation MUST be limited to the budget of [[REQ-PERF#PLX-PERF-021|PLX-PERF-021]]; propagation beyond that budget MUST continue asynchronously and MUST update … | A, T |
| **[[REQ-CTX#PLX-CTX-026|PLX-CTX-026]]** | [[S80 Context Engine Algorithms|§80]] | Propagation MUST be cycle-safe. The Relationship graph is not acyclic and propagation MUST terminate on cyclic paths without repeated re-entry. | T |
| **[[REQ-CTX#PLX-CTX-030|PLX-CTX-030]]** | [[S80 Context Engine Algorithms|§80]] | Context freshness MUST be computed per (user, Desk) and MUST decay with elapsed meaningful change, not with elapsed time alone. | T |
| **[[REQ-CTX#PLX-CTX-031|PLX-CTX-031]]** | [[S80 Context Engine Algorithms|§80]] | Freshness scores MUST NOT be surfaced as a comparative measure between users, and MUST NOT be exportable in a form that supports individual … | I, T |

### RES — Resume Engine

| ID | § | Requirement | V |
|---|---|---|---|
| **[[REQ-RES#PLX-RES-001|PLX-RES-001]]** | [[S39 Resume Entity|§39]] | Resume Objects MUST be versioned and diffable against any prior Resume for the same Desk and user. | T, D |
| **[[REQ-RES#PLX-RES-002|PLX-RES-002]]** | [[S39 Resume Entity|§39]] | Every Resume MUST record the Event identifiers from which it was derived. A Resume assertion not traceable to Events MUST NOT be emitted. | T |
| **[[REQ-RES#PLX-RES-003|PLX-RES-003]]** | [[S39 Resume Entity|§39]] | estimatedCatchup MUST be expressed as a range with a stated basis, not a bare point value. | T, D |
| **[[REQ-RES#PLX-RES-004|PLX-RES-004]]** | [[S39 Resume Entity|§39]] | Where forUserId is null, the Resume MUST be permission-filtered at render time per viewing user; a collaborative Resume MUST NOT be materialised in a … | T |
| **[[REQ-RES#PLX-RES-010|PLX-RES-010]]** | [[S52 Resume Engine|§52]] | Resume generation MUST be incremental. A Resume update MUST NOT require reprocessing the full Event history of a Desk. | A, T |
| **[[REQ-RES#PLX-RES-011|PLX-RES-011]]** | [[S52 Resume Engine|§52]] | Stages 1–6 of the Resume pipeline MUST be independently testable and MUST produce a complete structured Resume without invoking a model. Stage 7 (AI … | T |
| **[[REQ-RES#PLX-RES-012|PLX-RES-012]]** | [[S52 Resume Engine|§52]] | Expensive reasoning outputs MUST be cached and keyed by the structured input digest, so that identical input never incurs repeated model cost. | T, A |
| **[[REQ-RES#PLX-RES-013|PLX-RES-013]]** | [[S52 Resume Engine|§52]] | Where stage 7 is unavailable or disabled, the Resume MUST still render from the structured output of stages 1–6. | T |
| **[[REQ-RES#PLX-RES-020|PLX-RES-020]]** | [[S81 Resume Algorithms|§81]] | Each Resume stage MUST be independently testable with recorded fixtures, and stage outputs MUST be inspectable in non-production environments. | T |
| **[[REQ-RES#PLX-RES-021|PLX-RES-021]]** | [[S81 Resume Algorithms|§81]] | Stages 1–5 and 7 MUST complete without model invocation. A Resume MUST be renderable from these stages alone ([[REQ-RES#PLX-RES-013|PLX-RES-013]]). | T |
| **[[REQ-RES#PLX-RES-022|PLX-RES-022]]** | [[S81 Resume Algorithms|§81]] | Catch-up estimation (stage 7) MUST be calibrated against observed reconstruction time ([[REQ-MET#PLX-MET-003|PLX-MET-003]]) and recalibrated at least quarterly per tenant. | A |
| **[[REQ-RES#PLX-RES-023|PLX-RES-023]]** | [[S81 Resume Algorithms|§81]] | Noise removal (stage 3) MUST be reversible: removed Events MUST remain reachable through the disclosure path of [[REQ-UX#PLX-UX-051|PLX-UX-051]]. | T |

### GPH — Knowledge Graph

| ID | § | Requirement | V |
|---|---|---|---|
| **[[REQ-GPH#PLX-GPH-001|PLX-GPH-001]]** | [[S36 Relationship Entity|§36]] | Every Relationship MUST carry at least one EvidenceRef. A Relationship with an empty evidence set MUST be rejected at write time. | T |
| **[[REQ-GPH#PLX-GPH-002|PLX-GPH-002]]** | [[S36 Relationship Entity|§36]] | Provisional Relationships MUST NOT contribute to Context Health propagation, Resume content, search ranking or permission evaluation. | T |
| **[[REQ-GPH#PLX-GPH-003|PLX-GPH-003]]** | [[S36 Relationship Entity|§36]] | Relationship confidence MUST be recalculated when supporting evidence is superseded or invalidated, and a Relationship whose confidence falls below … | T |
| **[[REQ-GPH#PLX-GPH-004|PLX-GPH-004]]** | [[S36 Relationship Entity|§36]] | Users MUST NOT be required to construct graph structure manually to obtain relationship-derived intelligence. Manual curation MUST be available as … | D |
| **[[REQ-GPH#PLX-GPH-005|PLX-GPH-005]]** | [[S36 Relationship Entity|§36]] | A rejected Relationship MUST be retained with state rejected and MUST NOT be re-proposed on identical evidence. | T |
| **[[REQ-GPH#PLX-GPH-010|PLX-GPH-010]]** | [[S53 Knowledge Graph Runtime|§53]] | Graph traversal MUST be permission-filtered. Traversal MUST NOT cross an edge into a node the requesting principal cannot read, and MUST NOT disclose … | T, A |
| **[[REQ-GPH#PLX-GPH-011|PLX-GPH-011]]** | [[S53 Knowledge Graph Runtime|§53]] | Graph storage MUST be tenant-namespaced at the engine level. Application-level tenant filtering alone MUST NOT be relied upon ([[REQ-SEC#PLX-SEC-011|PLX-SEC-011]]). | I, T |
| **[[REQ-GPH#PLX-GPH-012|PLX-GPH-012]]** | [[S53 Knowledge Graph Runtime|§53]] | Graph writes MUST be idempotent with respect to Event replay. Replaying an Event MUST NOT duplicate nodes or edges. | T |
| **[[REQ-GPH#PLX-GPH-013|PLX-GPH-013]]** | [[S53 Knowledge Graph Runtime|§53]] | Community detection, clustering and duplicate detection MUST run asynchronously and MUST NOT be on the synchronous path of any user-facing operation … | A |
| **[[REQ-GPH#PLX-GPH-020|PLX-GPH-020]]** | [[S65 Knowledge Graph Schema|§65]] | The relationship type vocabulary MUST be a single closed registry (Appendix E). Services MUST NOT introduce edge types outside the registry; … | T, I |
| **[[REQ-GPH#PLX-GPH-021|PLX-GPH-021]]** | [[S65 Knowledge Graph Schema|§65]] | Every edge MUST carry a permission scope, and traversal MUST evaluate it ([[REQ-GPH#PLX-GPH-010|PLX-GPH-010]]). | T |
| **[[REQ-GPH#PLX-GPH-022|PLX-GPH-022]]** | [[S65 Knowledge Graph Schema|§65]] | Node and edge writes MUST carry the correlationId of the originating Event, so that any graph state is traceable to the user action that produced it. | T |

### SCH — Search

| ID | § | Requirement | V |
|---|---|---|---|
| **[[REQ-SCH#PLX-SCH-001|PLX-SCH-001]]** | [[S54 Search Architecture|§54]] | Permission filtering MUST be the first stage of the ranking pipeline and MUST be applied at the index or query layer, not as a post-filter over … | T, A |
| **[[REQ-SCH#PLX-SCH-002|PLX-SCH-002]]** | [[S54 Search Architecture|§54]] | Result counts, pagination totals and relevance scores MUST NOT disclose the existence of non-permitted results. | T |
| **[[REQ-SCH#PLX-SCH-003|PLX-SCH-003]]** | [[S54 Search Architecture|§54]] | AI re-ranking MUST be the final stage and MUST be optional. Disabling it MUST degrade result ordering, not result correctness or completeness. | T |
| **[[REQ-SCH#PLX-SCH-004|PLX-SCH-004]]** | [[S54 Search Architecture|§54]] | Search MUST meet [[REQ-PERF#PLX-PERF-040|PLX-PERF-040]] with AI re-ranking disabled. AI re-ranking MUST operate within a separate, additive budget and MUST be abandoned rather … | A |
| **[[REQ-SCH#PLX-SCH-005|PLX-SCH-005]]** | [[S54 Search Architecture|§54]] | Semantic index freshness MUST meet [[REQ-PERF#PLX-PERF-041|PLX-PERF-041]]; where an Object's embedding is stale, results MUST still include the Object via keyword and … | T, A |

### AI — AI orchestration & governance

| ID | § | Requirement | V |
|---|---|---|---|
| **[[REQ-AI#PLX-AI-001|PLX-AI-001]]** | [[S55 AI Orchestration|§55]] | All model invocation MUST occur through a single internal abstraction. No service other than the AI Orchestrator MUST hold a provider SDK dependency … | I, T |
| **[[REQ-AI#PLX-AI-002|PLX-AI-002]]** | [[S55 AI Orchestration|§55]] | The platform MUST maintain a declared capability matrix per model covering at minimum: tool calling, structured output, context window, prompt … | I |
| **[[REQ-AI#PLX-AI-003|PLX-AI-003]]** | [[S55 AI Orchestration|§55]] | Task routing MUST refuse to dispatch a task to a model that does not declare the capabilities the task requires, and MUST emit ReasoningRejected … | T |
| **[[REQ-AI#PLX-AI-004|PLX-AI-004]]** | [[S55 AI Orchestration|§55]] | Provider substitution MUST be verifiable by an evaluation suite executed against every supported model, with results recorded per release. A provider … | T, A |
| **[[REQ-AI#PLX-AI-005|PLX-AI-005]]** | [[S55 AI Orchestration|§55]] | AI MUST NOT write domain state directly. All AI-originated changes MUST be proposed as Events subject to the same validation, permission and … | T, I |
| **[[REQ-AI#PLX-AI-006|PLX-AI-006]]** | [[S55 AI Orchestration|§55]] | Prompt assembly MUST enforce permission scoping: no content MUST enter a prompt that the requesting principal is not permitted to read. | T, A |
| **[[REQ-AI#PLX-AI-007|PLX-AI-007]]** | [[S55 AI Orchestration|§55]] | Every model invocation MUST be recorded with model identity, version, token counts, cost, latency, cache status and the identity of the requesting … | T, I |
| **[[REQ-AI#PLX-AI-010|PLX-AI-010]]** | [[S67 AI Prompt Framework|§67]] | Prompt assembly MUST enforce permission scoping at the retrieval layer ([[REQ-AI#PLX-AI-006|PLX-AI-006]]). Instructing a model to withhold content MUST NOT be used as an … | T, A |
| **[[REQ-AI#PLX-AI-011|PLX-AI-011]]** | [[S67 AI Prompt Framework|§67]] | Every assembled prompt MUST record the identifiers of every source from which context was drawn, so that a generated output's inputs are auditable. | T |
| **[[REQ-AI#PLX-AI-012|PLX-AI-012]]** | [[S67 AI Prompt Framework|§67]] | Organisation AI policies MUST be applied before user request content and MUST NOT be overridable by user or Object content. Content-originated … | T, A |
| **[[REQ-AI#PLX-AI-013|PLX-AI-013]]** | [[S67 AI Prompt Framework|§67]] | Prompt templates MUST be versioned and their versions recorded on each invocation, so that a change in output behaviour is attributable to a change … | T, I |
| **[[REQ-AI#PLX-AI-020|PLX-AI-020]]** | [[S68 AI Cost Optimisation|§68]] | Every AI invocation MUST record token counts, model identity and version, cost, latency and cache status ([[REQ-AI#PLX-AI-007|PLX-AI-007]]). | T |
| **[[REQ-AI#PLX-AI-021|PLX-AI-021]]** | [[S68 AI Cost Optimisation|§68]] | Reasoning outputs MUST be cached keyed by the digest of the structured input. Cache hit rate MUST be reported per prompt type. | T, A |
| **[[REQ-AI#PLX-AI-022|PLX-AI-022]]** | [[S68 AI Cost Optimisation|§68]] | Embeddings MUST NOT be regenerated for unchanged content. Embedding generation MUST be keyed by content digest and embedding model version. | T |
| **[[REQ-AI#PLX-AI-030|PLX-AI-030]]** | [[S68 AI Cost Optimisation|§68]] | Every Organisation and every Desk MUST support a configurable AI cost ceiling. Exceeding a ceiling MUST suspend AI operations for that scope and emit … | T |
| **[[REQ-AI#PLX-AI-031|PLX-AI-031]]** | [[S68 AI Cost Optimisation|§68]] | The platform MUST report fully loaded AI cost per active user per tenant ([[REQ-MET#PLX-MET-011|PLX-MET-011]]) and MUST publish a unit-economics model before general … | A, I |
| **[[REQ-AI#PLX-AI-032|PLX-AI-032]]** | [[S68 AI Cost Optimisation|§68]] | Model selection MUST be recorded per invocation with the routing rationale, so that cost regressions are attributable. | T |
| **[[REQ-AI#PLX-AI-040|PLX-AI-040]]** | [[S70 AI Governance|§70]] | Every AI recommendation MUST be accompanied by retrievable evidence ([[REQ-PRIN#PLX-PRIN-007|PLX-PRIN-007]]). | T |
| **[[REQ-AI#PLX-AI-041|PLX-AI-041]]** | [[S70 AI Governance|§70]] | AI MUST express uncertainty explicitly and MUST NOT present low-confidence output as assertion ([[REQ-PRD#PLX-PRD-022|PLX-PRD-022]], [[REQ-PRD#PLX-PRD-044|PLX-PRD-044]]). | T, D |
| **[[REQ-AI#PLX-AI-042|PLX-AI-042]]** | [[S70 AI Governance|§70]] | AI MUST NOT create organisational facts. Any assertion about the organisation MUST be derivable from structured platform data ([[Invariants#PLX-INV-04|PLX-INV-04]]). | T, A |
| **[[REQ-AI#PLX-AI-043|PLX-AI-043]]** | [[S70 AI Governance|§70]] | Every reasoning request MUST be logged with inputs by reference, model identity, output, cost and requesting principal, retained per tenant policy. | T, I |
| **[[REQ-AI#PLX-AI-044|PLX-AI-044]]** | [[S70 AI Governance|§70]] | The platform MUST support model replacement without application change ([[REQ-AI#PLX-AI-001|PLX-AI-001]]–[[REQ-AI#PLX-AI-004|PLX-AI-004]]). | T, A |
| **[[REQ-AI#PLX-AI-045|PLX-AI-045]]** | [[S70 AI Governance|§70]] | The platform MUST maintain, per deployed AI capability, a record sufficient to support regulatory obligations applicable in the tenant's … | I |
| **[[REQ-AI#PLX-AI-046|PLX-AI-046]]** | [[S70 AI Governance|§70]] | Where AI output materially influences a decision affecting an individual's employment, evaluation or access, the platform MUST record the human … | T, I |

### AGT — Agents

| ID | § | Requirement | V |
|---|---|---|---|
| **[[REQ-AGT#PLX-AGT-001|PLX-AGT-001]]** | [[S41 Agent Entity|§41]] | An Agent's effective permissions MUST be a subset of the permissions of the principal on whose behalf it acts. Permission checks MUST be enforced at … | T |
| **[[REQ-AGT#PLX-AGT-002|PLX-AGT-002]]** | [[S41 Agent Entity|§41]] | Every Agent action MUST emit an Event attributed to the Agent, with onBehalfOf populated. | T |
| **[[REQ-AGT#PLX-AGT-003|PLX-AGT-003]]** | [[S41 Agent Entity|§41]] | Agents MUST NOT create Relationships in confirmed state. Agent-created Relationships MUST be provisional. | T |
| **[[REQ-AGT#PLX-AGT-004|PLX-AGT-004]]** | [[S41 Agent Entity|§41]] | Agents MUST NOT assert organisational facts not derivable from structured platform data. Assertions MUST carry evidence references ([[Invariants#PLX-INV-04|PLX-INV-04]]). | T, A |
| **[[REQ-AGT#PLX-AGT-005|PLX-AGT-005]]** | [[S41 Agent Entity|§41]] | Every Agent MUST have exactly one actsOnBehalfOf human principal at any moment. An Agent with no accountable human principal MUST be suspended. | T |
| **[[REQ-AGT#PLX-AGT-006|PLX-AGT-006]]** | [[S41 Agent Entity|§41]] | Agent cost consumption MUST be metered against costCeiling and against the owning Desk's costCeilingPerMonth; exceeding either MUST suspend the Agent … | T, A |
| **[[REQ-AGT#PLX-AGT-010|PLX-AGT-010]]** | [[S56 Multi-Agent Architecture|§56]] | Inter-agent messages MUST conform to the AgentMessage schema and MUST be validated on both send and receive. Free-text-only inter-agent communication … | T |
| **[[REQ-AGT#PLX-AGT-011|PLX-AGT-011]]** | [[S56 Multi-Agent Architecture|§56]] | Agent replies MUST validate against the expectedOutput schema. A non-conforming reply MUST be rejected and retried or failed, never passed downstream. | T |
| **[[REQ-AGT#PLX-AGT-012|PLX-AGT-012]]** | [[S56 Multi-Agent Architecture|§56]] | context MUST be passed by reference. Inlining content into inter-agent messages MUST NOT be used, so that permission evaluation occurs at dereference … | T, I |
| **[[REQ-AGT#PLX-AGT-013|PLX-AGT-013]]** | [[S56 Multi-Agent Architecture|§56]] | Every agent message and reply MUST be recorded in the agent audit stream with full lineage via correlationId and causationId. | T |
| **[[REQ-AGT#PLX-AGT-014|PLX-AGT-014]]** | [[S56 Multi-Agent Architecture|§56]] | Agent-to-agent delegation MUST propagate onBehalfOf unchanged and MUST NOT permit permission escalation through delegation depth. Delegation depth … | T |
| **[[REQ-AGT#PLX-AGT-015|PLX-AGT-015]]** | [[S56 Multi-Agent Architecture|§56]] | No Agent MUST hold more than one specialisation. An Agent performing unrelated responsibilities MUST be decomposed. | I |
| **[[REQ-AGT#PLX-AGT-020|PLX-AGT-020]]** | [[S78 AI Agent Framework|§78]] | Every Agent class MUST declare its permitted tool set, and tool invocation MUST be permission-checked at the tool boundary against the acting … | T, A |
| **[[REQ-AGT#PLX-AGT-021|PLX-AGT-021]]** | [[S78 AI Agent Framework|§78]] | The Research Agent MUST NOT transmit tenant content to external systems unless the Desk's externalDataAllowed is true, and every external … | T, I |
| **[[REQ-AGT#PLX-AGT-022|PLX-AGT-022]]** | [[S78 AI Agent Framework|§78]] | Every Agent MUST have a defined evaluation suite with recorded pass thresholds, executed per release ([[REQ-ENG#PLX-ENG-013|PLX-ENG-013]]). | T |
| **[[REQ-AGT#PLX-AGT-023|PLX-AGT-023]]** | [[S78 AI Agent Framework|§78]] | Agent memory scope MUST be enforced at retrieval. An Agent with memoryScope: "desk" MUST NOT retrieve content from another Desk, even where the … | T |

### CON — Connectors

| ID | § | Requirement | V |
|---|---|---|---|
| **[[REQ-CON#PLX-CON-001|PLX-CON-001]]** | [[S57 Connector Framework|§57]] | Every Connector MUST declare which capabilities it implements. Consumers MUST query declared capabilities rather than assuming them. | T, I |
| **[[REQ-CON#PLX-CON-002|PLX-CON-002]]** | [[S57 Connector Framework|§57]] | Connectors MUST map external permissions into the Plexi permission model, and MUST NOT grant a Plexi principal access to external content beyond what … | T, A |
| **[[REQ-CON#PLX-CON-003|PLX-CON-003]]** | [[S57 Connector Framework|§57]] | Where a Connector cannot faithfully represent an external system's permission model, it MUST default to the most restrictive interpretation and MUST … | I, T |
| **[[REQ-CON#PLX-CON-004|PLX-CON-004]]** | [[S57 Connector Framework|§57]] | Connector credentials MUST be stored in a dedicated credential vault, encrypted with tenant-scoped keys, and MUST NOT be readable by any service … | T, I |
| **[[REQ-CON#PLX-CON-005|PLX-CON-005]]** | [[S57 Connector Framework|§57]] | Connector synchronisation MUST be resumable from a durable cursor and MUST be idempotent. Re-running a sync MUST NOT duplicate Objects or Events. | T |
| **[[REQ-CON#PLX-CON-006|PLX-CON-006]]** | [[S57 Connector Framework|§57]] | Removal of a Connector MUST NOT delete previously imported Objects, Relationships, Events or derived context ([[REQ-PRIN#PLX-PRIN-002|PLX-PRIN-002]]). | T |
| **[[REQ-CON#PLX-CON-007|PLX-CON-007]]** | [[S57 Connector Framework|§57]] | Connectors MUST implement backoff and rate-limit handling for the external system, and MUST surface persistent sync failure as a user-visible state … | T, D |

### APP — Native applications

| ID | § | Requirement | V |
|---|---|---|---|
| **[[REQ-APP#PLX-APP-001|PLX-APP-001]]** | [[S76 Native Application Philosophy|§76]] | Every native application build MUST record an ADR answering §76.3, reviewed and approved before implementation begins. | I |
| **[[REQ-APP#PLX-APP-002|PLX-APP-002]]** | [[S76 Native Application Philosophy|§76]] | Every native application MUST understand Desk context, Relationships, Workspace Memory, AI, permissions and Events, and MUST use the same platform … | I, T |
| **[[REQ-APP#PLX-APP-010|PLX-APP-010]]** | [[S77 Native Workspace Applications|§77]] | The Canvas MUST persist Object position, size and z-order per (user, Desk, device class) and restore them exactly ([[REQ-UX#PLX-UX-030|PLX-UX-030]], [[REQ-UX#PLX-UX-032|PLX-UX-032]]). | T, D |
| **[[REQ-APP#PLX-APP-011|PLX-APP-011]]** | [[S77 Native Workspace Applications|§77]] | The Canvas MUST provide the equivalent linear, screen-reader-navigable representation required by [[REQ-A11Y#PLX-A11Y-003|PLX-A11Y-003]], developed and released concurrently … | T, D |
| **[[REQ-APP#PLX-APP-012|PLX-APP-012]]** | [[S77 Native Workspace Applications|§77]] | Canvas rendering MUST virtualise off-viewport Objects so that Desk open latency ([[REQ-PERF#PLX-PERF-001|PLX-PERF-001]]) is independent of total Object count. | A, T |
| **[[REQ-APP#PLX-APP-020|PLX-APP-020]]** | [[S77 Native Workspace Applications|§77]] | The Decision Tracker MUST require a recorded alternative-considered entry, or an explicit statement that none was considered, before a Decision may … | T, D |
| **[[REQ-APP#PLX-APP-030|PLX-APP-030]]** | [[S77 Native Workspace Applications|§77]] | Meeting recording and transcription MUST obtain and record consent from all participants per the applicable jurisdiction, and MUST NOT commence … | T, D, I |
| **[[REQ-APP#PLX-APP-031|PLX-APP-031]]** | [[S77 Native Workspace Applications|§77]] | Decisions and actions extracted from a meeting by AI MUST be created as provisional and MUST require human confirmation before entering approved … | T |
| **[[REQ-APP#PLX-APP-040|PLX-APP-040]]** | [[S77 Native Workspace Applications|§77]] | The Relationship Explorer MUST apply permission-filtered traversal ([[REQ-GPH#PLX-GPH-010|PLX-GPH-010]]) and MUST NOT reveal node existence, path counts or graph distances … | T |
| **[[REQ-APP#PLX-APP-041|PLX-APP-041]]** | [[S77 Native Workspace Applications|§77]] | The Relationship Explorer MUST display, for every edge, its evidence, confidence, discovery method and state (provisional or confirmed). | D |

### EXT — Marketplace & SDK

| ID | § | Requirement | V |
|---|---|---|---|
| **[[REQ-EXT#PLX-EXT-001|PLX-EXT-001]]** | [[S83 Marketplace Architecture|§83]] | Extensions MUST execute within a sandbox with an explicitly granted capability set. Capability grants MUST be reviewed by the installing Organisation … | T, I |
| **[[REQ-EXT#PLX-EXT-002|PLX-EXT-002]]** | [[S83 Marketplace Architecture|§83]] | Extensions MUST use the same public platform interfaces as first-party applications ([[REQ-APP#PLX-APP-002|PLX-APP-002]]). No private interface MUST exist for first-party … | I, T |
| **[[REQ-EXT#PLX-EXT-003|PLX-EXT-003]]** | [[S83 Marketplace Architecture|§83]] | Extension actions MUST emit Events attributed to the extension, with onBehalfOf recording the authorising principal. | T |
| **[[REQ-EXT#PLX-EXT-004|PLX-EXT-004]]** | [[S83 Marketplace Architecture|§83]] | Extensions MUST NOT exceed the permissions of the principal on whose behalf they act, and permission enforcement MUST occur at the data-access layer, … | T, A |
| **[[REQ-EXT#PLX-EXT-005|PLX-EXT-005]]** | [[S83 Marketplace Architecture|§83]] | Extension-registered Object types and Relationship types MUST be registered in the platform registries ([[REQ-PRD#PLX-PRD-011|PLX-PRD-011]], [[REQ-GPH#PLX-GPH-020|PLX-GPH-020]]) and MUST receive … | T |
| **[[REQ-EXT#PLX-EXT-006|PLX-EXT-006]]** | [[S83 Marketplace Architecture|§83]] | Extensions MUST declare their data egress. An extension that transmits tenant content externally MUST disclose destinations at install time and MUST … | T, I |
| **[[REQ-EXT#PLX-EXT-007|PLX-EXT-007]]** | [[S83 Marketplace Architecture|§83]] | Extension resource and cost consumption MUST be metered and attributable, and MUST be subject to the Organisation cost ceiling ([[REQ-AI#PLX-AI-030|PLX-AI-030]]). | T |
| **[[REQ-EXT#PLX-EXT-010|PLX-EXT-010]]** | [[S84 Platform SDK|§84]] | The SDK MUST be versioned with a published support and deprecation policy of not less than 12 months ([[REQ-API#PLX-API-005|PLX-API-005]]). | I |
| **[[REQ-EXT#PLX-EXT-011|PLX-EXT-011]]** | [[S84 Platform SDK|§84]] | The SDK MUST be backward compatible within a major version. Breaking changes MUST require a major version increment. | T, I |
| **[[REQ-EXT#PLX-EXT-012|PLX-EXT-012]]** | [[S84 Platform SDK|§84]] | Every SDK interface MUST be exercised by at least one first-party application, so that the SDK's capability is continuously proven rather than … | T, I |

### DATA — Data architecture

| ID | § | Requirement | V |
|---|---|---|---|
| **[[REQ-DATA#PLX-DATA-001|PLX-DATA-001]]** | [[S62 Canonical Data Architecture|§62]] | Each store MUST have exactly one owning service. No store MUST be written by more than one service. | I |
| **[[REQ-DATA#PLX-DATA-002|PLX-DATA-002]]** | [[S62 Canonical Data Architecture|§62]] | Derived stores — graph, vector, search, Context DB, Resume DB — MUST be fully rebuildable from the Event Store. Rebuild MUST be tested at least once … | T, A |
| **[[REQ-DATA#PLX-DATA-003|PLX-DATA-003]]** | [[S62 Canonical Data Architecture|§62]] | Only the Event Store is a system of record for history. Only the Object store is a system of record for current Object content. Every other store … | I |
| **[[REQ-DATA#PLX-DATA-004|PLX-DATA-004]]** | [[S62 Canonical Data Architecture|§62]] | Every store MUST enforce tenant isolation at the storage layer ([[REQ-SEC#PLX-SEC-010|PLX-SEC-010]]), including graph namespaces and vector-index partitions. | T, I |
| **[[REQ-DATA#PLX-DATA-005|PLX-DATA-005]]** | [[S62 Canonical Data Architecture|§62]] | Every store MUST have a documented backup, restore and point-in-time-recovery procedure, and restore MUST be exercised at least quarterly against … | I, D |
| **[[REQ-DATA#PLX-DATA-006|PLX-DATA-006]]** | [[S62 Canonical Data Architecture|§62]] | Personal data MUST be catalogued per store, with its lawful basis, retention period and erasure mechanism recorded, before that store enters … | I |
| **[[REQ-DATA#PLX-DATA-010|PLX-DATA-010]]** | [[S66 Workspace Memory Architecture|§66]] | Each memory layer MUST carry an independent, tenant-configurable retention policy, and policy application MUST emit an auditable Event. | T, I |
| **[[REQ-DATA#PLX-DATA-011|PLX-DATA-011]]** | [[S66 Workspace Memory Architecture|§66]] | AI memory MUST be classified as derived and rebuildable. Loss of AI memory MUST NOT cause loss of Objects, Events, Relationships or Decisions. | T, I |
| **[[REQ-DATA#PLX-DATA-012|PLX-DATA-012]]** | [[S66 Workspace Memory Architecture|§66]] | Retention policies MUST NOT be capable of pruning Decision alternatives ([[REQ-DOM#PLX-DOM-043|PLX-DOM-043]]) or Event records ([[Invariants#PLX-INV-05|PLX-INV-05]]). | T |

### API — API design

| ID | § | Requirement | V |
|---|---|---|---|
| **[[REQ-API#PLX-API-001|PLX-API-001]]** | [[S63 Canonical API Design|§63]] | Every platform capability MUST be reachable through the public API. No capability MUST be exclusive to the first-party interface ([[REQ-UX#PLX-UX-091|PLX-UX-091]]). | T, I |
| **[[REQ-API#PLX-API-002|PLX-API-002]]** | [[S63 Canonical API Design|§63]] | API operations MUST be named for business intent. CRUD-shaped generic mutation endpoints MUST NOT be exposed publicly. | I |
| **[[REQ-API#PLX-API-003|PLX-API-003]]** | [[S63 Canonical API Design|§63]] | Every response MUST carry the envelope of §63.3, including correlationId matching the Events generated by the operation. | T |
| **[[REQ-API#PLX-API-004|PLX-API-004]]** | [[S63 Canonical API Design|§63]] | permissionContext.filtered MUST be set true whenever any result was withheld by permission, without disclosing what or how much was withheld. | T |
| **[[REQ-API#PLX-API-005|PLX-API-005]]** | [[S63 Canonical API Design|§63]] | APIs MUST be versioned. A breaking change MUST require a new version; prior versions MUST be supported for a published deprecation period of not less … | I, T |
| **[[REQ-API#PLX-API-006|PLX-API-006]]** | [[S63 Canonical API Design|§63]] | Every mutating operation MUST accept an idempotency key and MUST return the original result on retry with the same key. | T |
| **[[REQ-API#PLX-API-007|PLX-API-007]]** | [[S63 Canonical API Design|§63]] | Every API MUST enforce per-principal and per-tenant rate limits, and MUST return machine-readable limit state. | T |
| **[[REQ-API#PLX-API-008|PLX-API-008]]** | [[S63 Canonical API Design|§63]] | GraphQL query depth and complexity MUST be bounded, and permission filtering MUST be applied at the resolver layer for every field, not only at the … | T, I |

### SEC — Security & privacy

| ID | § | Requirement | V |
|---|---|---|---|
| **[[REQ-SEC#PLX-SEC-010|PLX-SEC-010]]** | [[S42 Organisation Entity|§42]] | Every store — relational, document, event, graph, vector and search — MUST enforce tenant isolation at the storage layer, including namespace or … | T, I |
| **[[REQ-SEC#PLX-SEC-011|PLX-SEC-011]]** | [[S42 Organisation Entity|§42]] | Cross-Organisation traversal, search or reasoning MUST be impossible by construction. No API, query path, agent tool or administrative interface MUST … | T, A |
| **[[REQ-SEC#PLX-SEC-020|PLX-SEC-020]]** | [[S69 Security Architecture|§69]] | Authorisation MUST be evaluated at the data-access layer of every service. Gateway-level authorisation alone MUST NOT be relied upon. | T, I |
| **[[REQ-SEC#PLX-SEC-021|PLX-SEC-021]]** | [[S69 Security Architecture|§69]] | Every authorisation decision MUST be auditable, recording principal, resource, decision, policy evaluated and timestamp. | T |
| **[[REQ-SEC#PLX-SEC-022|PLX-SEC-022]]** | [[S69 Security Architecture|§69]] | Temporary permissions MUST carry an explicit expiry and MUST be revoked automatically. Permission grants without expiry MUST be an explicit, audited … | T |
| **[[REQ-SEC#PLX-SEC-023|PLX-SEC-023]]** | [[S69 Security Architecture|§69]] | Permission changes MUST propagate to derived stores — search index, vector index, graph, materialised Context Health — within [[REQ-PERF#PLX-PERF-021|PLX-PERF-021]], and stale … | T, A |
| **[[REQ-SEC#PLX-SEC-024|PLX-SEC-024]]** | [[S69 Security Architecture|§69]] | All secrets MUST be stored in a managed vault with automatic rotation. Secrets MUST NOT appear in configuration files, environment variables in … | T, I |
| **[[REQ-SEC#PLX-SEC-025|PLX-SEC-025]]** | [[S69 Security Architecture|§69]] | Data residency MUST be enforceable per Organisation, including for AI inference. A tenant with an EU residency requirement MUST NOT have content … | T, I |
| **[[REQ-SEC#PLX-SEC-026|PLX-SEC-026]]** | [[S69 Security Architecture|§69]] | The platform MUST support customer-managed encryption keys for tenants requiring them, with key revocation rendering tenant data inaccessible. | T, I |
| **[[REQ-SEC#PLX-SEC-027|PLX-SEC-027]]** | [[S69 Security Architecture|§69]] | AI-generated content MUST be marked as such in storage and in every export ([[REQ-UX#PLX-UX-062|PLX-UX-062]], [[REQ-DOM#PLX-DOM-014|PLX-DOM-014]]). | T |
| **[[REQ-SEC#PLX-SEC-030|PLX-SEC-030]]** | [[S69 Security Architecture|§69]] | The platform MUST implement cryptographic erasure for personal data: per-subject key material, destroyed on valid erasure request, rendering that … | T, I |
| **[[REQ-SEC#PLX-SEC-031|PLX-SEC-031]]** | [[S69 Security Architecture|§69]] | The platform MUST maintain a data inventory identifying every location personal data is stored, including derived stores, caches, prompt logs, … | I, A |
| **[[REQ-SEC#PLX-SEC-032|PLX-SEC-032]]** | [[S69 Security Architecture|§69]] | Data subject access requests MUST be servicable within the statutory period, including data held in Event history, embeddings and AI memory. | D, A |
| **[[REQ-SEC#PLX-SEC-033|PLX-SEC-033]]** | [[S69 Security Architecture|§69]] | Presence, focus and dwell telemetry MUST be retained under the presence retention class ([[REQ-UX#PLX-UX-072|PLX-UX-072]]) and MUST NOT be repurposed for performance … | I, T |

### OPS — Deployment & observability

| ID | § | Requirement | V |
|---|---|---|---|
| **[[REQ-OPS#PLX-OPS-001|PLX-OPS-001]]** | [[S71 Deployment Architecture|§71]] | Every service MUST be deployable as a container with no host-specific dependencies and MUST support rolling deployment without downtime. | T, D |
| **[[REQ-OPS#PLX-OPS-002|PLX-OPS-002]]** | [[S71 Deployment Architecture|§71]] | The tenant isolation model (silo, pool or bridge) MUST be an explicit, recorded per-deployment decision, and the chosen model MUST be documented per … | I |
| **[[REQ-OPS#PLX-OPS-003|PLX-OPS-003]]** | [[S71 Deployment Architecture|§71]] | Regional deployment MUST enforce data residency for storage, processing, backups and AI inference ([[REQ-SEC#PLX-SEC-025|PLX-SEC-025]]). | T, I |
| **[[REQ-OPS#PLX-OPS-004|PLX-OPS-004]]** | [[S71 Deployment Architecture|§71]] | Every deployment topology offered commercially MUST be continuously exercised in CI. A topology that is not tested MUST NOT be offered. | T, I |
| **[[REQ-OPS#PLX-OPS-010|PLX-OPS-010]]** | [[S72 Observability|§72]] | Every service MUST emit metrics, structured logs and distributed traces using OpenTelemetry semantics, with correlationId propagated end to end from … | T, I |
| **[[REQ-OPS#PLX-OPS-011|PLX-OPS-011]]** | [[S72 Observability|§72]] | Every target in [[S58 Performance Requirements|§58]] MUST have a corresponding production SLI, an alert threshold and an error budget. | I, A |
| **[[REQ-OPS#PLX-OPS-012|PLX-OPS-012]]** | [[S72 Observability|§72]] | AI cost and token usage MUST be observable per tenant, per Desk, per prompt type and per model. | T |
| **[[REQ-OPS#PLX-OPS-013|PLX-OPS-013]]** | [[S72 Observability|§72]] | Logs MUST NOT contain Object content, personal data or prompt content. Content MUST be referenced by identifier and digest. | T, I |
| **[[REQ-OPS#PLX-OPS-014|PLX-OPS-014]]** | [[S72 Observability|§72]] | Event Store lag, derived-store rebuild lag and consumer lag per partition MUST be measured and alerted, as these are the platform's primary … | T, I |

### ENG — Engineering standards

| ID | § | Requirement | V |
|---|---|---|---|
| **[[REQ-ENG#PLX-ENG-001|PLX-ENG-001]]** | [[S59 Architectural Invariants|§59]] | Every invariant in Appendix B MUST have at least one automated detection test that fails if the invariant is violated. Invariants asserted only in … | T, I |
| **[[REQ-ENG#PLX-ENG-010|PLX-ENG-010]]** | [[S73 Engineering Standards|§73]] | Every change MUST be evaluated against [[S06 Product Philosophy|§6]] Philosophy 1: a change that increases functionality while reducing the accuracy or freshness of Context … | I |
| **[[REQ-ENG#PLX-ENG-011|PLX-ENG-011]]** | [[S73 Engineering Standards|§73]] | Contract tests MUST exist between every producer and consumer of an Event type and every API client and server, and MUST run in CI. | T |
| **[[REQ-ENG#PLX-ENG-012|PLX-ENG-012]]** | [[S73 Engineering Standards|§73]] | Event replay tests MUST verify that replaying a recorded Event stream reproduces identical derived state, and MUST run against every derived store. | T |
| **[[REQ-ENG#PLX-ENG-013|PLX-ENG-013]]** | [[S73 Engineering Standards|§73]] | AI evaluation tests MUST run against every supported model on every release, with recorded pass thresholds per prompt type ([[REQ-AI#PLX-AI-004|PLX-AI-004]]). | T |
| **[[REQ-ENG#PLX-ENG-014|PLX-ENG-014]]** | [[S73 Engineering Standards|§73]] | Every invariant in Appendix B MUST have an automated detection test ([[REQ-ENG#PLX-ENG-001|PLX-ENG-001]]). | T |
| **[[REQ-ENG#PLX-ENG-015|PLX-ENG-015]]** | [[S73 Engineering Standards|§73]] | Chaos testing MUST include AI provider unavailability, Event Bus partition loss, consumer lag and derived-store divergence, verifying [[REQ-ARC#PLX-ARC-022|PLX-ARC-022]] and … | T |
| **[[REQ-ENG#PLX-ENG-016|PLX-ENG-016]]** | [[S73 Engineering Standards|§73]] | Every service MUST publish the documentation set of §73.3 before production deployment. Deployment without it MUST be blocked. | I |
| **[[REQ-ENG#PLX-ENG-020|PLX-ENG-020]]** | [[S74 Definition of Done|§74]] | A feature MUST NOT be marked done with any [[S74 Definition of Done|§74]] gate unmet. Exceptions MUST be recorded as accepted risk with a named owner and a remediation date. | I |
| **[[REQ-ENG#PLX-ENG-021|PLX-ENG-021]]** | [[S74 Definition of Done|§74]] | Requirement-to-test traceability MUST be machine-checkable. CI MUST report any PLX-* requirement with no linked verifying test. | T, I |
| **[[REQ-ENG#PLX-ENG-030|PLX-ENG-030]]** | [[S85 Five-Year Product Roadmap|§85]] | Every item in §85.2 MUST be resolved, with the resolution recorded as an ADR, before the stated milestone. A milestone MUST NOT be declared complete … | I |

### PERF — Performance

| ID | § | Requirement | V |
|---|---|---|---|
| **[[REQ-PERF#PLX-PERF-001|PLX-PERF-001]]** | [[S58 Performance Requirements|§58]] | Desk open — first meaningful paint of Resume Card and layout | A |
| **[[REQ-PERF#PLX-PERF-002|PLX-PERF-002]]** | [[S58 Performance Requirements|§58]] | Desk open — full Object hydration | A |
| **[[REQ-PERF#PLX-PERF-010|PLX-PERF-010]]** | [[S58 Performance Requirements|§58]] | Object open (in-Desk) | A |
| **[[REQ-PERF#PLX-PERF-011|PLX-PERF-011]]** | [[S58 Performance Requirements|§58]] | Resume generation — deterministic stages 1–6 | A |
| **[[REQ-PERF#PLX-PERF-012|PLX-PERF-012]]** | [[S58 Performance Requirements|§58]] | Resume generation — including AI summary (stage 7) | A |
| **[[REQ-PERF#PLX-PERF-020|PLX-PERF-020]]** | [[S58 Performance Requirements|§58]] | Context Health update — direct impact (depth 0–1) | A |
| **[[REQ-PERF#PLX-PERF-021|PLX-PERF-021]]** | [[S58 Performance Requirements|§58]] | Context Health update — propagated impact (depth 2–N, within bound) | A |
| **[[REQ-PERF#PLX-PERF-022|PLX-PERF-022]]** | [[S58 Performance Requirements|§58]] | Graph traversal, permission-filtered, depth ≤ 3 | A |
| **[[REQ-PERF#PLX-PERF-030|PLX-PERF-030]]** | [[S58 Performance Requirements|§58]] | Event ingestion to Event Store durability | A |
| **[[REQ-PERF#PLX-PERF-031|PLX-PERF-031]]** | [[S58 Performance Requirements|§58]] | Event Store → bus delivery to first subscriber | A |
| **[[REQ-PERF#PLX-PERF-040|PLX-PERF-040]]** | [[S58 Performance Requirements|§58]] | Search, AI re-ranking disabled | A |
| **[[REQ-PERF#PLX-PERF-041|PLX-PERF-041]]** | [[S58 Performance Requirements|§58]] | Semantic index freshness after content-changing Event | A |
| **[[REQ-PERF#PLX-PERF-042|PLX-PERF-042]]** | [[S58 Performance Requirements|§58]] | Search, including AI re-ranking | A |
| **[[REQ-PERF#PLX-PERF-050|PLX-PERF-050]]** | [[S58 Performance Requirements|§58]] | AI recommendation, end to end | A |
| **[[REQ-PERF#PLX-PERF-060|PLX-PERF-060]]** | [[S58 Performance Requirements|§58]] | Authorisation decision | A |
| **[[REQ-PERF#PLX-PERF-070|PLX-PERF-070]]** | [[S58 Performance Requirements|§58]] | Every target in [[S58 Performance Requirements|§58]] MUST be continuously measured in production and alerted on. A target without production instrumentation MUST NOT be claimed as … | I, A |
| **[[REQ-PERF#PLX-PERF-071|PLX-PERF-071]]** | [[S58 Performance Requirements|§58]] | Performance targets MUST be re-derived and republished whenever reference load assumptions change by more than one order of magnitude in any … | I |
| **[[REQ-PERF#PLX-PERF-072|PLX-PERF-072]]** | [[S58 Performance Requirements|§58]] | Operations with an AI component MUST have a deterministic fallback that meets the corresponding non-AI target, so that AI latency degradation cannot … | T, A |

### MET — Metrics

| ID | § | Requirement | V |
|---|---|---|---|
| **[[REQ-MET#PLX-MET-001|PLX-MET-001]]** | [[S08 Success Criteria|§8]] | Resume accuracy | A |
| **[[REQ-MET#PLX-MET-002|PLX-MET-002]]** | [[S08 Success Criteria|§8]] | Context reconstruction time | A |
| **[[REQ-MET#PLX-MET-003|PLX-MET-003]]** | [[S08 Success Criteria|§8]] | Catch-up estimate calibration | A |
| **[[REQ-MET#PLX-MET-004|PLX-MET-004]]** | [[S08 Success Criteria|§8]] | Duplicate work detected | A |
| **[[REQ-MET#PLX-MET-005|PLX-MET-005]]** | [[S08 Success Criteria|§8]] | Decision latency | A |
| **[[REQ-MET#PLX-MET-006|PLX-MET-006]]** | [[S08 Success Criteria|§8]] | Attention precision | A |
| **[[REQ-MET#PLX-MET-007|PLX-MET-007]]** | [[S08 Success Criteria|§8]] | Search reduction | A |
| **[[REQ-MET#PLX-MET-008|PLX-MET-008]]** | [[S08 Success Criteria|§8]] | Knowledge reuse | A |
| **[[REQ-MET#PLX-MET-009|PLX-MET-009]]** | [[S08 Success Criteria|§8]] | Onboarding time to first contribution | A |
| **[[REQ-MET#PLX-MET-010|PLX-MET-010]]** | [[S08 Success Criteria|§8]] | AI recommendation trust | A |
| **[[REQ-MET#PLX-MET-011|PLX-MET-011]]** | [[S08 Success Criteria|§8]] | Infrastructure cost per active user | A |
| **[[REQ-MET#PLX-MET-012|PLX-MET-012]]** | [[S08 Success Criteria|§8]] | Every metric in §8.1 MUST be instrumented and reported before the capability it measures is declared generally available. A capability MUST NOT reach … | I, T |
| **[[REQ-MET#PLX-MET-013|PLX-MET-013]]** | [[S08 Success Criteria|§8]] | [[REQ-MET#PLX-MET-006|PLX-MET-006]] (attention precision) MUST be treated as a release gate. A release that reduces attention precision by more than 5 percentage points MUST … | A, I |
| **[[REQ-MET#PLX-MET-020|PLX-MET-020]]** | [[S86 Product Success Metrics|§86]] | Primary metrics MUST take precedence over secondary metrics in product decision-making. Where a change improves a secondary metric while degrading a … | I |
| **[[REQ-MET#PLX-MET-021|PLX-MET-021]]** | [[S86 Product Success Metrics|§86]] | "Time in product" and equivalent engagement-maximising metrics MUST NOT be adopted as success metrics. The platform's stated purpose is to reduce … | I |

## A.3 Verification method distribution

| Method | Requirements |
|---|---|
| **T** — Test | 262 |
| **A** — Analysis | 77 |
| **I** — Inspection | 108 |
| **D** — Demonstration | 57 |

Every requirement declares at least one method. A requirement without a verification method is not a requirement (§0.3).

---
