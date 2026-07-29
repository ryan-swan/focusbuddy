---
id: S4
section: §4
title: "Vision"
part: I
type: section
defines:
  - PLX-PRIN-004
  - PLX-PRIN-005
tags:
  - section
  - part/i
---

# §4 Vision

◀ [[S03 Why Existing Software Fails]] · [[Part I — Vision|▲ Part I]] · [[S05 Mission]] ▶

---

Plexi should become the first **Context Operating System**. Every piece of work should exist inside persistent context. Context should outlive applications, devices, operating systems, employees, meetings and conversations.

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-PRIN#PLX-PRIN-004|PLX-PRIN-004]] | Context, relationships, decisions and history **MUST** be exportable in a documented, machine-readable, vendor-neutral format sufficient to reconstruct organisational memory outside Plexi. | T | §4 (implied), new |
| [[REQ-PRIN#PLX-PRIN-005|PLX-PRIN-005]] | The platform **MUST NOT** make context durability contingent on a specific AI model, vendor or version. Withdrawal of any model provider **MUST NOT** invalidate previously stored context, relationships or decisions. | A, I | §4, [[S55 AI Orchestration|§55]] |

> **Why `[[REQ-PRIN#PLX-PRIN-004|PLX-PRIN-004]]` is here.** A platform whose entire value proposition is "your understanding outlives everything" cannot credibly also be a lock-in trap. Export is not a competitive concession; it is the proof of the claim. Enterprise buyers will ask for it in the first security review, and the answer "we haven't built that yet" undermines the pitch more than any feature gap.

---

---

## Requirements defined or cited here

- [[REQ-PRIN#PLX-PRIN-004|PLX-PRIN-004]] — Context, relationships, decisions and history **MUST** be exportable in a documented, machine-readable, vendor
- [[REQ-PRIN#PLX-PRIN-005|PLX-PRIN-005]] — The platform **MUST NOT** make context durability contingent on a specific AI model, vendor or version. Withdr

◀ [[S03 Why Existing Software Fails]] · [[Part I — Vision|▲ Part I]] · [[S05 Mission]] ▶
