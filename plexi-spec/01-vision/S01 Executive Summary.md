---
id: S1
section: §1
title: "Executive Summary"
part: I
type: section
defines:
  - PLX-PRIN-001
  - PLX-PRIN-002
  - PLX-PRIN-003
tags:
  - section
  - part/i
---

# §1 Executive Summary

◀ [[S00 Conventions, requirement identifiers and verification]] · [[Part I — Vision|▲ Part I]] · [[S02 The Problem]] ▶

---

### 1.1 Purpose

Plexi is a **Context Operating System**. Rather than replacing the applications people already use, Plexi surrounds those applications with persistent context, organisational memory and AI reasoning.

The platform exists to solve a problem that almost every knowledge worker experiences multiple times every day:

> **People lose context far more often than they lose data.**

Every interruption creates a hidden tax. Opening a project after a week requires reconstructing what was happening, what decisions were made, why those decisions were made, what changed, what remains unresolved, and where to continue.

Current software stores files. Current software stores conversations. Current software stores tasks. Very little software stores **understanding**.

Plexi exists to preserve understanding.

### 1.2 Vision statement

Create software that remembers work the same way people remember physical workspaces. A person should be able to leave a project for five minutes, five days or five months and immediately continue working without reconstructing their mental model. The workspace itself should remember.

### 1.3 Product definition

Plexi is **not** another document editor, another project manager, another note application, or another operating system in the systems sense.

Plexi is the contextual layer that exists around every application. Applications remain specialists. Plexi becomes memory.

### 1.4 Primary product promise

Users never rebuild context. They switch Desks. Everything else is already waiting.

### 1.5 Normative framing

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-PRIN#PLX-PRIN-001|PLX-PRIN-001]] | The platform **MUST NOT** require a user to perform any manual action whose sole purpose is to preserve context for their own future return. Saving, snapshotting, pinning, bookmarking and summarising for continuity purposes **MUST** be automatic. | T, D | §1.4, [[S13 Workspace Memory|§13]] |
| [[REQ-PRIN#PLX-PRIN-002|PLX-PRIN-002]] | The platform **MUST** preserve context independently of the applications that produced it. Removal, replacement or deprecation of a Connector **MUST NOT** destroy previously captured context, relationships or history relating to Objects sourced through it. | T | [[S04 Vision|§4]], [[S59 Architectural Invariants|§59]] |
| [[REQ-PRIN#PLX-PRIN-003|PLX-PRIN-003]] | The platform **MUST NOT** position itself as a replacement for specialist applications. Native applications **MUST** be justified against the build-vs-integrate test in [[S76 Native Application Philosophy|§76]] and the justification recorded in an Architecture Decision Record. | I | §1.3, [[S76 Native Application Philosophy|§76]] |

---

---

## Requirements defined or cited here

- [[REQ-PRIN#PLX-PRIN-001|PLX-PRIN-001]] — The platform **MUST NOT** require a user to perform any manual action whose sole purpose is to preserve contex
- [[REQ-PRIN#PLX-PRIN-002|PLX-PRIN-002]] — The platform **MUST** preserve context independently of the applications that produced it. Removal, replacemen
- [[REQ-PRIN#PLX-PRIN-003|PLX-PRIN-003]] — The platform **MUST NOT** position itself as a replacement for specialist applications. Native applications **

◀ [[S00 Conventions, requirement identifiers and verification]] · [[Part I — Vision|▲ Part I]] · [[S02 The Problem]] ▶
