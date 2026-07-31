// THE LIVE-INGEST POLICY (plexi-brain I2b — the live ingest loop). PURE: no DB, no I/O,
// no Electron, no timers. The rules that decide WHEN a write becomes a reindex live here
// on their own so they are unit-testable in isolation and cannot drift into the driver
// that applies them — the same separation `indexReconcile.ts` gives the delete path and
// `orchestrate.ts` gives the connector registry.
//
// ── The defect this closes (D10) ─────────────────────────────────────────────────
// The only caller of buildIndex() was a button in Settings. Editing a sticky, writing a
// doc, or adding a task reached the brain ONLY when a human clicked Rebuild. The product
// claim is "real-time accurate information"; the honest pre-I2b statement was "accurate
// as of the last time someone opened Settings and clicked". The expensive machinery was
// already in place — indexer.ts has content-hash INCREMENTAL re-indexing, measured at
// ~100ms for a one-source change on the real 379-chunk corpus against ~12s for a forced
// full rebuild. What was missing was purely the TRIGGER.
//
// ── Why a policy and not just `setTimeout(reindex, 0)` ───────────────────────────
// A write is not an edit. One user typing one sentence into a sticky produces a burst of
// row writes; a paste, an import, a template instantiation or a workspace sync produce
// hundreds across many sources. Reindexing per write would re-embed the same source
// dozens of times a minute and turn a bulk import into a thundering herd. So writes are
// COALESCED BY SOURCE IDENTITY into a dirty set, and the set is drained on two rules:
//
//   QUIET   — the burst stopped (no write for `quietMs`). The common case: you stop
//             typing, and a second and a half later the brain knows.
//   CEILING — the burst has been going for `maxWaitMs`. Without this, someone typing
//             continuously for ten minutes would never see their work indexed, because
//             the quiet window would never open. A bounded worst case is what makes
//             "within seconds" a guarantee rather than a hope.
//
// ── Why the graph passes have their own, slower clock (F-12) ─────────────────────
// buildIndex runs five FULL-CORPUS graph passes after chunking (projection, importance,
// entity extraction, cross-room same-as, contradictions). Those are what make a rebuild
// cost more than the chunk write itself, and they are global by nature — a single new
// edge can change many nodes' derived importance, so there is no honest "just this one
// source" version of them.
//
// They are also NOT required for findability. `spineRerank.ts` is explicit about it: a
// candidate with no projected node gets factor 1.0 and passes every gate but the room
// aperture ("No projected node: the store-anyway floor keeps it findable"). So the two
// clocks are safe to separate, and separating them is what makes the fast path fast:
//
//   FAST PATH  (per source, ~ms)  → chunk + embed + FTS. Content is retrievable NOW.
//   IDLE PATH  (whole corpus)     → the five graph passes, once the writing has stopped
//                                   for `graphIdleMs`. Graph quality catches up, and a
//                                   thousand edits still cost ONE graph pass, not a
//                                   thousand.
//
// The user-visible contract is therefore: your text is findable within seconds; its
// place in the graph settles a few seconds later. Never the reverse, because
// findability is the property the product claim is about.

import type { SourceRef } from './indexReconcile'
import { sourceRefKey } from './indexReconcile'

export type { SourceRef } from './indexReconcile'

/** Timing policy. Every value is a deliberate trade-off, not a default. */
export interface LiveIngestPolicy {
  /** Quiet window after the last write before a burst is considered finished.
   *  Long enough to swallow a typing burst, short enough that "within seconds" holds. */
  readonly quietMs: number
  /** Hard ceiling on how long a source may sit dirty while writes keep arriving.
   *  Bounds the worst case for continuous typing. */
  readonly maxWaitMs: number
  /** How many sources one flush may take. A bulk import marks hundreds at once; draining
   *  them in bounded batches keeps any single pass short and lets the queue stay
   *  responsive to a fresh edit instead of disappearing into a ten-minute reindex. */
  readonly maxBatch: number
  /** How long the queue must stay EMPTY before the whole-corpus graph passes run. */
  readonly graphIdleMs: number
}

// Measured against the real corpus (see 05-ARCHITECTURE/I2b-LIVE-INGEST.md):
// a one-source incremental reindex costs ~100ms, so the latency the user perceives is
// dominated entirely by `quietMs`, not by the work.
export const DEFAULT_POLICY: LiveIngestPolicy = {
  quietMs: 1_500,
  maxWaitMs: 8_000,
  maxBatch: 200,
  graphIdleMs: 15_000
}

/** The coalescing queue's state. Owned by the driver; mutated only through this module. */
export interface LiveIngestState {
  /** Dirty sources, coalesced by identity — ten edits to one sticky are one entry. */
  readonly dirty: Map<string, SourceRef>
  /** When the OLDEST currently-dirty source was first marked (drives the CEILING rule). */
  firstMarkAt: number | null
  /** When the most recent write arrived (drives the QUIET rule). */
  lastMarkAt: number | null
  /** When the queue last became empty — the clock the idle graph pass runs on. */
  emptySince: number | null
  /** True once a flush has written chunks that the graph passes have not yet seen. */
  graphDirty: boolean
}

