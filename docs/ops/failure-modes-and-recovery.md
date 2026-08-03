# Failure modes and recovery

This document satisfies PLX-ARC-021: every service records its failure modes and
recovery procedures before production deployment (spec §73). It covers the
services that make up the local-first product and its sync surface. The scope is
the topology decided in ADR-0005 (local-first Electron plus a sync/signal relay),
so it does not cover a hosted multi-tenant cloud, which is deferred.

Each service below lists how it can fail, what the user or operator observes, and
how it recovers. The guiding rule is the one the architecture already enforces:
no AI on the critical path (ARC-022), so an AI outage degrades a feature rather
than breaking it.

## Event Store

The append-only event log is the source of record, with a transactional outbox so
a state mutation and its event commit land atomically.

Failure modes. A write can fail if the local database is locked, the disk is full,
or the process is killed mid-transaction. A corrupted database file would make
reads fail on open.

Recovery. Writes are transactional, so a killed process leaves either the whole
mutation-plus-event or neither, never a half state; the outbox re-drives any event
that committed without its downstream projection. A disk-full or lock error
surfaces as an honest error to the caller rather than a silent drop. Because every
derived store (the graph, context health) is a projection, it is rebuildable from
the log, so a corrupted projection is repaired by replay rather than by guesswork.

## Workspace sync (cross-member, near-live)

Pushes and pulls each account's and org's changes through the signal relay, ordered
parent-before-child, tracked by a per-account and per-org cursor.

Failure modes. The relay can be unreachable, a push can partially apply, or two
members can edit the same object and produce a conflict. A silent auth failure on
deploy is a known operational trap.

Recovery. Sync is cursor-driven and idempotent, so an interrupted or repeated push
re-applies safely from the last acknowledged cursor without duplicating rows. The
client stays fully usable offline because it is local-first; changes queue and
flush when the relay returns. Conflicts resolve by the recorded ordering and
last-writer rules, and per-user view state (camera, selection, personal layout)
never enters the sync pipeline, so it cannot conflict at all. A deploy is verified
against a fresh health check with a rising uptime, never assumed from an exit code.

## AI orchestrator and model seam

All model calls route through a single seam (AI-001) with capability-aware routing,
permission-scoped prompts, digest caches, invocation accounting and cost ceilings.

Failure modes. The provider can be unavailable, rate-limited, slow, or the API key
can be missing, invalid or exhausted against its ceiling. A response can be
truncated by a stop reason or fail to parse.

Recovery. Every AI-backed operation has a deterministic fallback that meets the
non-AI path (PERF-072), so an outage, a missing key or a ceiling breach degrades to
the deterministic result rather than blocking the user. Repeated identical requests
are served from the digest cache. A truncated or unparseable response is treated as
a failure and degrades the same way. The key lives in the OS keychain, never in
config, logs, event payloads or prompts.

## Desk layout overlay

Persists per-(user, device class) camera, selection and, when opted in, object
position and size, restored on desk open.

Failure modes. The layout read can fail or return nothing, and a reentrant open of
the same desk can race a stale restore.

Recovery. A missing or failed read degrades to the reset origin, so the desk always
opens; the store is marked hydrated so saves can still begin. A per-call token makes
the newest desk open supersede any in-flight stale restore. Because per-user
geometry is applied over a freshly loaded base and eligibility is re-derived live, a
stale overlay row for an object that has since changed is inert rather than wrong.

## Resume engine

Produces the deterministic catch-up of what changed since a user was last present,
optionally summarised live by AI.

Failure modes. Insufficient signal to summarise, or an AI summary failure.

Recovery. With insufficient signal the engine says so plainly rather than
inventing. The AI summary is optional and cached; on failure it falls back to the
deterministic resume (RES-013, ARC-022), which is source-traceable to its events.

## Context engine and health propagation

Scores materiality deterministically and propagates context health across the
relationship graph.

Failure modes. A propagation cycle, or an unbounded fan-out on a dense graph.

Recovery. Propagation is bounded, cycle-safe and incremental, and truncation is
made visible rather than hidden, so a dense graph degrades to a bounded, honest
result instead of hanging. All transitions are auditable, and the whole graph is a
rebuildable projection of the event log.

## Presence and signal relay

Carries live presence and the sync/relay transport on the Fly signal service.

Failure modes. The socket can drop, the service can restart, or a deploy can
silently fail to take effect.

Recovery. Presence is soft state that re-establishes on reconnect; its loss never
affects local work. A deploy is treated as done only when a fresh health check
reports a rising uptime, which is the guard against the silent-auth-failure trap.
