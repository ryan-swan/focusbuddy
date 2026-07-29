# ADR-0002 — Tenant isolation model for the local-first build

Status: ACCEPTED for the desktop build (operator-delegated, 2026-07-30). Overridable before the plexi-4.0 branch merges.
Relates to spec risk PLX-RSK-07 and spec decision ADR-07 (which remains OPEN for the cloud topology; this record narrows it to the desktop build, it does not close it).

## Context

Spec requirements PLX-GPH-010, GPH-011, GPH-021, SEC-010, SEC-011, SEC-020, DOM-011 and invariant INV-06 all require that tenant isolation and permission-filtered traversal be enforced at the data-access layer, not by application code and not by a gateway. The graph is the hard case: traversal is the primary access pattern and a single unbounded walk can leave a namespace, so application-level tenant filtering over a pooled graph is one query-construction bug away from a cross-tenant leak.

The spec's open decision (ADR-07 / RSK-07) frames this as a cloud-scale question: silo the graph per tenant or namespace within one engine, what the cost curve looks like at 1,000 tenants, how vector indexes partition. Those questions are real, but they are about a cloud backend. The actual product today is a local-first Electron and SQLite desktop app in which "tenants" are the organisations a single user belongs to (multi-org already ships, with per-org local scoping). The cloud topology sub-questions do not bind the desktop build.

Per the vault's hard rule, this foreclosing decision is recorded rather than settled by an implementation detail. The operator delegated the call for the long-term health of the app; this ADR is the durable record and can be overridden before merge.

## Decision

For the local-first desktop build, `organisationId` is the tenant boundary, enforced at the store (data-access) layer by construction.

- Every entity already carries `organisationId` (DOM-011). Every store that can traverse or aggregate is bound to a single `organisationId` at construction, and every read hardcodes that filter. A store instance can only ever return its own organisation's data, so a cross-organisation result is impossible by construction rather than by discipline (SEC-011, SEC-010). In the local single-database engine, this store-layer binding is the "engine-level namespacing" of GPH-011 — the store is the lowest layer above SQLite, and the caller cannot widen its scope.
- Graph traversal is permission-filtered (GPH-010). Traversal never crosses an edge into a node the requesting principal cannot read, and the existence of an unreadable node is never disclosed through neighbour counts, path lengths or aggregates: unreadable neighbours are omitted before any count is derived, not filtered from a count computed over all of them.
- Every edge carries a permission scope and traversal evaluates it (GPH-021). Most-restrictive-wins: an edge is traversable only when both endpoints are readable and the edge scope is satisfied (INV-06).
- Authorisation is evaluated in the store, not in the caller or a gateway (SEC-020). The permission predicate is injected so the graph layer stays decoupled from the concrete membership model, but the enforcement point is the data-access layer.

In production the Context Engine binds each store to `getActiveOrgId()`, so the by-construction guarantee holds on the real path. An unbound store constructor is retained for single-organisation unit tests only and is documented as such.

## What remains open

The cloud multi-tenant topology is NOT decided here and ADR-07 stays OPEN for it: whether a cloud graph engine is siloed per tenant or namespaced within one engine, the cost curve at scale, and vector-index partitioning. Those bind a cloud backend that does not yet exist. When one is built, a follow-up ADR resolves them; nothing in this desktop decision forecloses either choice, because the store-layer binding maps cleanly onto either a per-tenant instance or a namespaced pool.

## Consequences

- Correctness and safety land before more of the brain is surfaced in the collaborative and cross-member-sync paths the app already ships, closing a latent cross-tenant leak in graph traversal and Context Health propagation.
- The decision is made at the cheapest possible moment: the event-sourced schema is on an unmerged branch with zero production data, so reversal is still inexpensive.
- Stores gain an organisation binding and a permission-filtered traversal path; the single-user local case supplies an allow-all read predicate, so behaviour is unchanged for today's typical user while the enforcement is in place for multi-user use.
