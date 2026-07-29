---
type: requirement-register
area: SYN
domain: "Synchronisation"
count: 6
tags:
  - requirements
  - area/syn
---

# REQ-SYN — Synchronisation

6 normative requirements. Identifiers are permanent and never reused.

> [!important] For Claude Code
> Every requirement below is binding. Cite the ID in the test name that verifies it (`test_plx_syn_001_*`) so [[S74 Definition of Done|§74]] gate 13 (requirement-to-test traceability) can be machine-checked.

| ID | § | V | Summary |
|---|---|---|---|
| [[#PLX-SYN-001]] | §50 | I, T | Collaborative text and rich-text Objects MUST use a CRDT with proven convergence, selected to support offline editing and reconnec |
| [[#PLX-SYN-002]] | §50 | A | The chosen CRDT implementation MUST have a defined garbage-collection or compaction strategy for tombstones and history metadata,  |
| [[#PLX-SYN-003]] | §50 | T | Conflict resolution MUST be deterministic for every data class in §50.2. AI MUST NOT participate in conflict resolution for any cl |
| [[#PLX-SYN-010]] | §50 | T | Offline clients MUST be able to create Objects and Events with client-generated identifiers and reconcile on reconnection without  |
| [[#PLX-SYN-011]] | §50 | T | On reconnection, an offline client's Events MUST be ingested with their original timestamp preserved and a distinct recordedAt, an |
| [[#PLX-SYN-012]] | §50 | T, D | Where an offline edit cannot be merged (a Workflow or Decision class conflict), the platform MUST surface the conflict to the user |

---

### PLX-SYN-001

Collaborative text and rich-text Objects **MUST** use a CRDT with proven convergence, selected to support offline editing and reconnection without a coordinating server.

| | |
|---|---|
| **Verification** | `I, T` |
| **Defined in** | [[S50 Synchronisation Engine|§50]] |
| **Derives from** | [[S50 Synchronisation Engine|§50]], decision |
| **Test name** | `test_plx_syn_001` |

### PLX-SYN-002

The chosen CRDT implementation **MUST** have a defined garbage-collection or compaction strategy for tombstones and history metadata, and its growth characteristics **MUST** be load-tested against a document with 10⁶ cumulative edits before Phase 1 exit.

| | |
|---|---|
| **Verification** | `A` |
| **Defined in** | [[S50 Synchronisation Engine|§50]] |
| **Derives from** | [[S50 Synchronisation Engine|§50]], new |
| **Test name** | `test_plx_syn_002` |

### PLX-SYN-003

Conflict resolution **MUST** be deterministic for every data class in §50.2. AI **MUST NOT** participate in conflict resolution for any class marked deterministic.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S50 Synchronisation Engine|§50]] |
| **Derives from** | §50.2 |
| **Test name** | `test_plx_syn_003` |

### PLX-SYN-010

Offline clients **MUST** be able to create Objects and Events with client-generated identifiers and reconcile on reconnection without renumbering, duplication or loss.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S50 Synchronisation Engine|§50]] |
| **Derives from** | [[S45 Platform Architecture|§45]], [[S32 Canonical Entity Model|§32]] |
| **Test name** | `test_plx_syn_010` |

### PLX-SYN-011

On reconnection, an offline client's Events **MUST** be ingested with their original `timestamp` preserved and a distinct `recordedAt`, and downstream consumers **MUST** handle late-arriving Events without corrupting derived state.

| | |
|---|---|
| **Verification** | `T` |
| **Defined in** | [[S50 Synchronisation Engine|§50]] |
| **Derives from** | [[S35 Event Entity|§35]], new |
| **Test name** | `test_plx_syn_011` |

### PLX-SYN-012

Where an offline edit cannot be merged (a Workflow or Decision class conflict), the platform **MUST** surface the conflict to the user with both versions intact and **MUST NOT** silently discard either.

| | |
|---|---|
| **Verification** | `T, D` |
| **Defined in** | [[S50 Synchronisation Engine|§50]] |
| **Derives from** | [[S50 Synchronisation Engine|§50]], new |
| **Test name** | `test_plx_syn_012` |
