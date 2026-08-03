---
type: requirement-register
area: DATA
domain: "Data architecture"
count: 9
tags:
  - requirements
  - area/data
---

# REQ-DATA — Data architecture

9 normative requirements. Identifiers are permanent and never reused.

> [!important] For Claude Code
> Every requirement below is binding. Cite the ID in the test name that verifies it (`test_plx_data_001_*`) so [[S74 Definition of Done|§74]] gate 13 (requirement-to-test traceability) can be machine-checked.

| ID | § | V | Summary |
|---|---|---|---|
| [[#PLX-DATA-001]] | §62 | I | Each store MUST have exactly one owning service. No store MUST be written by more than one service. |
| [[#PLX-DATA-002]] | §62 | T, A | Derived stores — graph, vector, search, Context DB, Resume DB — MUST be fully rebuildable from the Event Store. Rebuild MUST be te |
| [[#PLX-DATA-003]] | §62 | I | Only the Event Store is a system of record for history. Only the Object store is a system of record for current Object content. Ev |
| [[#PLX-DATA-004]] | §62 | T, I | Every store MUST enforce tenant isolation at the storage layer (PLX-SEC-010), including graph namespaces and vector-index partitio |
| [[#PLX-DATA-005]] | §62 | I, D | Every store MUST have a documented backup, restore and point-in-time-recovery procedure, and restore MUST be exercised at least qu |
| [[#PLX-DATA-006]] | §62 | I | Personal data MUST be catalogued per store, with its lawful basis, retention period and erasure mechanism recorded, before that st |
| [[#PLX-DATA-010]] | §66 | T, I | Each memory layer MUST carry an independent, tenant-configurable retention policy, and policy application MUST emit an auditable E |
| [[#PLX-DATA-011]] | §66 | T, I | AI memory MUST be classified as derived and rebuildable. Loss of AI memory MUST NOT cause loss of Objects, Events, Relationships o |
| [[#PLX-DATA-012]] | §66 | T | Retention policies MUST NOT be capable of pruning Decision alternatives (PLX-DOM-043) or Event records (PLX-INV-05). |

---

### PLX-DATA-001

Each store **MUST** have exactly one owning service. No store **MUST** be written by more than one service.

| | |
|---|---|
| **Verification** | `I` |
| **Defined in** | [[S62 Canonical Data Architecture|§62]] |
| **Derives from** | [[S62 Canonical Data Architecture|§62]], [[S45 Platform Architecture|§45]] |
| **Test name** | `test_plx_data_001` |

### PLX-DATA-002

Derived stores — graph, vector, search, Context DB, Resume DB — **MUST** be fully rebuildable from the Event Store. Rebuild **MUST** be tested at least once per release train.

| | |
|---|---|
| **Verification** | `T, A` |
| **Defined in** | [[S62 Canonical Data Architecture|§62]] |
| **Derives from** | [[S62 Canonical Data Architecture|§62]], new |
| **Test name** | `test_plx_data_002` |

### PLX-DATA-003

Only the Event Store is a system of record for history. Only the Object store is a system of record for current Object content. Every other store **MUST** be treated as a rebuildable projection.

| | |
|---|---|
| **Verification** | `I` |
| **Defined in** | [[S62 Canonical Data Architecture|§62]] |
| **Derives from** | [[S62 Canonical Data Architecture|§62]], new |
| **Test name** | `test_plx_data_003` |

### PLX-DATA-004

Every store **MUST** enforce tenant isolation at the storage layer (`[[REQ-SEC#PLX-SEC-010|PLX-SEC-010]]`), including graph namespaces and vector-index partitions.

| | |
|---|---|
| **Verification** | `T, I` |
| **Defined in** | [[S62 Canonical Data Architecture|§62]] |
| **Derives from** | [[S62 Canonical Data Architecture|§62]], [[S42 Organisation Entity|§42]] |
| **Test name** | `test_plx_data_004` |

### PLX-DATA-005

Every store **MUST** have a documented backup, restore and point-in-time-recovery procedure, and restore **MUST** be exercised at least quarterly against production-scale data.

| | |
|---|---|
| **Verification** | `I, D` |
| **Defined in** | [[S62 Canonical Data Architecture|§62]] |
| **Derives from** | [[S62 Canonical Data Architecture|§62]], new |
| **Test name** | `test_plx_data_005` |

### PLX-DATA-006

Personal data **MUST** be catalogued per store, with its lawful basis, retention period and erasure mechanism recorded, before that store enters production.

| | |
|---|---|
| **Verification** | `I` |
| **Defined in** | [[S62 Canonical Data Architecture|§62]] |
| **Derives from** | [[S62 Canonical Data Architecture|§62]], [[S69 Security Architecture|§69]], new |
| **Test name** | `test_plx_data_006` |

### PLX-DATA-010

Each memory layer **MUST** carry an independent, tenant-configurable retention policy, and policy application **MUST** emit an auditable Event.

| | |
|---|---|
| **Verification** | `T, I` |
| **Defined in** | [[S66 Workspace Memory Architecture|§66]] |
| **Derives from** | [[S66 Workspace Memory Architecture|§66]] |
| **Test name** | `test_plx_data_010` |

### PLX-DATA-011

AI memory **MUST** be classified as derived and rebuildable. Loss of AI memory **MUST NOT** cause loss of Objects, Events, Relationships or Decisions.

| | |
|---|---|
| **Verification** | `T, I` |
| **Defined in** | [[S66 Workspace Memory Architecture|§66]] |
| **Derives from** | [[S66 Workspace Memory Architecture|§66]], new |
| **Test name** | `test_plx_data_011` |

### PLX-DATA-012

Retention policies **MUST NOT** be capable of pruning Decision `alternatives` (`[[REQ-DOM#PLX-DOM-043|PLX-DOM-043]]`) or Event records (`[[Invariants#PLX-INV-05|PLX-INV-05]]`).

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S66 Workspace Memory Architecture|§66]] |
| **Derives from** | [[S66 Workspace Memory Architecture|§66]], [[S37 Decision Entity|§37]] |
| **Test name** | `test_plx_data_012` |
