# ADR-0005 — Deployment topology: local-first plus sync, not a hosted multi-tenant cloud

Status: ACCEPTED for the 4.0 milestone (operator-directed, 2026-07-30). Revisit if a hosted product is built.
Relates to spec §71 (seven topologies), REQ-OPS, REQ-SEC (024/025/026), EVT-032, CON-004, DATA-005, and spec risk PLX-RSK-07/08.

## Context

The spec is written for a hosted multi-tenant Context OS and carries a family of requirements that only make sense for that shape: nine OPS requirements (deployment, monitoring, SLO dashboards, incident runbooks), data residency per organisation (SEC-025), customer-managed encryption keys (SEC-026), per-tenant graph/vector KMS, a connector credential vault (CON-004), and seven deployment topologies (§71).

The actual product is a local-first Electron desktop app. Its only server-side component is a sync/signal service (the Fly `focusbuddy-signal` service and a Vercel deployment for the brochure/admin); that server relays sync and presence, it is not a hosted instance of the app, and organisational data lives in each client's local SQLite. Building a multi-tenant cloud backend now, purely to satisfy those requirements, would be a large infrastructure investment with real ongoing cost and no current user — the opposite of the product's local-first thesis.

## Decision

The 4.0 milestone targets the local-first plus sync topology. The pure hosted-cloud requirements are DEFERRED and recorded as not-applicable-to-the-current-topology, rather than left as silent gaps:

- Deferred (need a hosted backend that does not exist): OPS-001..014 as a cloud ops surface, SEC-025 (data residency), SEC-026 (customer-managed keys), per-tenant graph/vector KMS, and the §71 topology matrix beyond the desktop and sync shapes.

The requirements that DO apply to the local-first plus sync reality are in scope and done at that level, not deferred:

- SEC-024 (secrets in a managed vault): satisfied by the OS keychain via Electron safeStorage, which is where API keys and the session token already live. Verify, do not rebuild.
- EVT-032 (event store encrypted at rest): applies to the local SQLite. The crypto-erasure layer (ADR-0003) already seals personal data in Event payloads under per-subject keys; full database-file encryption (SQLCipher or OS-level disk encryption) is the remaining hardening and is a desktop packaging decision.
- DATA-005 (backup / restore / PITR): a desktop backup path already exists (backup.ts) and the sync server has Fly snapshots. Document the procedure and exercise a restore.
- OPS for the sync server only: the Fly signal service warrants a monitoring/runbook/failure-mode note, scoped to that small service, not a full cloud ops surface.

## Consequences

- The honest finish line for this milestone is the applicable set, not all 344. Roughly 20 requirements are correctly deferred as hosted-cloud-only; the tracker marks them deferred with this ADR as the reason, so the gauge is not padded with things the product does not deploy.
- Nothing here forecloses a future hosted product. If one is built, this ADR is superseded and the deferred requirements come into scope with their own infrastructure work.
- The performance targets (§58) are measured at the desktop/core-operation level with a seeded benchmark harness; production-instrumentation targets (PERF-070/071/072) remain deferred until there is production to instrument.