export function createState(nowMs: number): LiveIngestState {
  return { dirty: new Map(), firstMarkAt: null, lastMarkAt: null, emptySince: nowMs, graphDirty: false }
}

/**
 * Record that a source changed. Idempotent per identity: marking the same source ten
 * times in a burst leaves ONE entry, and does not extend the CEILING — `firstMarkAt`
 * tracks the oldest unflushed source, so a continuously-edited sticky still lands on
 * schedule rather than being starved by its own edits.
 */
export function markDirty(state: LiveIngestState, ref: SourceRef, nowMs: number): void {
  const key = sourceRefKey(ref)
  if (!state.dirty.has(key)) state.dirty.set(key, { sourceType: ref.sourceType, sourceId: ref.sourceId })
  if (state.firstMarkAt === null) state.firstMarkAt = nowMs
  state.lastMarkAt = nowMs
  state.emptySince = null
}

export type FlushReason = 'quiet' | 'ceiling' | 'drain'

/**
 * Should the dirty set be drained now, and why?
 *
 * `null` = not yet. `'quiet'` = the burst ended. `'ceiling'` = the burst is still going
 * but has exceeded the latency bound. `'drain'` = a previous flush hit `maxBatch` and
 * left work behind, so the remainder goes immediately rather than waiting for a quiet
 * window that may never come.
 */
export function flushDecision(
  state: LiveIngestState,
  nowMs: number,
  policy: LiveIngestPolicy = DEFAULT_POLICY
): FlushReason | null {
  if (state.dirty.size === 0) return null
  if (state.lastMarkAt === null || state.firstMarkAt === null) return null
  if (nowMs - state.firstMarkAt >= policy.maxWaitMs) return 'ceiling'
  if (nowMs - state.lastMarkAt >= policy.quietMs) return 'quiet'
  return null
}

export interface Batch {
  /** The sources to reindex now, in deterministic order. */
  readonly refs: SourceRef[]
  /** True when `maxBatch` cut the batch short and more dirty sources remain. */
  readonly more: boolean
}

/**
 * Take up to `maxBatch` dirty sources, removing them from the queue.
 *
 * Deterministic order (by identity) so a flush, its log line and its test expectation
 * are stable run to run — the same reason `indexReconcile` sorts its plan.
 *
 * The CEILING clock is re-based to `nowMs` when work remains, so the leftovers are not
 * instantly "overdue" from the previous burst's clock.
 */
export function takeBatch(
  state: LiveIngestState,
  nowMs: number,
  policy: LiveIngestPolicy = DEFAULT_POLICY
): Batch {
  const all = [...state.dirty.values()].sort((a, b) =>
    a.sourceType === b.sourceType
      ? a.sourceId < b.sourceId
        ? -1
        : a.sourceId > b.sourceId
          ? 1
          : 0
      : a.sourceType < b.sourceType
        ? -1
        : 1
  )
  const refs = all.slice(0, Math.max(1, policy.maxBatch))
  for (const r of refs) state.dirty.delete(sourceRefKey(r))
  const more = state.dirty.size > 0
  if (refs.length > 0) state.graphDirty = true
  if (more) {
    state.firstMarkAt = nowMs
  } else {
    state.firstMarkAt = null
    state.lastMarkAt = null
    state.emptySince = nowMs
  }
  return { refs, more }
}

/**
 * Should the whole-corpus graph passes run now?
 *
 * Only when (a) a flush has written something the graph has not seen, (b) nothing is
 * waiting to be indexed, and (c) the queue has been empty for `graphIdleMs`. That last
 * condition is what collapses a thousand edits into one graph pass instead of a thousand.
 */
export function graphPassDue(
  state: LiveIngestState,
  nowMs: number,
  policy: LiveIngestPolicy = DEFAULT_POLICY
): boolean {
  if (!state.graphDirty) return false
  if (state.dirty.size > 0) return false
  if (state.emptySince === null) return false
  return nowMs - state.emptySince >= policy.graphIdleMs
}

/** Called after the graph passes complete — the graph has now seen every flushed write. */
export function markGraphClean(state: LiveIngestState): void {
  state.graphDirty = false
}

/**
 * Drop everything without indexing it. Used when the brain is turned OFF mid-burst
 * (DEC-012: brain OFF must be byte-identical to brain-absent, so a queue armed while it
 * was on must never fire after it goes off) and when the active org changes (the queued
 * identities belong to the previous org's corpus).
 */
export function discardAll(state: LiveIngestState, nowMs: number): number {
  const dropped = state.dirty.size
  state.dirty.clear()
  state.firstMarkAt = null
  state.lastMarkAt = null
  state.emptySince = nowMs
  state.graphDirty = false
  return dropped
}
