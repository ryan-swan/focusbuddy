---
id: S50
section: §50
title: "Synchronisation Engine"
part: V
type: section
defines:
  - PLX-SYN-001
  - PLX-SYN-002
  - PLX-SYN-003
  - PLX-SYN-010
  - PLX-SYN-011
  - PLX-SYN-012
tags:
  - section
  - part/v
---

# §50 Synchronisation Engine

◀ [[S49 Event Store]] · [[Part V — Platform Architecture|▲ Part V]] · [[S51 Context Engine]] ▶

---

Synchronisation exists between users, devices, Desks, Objects, applications and AI.

### 50.1 Synchronisation modes

| Mode | Semantics | Conflict handling |
|---|---|---|
| **Independent** | Full fork; no ongoing relationship | None required |
| **Snapshot** | Point-in-time copy | None required |
| **Linked** | Reference with change notification, no automatic content merge | Notification only |
| **Federated** | Multiple owners, shared editing, shared history, independent presentation | Full merge |
| **Live** | Single canonical Object, concurrent editing | Full merge |
| **Streaming** | Continuous inbound feed from an external system | Last-writer-wins on source authority |

### 50.2 Conflict resolution

Conflict resolution **must be deterministic**. Rules precede AI.

| Data class | Resolution strategy | Determinism |
|---|---|---|
| Rich text / documents | CRDT (see `[[REQ-SYN#PLX-SYN-001|PLX-SYN-001]]`) | Guaranteed convergent |
| Structured rows / database tables | Field-level merge, last-writer-wins per field by `(timestamp, actorId)` tiebreak | Deterministic |
| Object layout / position | Last-writer-wins per (user, device class); layout is per-user, so cross-user conflict does not arise | Deterministic |
| Workflow state | Version validation; conflicting transition rejected, not merged | Deterministic |
| Decisions | No automatic merge; concurrent conflicting Decisions escalate to human approval | Human-resolved |
| AI suggestions | Never auto-applied; require human approval | Human-resolved |

### 50.3 The OT-versus-CRDT decision

The source specification states *"Operational Transformation or CRDT"* for text. **That is not a decision, and it cannot remain open.**

The two approaches have divergent infrastructure consequences. Operational Transformation requires a central transformation authority that sees every operation in order — it is inherently server-mediated. CRDTs converge without coordination, which is what permits genuine offline editing and peer reconciliation, at the cost of metadata that grows with edit history.

**Architectural Principle 7 is "offline capable."** That principle, taken seriously, forecloses the OT branch: a user editing a document on a plane, whose operations cannot be transformed against a server they cannot reach, needs a data structure that converges on reconnection without a referee. This specification therefore selects CRDT and records the consequence.

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-SYN#PLX-SYN-001|PLX-SYN-001]] | Collaborative text and rich-text Objects **MUST** use a CRDT with proven convergence, selected to support offline editing and reconnection without a coordinating server. | I, T | §50, decision |
| [[REQ-SYN#PLX-SYN-002|PLX-SYN-002]] | The chosen CRDT implementation **MUST** have a defined garbage-collection or compaction strategy for tombstones and history metadata, and its growth characteristics **MUST** be load-tested against a document with 10⁶ cumulative edits before Phase 1 exit. | A | §50, new |
| [[REQ-SYN#PLX-SYN-003|PLX-SYN-003]] | Conflict resolution **MUST** be deterministic for every data class in §50.2. AI **MUST NOT** participate in conflict resolution for any class marked deterministic. | T | §50.2 |
| [[REQ-SYN#PLX-SYN-010|PLX-SYN-010]] | Offline clients **MUST** be able to create Objects and Events with client-generated identifiers and reconcile on reconnection without renumbering, duplication or loss. | T | [[S45 Platform Architecture|§45]], [[S32 Canonical Entity Model|§32]] |
| [[REQ-SYN#PLX-SYN-011|PLX-SYN-011]] | On reconnection, an offline client's Events **MUST** be ingested with their original `timestamp` preserved and a distinct `recordedAt`, and downstream consumers **MUST** handle late-arriving Events without corrupting derived state. | T | [[S35 Event Entity|§35]], new |
| [[REQ-SYN#PLX-SYN-012|PLX-SYN-012]] | Where an offline edit cannot be merged (a Workflow or Decision class conflict), the platform **MUST** surface the conflict to the user with both versions intact and **MUST NOT** silently discard either. | T, D | §50, new |

> **Why `[[REQ-SYN#PLX-SYN-002|PLX-SYN-002]]` matters more than it looks.** CRDT metadata growth is the standard way this choice goes wrong in production: a document edited for two years by six people accumulates enough tombstone metadata that load time degrades noticeably, and by then there are millions of documents in that state. The compaction strategy is part of the choice, not a follow-up.

---

---

## Requirements defined or cited here

- [[REQ-SYN#PLX-SYN-001|PLX-SYN-001]] — Collaborative text and rich-text Objects **MUST** use a CRDT with proven convergence, selected to support offl
- [[REQ-SYN#PLX-SYN-002|PLX-SYN-002]] — The chosen CRDT implementation **MUST** have a defined garbage-collection or compaction strategy for tombstone
- [[REQ-SYN#PLX-SYN-003|PLX-SYN-003]] — Conflict resolution **MUST** be deterministic for every data class in §50.2. AI **MUST NOT** participate in co
- [[REQ-SYN#PLX-SYN-010|PLX-SYN-010]] — Offline clients **MUST** be able to create Objects and Events with client-generated identifiers and reconcile
- [[REQ-SYN#PLX-SYN-011|PLX-SYN-011]] — On reconnection, an offline client's Events **MUST** be ingested with their original `timestamp` preserved and
- [[REQ-SYN#PLX-SYN-012|PLX-SYN-012]] — Where an offline edit cannot be merged (a Workflow or Decision class conflict), the platform **MUST** surface

◀ [[S49 Event Store]] · [[Part V — Platform Architecture|▲ Part V]] · [[S51 Context Engine]] ▶
