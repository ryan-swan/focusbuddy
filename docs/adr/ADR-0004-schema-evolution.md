# ADR-0004 — Event schema evolution over an infinite horizon

Status: ACCEPTED for the desktop build (operator-delegated, 2026-07-30). Overridable before the plexi-4.0 branch merges.
Relates to spec risk PLX-RSK-02 (foreclosing) and requirements PLX-EVT-035, EVT-044, DOM-012.

## Context

Events are immutable and retained forever, so every schema change is permanent and the platform will be reading v1 Events years from now. Without a designed upcasting layer, "replay any Desk at any point in history" silently degrades to "replay any Desk since the last breaking change" (RSK-02). The risk register lists three sub-questions that must be answered rather than emerge by accident: is upcasting applied at read time or via a materialised projection; how are upcasters themselves versioned and tested; and what happens when a field is added with no sensible historical default, does the upcaster fabricate a value or expose absence.

This is foreclosing and is required before the first production Event, so it is cheapest to settle now, while the event-sourced schema is unmerged with zero production data. The operator delegated the call; this ADR is the durable record and is overridable before merge.

## Decision

Upcasting is applied at read time, upcasters are versioned and chained, and absence is never fabricated.

Read-time upcasting. Events are stored exactly as written and are never rewritten. On read, an Event whose `schemaVersion` is older than the current version for its type is passed through the registered chain of upcasters until it reaches the current shape. The stored log stays pristine, which keeps INV-05 intact and means a fixed upcaster bug can be corrected and simply re-applied on the next read rather than needing a data migration. A materialised-projection alternative was rejected because it would create a second thing to keep consistent with the log and would bake historical upcaster bugs into stored state.

Versioned, chained, retained upcasters. Each Event type has a current schema version. An upcaster is a pure function from version N to version N+1 for a given type, registered once and never redefined. Reading a v1 Event when the current version is v3 applies v1-to-v2 then v2-to-v3. Upcasters are permanent code with a permanent test obligation: each is tested against an archived fixture of the historical schema it consumes, so a later refactor cannot silently break the reading of old Events. A breaking change is always a new type version; an existing version is never redefined in place (EVT-044). Readers also tolerate unknown fields, so a forward-compatible reader does not break on a newer Event it partially understands (DOM-012).

Never fabricate absence. When a new schema adds a field that old Events genuinely never had, the upcaster exposes that absence rather than inventing a plausible value. A field with a truthful, universal default may take it; a field whose historical value is simply unknown is surfaced as absent or null, never guessed. This is the no-fakery rule applied to time: an upcast Event must not assert something about the past that was not recorded.

## What remains open

Nothing foreclosing. The registry format and where the historical fixtures are archived are implementation details that can evolve. A cloud backend would keep the same read-time model; only the fixture archive location and the CI wiring that validates every producer and consumer against published schemas (EVT-043) would differ, and that CI validation is a separate follow-up that does not change this decision.

## Consequences

- Replay stays honest over the whole horizon: a decade-old Event is read as its current shape, and nothing about the past is invented.
- Each schema change carries a standing cost, one upcaster and one fixture test, retained forever. This is a budgeted maintenance obligation, not a one-off, and the mechanism makes that cost explicit and enforced.
- Decided before any production Event exists, when it is still free to choose.
