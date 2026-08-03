---
id: S2
section: §2
title: "The Problem"
part: I
type: section
defines:
  - PLX-MET-002
  - PLX-MET-004
  - PLX-MET-006
tags:
  - section
  - part/i
---

# §2 The Problem

◀ [[S01 Executive Summary]] · [[Part I — Vision|▲ Part I]] · [[S03 Why Existing Software Fails]] ▶

---

### 2.1 Context switching

Modern work is fragmented. A single task routinely requires email, Slack, Teams, a browser, a CRM, an IDE, notes, documentation, AI tools, a calendar, meetings and spreadsheets.

The user continually reconstructs context between applications. This reconstruction is invisible. It is not measured. It is one of the largest productivity costs inside modern organisations.

### 2.2 Context loss

People rarely forget information. They forget where they left off, why something exists, what changed, whether something is finished, who owns it, and what depends upon it.

Current software has almost no concept of these questions.

### 2.3 Organisational memory

When people leave organisations they take context with them. Projects become archaeological digs. Decisions lose evidence. Knowledge becomes tribal. The organisation repeatedly pays to rediscover its own knowledge.

### 2.4 The state of AI assistance

Current AI systems answer questions. Very few understand ongoing work. They lack persistent memory, organisational understanding, object relationships, decision history, workspace state and contextual continuity.

As a result AI continually asks users to provide context that the computer already possesses.

### 2.5 Problem-to-capability traceability

Each problem statement below maps to the capability that discharges it. This mapping is the primary defence against feature drift: a proposed feature that maps to no problem row has no claim on the roadmap.

| Problem | Discharged by | Measured by |
|---|---|---|
| Where did I leave off? | Resume Intelligence ([[S14 Resume Intelligence|§14]], [[S52 Resume Engine|§52]]) | Context reconstruction time (`[[REQ-MET#PLX-MET-002|PLX-MET-002]]`) |
| Why does this exist? | Decision entity ([[S37 Decision Entity|§37]]), Relationship provenance ([[S36 Relationship Entity|§36]]) | Decision retrieval success rate |
| What changed? | Context Health ([[S20 Context Health|§20]]), Resume changes ([[S39 Resume Entity|§39]]) | Attention precision (`[[REQ-MET#PLX-MET-006|PLX-MET-006]]`) |
| Is this finished? | Object lifecycle ([[S11 Objects|§11]]), Decision states ([[S37 Decision Entity|§37]]) | — |
| Who owns it? | Ownership invariant (`[[Invariants#PLX-INV-01|PLX-INV-01]]`), Relationship types ([[S36 Relationship Entity|§36]]) | — |
| What depends on this? | Knowledge Graph ([[S15 Knowledge Graph|§15]], [[S53 Knowledge Graph Runtime|§53]]), Dependency propagation ([[S80 Context Engine Algorithms|§80]]) | Duplicate work detected (`[[REQ-MET#PLX-MET-004|PLX-MET-004]]`) |
| Knowledge leaves with people | Organisational Memory ([[S17 Organisational Intelligence|§17]]), immutable history (`[[Invariants#PLX-INV-05|PLX-INV-05]]`) | Onboarding time to first contribution |
| AI asks for context the system already has | AI Orchestrator context assembly ([[S67 AI Prompt Framework|§67]]) | Prompt context hit rate |

---

---

## Requirements defined or cited here

- [[REQ-MET#PLX-MET-002|PLX-MET-002]] — Context reconstruction time — Elapsed time from Desk open to first substantive edit or Decision action Baselin
- [[REQ-MET#PLX-MET-004|PLX-MET-004]] — Duplicate work detected — Count of duplicate-candidate Relationships surfaced and confirmed by a user Baseline
- [[REQ-MET#PLX-MET-006|PLX-MET-006]] — Attention precision — Proportion of `Attention Required` and `Decision Risk` transitions the user acts on rath

◀ [[S01 Executive Summary]] · [[Part I — Vision|▲ Part I]] · [[S03 Why Existing Software Fails]] ▶
