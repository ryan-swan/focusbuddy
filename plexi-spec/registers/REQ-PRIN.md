---
type: requirement-register
area: PRIN
domain: "Foundational principles"
count: 8
tags:
  - requirements
  - area/prin
---

# REQ-PRIN — Foundational principles

8 normative requirements. Identifiers are permanent and never reused.

> [!important] For Claude Code
> Every requirement below is binding. Cite the ID in the test name that verifies it (`test_plx_prin_001_*`) so [[S74 Definition of Done|§74]] gate 13 (requirement-to-test traceability) can be machine-checked.

| ID | § | V | Summary |
|---|---|---|---|
| [[#PLX-PRIN-001]] | §1 | T, D | The platform MUST NOT require a user to perform any manual action whose sole purpose is to preserve context for their own future r |
| [[#PLX-PRIN-002]] | §1 | T | The platform MUST preserve context independently of the applications that produced it. Removal, replacement or deprecation of a Co |
| [[#PLX-PRIN-003]] | §1 | I | The platform MUST NOT position itself as a replacement for specialist applications. Native applications MUST be justified against  |
| [[#PLX-PRIN-004]] | §4 | T | Context, relationships, decisions and history MUST be exportable in a documented, machine-readable, vendor-neutral format sufficie |
| [[#PLX-PRIN-005]] | §4 | A, I | The platform MUST NOT make context durability contingent on a specific AI model, vendor or version. Withdrawal of any model provid |
| [[#PLX-PRIN-006]] | §7 | I | Every feature design MUST record, at design review, which of the ten design principles it advances and which it places under tensi |
| [[#PLX-PRIN-007]] | §7 | T, D | Every user-visible AI recommendation MUST be accompanied by machine-retrievable evidence consisting of references to specific Obje |
| [[#PLX-PRIN-008]] | §7 | D | Every inferred Relationship, Context Health transition and Resume assertion MUST be traceable by the user to the Events that produ |

---

### PLX-PRIN-001

The platform **MUST NOT** require a user to perform any manual action whose sole purpose is to preserve context for their own future return. Saving, snapshotting, pinning, bookmarking and summarising for continuity purposes **MUST** be automatic.

| | |
|---|---|
| **Verification** | `T, D` |
| **Defined in** | [[S01 Executive Summary|§1]] |
| **Derives from** | §1.4, [[S13 Workspace Memory|§13]] |
| **Test name** | `test_plx_prin_001` |

### PLX-PRIN-002

The platform **MUST** preserve context independently of the applications that produced it. Removal, replacement or deprecation of a Connector **MUST NOT** destroy previously captured context, relationships or history relating to Objects sourced through it.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S01 Executive Summary|§1]] |
| **Derives from** | [[S04 Vision|§4]], [[S59 Architectural Invariants|§59]] |
| **Test name** | `test_plx_prin_002` |

### PLX-PRIN-003

The platform **MUST NOT** position itself as a replacement for specialist applications. Native applications **MUST** be justified against the build-vs-integrate test in [[S76 Native Application Philosophy|§76]] and the justification recorded in an Architecture Decision Record.

| | |
|---|---|
| **Verification** | `I` |
| **Defined in** | [[S01 Executive Summary|§1]] |
| **Derives from** | §1.3, [[S76 Native Application Philosophy|§76]] |
| **Test name** | `test_plx_prin_003` |

### PLX-PRIN-004

Context, relationships, decisions and history **MUST** be exportable in a documented, machine-readable, vendor-neutral format sufficient to reconstruct organisational memory outside Plexi.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S04 Vision|§4]] |
| **Derives from** | [[S04 Vision|§4]] (implied), new |
| **Test name** | `test_plx_prin_004` |

### PLX-PRIN-005

The platform **MUST NOT** make context durability contingent on a specific AI model, vendor or version. Withdrawal of any model provider **MUST NOT** invalidate previously stored context, relationships or decisions.

| | |
|---|---|
| **Verification** | `A, I` |
| **Defined in** | [[S04 Vision|§4]] |
| **Derives from** | [[S04 Vision|§4]], [[S55 AI Orchestration|§55]] |
| **Test name** | `test_plx_prin_005` |

### PLX-PRIN-006

Every feature design **MUST** record, at design review, which of the ten design principles it advances and which it places under tension. Designs placing a principle under tension **MUST** record the mitigation.

| | |
|---|---|
| **Verification** | `I` |
| **Defined in** | [[S07 Design Principles|§7]] |
| **Derives from** | [[S07 Design Principles|§7]] |
| **Test name** | `test_plx_prin_006` |

### PLX-PRIN-007

Every user-visible AI recommendation **MUST** be accompanied by machine-retrievable evidence consisting of references to specific Objects, Events, Decisions or Relationships. A recommendation for which no such evidence exists **MUST NOT** be displayed.

| | |
|---|---|
| **Verification** | `T, D` |
| **Defined in** | [[S07 Design Principles|§7]] |
| **Derives from** | §7.9, [[S24 AI Experience|§24]] |
| **Test name** | `test_plx_prin_007` |

### PLX-PRIN-008

Every inferred Relationship, Context Health transition and Resume assertion **MUST** be traceable by the user to the Events that produced it, through no more than three interactions from the point of display.

| | |
|---|---|
| **Verification** | `D` |
| **Defined in** | [[S07 Design Principles|§7]] |
| **Derives from** | §7.8, [[S23 Resume Experience|§23]] |
| **Test name** | `test_plx_prin_008` |
