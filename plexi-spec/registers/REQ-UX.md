---
type: requirement-register
area: UX
domain: "User experience"
count: 40
tags:
  - requirements
  - area/ux
---

# REQ-UX — User experience

40 normative requirements. Identifiers are permanent and never reused.

> [!important] For Claude Code
> Every requirement below is binding. Cite the ID in the test name that verifies it (`test_plx_ux_001_*`) so [[S74 Definition of Done|§74]] gate 13 (requirement-to-test traceability) can be machine-checked.

| ID | § | V | Summary |
|---|---|---|---|
| [[#PLX-UX-001]] | §18 | I | Every feature proposal MUST state, at design review, the cognitive load it removes. A proposal that adds capability without removi |
| [[#PLX-UX-010]] | §19 | D | The active Desk identity MUST be visible at all times in every view, without user action, including full-screen Object views. |
| [[#PLX-UX-011]] | §19 | D | The Desk Current Objective MUST be visible or retrievable in a single interaction from any view within the Desk. |
| [[#PLX-UX-012]] | §19 | T, D | Changes since the user's last review MUST be available on Desk open without the user performing any investigative action. |
| [[#PLX-UX-013]] | §19 | T, D | Ordering of changes presented to the user MUST be by materiality score (§80), not chronology. Chronological ordering MUST be avail |
| [[#PLX-UX-014]] | §19 | T, D | Every Desk MUST present a Suggested Next Action derived from evidence, or explicitly state that no action is recommended. It MUST  |
| [[#PLX-UX-015]] | §19 | D | Every recommendation, Context Health transition and Resume assertion MUST expose its evidence within one interaction from the poin |
| [[#PLX-UX-020]] | §20 | T | Context Health MUST be evaluated per (user, Object) pair, relative to that user's last review point. |
| [[#PLX-UX-021]] | §20 | T | Context Health transitions MUST be driven by materiality score (§80), not by raw change detection. A non-material change MUST NOT  |
| [[#PLX-UX-022]] | §20 | T, A | Context Health MUST propagate across confirmed Relationships. Propagation depth MUST be bounded by configuration, and the bound MU |
| [[#PLX-UX-023]] | §20 | T | Presence (Live Activity) MUST be modelled orthogonally to Context Health state and MUST NOT overwrite an Attention Required or Dec |
| [[#PLX-UX-024]] | §20 | T | Every Context Health transition MUST record the triggering Event, the materiality score, and the propagation path, and this record |
| [[#PLX-UX-025]] | §20 | T | Transition to Decision Risk MUST identify the specific Decision or Decisions at risk and the specific change believed to invalidat |
| [[#PLX-UX-030]] | §21 | T, D | The platform MUST NOT reposition, resize or reflow user-placed Objects on a Desk without explicit user action, except where requir |
| [[#PLX-UX-031]] | §21 | T, D | Desk restoration MUST restore layout, scroll positions, window states, open conversations, selected Objects, AI discussions and ac |
| [[#PLX-UX-032]] | §21 | T | Layout MUST be persisted per (user, Desk, device class), so that a user's desktop arrangement is not overwritten by their mobile o |
| [[#PLX-UX-033]] | §21 | D | Where layout cannot be fully restored (for example, an Object has been deleted or permission revoked), the platform MUST indicate  |
| [[#PLX-UX-040]] | §22 | T | Search results MUST be ranked with the active Desk as a ranking input. The same query issued from two different Desks MUST be perm |
| [[#PLX-UX-041]] | §22 | T | Search MUST apply permission filtering as the first stage of the ranking pipeline, before any relevance computation, and MUST NOT  |
| [[#PLX-UX-042]] | §26 | A | Interruptive notification volume per active user MUST be instrumented and reported per release as a regression metric. |
| [[#PLX-UX-043]] | §26 | T, I | Every notification emitted MUST record the escalation layer it entered at and the trigger that escalated it. Notifications emitted |
| [[#PLX-UX-044]] | §26 | T | The Security category MUST be exempt from user-configurable suppression. All other categories MUST be user-suppressible. |
| [[#PLX-UX-045]] | §26 | D | A user MUST be able to view, in one place, every signal the platform chose *not* to escalate to them in a given period, so that su |
| [[#PLX-UX-050]] | §23 | T, D | Every Desk open MUST present a Resume Card. Where no changes have occurred, it MUST state so explicitly rather than rendering empt |
| [[#PLX-UX-051]] | §23 | D | The disclosure path Summary → Details → Evidence → History → Raw Events MUST be complete and navigable for every Resume assertion. |
| [[#PLX-UX-052]] | §23 | D, I | The Resume Card MUST display a confidence score, and the meaning of the score MUST be documented in-product in plain language. |
| [[#PLX-UX-060]] | §24 | T | Every AI recommendation presented to a user MUST carry all eight fields of §24.3. A recommendation missing evidence MUST NOT be di |
| [[#PLX-UX-061]] | §24 | T, D | AI MUST obtain explicit user confirmation before any action that mutates an Object, changes a permission, sends an external commun |
| [[#PLX-UX-062]] | §24 | T, D | AI-generated content MUST be visually and programmatically distinguishable from human-authored content at every point of display a |
| [[#PLX-UX-063]] | §24 | A, I | Confidence scores presented to users MUST be derived from a documented, calibrated methodology. Uncalibrated model self-report MUS |
| [[#PLX-UX-070]] | §25 | T | Presence information MUST be permission-scoped. A user MUST NOT be shown the presence of another user on an Object they cannot the |
| [[#PLX-UX-071]] | §25 | T, D | Change communication MUST be expressed in terms of consequence where consequence is derivable, and MUST fall back to factual activ |
| [[#PLX-UX-072]] | §25 | T, I | Presence data MUST be treated as personal data with a defined, tenant-configurable retention period, and MUST NOT be retained in t |
| [[#PLX-UX-080]] | §28 | T, D | Resume review and Decision approval MUST be fully functional on mobile, including evidence disclosure to at least the Evidence lev |
| [[#PLX-UX-081]] | §28 | T | Mobile MUST NOT be required to render or restore the spatial Canvas layout. Mobile layout state MUST NOT overwrite desktop layout  |
| [[#PLX-UX-082]] | §28 | T, D | Objects captured on mobile MUST be attributed to a Desk at capture time, with a user-configurable default capture Desk. |
| [[#PLX-UX-085]] | §82 | T | Collaborative Resume content MUST be permission-filtered per viewing user at render time (PLX-RES-004). |
| [[#PLX-UX-086]] | §82 | I, T | Team awareness data MUST NOT be aggregated into individual activity reports without explicit tenant configuration, subject to PLX- |
| [[#PLX-UX-090]] | §29 | I, T | No Context, Relationship, Decision or Resume data MUST be stored in a presentation-specific form. Presentation state (layout, view |
| [[#PLX-UX-091]] | §29 | T, I | Every capability exposed through the primary interface MUST be reachable through the public API (§63), so that alternative interfa |

---

### PLX-UX-001

Every feature proposal **MUST** state, at design review, the cognitive load it removes. A proposal that adds capability without removing load **MUST** be explicitly justified against [[S06 Product Philosophy|§6]] Philosophy 1 and recorded.

| | |
|---|---|
| **Verification** | `I` |
| **Defined in** | [[S18 User Experience Philosophy|§18]] |
| **Derives from** | [[S18 User Experience Philosophy|§18]], [[S06 Product Philosophy|§6]] |
| **Test name** | `test_plx_ux_001` |

### PLX-UX-010

The active Desk identity **MUST** be visible at all times in every view, without user action, including full-screen Object views.

| | |
|---|---|
| **Verification** | `D` |
| **Defined in** | [[S19 Cognitive Design Principles|§19]] |
| **Derives from** | §19.1 |
| **Test name** | `test_plx_ux_010` |

### PLX-UX-011

The Desk Current Objective **MUST** be visible or retrievable in a single interaction from any view within the Desk.

| | |
|---|---|
| **Verification** | `D` |
| **Defined in** | [[S19 Cognitive Design Principles|§19]] |
| **Derives from** | §19.2 |
| **Test name** | `test_plx_ux_011` |

### PLX-UX-012

Changes since the user's last review **MUST** be available on Desk open without the user performing any investigative action.

| | |
|---|---|
| **Verification** | `T, D` |
| **Defined in** | [[S19 Cognitive Design Principles|§19]] |
| **Derives from** | §19.3 |
| **Test name** | `test_plx_ux_012` |

### PLX-UX-013

Ordering of changes presented to the user **MUST** be by materiality score ([[S80 Context Engine Algorithms|§80]]), not chronology. Chronological ordering **MUST** be available as an explicit alternative view.

| | |
|---|---|
| **Verification** | `T, D` |
| **Defined in** | [[S19 Cognitive Design Principles|§19]] |
| **Derives from** | §19.4 |
| **Test name** | `test_plx_ux_013` |

### PLX-UX-014

Every Desk **MUST** present a Suggested Next Action derived from evidence, or explicitly state that no action is recommended. It **MUST NOT** present a fabricated or filler suggestion.

| | |
|---|---|
| **Verification** | `T, D` |
| **Defined in** | [[S19 Cognitive Design Principles|§19]] |
| **Derives from** | §19.5 |
| **Test name** | `test_plx_ux_014` |

### PLX-UX-015

Every recommendation, Context Health transition and Resume assertion **MUST** expose its evidence within one interaction from the point of display.

| | |
|---|---|
| **Verification** | `D` |
| **Defined in** | [[S19 Cognitive Design Principles|§19]] |
| **Derives from** | §19.6, [[S07 Design Principles|§7]] |
| **Test name** | `test_plx_ux_015` |

### PLX-UX-020

Context Health **MUST** be evaluated per (user, Object) pair, relative to that user's last review point.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S20 Context Health|§20]] |
| **Derives from** | §20.1 |
| **Test name** | `test_plx_ux_020` |

### PLX-UX-021

Context Health transitions **MUST** be driven by materiality score ([[S80 Context Engine Algorithms|§80]]), not by raw change detection. A non-material change **MUST NOT** produce an `Attention Required` transition.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S20 Context Health|§20]] |
| **Derives from** | [[S20 Context Health|§20]], [[S51 Context Engine|§51]] |
| **Test name** | `test_plx_ux_021` |

### PLX-UX-022

Context Health **MUST** propagate across confirmed Relationships. Propagation depth **MUST** be bounded by configuration, and the bound **MUST** be recorded in the propagation Event so that truncation is visible rather than silent.

| | |
|---|---|
| **Verification** | `T, A` |
| **Defined in** | [[S20 Context Health|§20]] |
| **Derives from** | §20.5, [[S80 Context Engine Algorithms|§80]] |
| **Test name** | `test_plx_ux_022` |

### PLX-UX-023

Presence (`Live Activity`) **MUST** be modelled orthogonally to Context Health state and **MUST NOT** overwrite an `Attention Required` or `Decision Risk` state.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S20 Context Health|§20]] |
| **Derives from** | §20.3, new |
| **Test name** | `test_plx_ux_023` |

### PLX-UX-024

Every Context Health transition **MUST** record the triggering Event, the materiality score, and the propagation path, and this record **MUST** be retrievable by the user (`[[REQ-UX#PLX-UX-015|PLX-UX-015]]`).

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S20 Context Health|§20]] |
| **Derives from** | [[S20 Context Health|§20]], [[S07 Design Principles|§7]] |
| **Test name** | `test_plx_ux_024` |

### PLX-UX-025

Transition to `Decision Risk` **MUST** identify the specific Decision or Decisions at risk and the specific change believed to invalidate them. A `Decision Risk` state without a named Decision **MUST NOT** be raised.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S20 Context Health|§20]] |
| **Derives from** | §20.3, [[S37 Decision Entity|§37]] |
| **Test name** | `test_plx_ux_025` |

### PLX-UX-030

The platform **MUST NOT** reposition, resize or reflow user-placed Objects on a Desk without explicit user action, except where required by a viewport change, and **MUST** restore the user's canonical layout when the original viewport is restored.

| | |
|---|---|
| **Verification** | `T, D` |
| **Defined in** | [[S21 Workspace Navigation|§21]] |
| **Derives from** | §21.2, §21.3 |
| **Test name** | `test_plx_ux_030` |

### PLX-UX-031

Desk restoration **MUST** restore layout, scroll positions, window states, open conversations, selected Objects, AI discussions and active workflows to the state recorded in the most recent Session snapshot.

| | |
|---|---|
| **Verification** | `T, D` |
| **Defined in** | [[S21 Workspace Navigation|§21]] |
| **Derives from** | §21.2 |
| **Test name** | `test_plx_ux_031` |

### PLX-UX-032

Layout **MUST** be persisted per (user, Desk, device class), so that a user's desktop arrangement is not overwritten by their mobile or multi-monitor arrangement.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S21 Workspace Navigation|§21]] |
| **Derives from** | [[S21 Workspace Navigation|§21]], new |
| **Test name** | `test_plx_ux_032` |

### PLX-UX-033

Where layout cannot be fully restored (for example, an Object has been deleted or permission revoked), the platform **MUST** indicate what could not be restored rather than silently omitting it.

| | |
|---|---|
| **Verification** | `D` |
| **Defined in** | [[S21 Workspace Navigation|§21]] |
| **Derives from** | [[S21 Workspace Navigation|§21]], new |
| **Test name** | `test_plx_ux_033` |

### PLX-UX-040

Search results **MUST** be ranked with the active Desk as a ranking input. The same query issued from two different Desks **MUST** be permitted to produce different orderings.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S22 Search Experience|§22]] |
| **Derives from** | §22.3, [[S54 Search Architecture|§54]] |
| **Test name** | `test_plx_ux_040` |

### PLX-UX-041

Search **MUST** apply permission filtering as the first stage of the ranking pipeline, before any relevance computation, and **MUST NOT** disclose the existence of non-permitted results through result counts, pagination totals or ranking artefacts.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S22 Search Experience|§22]] |
| **Derives from** | [[S54 Search Architecture|§54]], [[S44 Domain Invariants|§44]] R6 |
| **Test name** | `test_plx_ux_041` |

### PLX-UX-042

Interruptive notification volume per active user **MUST** be instrumented and reported per release as a regression metric.

| | |
|---|---|
| **Verification** | `A` |
| **Defined in** | [[S26 Notifications|§26]] |
| **Derives from** | §6.7, [[S26 Notifications|§26]], new |
| **Test name** | `test_plx_ux_042` |

### PLX-UX-043

Every notification emitted **MUST** record the escalation layer it entered at and the trigger that escalated it. Notifications emitted without a recorded escalation trigger **MUST** be treated as defects.

| | |
|---|---|
| **Verification** | `T, I` |
| **Defined in** | [[S26 Notifications|§26]] |
| **Derives from** | §26.2, new |
| **Test name** | `test_plx_ux_043` |

### PLX-UX-044

The `Security` category **MUST** be exempt from user-configurable suppression. All other categories **MUST** be user-suppressible.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S26 Notifications|§26]] |
| **Derives from** | §26.1, new |
| **Test name** | `test_plx_ux_044` |

### PLX-UX-045

A user **MUST** be able to view, in one place, every signal the platform chose *not* to escalate to them in a given period, so that suppression remains inspectable rather than opaque.

| | |
|---|---|
| **Verification** | `D` |
| **Defined in** | [[S26 Notifications|§26]] |
| **Derives from** | [[S26 Notifications|§26]], new |
| **Test name** | `test_plx_ux_045` |

### PLX-UX-050

Every Desk open **MUST** present a Resume Card. Where no changes have occurred, it **MUST** state so explicitly rather than rendering empty.

| | |
|---|---|
| **Verification** | `T, D` |
| **Defined in** | [[S23 Resume Experience|§23]] |
| **Derives from** | [[S23 Resume Experience|§23]] |
| **Test name** | `test_plx_ux_050` |

### PLX-UX-051

The disclosure path Summary → Details → Evidence → History → Raw Events **MUST** be complete and navigable for every Resume assertion.

| | |
|---|---|
| **Verification** | `D` |
| **Defined in** | [[S23 Resume Experience|§23]] |
| **Derives from** | §23.2 |
| **Test name** | `test_plx_ux_051` |

### PLX-UX-052

The Resume Card **MUST** display a confidence score, and the meaning of the score **MUST** be documented in-product in plain language.

| | |
|---|---|
| **Verification** | `D, I` |
| **Defined in** | [[S23 Resume Experience|§23]] |
| **Derives from** | §23.1, [[S55 AI Orchestration|§55]] |
| **Test name** | `test_plx_ux_052` |

### PLX-UX-060

Every AI recommendation presented to a user **MUST** carry all eight fields of §24.3. A recommendation missing evidence **MUST NOT** be displayed.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S24 AI Experience|§24]] |
| **Derives from** | §24.3, §7.9 |
| **Test name** | `test_plx_ux_060` |

### PLX-UX-061

AI **MUST** obtain explicit user confirmation before any action that mutates an Object, changes a permission, sends an external communication, or incurs cost above the tenant-configured threshold.

| | |
|---|---|
| **Verification** | `T, D` |
| **Defined in** | [[S24 AI Experience|§24]] |
| **Derives from** | §24.2 |
| **Test name** | `test_plx_ux_061` |

### PLX-UX-062

AI-generated content **MUST** be visually and programmatically distinguishable from human-authored content at every point of display and in every export.

| | |
|---|---|
| **Verification** | `T, D` |
| **Defined in** | [[S24 AI Experience|§24]] |
| **Derives from** | [[S24 AI Experience|§24]], [[S70 AI Governance|§70]], new |
| **Test name** | `test_plx_ux_062` |

### PLX-UX-063

Confidence scores presented to users **MUST** be derived from a documented, calibrated methodology. Uncalibrated model self-report **MUST NOT** be surfaced as a confidence score.

| | |
|---|---|
| **Verification** | `A, I` |
| **Defined in** | [[S24 AI Experience|§24]] |
| **Derives from** | §24.3, new |
| **Test name** | `test_plx_ux_063` |

### PLX-UX-070

Presence information **MUST** be permission-scoped. A user **MUST NOT** be shown the presence of another user on an Object they cannot themselves see.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S25 Collaboration|§25]] |
| **Derives from** | §25.1, [[S44 Domain Invariants|§44]] R6 |
| **Test name** | `test_plx_ux_070` |

### PLX-UX-071

Change communication **MUST** be expressed in terms of consequence where consequence is derivable, and **MUST** fall back to factual activity description where it is not. It **MUST NOT** fabricate consequence.

| | |
|---|---|
| **Verification** | `T, D` |
| **Defined in** | [[S25 Collaboration|§25]] |
| **Derives from** | §25.2 |
| **Test name** | `test_plx_ux_071` |

### PLX-UX-072

Presence data **MUST** be treated as personal data with a defined, tenant-configurable retention period, and **MUST NOT** be retained in the Event Store beyond that period in identifiable form.

| | |
|---|---|
| **Verification** | `T, I` |
| **Defined in** | [[S25 Collaboration|§25]] |
| **Derives from** | §25.1, new |
| **Test name** | `test_plx_ux_072` |

### PLX-UX-080

Resume review and Decision approval **MUST** be fully functional on mobile, including evidence disclosure to at least the Evidence level of §23.2.

| | |
|---|---|
| **Verification** | `T, D` |
| **Defined in** | [[S28 Mobile Experience|§28]] |
| **Derives from** | [[S28 Mobile Experience|§28]] |
| **Test name** | `test_plx_ux_080` |

### PLX-UX-081

Mobile **MUST NOT** be required to render or restore the spatial Canvas layout. Mobile layout state **MUST NOT** overwrite desktop layout state (`[[REQ-UX#PLX-UX-032|PLX-UX-032]]`).

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S28 Mobile Experience|§28]] |
| **Derives from** | [[S28 Mobile Experience|§28]], [[S21 Workspace Navigation|§21]] |
| **Test name** | `test_plx_ux_081` |

### PLX-UX-082

Objects captured on mobile **MUST** be attributed to a Desk at capture time, with a user-configurable default capture Desk.

| | |
|---|---|
| **Verification** | `T, D` |
| **Defined in** | [[S28 Mobile Experience|§28]] |
| **Derives from** | [[S28 Mobile Experience|§28]], [[S44 Domain Invariants|§44]] R1 |
| **Test name** | `test_plx_ux_082` |

### PLX-UX-085

Collaborative Resume content **MUST** be permission-filtered per viewing user at render time (`[[REQ-RES#PLX-RES-004|PLX-RES-004]]`).

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S82 Collaboration Framework|§82]] |
| **Derives from** | [[S82 Collaboration Framework|§82]], [[S25 Collaboration|§25]] |
| **Test name** | `test_plx_ux_085` |

### PLX-UX-086

Team awareness data **MUST NOT** be aggregated into individual activity reports without explicit tenant configuration, subject to `[[REQ-SEC#PLX-SEC-033|PLX-SEC-033]]`.

| | |
|---|---|
| **Verification** | `I, T` |
| **Defined in** | [[S82 Collaboration Framework|§82]] |
| **Derives from** | [[S82 Collaboration Framework|§82]], new |
| **Test name** | `test_plx_ux_086` |

### PLX-UX-090

No Context, Relationship, Decision or Resume data **MUST** be stored in a presentation-specific form. Presentation state (layout, viewport, device class) **MUST** be stored separately from semantic state.

| | |
|---|---|
| **Verification** | `I, T` |
| **Defined in** | [[S29 Future Interaction Models|§29]] |
| **Derives from** | [[S29 Future Interaction Models|§29]] |
| **Test name** | `test_plx_ux_090` |

### PLX-UX-091

Every capability exposed through the primary interface **MUST** be reachable through the public API ([[S63 Canonical API Design|§63]]), so that alternative interfaces are first-class rather than privileged.

| | |
|---|---|
| **Verification** | `T, I` |
| **Defined in** | [[S29 Future Interaction Models|§29]] |
| **Derives from** | [[S29 Future Interaction Models|§29]], [[S84 Platform SDK|§84]] |
| **Test name** | `test_plx_ux_091` |
