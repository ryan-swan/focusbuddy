---
id: S53
section: §53
title: "Knowledge Graph Runtime"
part: V
type: section
defines:
  - PLX-GPH-010
  - PLX-GPH-011
  - PLX-GPH-012
  - PLX-GPH-013
  - PLX-SEC-011
tags:
  - section
  - part/v
---

# §53 Knowledge Graph Runtime

◀ [[S52 Resume Engine]] · [[Part V — Platform Architecture|▲ Part V]] · [[S54 Search Architecture]] ▶

---

Unlike traditional graph databases, the Plexi graph is **active**. It reacts. It evolves. It reasons.

### 53.1 Responsibilities

Relationship storage · relationship inference · traversal · similarity analysis · dependency propagation · community detection · knowledge clustering · duplicate detection · organisational awareness.

### 53.2 Graph updates

Every Event potentially modifies nodes, edges, weights, confidence, relationship strength, traversal paths and semantic clusters.

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-GPH#PLX-GPH-010|PLX-GPH-010]] | Graph traversal **MUST** be permission-filtered. Traversal **MUST NOT** cross an edge into a node the requesting principal cannot read, and **MUST NOT** disclose the existence of such a node through path counts, distances or aggregate results. | T, A | §53, [[S44 Domain Invariants|§44]] R6 |
| [[REQ-GPH#PLX-GPH-011|PLX-GPH-011]] | Graph storage **MUST** be tenant-namespaced at the engine level. Application-level tenant filtering alone **MUST NOT** be relied upon (`[[REQ-SEC#PLX-SEC-011|PLX-SEC-011]]`). | I, T | §53, [[S42 Organisation Entity|§42]] |
| [[REQ-GPH#PLX-GPH-012|PLX-GPH-012]] | Graph writes **MUST** be idempotent with respect to Event replay. Replaying an Event **MUST NOT** duplicate nodes or edges. | T | §53, [[S49 Event Store|§49]] |
| [[REQ-GPH#PLX-GPH-013|PLX-GPH-013]] | Community detection, clustering and duplicate detection **MUST** run asynchronously and **MUST NOT** be on the synchronous path of any user-facing operation with a latency SLO. | A | §53, [[S58 Performance Requirements|§58]] |

> **On `[[REQ-GPH#PLX-GPH-010|PLX-GPH-010]]`.** Permission-filtered traversal is substantially more expensive than unfiltered traversal, and it interacts badly with the [[S58 Performance Requirements|§58]] latency budgets. There are two viable designs: filter at traversal time (correct, slow) or maintain per-principal materialised reachability (fast, expensive to maintain, and stale after permission changes). This is a real architectural fork that must be decided with measurement, not assumption. Note also the second clause: leaking *existence* through a path count is a genuine and commonly-missed vulnerability class. See `[[Risk Register#PLX-RSK-09|PLX-RSK-09]]`.

---

---

## Requirements defined or cited here

- [[REQ-GPH#PLX-GPH-010|PLX-GPH-010]] — Graph traversal **MUST** be permission-filtered. Traversal **MUST NOT** cross an edge into a node the requesti
- [[REQ-GPH#PLX-GPH-011|PLX-GPH-011]] — Graph storage **MUST** be tenant-namespaced at the engine level. Application-level tenant filtering alone **MU
- [[REQ-GPH#PLX-GPH-012|PLX-GPH-012]] — Graph writes **MUST** be idempotent with respect to Event replay. Replaying an Event **MUST NOT** duplicate no
- [[REQ-GPH#PLX-GPH-013|PLX-GPH-013]] — Community detection, clustering and duplicate detection **MUST** run asynchronously and **MUST NOT** be on the
- [[REQ-SEC#PLX-SEC-011|PLX-SEC-011]] — Cross-Organisation traversal, search or reasoning **MUST** be impossible by construction. No API, query path,

◀ [[S52 Resume Engine]] · [[Part V — Platform Architecture|▲ Part V]] · [[S54 Search Architecture]] ▶
