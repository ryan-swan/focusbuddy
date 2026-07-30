# ADR-0003 — Cryptographic erasure and per-subject key management

Status: ACCEPTED for the desktop build (operator-delegated, 2026-07-30). Overridable before the plexi-4.0 branch merges.
Relates to spec risk PLX-RSK-01 and spec decision ADR-01 (key management), which remains OPEN for the cloud KMS/HSM topology; this record narrows it to the desktop build.

## Context

Event sourcing makes organisational memory immutable: the Event Store exposes no update or delete, and `deletedAt` affects visibility only (INV-05, DOM-015, PRD-012). Data-protection law grants a data subject the right to erasure. These collide head-on: you cannot both keep every Event forever and delete a person's data on request.

The spec resolves this with the §44.1 carve-out: erasure is executed by destroying the per-subject key material, not by mutating or deleting Event records. The Event records remain; their personal-data payloads become permanently undecryptable. This requires that personal data never sits in clear inside an Event, but is sealed under a per-subject key and referenced (DOM-032), and that a real key registry exists whose keys can be irreversibly destroyed (SEC-030), backed by a data inventory (SEC-031, DATA-006) and a DSAR path (SEC-032).

This is the ADR-01 foreclosing decision. The operator delegated the call for the long-term security of users; this ADR is the durable record and can be overridden before merge. As with tenant isolation, this is the cheapest moment to decide: the event-sourced schema is unmerged with zero production data, so no personal data is yet stranded under an undecided scheme.

## Decision

For the desktop build, personal data is protected by per-subject symmetric keys and erased cryptographically.

- Each data subject has a symmetric key (AES-256-GCM, 256-bit) in a key registry. In production the registry is backed by the OS keychain via Electron safeStorage; the module accepts any key store, and tests use an in-memory or SQLite-backed one.
- Personal data is sealed under the subject's key before it is referenced from any Event or derived store, and referenced by an immutable content digest, never inlined in an Event payload (DOM-032). An Event carries the reference and the ciphertext, never the clear text.
- Erasure destroys the subject's key irreversibly. Sealed payloads then decrypt to a permanent tombstone rather than clear text, and no Event, Relationship, Decision or version record is mutated or removed (SEC-030, INV-05, DOM-015). The erasure action is itself recorded as a `SubjectErased` Event (§44.1).
- A data inventory catalogues every store that holds personal data, with its lawful basis, retention period and erasure mechanism, so erasure and DSAR can reach all of them (SEC-031, DATA-006). A DSAR gathers a subject's still-decryptable data across those stores (SEC-032); after erasure it honestly reports the data as unrecoverable rather than fabricating a record.
- Retention policies can never prune Event records or Decision `alternatives` (DATA-012); the retention guard refuses those targets by construction.

## What remains open

Cloud key management is NOT decided here and ADR-01 stays OPEN for it: a cloud backend would use a managed KMS or HSM with automatic rotation (SEC-024) and customer-managed keys (SEC-026), and would need per-region residency for inference (SEC-025). Those bind a cloud service that does not yet exist. The desktop decision maps cleanly onto a KMS-backed registry later — the seal/open/destroy interface is the same — so nothing here forecloses that choice.

## Consequences

- Users gain a real, lawful erasure path that does not corrupt the audit trail: destroy the key, keep the history, the personal data is gone.
- The erasure mechanism, key registry, sealing, data inventory and DSAR are built and tested here. Routing each specific personal-data field in the live app through the seal is the integration step that follows; the mechanism the foreclosing decision was blocking now exists.
- Decided at the cheapest moment, before any production data exists under the new schema.
