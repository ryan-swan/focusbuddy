// Replay helpers (spec §48, §64; PLX-EVT-024/031/033). Two properties matter when
// reading the log back. Replay evaluates access against the permission snapshot
// each Event carried at emission, never against today's permissions (EVT-033), so
// history is read as it was, not as it is now. And consumers order by sequence
// WITHIN a partition and never assume a global total order across partitions
// (EVT-024), because partitions advance independently.

import { partitionKey, type PlexiEvent } from '../../shared/events'
import { satisfiesScope, type Principal } from '../../shared/permission'

// Filter a replayed Event stream to those the principal was permitted to see AT
// THE TIME, using the permission snapshot carried on each Event (EVT-033 / EVT-012).
// Changing current permissions cannot retroactively reveal or hide history.
export function replayVisibleTo(events: PlexiEvent[], principal: Principal, now = Date.now()): PlexiEvent[] {
  return events.filter((e) => e.organisationId === principal.organisationId && satisfiesScope(principal, e.permissions, now))
}

// Group a possibly-out-of-order Event batch into per-partition streams, each
// ordered by its own monotonic sequence (EVT-024). The input order is irrelevant;
// correctness comes from `sequence` within `partitionKey`, never from arrival
// order or wall-clock time (EVT-013).
export function orderedWithinPartitions(events: PlexiEvent[]): Map<string, PlexiEvent[]> {
  const byPartition = new Map<string, PlexiEvent[]>()
  for (const e of events) {
    const pk = partitionKey(e)
    const arr = byPartition.get(pk) ?? []
    arr.push(e)
    byPartition.set(pk, arr)
  }
  for (const [, arr] of byPartition) arr.sort((a, b) => a.sequence - b.sequence)
  return byPartition
}

// A minimal idempotent projection fold (EVT-015/024): applies each Event at most
// once (dedup by id), in per-partition sequence order, tolerant of duplicate and
// out-of-order delivery. `apply` builds derived state; it never sees an Event twice.
export function foldIdempotent<S>(events: PlexiEvent[], initial: S, apply: (state: S, e: PlexiEvent) => S): S {
  const seen = new Set<string>()
  let state = initial
  for (const [, stream] of orderedWithinPartitions(events)) {
    for (const e of stream) {
      if (seen.has(e.id)) continue // at-least-once tolerated without double-apply
      seen.add(e.id)
      state = apply(state, e)
    }
  }
  return state
}
