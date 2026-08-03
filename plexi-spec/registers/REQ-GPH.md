---
type: requirement-register
area: GPH
domain: "Knowledge Graph"
count: 12
tags:
  - requirements
  - area/gph
---

# REQ-GPH — Knowledge Graph

12 normative requirements. Identifiers are permanent and never reused.

> [!important] For Claude Code
> Every requirement below is binding. Cite the ID in the test name that verifies it (`test_plx_gph_001_*`) so [[S74 Definition of Done|§74]] gate 13 (requirement-to-test traceability) can be machine-checked.

| ID | § | V | Summary |
|---|---|---|---|
| [[#PLX-GPH-001]] | §36 | T | Every Relationship MUST carry at least one EvidenceRef. A Relationship with an empty evidence set MUST be rejected at write time. |
| [[#PLX-GPH-002]] | §36 | T | Provisional Relationships MUST NOT contribute to Context Health propagation, Resume content, search ranking or permission evaluati |
| [[#PLX-GPH-003]] | §36 | T | Relationship confidence MUST be recalculated when supporting evidence is superseded or invalidated, and a Relationship whose confi |
| [[#PLX-GPH-004]] | §36 | D | Users MUST NOT be required to construct graph structure manually to obtain relationship-derived intelligence. Manual curation MUST |
| [[#PLX-GPH-005]] | §36 | T | A rejected Relationship MUST be retained with state rejected and MUST NOT be re-proposed on identical evidence. |
| [[#PLX-GPH-010]] | §53 | T, A | Graph traversal MUST be permission-filtered. Traversal MUST NOT cross an edge into a node the requesting principal cannot read, an |
| [[#PLX-GPH-011]] | §53 | I, T | Graph storage MUST be tenant-namespaced at the engine level. Application-level tenant filtering alone MUST NOT be relied upon (PLX |
| [[#PLX-GPH-012]] | §53 | T | Graph writes MUST be idempotent with respect to Event replay. Replaying an Event MUST NOT duplicate nodes or edges. |
| [[#PLX-GPH-013]] | §53 | A | Community detection, clustering and duplicate detection MUST run asynchronously and MUST NOT be on the synchronous path of any use |
| [[#PLX-GPH-020]] | §65 | T, I | The relationship type vocabulary MUST be a single closed registry (Appendix E). Services MUST NOT introduce edge types outside the |
| [[#PLX-GPH-021]] | §65 | T | Every edge MUST carry a permission scope, and traversal MUST evaluate it (PLX-GPH-010). |
| [[#PLX-GPH-022]] | §65 | T | Node and edge writes MUST carry the correlationId of the originating Event, so that any graph state is traceable to the user actio |

---

### PLX-GPH-001

Every Relationship **MUST** carry at least one `EvidenceRef`. A Relationship with an empty evidence set **MUST** be rejected at write time.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S36 Relationship Entity|§36]] |
| **Derives from** | [[S36 Relationship Entity|§36]], [[S44 Domain Invariants|§44]] R3 |
| **Test name** | `test_plx_gph_001` |

### PLX-GPH-002

Provisional Relationships **MUST NOT** contribute to Context Health propagation, Resume content, search ranking or permission evaluation.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S36 Relationship Entity|§36]] |
| **Derives from** | §36.3, §15.2 |
| **Test name** | `test_plx_gph_002` |

### PLX-GPH-003

Relationship confidence **MUST** be recalculated when supporting evidence is superseded or invalidated, and a Relationship whose confidence falls below the tenant threshold **MUST** revert to provisional.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S36 Relationship Entity|§36]] |
| **Derives from** | [[S36 Relationship Entity|§36]], new |
| **Test name** | `test_plx_gph_003` |

### PLX-GPH-004

Users **MUST NOT** be required to construct graph structure manually to obtain relationship-derived intelligence. Manual curation **MUST** be available as confirmation and correction.

| | |
|---|---|
| **Verification** | `D` |
| **Defined in** | [[S36 Relationship Entity|§36]] |
| **Derives from** | §6.8, [[S15 Knowledge Graph|§15]] |
| **Test name** | `test_plx_gph_004` |

### PLX-GPH-005

A rejected Relationship **MUST** be retained with state `rejected` and **MUST NOT** be re-proposed on identical evidence.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S36 Relationship Entity|§36]] |
| **Derives from** | [[S36 Relationship Entity|§36]], new |
| **Test name** | `test_plx_gph_005` |

### PLX-GPH-010

Graph traversal **MUST** be permission-filtered. Traversal **MUST NOT** cross an edge into a node the requesting principal cannot read, and **MUST NOT** disclose the existence of such a node through path counts, distances or aggregate results.

| | |
|---|---|
| **Verification** | `T, A` |
| **Defined in** | [[S53 Knowledge Graph Runtime|§53]] |
| **Derives from** | [[S53 Knowledge Graph Runtime|§53]], [[S44 Domain Invariants|§44]] R6 |
| **Test name** | `test_plx_gph_010` |

### PLX-GPH-011

Graph storage **MUST** be tenant-namespaced at the engine level. Application-level tenant filtering alone **MUST NOT** be relied upon (`[[REQ-SEC#PLX-SEC-011|PLX-SEC-011]]`).

| | |
|---|---|
| **Verification** | `I, T` |
| **Defined in** | [[S53 Knowledge Graph Runtime|§53]] |
| **Derives from** | [[S53 Knowledge Graph Runtime|§53]], [[S42 Organisation Entity|§42]] |
| **Test name** | `test_plx_gph_011` |

### PLX-GPH-012

Graph writes **MUST** be idempotent with respect to Event replay. Replaying an Event **MUST NOT** duplicate nodes or edges.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S53 Knowledge Graph Runtime|§53]] |
| **Derives from** | [[S53 Knowledge Graph Runtime|§53]], [[S49 Event Store|§49]] |
| **Test name** | `test_plx_gph_012` |

### PLX-GPH-013

Community detection, clustering and duplicate detection **MUST** run asynchronously and **MUST NOT** be on the synchronous path of any user-facing operation with a latency SLO.

| | |
|---|---|
| **Verification** | `A` |
| **Defined in** | [[S53 Knowledge Graph Runtime|§53]] |
| **Derives from** | [[S53 Knowledge Graph Runtime|§53]], [[S58 Performance Requirements|§58]] |
| **Test name** | `test_plx_gph_013` |

### PLX-GPH-020

The relationship type vocabulary **MUST** be a single closed registry (Appendix E). Services **MUST NOT** introduce edge types outside the registry; extension-defined types **MUST** be registered before use.

| | |
|---|---|
| **Verification** | `T, I` |
| **Defined in** | [[S65 Knowledge Graph Schema|§65]] |
| **Derives from** | [[S65 Knowledge Graph Schema|§65]], new |
| **Test name** | `test_plx_gph_020` |

### PLX-GPH-021

Every edge **MUST** carry a permission scope, and traversal **MUST** evaluate it (`[[REQ-GPH#PLX-GPH-010|PLX-GPH-010]]`).

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S65 Knowledge Graph Schema|§65]] |
| **Derives from** | [[S65 Knowledge Graph Schema|§65]] |
| **Test name** | `test_plx_gph_021` |

### PLX-GPH-022

Node and edge writes **MUST** carry the `correlationId` of the originating Event, so that any graph state is traceable to the user action that produced it.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S65 Knowledge Graph Schema|§65]] |
| **Derives from** | [[S65 Knowledge Graph Schema|§65]], new |
| **Test name** | `test_plx_gph_022` |
