---
id: S46
section: §46
title: "High-Level System Architecture"
part: V
type: section
defines: None
tags:
  - section
  - part/v
---

# §46 High-Level System Architecture

◀ [[S45 Platform Architecture]] · [[Part V — Platform Architecture|▲ Part V]] · [[S47 Service Architecture]] ▶

---

```mermaid
flowchart TD
    UI[User Interface<br/>desktop · mobile · voice · XR · API clients]
    GW[Workspace Gateway API]

    UI --> GW

    GW --> WS[Workspace Service]
    GW --> ID[Identity Service]
    GW --> SE[Search Service]

    WS --> BUS[(Event Bus — immutable, partitioned, ordered)]
    ID --> BUS
    SE --> BUS

    BUS --> OBJ[Object Service]
    BUS --> CTX[Context Engine]
    BUS --> GPH[Graph Engine]
    BUS --> RES[Resume Engine]
    BUS --> AUT[Automation Engine]

    OBJ --> ODB[(Object DB)]
    CTX --> CDB[(Context DB)]
    GPH --> GDB[(Graph DB)]
    RES --> RDB[(Resume DB)]
    AUT --> WDB[(Workflow DB)]

    CTX --> ORCH[AI Orchestrator]
    RES --> ORCH
    GPH --> ORCH

    ORCH --> RA[Reasoning Agent]
    ORCH --> SA[Search Agent]
    ORCH --> CA[Coordination Agent]

    ORCH --> CONN[Connector Service]
    CONN --> EXT[External Systems]

    EVS[Event Service] --> BUS
    BUS --> EVS
    EVS --> ESTORE[(Event Store — append-only)]
```

### 46.1 Responsibility boundaries

Each service owns exactly one business capability. No service directly manipulates another service's data. Communication occurs exclusively through APIs and Events. This prevents tight coupling.

### 46.2 Correction to the source diagram

The v1.0 Part V diagram showed the AI Orchestrator downstream of the derived-state services and the Connector Service downstream of the AI Orchestrator. As drawn, this implies connectors are reachable only through AI, which contradicts [[S57 Connector Framework|§57]] (connectors expose capabilities to the platform, not only to agents) and would make deterministic integration sync impossible.

The corrected topology above places the Connector Service as a peer service reachable both by the AI Orchestrator (as a tool surface) and directly by the Event Bus (for deterministic synchronisation). This is a **defect correction**, recorded in Appendix H.

---

---

◀ [[S45 Platform Architecture]] · [[Part V — Platform Architecture|▲ Part V]] · [[S47 Service Architecture]] ▶
