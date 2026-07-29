---
id: S76
section: §76
title: "Native Application Philosophy"
part: VII
type: section
defines:
  - PLX-APP-001
  - PLX-APP-002
  - PLX-EXT-002
tags:
  - section
  - part/vii
---

# §76 Native Application Philosophy

◀ [[S75 Engineering Manifesto]] · [[Part VII — Applications, Agents, Algorithms & Roadmap|▲ Part VII]] · [[S77 Native Workspace Applications]] ▶

---

### 76.1 Purpose

Plexi is not intended to replace every application. It should replace the *need to constantly switch context* between applications.

Native applications exist only where owning the experience materially improves contextual understanding:

> If another application already performs a specialised task well, **integrate** it.
> If contextual continuity requires deep integration, **build** it.

### 76.2 Build versus integrate

| Decision | Applies to | Examples |
|---|---|---|
| **Integrate** | Applications whose primary value lies in specialised functionality | Microsoft Word, Excel, Google Docs, Adobe Creative Cloud, Figma, GitHub, Slack, Jira, Salesforce |
| **Build** | Applications where context itself creates significant value | Workspace Canvas, AI Chat, Knowledge Cards, Decision Tracker, Meeting Workspace, Whiteboard, Workspace Browser, Resume Viewer, Relationship Explorer, Automation Builder |

Plexi enhances integrated applications through context rather than replacement. Built applications become core parts of the Context Operating System.

### 76.3 The build-versus-integrate test

A native build **MUST** be justified by an affirmative answer to at least one of:

1. Does contextual continuity require capturing interaction events no external API exposes?
2. Does the experience require Objects to be first-class graph participants in a way an embedded external surface cannot achieve?
3. Is the capability absent from the market such that no integration target exists?

Cost, licensing preference, and a desire to own the surface are **not** valid justifications and **MUST NOT** be recorded as such.

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-APP#PLX-APP-001|PLX-APP-001]] | Every native application build **MUST** record an ADR answering §76.3, reviewed and approved before implementation begins. | I | §76, §1.3 |
| [[REQ-APP#PLX-APP-002|PLX-APP-002]] | Every native application **MUST** understand Desk context, Relationships, Workspace Memory, AI, permissions and Events, and **MUST** use the same platform interfaces available to marketplace extensions (`[[REQ-EXT#PLX-EXT-002|PLX-EXT-002]]`). | I, T | [[S77 Native Workspace Applications|§77]], [[S83 Marketplace Architecture|§83]] |

> **On `[[REQ-APP#PLX-APP-002|PLX-APP-002]]`.** Building first-party applications on the same public interfaces that third parties must use is the only reliable way to ensure the SDK is genuinely capable rather than nominally public. Every platform that exempts its own applications ends up with a marketplace of second-class citizens and an SDK that nobody can build anything serious on. This is a decision to make once, at the start, because it is nearly impossible to walk back.

---

---

## Requirements defined or cited here

- [[REQ-APP#PLX-APP-001|PLX-APP-001]] — Every native application build **MUST** record an ADR answering §76.3, reviewed and approved before implementa
- [[REQ-APP#PLX-APP-002|PLX-APP-002]] — Every native application **MUST** understand Desk context, Relationships, Workspace Memory, AI, permissions an
- [[REQ-EXT#PLX-EXT-002|PLX-EXT-002]] — Extensions **MUST** use the same public platform interfaces as first-party applications (`PLX-APP-002`). No pr

◀ [[S75 Engineering Manifesto]] · [[Part VII — Applications, Agents, Algorithms & Roadmap|▲ Part VII]] · [[S77 Native Workspace Applications]] ▶
