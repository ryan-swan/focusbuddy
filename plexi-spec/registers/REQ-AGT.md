---
type: requirement-register
area: AGT
domain: "Agents"
count: 16
tags:
  - requirements
  - area/agt
---

# REQ-AGT — Agents

16 normative requirements. Identifiers are permanent and never reused.

> [!important] For Claude Code
> Every requirement below is binding. Cite the ID in the test name that verifies it (`test_plx_agt_001_*`) so [[S74 Definition of Done|§74]] gate 13 (requirement-to-test traceability) can be machine-checked.

| ID | § | V | Summary |
|---|---|---|---|
| [[#PLX-AGT-001]] | §41 | T | An Agent's effective permissions MUST be a subset of the permissions of the principal on whose behalf it acts. Permission checks M |
| [[#PLX-AGT-002]] | §41 | T | Every Agent action MUST emit an Event attributed to the Agent, with onBehalfOf populated. |
| [[#PLX-AGT-003]] | §41 | T | Agents MUST NOT create Relationships in confirmed state. Agent-created Relationships MUST be provisional. |
| [[#PLX-AGT-004]] | §41 | T, A | Agents MUST NOT assert organisational facts not derivable from structured platform data. Assertions MUST carry evidence references |
| [[#PLX-AGT-005]] | §41 | T | Every Agent MUST have exactly one actsOnBehalfOf human principal at any moment. An Agent with no accountable human principal MUST  |
| [[#PLX-AGT-006]] | §41 | T, A | Agent cost consumption MUST be metered against costCeiling and against the owning Desk's costCeilingPerMonth; exceeding either MUS |
| [[#PLX-AGT-010]] | §56 | T | Inter-agent messages MUST conform to the AgentMessage schema and MUST be validated on both send and receive. Free-text-only inter- |
| [[#PLX-AGT-011]] | §56 | T | Agent replies MUST validate against the expectedOutput schema. A non-conforming reply MUST be rejected and retried or failed, neve |
| [[#PLX-AGT-012]] | §56 | T, I | context MUST be passed by reference. Inlining content into inter-agent messages MUST NOT be used, so that permission evaluation oc |
| [[#PLX-AGT-013]] | §56 | T | Every agent message and reply MUST be recorded in the agent audit stream with full lineage via correlationId and causationId. |
| [[#PLX-AGT-014]] | §56 | T | Agent-to-agent delegation MUST propagate onBehalfOf unchanged and MUST NOT permit permission escalation through delegation depth.  |
| [[#PLX-AGT-015]] | §56 | I | No Agent MUST hold more than one specialisation. An Agent performing unrelated responsibilities MUST be decomposed. |
| [[#PLX-AGT-020]] | §78 | T, A | Every Agent class MUST declare its permitted tool set, and tool invocation MUST be permission-checked at the tool boundary against |
| [[#PLX-AGT-021]] | §78 | T, I | The Research Agent MUST NOT transmit tenant content to external systems unless the Desk's externalDataAllowed is true, and every e |
| [[#PLX-AGT-022]] | §78 | T | Every Agent MUST have a defined evaluation suite with recorded pass thresholds, executed per release (PLX-ENG-013). |
| [[#PLX-AGT-023]] | §78 | T | Agent memory scope MUST be enforced at retrieval. An Agent with memoryScope: "desk" MUST NOT retrieve content from another Desk, e |

---

### PLX-AGT-001

An Agent's effective permissions **MUST** be a subset of the permissions of the principal on whose behalf it acts. Permission checks **MUST** be enforced at the data-access layer, not only at the orchestration layer.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S41 Agent Entity|§41]] |
| **Derives from** | §41.2, [[S69 Security Architecture|§69]] |
| **Test name** | `test_plx_agt_001` |

### PLX-AGT-002

Every Agent action **MUST** emit an Event attributed to the Agent, with `onBehalfOf` populated.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S41 Agent Entity|§41]] |
| **Derives from** | §41.2 |
| **Test name** | `test_plx_agt_002` |

### PLX-AGT-003

Agents **MUST NOT** create Relationships in `confirmed` state. Agent-created Relationships **MUST** be `provisional`.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S41 Agent Entity|§41]] |
| **Derives from** | §41.2, [[S36 Relationship Entity|§36]] |
| **Test name** | `test_plx_agt_003` |

### PLX-AGT-004

Agents **MUST NOT** assert organisational facts not derivable from structured platform data. Assertions **MUST** carry evidence references (`[[Invariants#PLX-INV-04|PLX-INV-04]]`).

| | |
|---|---|
| **Verification** | `T, A` |
| **Defined in** | [[S41 Agent Entity|§41]] |
| **Derives from** | §41.2, [[S70 AI Governance|§70]] |
| **Test name** | `test_plx_agt_004` |

### PLX-AGT-005

Every Agent **MUST** have exactly one `actsOnBehalfOf` human principal at any moment. An Agent with no accountable human principal **MUST** be suspended.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S41 Agent Entity|§41]] |
| **Derives from** | [[S41 Agent Entity|§41]], new |
| **Test name** | `test_plx_agt_005` |

### PLX-AGT-006

Agent cost consumption **MUST** be metered against `costCeiling` and against the owning Desk's `costCeilingPerMonth`; exceeding either **MUST** suspend the Agent and emit an Event, not silently degrade output quality.

| | |
|---|---|
| **Verification** | `T, A` |
| **Defined in** | [[S41 Agent Entity|§41]] |
| **Derives from** | [[S41 Agent Entity|§41]], [[S68 AI Cost Optimisation|§68]], new |
| **Test name** | `test_plx_agt_006` |

### PLX-AGT-010

Inter-agent messages **MUST** conform to the `AgentMessage` schema and **MUST** be validated on both send and receive. Free-text-only inter-agent communication **MUST NOT** be permitted.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S56 Multi-Agent Architecture|§56]] |
| **Derives from** | [[S56 Multi-Agent Architecture|§56]] |
| **Test name** | `test_plx_agt_010` |

### PLX-AGT-011

Agent replies **MUST** validate against the `expectedOutput` schema. A non-conforming reply **MUST** be rejected and retried or failed, never passed downstream.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S56 Multi-Agent Architecture|§56]] |
| **Derives from** | [[S56 Multi-Agent Architecture|§56]], new |
| **Test name** | `test_plx_agt_011` |

### PLX-AGT-012

`context` **MUST** be passed by reference. Inlining content into inter-agent messages **MUST NOT** be used, so that permission evaluation occurs at dereference time against the acting principal.

| | |
|---|---|
| **Verification** | `T, I` |
| **Defined in** | [[S56 Multi-Agent Architecture|§56]] |
| **Derives from** | [[S56 Multi-Agent Architecture|§56]], new |
| **Test name** | `test_plx_agt_012` |

### PLX-AGT-013

Every agent message and reply **MUST** be recorded in the agent audit stream with full lineage via `correlationId` and `causationId`.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S56 Multi-Agent Architecture|§56]] |
| **Derives from** | [[S56 Multi-Agent Architecture|§56]] |
| **Test name** | `test_plx_agt_013` |

### PLX-AGT-014

Agent-to-agent delegation **MUST** propagate `onBehalfOf` unchanged and **MUST NOT** permit permission escalation through delegation depth. Delegation depth **MUST** be bounded and the bound **MUST** be enforced.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S56 Multi-Agent Architecture|§56]] |
| **Derives from** | [[S56 Multi-Agent Architecture|§56]], new |
| **Test name** | `test_plx_agt_014` |

### PLX-AGT-015

No Agent **MUST** hold more than one specialisation. An Agent performing unrelated responsibilities **MUST** be decomposed.

| | |
|---|---|
| **Verification** | `I` |
| **Defined in** | [[S56 Multi-Agent Architecture|§56]] |
| **Derives from** | [[S79 Agent Collaboration|§79]] |
| **Test name** | `test_plx_agt_015` |

### PLX-AGT-020

Every Agent class **MUST** declare its permitted tool set, and tool invocation **MUST** be permission-checked at the tool boundary against the acting principal, not trusted from the model's request.

| | |
|---|---|
| **Verification** | `T, A` |
| **Defined in** | [[S78 AI Agent Framework|§78]] |
| **Derives from** | [[S78 AI Agent Framework|§78]], [[S67 AI Prompt Framework|§67]] |
| **Test name** | `test_plx_agt_020` |

### PLX-AGT-021

The Research Agent **MUST NOT** transmit tenant content to external systems unless the Desk's `externalDataAllowed` is true, and every external transmission **MUST** be logged with its destination and content digest.

| | |
|---|---|
| **Verification** | `T, I` |
| **Defined in** | [[S78 AI Agent Framework|§78]] |
| **Derives from** | [[S78 AI Agent Framework|§78]], [[S69 Security Architecture|§69]] |
| **Test name** | `test_plx_agt_021` |

### PLX-AGT-022

Every Agent **MUST** have a defined evaluation suite with recorded pass thresholds, executed per release (`[[REQ-ENG#PLX-ENG-013|PLX-ENG-013]]`).

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S78 AI Agent Framework|§78]] |
| **Derives from** | [[S78 AI Agent Framework|§78]], [[S73 Engineering Standards|§73]] |
| **Test name** | `test_plx_agt_022` |

### PLX-AGT-023

Agent memory scope **MUST** be enforced at retrieval. An Agent with `memoryScope: "desk"` **MUST NOT** retrieve content from another Desk, even where the acting principal has permission to it.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S78 AI Agent Framework|§78]] |
| **Derives from** | [[S41 Agent Entity|§41]], new |
| **Test name** | `test_plx_agt_023` |
