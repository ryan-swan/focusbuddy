---
id: S15
section: §15
title: "Knowledge Graph"
part: II
type: section
defines:
  - PLX-PRD-050
  - PLX-PRD-051
  - PLX-PRD-052
  - PLX-PRD-053
tags:
  - section
  - part/ii
---

# §15 Knowledge Graph

◀ [[S14 Resume Intelligence]] · [[Part II — Product Model|▲ Part II]] · [[S16 Shared Objects]] ▶

---

Everything inside Plexi participates in a continuously evolving knowledge graph. Unlike traditional links, Relationships may be **explicit** or **discovered**.

### 15.1 Relationship types

Supports · Blocks · Depends On · References · Duplicates · Conflicts With · Extends · Replaces · Related To · Owned By · Created By · Requested By · Explains · Evidence For · Evidence Against

The consolidated, deduplicated catalogue reconciling this list with [[S36 Relationship Entity|§36]] and [[S65 Knowledge Graph Schema|§65]] is **Appendix E**.

### 15.2 Automatic relationship discovery

AI continuously evaluates semantic similarity, shared meetings, shared decisions, shared stakeholders, shared documents, shared history, dependency overlap, project overlap, language similarity and workflow similarity.

Suggested Relationships remain recommendations until accepted.

### 15.3 Graph principles

The graph should explain, not surprise. Every inferred Relationship must include evidence. Every recommendation must include confidence. Users must always understand why a Relationship exists.

### 15.4 Requirements

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-PRD#PLX-PRD-050|PLX-PRD-050]] | Every Relationship **MUST** carry provenance: discovery method, creating actor or system, evidence references, and confidence. | T | §15.3, [[S36 Relationship Entity|§36]], [[S44 Domain Invariants|§44]] R3 |
| [[REQ-PRD#PLX-PRD-051|PLX-PRD-051]] | AI-discovered Relationships **MUST** be stored as `provisional` and **MUST NOT** influence Context Health, Resume content or permission evaluation until confirmed by a user or until confidence exceeds the configured tenant threshold. | T | §15.2, [[S36 Relationship Entity|§36]] |
| [[REQ-PRD#PLX-PRD-052|PLX-PRD-052]] | Promotion of a provisional Relationship to confirmed by threshold **MUST** emit a `RelationshipConfirmed` Event recording the threshold and the confidence at promotion. | T | [[S36 Relationship Entity|§36]], new |
| [[REQ-PRD#PLX-PRD-053|PLX-PRD-053]] | The platform **MUST NOT** require a user to manually construct graph structure in order to receive relationship-derived intelligence. | D | §6.8 |

---

---

## Requirements defined or cited here

- [[REQ-PRD#PLX-PRD-050|PLX-PRD-050]] — Every Relationship **MUST** carry provenance: discovery method, creating actor or system, evidence references,
- [[REQ-PRD#PLX-PRD-051|PLX-PRD-051]] — AI-discovered Relationships **MUST** be stored as `provisional` and **MUST NOT** influence Context Health, Res
- [[REQ-PRD#PLX-PRD-052|PLX-PRD-052]] — Promotion of a provisional Relationship to confirmed by threshold **MUST** emit a `RelationshipConfirmed` Even
- [[REQ-PRD#PLX-PRD-053|PLX-PRD-053]] — The platform **MUST NOT** require a user to manually construct graph structure in order to receive relationshi

◀ [[S14 Resume Intelligence]] · [[Part II — Product Model|▲ Part II]] · [[S16 Shared Objects]] ▶
