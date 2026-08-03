---
type: requirement-register
area: APP
domain: "Native applications"
count: 10
tags:
  - requirements
  - area/app
---

# REQ-APP — Native applications

10 normative requirements. Identifiers are permanent and never reused.

> [!important] For Claude Code
> Every requirement below is binding. Cite the ID in the test name that verifies it (`test_plx_app_001_*`) so [[S74 Definition of Done|§74]] gate 13 (requirement-to-test traceability) can be machine-checked.

| ID | § | V | Summary |
|---|---|---|---|
| [[#PLX-APP-001]] | §76 | I | Every native application build MUST record an ADR answering §76.3, reviewed and approved before implementation begins. |
| [[#PLX-APP-002]] | §76 | I, T | Every native application MUST understand Desk context, Relationships, Workspace Memory, AI, permissions and Events, and MUST use t |
| [[#PLX-APP-010]] | §77 | T, D | The Canvas MUST persist Object position, size and z-order per (user, Desk, device class) and restore them exactly (PLX-UX-030, PLX |
| [[#PLX-APP-011]] | §77 | T, D | The Canvas MUST provide the equivalent linear, screen-reader-navigable representation required by PLX-A11Y-003, developed and rele |
| [[#PLX-APP-012]] | §77 | A, T | Canvas rendering MUST virtualise off-viewport Objects so that Desk open latency (PLX-PERF-001) is independent of total Object coun |
| [[#PLX-APP-020]] | §77 | T, D | The Decision Tracker MUST require a recorded alternative-considered entry, or an explicit statement that none was considered, befo |
| [[#PLX-APP-030]] | §77 | T, D, I | Meeting recording and transcription MUST obtain and record consent from all participants per the applicable jurisdiction, and MUST |
| [[#PLX-APP-031]] | §77 | T | Decisions and actions extracted from a meeting by AI MUST be created as provisional and MUST require human confirmation before ent |
| [[#PLX-APP-040]] | §77 | T | The Relationship Explorer MUST apply permission-filtered traversal (PLX-GPH-010) and MUST NOT reveal node existence, path counts o |
| [[#PLX-APP-041]] | §77 | D | The Relationship Explorer MUST display, for every edge, its evidence, confidence, discovery method and state (provisional or confi |

---

### PLX-APP-001

Every native application build **MUST** record an ADR answering §76.3, reviewed and approved before implementation begins.

| | |
|---|---|
| **Verification** | `I` |
| **Defined in** | [[S76 Native Application Philosophy|§76]] |
| **Derives from** | [[S76 Native Application Philosophy|§76]], §1.3 |
| **Test name** | `test_plx_app_001` |

### PLX-APP-002

Every native application **MUST** understand Desk context, Relationships, Workspace Memory, AI, permissions and Events, and **MUST** use the same platform interfaces available to marketplace extensions (`[[REQ-EXT#PLX-EXT-002|PLX-EXT-002]]`).

| | |
|---|---|
| **Verification** | `I, T` |
| **Defined in** | [[S76 Native Application Philosophy|§76]] |
| **Derives from** | [[S77 Native Workspace Applications|§77]], [[S83 Marketplace Architecture|§83]] |
| **Test name** | `test_plx_app_002` |

### PLX-APP-010

The Canvas **MUST** persist Object position, size and z-order per (user, Desk, device class) and restore them exactly (`[[REQ-UX#PLX-UX-030|PLX-UX-030]]`, `[[REQ-UX#PLX-UX-032|PLX-UX-032]]`).

| | |
|---|---|
| **Verification** | `T, D` |
| **Defined in** | [[S77 Native Workspace Applications|§77]] |
| **Derives from** | [[S77 Native Workspace Applications|§77]] |
| **Test name** | `test_plx_app_010` |

### PLX-APP-011

The Canvas **MUST** provide the equivalent linear, screen-reader-navigable representation required by `[[REQ-A11Y#PLX-A11Y-003|PLX-A11Y-003]]`, developed and released concurrently with the spatial surface.

| | |
|---|---|
| **Verification** | `T, D` |
| **Defined in** | [[S77 Native Workspace Applications|§77]] |
| **Derives from** | [[S77 Native Workspace Applications|§77]], [[S27 Accessibility|§27]] |
| **Test name** | `test_plx_app_011` |

### PLX-APP-012

Canvas rendering **MUST** virtualise off-viewport Objects so that Desk open latency (`[[REQ-PERF#PLX-PERF-001|PLX-PERF-001]]`) is independent of total Object count.

| | |
|---|---|
| **Verification** | `A, T` |
| **Defined in** | [[S77 Native Workspace Applications|§77]] |
| **Derives from** | [[S77 Native Workspace Applications|§77]], new |
| **Test name** | `test_plx_app_012` |

### PLX-APP-020

The Decision Tracker **MUST** require a recorded alternative-considered entry, or an explicit statement that none was considered, before a Decision may move to `approved`.

| | |
|---|---|
| **Verification** | `T, D` |
| **Defined in** | [[S77 Native Workspace Applications|§77]] |
| **Derives from** | [[S77 Native Workspace Applications|§77]], [[S37 Decision Entity|§37]] |
| **Test name** | `test_plx_app_020` |

### PLX-APP-030

Meeting recording and transcription **MUST** obtain and record consent from all participants per the applicable jurisdiction, and **MUST NOT** commence without it.

| | |
|---|---|
| **Verification** | `T, D, I` |
| **Defined in** | [[S77 Native Workspace Applications|§77]] |
| **Derives from** | [[S77 Native Workspace Applications|§77]], new |
| **Test name** | `test_plx_app_030` |

### PLX-APP-031

Decisions and actions extracted from a meeting by AI **MUST** be created as provisional and **MUST** require human confirmation before entering `approved` state or generating Relationships.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S77 Native Workspace Applications|§77]] |
| **Derives from** | [[S77 Native Workspace Applications|§77]], [[S37 Decision Entity|§37]] |
| **Test name** | `test_plx_app_031` |

### PLX-APP-040

The Relationship Explorer **MUST** apply permission-filtered traversal (`[[REQ-GPH#PLX-GPH-010|PLX-GPH-010]]`) and **MUST NOT** reveal node existence, path counts or graph distances involving non-permitted nodes.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S77 Native Workspace Applications|§77]] |
| **Derives from** | [[S77 Native Workspace Applications|§77]], [[S53 Knowledge Graph Runtime|§53]] |
| **Test name** | `test_plx_app_040` |

### PLX-APP-041

The Relationship Explorer **MUST** display, for every edge, its evidence, confidence, discovery method and state (provisional or confirmed).

| | |
|---|---|
| **Verification** | `D` |
| **Defined in** | [[S77 Native Workspace Applications|§77]] |
| **Derives from** | [[S77 Native Workspace Applications|§77]], [[S36 Relationship Entity|§36]] |
| **Test name** | `test_plx_app_041` |
