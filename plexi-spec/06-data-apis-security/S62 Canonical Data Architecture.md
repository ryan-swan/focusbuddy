---
id: S62
section: §62
title: "Canonical Data Architecture"
part: VI
type: section
defines:
  - PLX-CON-004
  - PLX-DATA-001
  - PLX-DATA-002
  - PLX-DATA-003
  - PLX-DATA-004
  - PLX-DATA-005
  - PLX-DATA-006
  - PLX-DOM-032
  - PLX-SEC-010
tags:
  - section
  - part/vi
---

# §62 Canonical Data Architecture

◀ [[S61 Purpose]] · [[Part VI — Data, APIs, Security & Engineering Standards|▲ Part VI]] · [[S63 Canonical API Design]] ▶

---

### 62.1 Philosophy

Plexi is not a single database. Different kinds of information require different persistence models. The platform adopts **polyglot persistence**, with each store selected for its business purpose rather than engineering preference.

### 62.2 Storage components

| Store | Purpose | Holds | Candidate technologies |
|---|---|---|---|
| **Relational** | Transactional business data | Users, Organisations, permissions, billing, authentication, configuration, policies, role assignments, audit references | PostgreSQL |
| **Object store** | Persistent storage of workspace Objects | Documents, widgets, canvases, meetings, chats, tasks, tables, presentations, files, metadata | PostgreSQL JSONB or MongoDB |
| **Event Store** | Permanent history — append-only, never updated, never deleted | Every meaningful change | EventStoreDB, Kafka + object storage, Apache Pulsar |
| **Knowledge Graph** | Relationships, dependencies, organisational understanding | Nodes, edges, relationship confidence, traversal weights, semantic links | Neo4j, Memgraph, Amazon Neptune |
| **Vector index** | Semantic retrieval | Embeddings, AI memory indexes, knowledge retrieval | pgvector, Qdrant, Weaviate, Pinecone |
| **Search index** | Fast retrieval | Searchable representations | OpenSearch, Elasticsearch, Meilisearch |
| **Blob store** | Large content, referenced by digest (`[[REQ-DOM#PLX-DOM-032|PLX-DOM-032]]`) | File bodies, recordings, media | Object storage with immutable-object support |
| **Credential vault** | Third-party credentials (`[[REQ-CON#PLX-CON-004|PLX-CON-004]]`) | Connector secrets, tokens | Dedicated secrets manager with tenant-scoped keys |

The blob store and credential vault are additions made during consolidation; both are required by requirements stated elsewhere and were absent from the source component list.

### 62.3 Requirements

| ID | Requirement | V | Src |
|---|---|---|---|
| [[REQ-DATA#PLX-DATA-001|PLX-DATA-001]] | Each store **MUST** have exactly one owning service. No store **MUST** be written by more than one service. | I | §62, [[S45 Platform Architecture|§45]] |
| [[REQ-DATA#PLX-DATA-002|PLX-DATA-002]] | Derived stores — graph, vector, search, Context DB, Resume DB — **MUST** be fully rebuildable from the Event Store. Rebuild **MUST** be tested at least once per release train. | T, A | §62, new |
| [[REQ-DATA#PLX-DATA-003|PLX-DATA-003]] | Only the Event Store is a system of record for history. Only the Object store is a system of record for current Object content. Every other store **MUST** be treated as a rebuildable projection. | I | §62, new |
| [[REQ-DATA#PLX-DATA-004|PLX-DATA-004]] | Every store **MUST** enforce tenant isolation at the storage layer (`[[REQ-SEC#PLX-SEC-010|PLX-SEC-010]]`), including graph namespaces and vector-index partitions. | T, I | §62, [[S42 Organisation Entity|§42]] |
| [[REQ-DATA#PLX-DATA-005|PLX-DATA-005]] | Every store **MUST** have a documented backup, restore and point-in-time-recovery procedure, and restore **MUST** be exercised at least quarterly against production-scale data. | I, D | §62, new |
| [[REQ-DATA#PLX-DATA-006|PLX-DATA-006]] | Personal data **MUST** be catalogued per store, with its lawful basis, retention period and erasure mechanism recorded, before that store enters production. | I | §62, [[S69 Security Architecture|§69]], new |

> **On `[[REQ-DATA#PLX-DATA-002|PLX-DATA-002]]`.** Rebuildability is what makes polyglot persistence tolerable rather than terrifying. Six stores means six opportunities for divergence, and divergence in a derived store shows up to the user as the platform confidently asserting something false. If the graph, vector and search stores can be dropped and rebuilt from the Event Store on demand, then corruption is an inconvenience. If they cannot, every one of them is a system of record you did not intend to create, with its own backup, migration and consistency burden. Test the rebuild, or it does not work — this is the single highest-leverage test in the platform.

---

---

## Requirements defined or cited here

- [[REQ-CON#PLX-CON-004|PLX-CON-004]] — Connector credentials **MUST** be stored in a dedicated credential vault, encrypted with tenant-scoped keys, a
- [[REQ-DATA#PLX-DATA-001|PLX-DATA-001]] — Each store **MUST** have exactly one owning service. No store **MUST** be written by more than one service.
- [[REQ-DATA#PLX-DATA-002|PLX-DATA-002]] — Derived stores — graph, vector, search, Context DB, Resume DB — **MUST** be fully rebuildable from the Event S
- [[REQ-DATA#PLX-DATA-003|PLX-DATA-003]] — Only the Event Store is a system of record for history. Only the Object store is a system of record for curren
- [[REQ-DATA#PLX-DATA-004|PLX-DATA-004]] — Every store **MUST** enforce tenant isolation at the storage layer (`PLX-SEC-010`), including graph namespaces
- [[REQ-DATA#PLX-DATA-005|PLX-DATA-005]] — Every store **MUST** have a documented backup, restore and point-in-time-recovery procedure, and restore **MUS
- [[REQ-DATA#PLX-DATA-006|PLX-DATA-006]] — Personal data **MUST** be catalogued per store, with its lawful basis, retention period and erasure mechanism
- [[REQ-DOM#PLX-DOM-032|PLX-DOM-032]] — Large Object content **MUST** be stored out-of-band via `contentRef` and **MUST NOT** be embedded in Event pay
- [[REQ-SEC#PLX-SEC-010|PLX-SEC-010]] — Every store — relational, document, event, graph, vector and search — **MUST** enforce tenant isolation at the

◀ [[S61 Purpose]] · [[Part VI — Data, APIs, Security & Engineering Standards|▲ Part VI]] · [[S63 Canonical API Design]] ▶
