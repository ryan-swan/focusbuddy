---
type: requirement-register
area: SCH
domain: "Search"
count: 5
tags:
  - requirements
  - area/sch
---

# REQ-SCH — Search

5 normative requirements. Identifiers are permanent and never reused.

> [!important] For Claude Code
> Every requirement below is binding. Cite the ID in the test name that verifies it (`test_plx_sch_001_*`) so [[S74 Definition of Done|§74]] gate 13 (requirement-to-test traceability) can be machine-checked.

| ID | § | V | Summary |
|---|---|---|---|
| [[#PLX-SCH-001]] | §54 | T, A | Permission filtering MUST be the first stage of the ranking pipeline and MUST be applied at the index or query layer, not as a pos |
| [[#PLX-SCH-002]] | §54 | T | Result counts, pagination totals and relevance scores MUST NOT disclose the existence of non-permitted results. |
| [[#PLX-SCH-003]] | §54 | T | AI re-ranking MUST be the final stage and MUST be optional. Disabling it MUST degrade result ordering, not result correctness or c |
| [[#PLX-SCH-004]] | §54 | A | Search MUST meet PLX-PERF-040 with AI re-ranking disabled. AI re-ranking MUST operate within a separate, additive budget and MUST  |
| [[#PLX-SCH-005]] | §54 | T, A | Semantic index freshness MUST meet PLX-PERF-041; where an Object's embedding is stale, results MUST still include the Object via k |

---

### PLX-SCH-001

Permission filtering **MUST** be the first stage of the ranking pipeline and **MUST** be applied at the index or query layer, not as a post-filter over returned results.

| | |
|---|---|
| **Verification** | `T, A` |
| **Defined in** | [[S54 Search Architecture|§54]] |
| **Derives from** | [[S54 Search Architecture|§54]] |
| **Test name** | `test_plx_sch_001` |

### PLX-SCH-002

Result counts, pagination totals and relevance scores **MUST NOT** disclose the existence of non-permitted results.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S54 Search Architecture|§54]] |
| **Derives from** | [[S54 Search Architecture|§54]], new |
| **Test name** | `test_plx_sch_002` |

### PLX-SCH-003

AI re-ranking **MUST** be the final stage and **MUST** be optional. Disabling it **MUST** degrade result ordering, not result correctness or completeness.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S54 Search Architecture|§54]] |
| **Derives from** | [[S54 Search Architecture|§54]], [[S48 Event Architecture|§48]] |
| **Test name** | `test_plx_sch_003` |

### PLX-SCH-004

Search **MUST** meet `[[REQ-PERF#PLX-PERF-040|PLX-PERF-040]]` with AI re-ranking disabled. AI re-ranking **MUST** operate within a separate, additive budget and **MUST** be abandoned rather than exceed it.

| | |
|---|---|
| **Verification** | `A` |
| **Defined in** | [[S54 Search Architecture|§54]] |
| **Derives from** | [[S58 Performance Requirements|§58]], new |
| **Test name** | `test_plx_sch_004` |

### PLX-SCH-005

Semantic index freshness **MUST** meet `[[REQ-PERF#PLX-PERF-041|PLX-PERF-041]]`; where an Object's embedding is stale, results **MUST** still include the Object via keyword and relationship paths.

| | |
|---|---|
| **Verification** | `T, A` |
| **Defined in** | [[S54 Search Architecture|§54]] |
| **Derives from** | [[S54 Search Architecture|§54]], new |
| **Test name** | `test_plx_sch_005` |
