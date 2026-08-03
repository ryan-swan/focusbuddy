---
id: S43
section: §43
title: "Entity Relationships"
part: IV
type: section
defines: None
tags:
  - section
  - part/iv
---

# §43 Entity Relationships

◀ [[S42 Organisation Entity]] · [[Part IV — Domain Model|▲ Part IV]] · [[S44 Domain Invariants]] ▶

---

Conceptually, entities layer as follows:

```mermaid
flowchart TD
    O[Organisation] --> D[Desk]
    D --> Ob[Object]
    Ob --> Dec[Decision]
    Dec --> E[Event]
    E --> R[Relationship]
    R --> Res[Resume]
    Res --> WM[Workspace Memory]
    WM --> KG[Knowledge Graph]
    KG --> AI[AI Reasoning]
```

This hierarchy is **conceptual only**. Internally, all entities participate equally within the graph. Implementations **MUST NOT** encode this diagram as a storage or traversal hierarchy.

---

---

◀ [[S42 Organisation Entity]] · [[Part IV — Domain Model|▲ Part IV]] · [[S44 Domain Invariants]] ▶
