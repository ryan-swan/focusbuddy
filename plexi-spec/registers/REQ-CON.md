---
type: requirement-register
area: CON
domain: "Connectors"
count: 7
tags:
  - requirements
  - area/con
---

# REQ-CON — Connectors

7 normative requirements. Identifiers are permanent and never reused.

> [!important] For Claude Code
> Every requirement below is binding. Cite the ID in the test name that verifies it (`test_plx_con_001_*`) so [[S74 Definition of Done|§74]] gate 13 (requirement-to-test traceability) can be machine-checked.

| ID | § | V | Summary |
|---|---|---|---|
| [[#PLX-CON-001]] | §57 | T, I | Every Connector MUST declare which capabilities it implements. Consumers MUST query declared capabilities rather than assuming the |
| [[#PLX-CON-002]] | §57 | T, A | Connectors MUST map external permissions into the Plexi permission model, and MUST NOT grant a Plexi principal access to external  |
| [[#PLX-CON-003]] | §57 | I, T | Where a Connector cannot faithfully represent an external system's permission model, it MUST default to the most restrictive inter |
| [[#PLX-CON-004]] | §57 | T, I | Connector credentials MUST be stored in a dedicated credential vault, encrypted with tenant-scoped keys, and MUST NOT be readable  |
| [[#PLX-CON-005]] | §57 | T | Connector synchronisation MUST be resumable from a durable cursor and MUST be idempotent. Re-running a sync MUST NOT duplicate Obj |
| [[#PLX-CON-006]] | §57 | T | Removal of a Connector MUST NOT delete previously imported Objects, Relationships, Events or derived context (PLX-PRIN-002). |
| [[#PLX-CON-007]] | §57 | T, D | Connectors MUST implement backoff and rate-limit handling for the external system, and MUST surface persistent sync failure as a u |

---

### PLX-CON-001

Every Connector **MUST** declare which capabilities it implements. Consumers **MUST** query declared capabilities rather than assuming them.

| | |
|---|---|
| **Verification** | `T, I` |
| **Defined in** | [[S57 Connector Framework|§57]] |
| **Derives from** | [[S57 Connector Framework|§57]] |
| **Test name** | `test_plx_con_001` |

### PLX-CON-002

Connectors **MUST** map external permissions into the Plexi permission model, and **MUST NOT** grant a Plexi principal access to external content beyond what the external system grants the linked external principal.

| | |
|---|---|
| **Verification** | `T, A` |
| **Defined in** | [[S57 Connector Framework|§57]] |
| **Derives from** | [[S57 Connector Framework|§57]], [[S69 Security Architecture|§69]] |
| **Test name** | `test_plx_con_002` |

### PLX-CON-003

Where a Connector cannot faithfully represent an external system's permission model, it **MUST** default to the most restrictive interpretation and **MUST** record the limitation in its capability declaration.

| | |
|---|---|
| **Verification** | `I, T` |
| **Defined in** | [[S57 Connector Framework|§57]] |
| **Derives from** | [[S57 Connector Framework|§57]], new |
| **Test name** | `test_plx_con_003` |

### PLX-CON-004

Connector credentials **MUST** be stored in a dedicated credential vault, encrypted with tenant-scoped keys, and **MUST NOT** be readable by any service other than the Connector Service.

| | |
|---|---|
| **Verification** | `T, I` |
| **Defined in** | [[S57 Connector Framework|§57]] |
| **Derives from** | [[S57 Connector Framework|§57]], [[S69 Security Architecture|§69]] |
| **Test name** | `test_plx_con_004` |

### PLX-CON-005

Connector synchronisation **MUST** be resumable from a durable cursor and **MUST** be idempotent. Re-running a sync **MUST NOT** duplicate Objects or Events.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S57 Connector Framework|§57]] |
| **Derives from** | [[S57 Connector Framework|§57]], new |
| **Test name** | `test_plx_con_005` |

### PLX-CON-006

Removal of a Connector **MUST NOT** delete previously imported Objects, Relationships, Events or derived context (`[[REQ-PRIN#PLX-PRIN-002|PLX-PRIN-002]]`).

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S57 Connector Framework|§57]] |
| **Derives from** | [[S57 Connector Framework|§57]], [[S04 Vision|§4]] |
| **Test name** | `test_plx_con_006` |

### PLX-CON-007

Connectors **MUST** implement backoff and rate-limit handling for the external system, and **MUST** surface persistent sync failure as a user-visible state rather than failing silently.

| | |
|---|---|
| **Verification** | `T, D` |
| **Defined in** | [[S57 Connector Framework|§57]] |
| **Derives from** | [[S57 Connector Framework|§57]], new |
| **Test name** | `test_plx_con_007` |
