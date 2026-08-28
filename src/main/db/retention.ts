// DEC-056 — the retention sweep, and the caller that makes caps real.
//
// Every prune function in this codebase was written and then never called.
// `pruneActivity()` (activity.ts, nominal cap 5,000), `pruneHistory()`
// (browsing.ts, nominal cap 500) and `pruneOutbox()` (eventStore.ts) all had
// zero call sites outside their own definitions, so the tables they claim to
// bound grew without limit. On the operator's machine that produced an
// `event_outbox` of 764,373 rows / 89.4 MB including its index, and an
// `activity_log` of 52,208 rows against its own declared 5,000. A cap that
// nothing invokes is a comment, not a cap.
//
// ── What this sweep MUST NOT touch ──────────────────────────────────────────
// Events are not prunable and cannot be made prunable. Four independent
// mechanisms say so, and they agree deliberately:
//
//   1. PLX-EVT-030 — the Event Store MUST be immutable and append-only; "no
//      interface, including administrative and database-level access" may
//      delete a written Event. A pruneEvents() would BE that interface.
//   2. PLX-EVT-031 — replay MUST reconstruct the state of any Desk at any
//      point in its history. Deleting old Events deletes old history.
//   3. `events_no_delete` — a BEFORE DELETE trigger that RAISE(ABORT)s, so the
//      database refuses even if application code asks.
//   4. PLX-DATA-012 / INV-05 / DOM-043 — `assertRetentionTarget()` holds
//      'events' in PROTECTED_TARGETS and throws by construction.
//
// So every target below is routed through `assertRetentionTarget()` before a
// single row is deleted. That is not ceremony: it means a future edit that
// adds a protected target to this list fails loudly instead of quietly
// deleting history the spec promises is replayable.
//
// `event_outbox` is a different kind of thing and that is why it qualifies. It
// is delivery bookkeeping — one row per Event still awaiting publication to
// the bus — and it carries no history of its own. The Event each row points at
// stays in `events`, fully replayable, whether or not the pointer survives.
// Capping the queue therefore destroys nothing any requirement protects. It
// needs a cap precisely because it gains a row per Event and only sheds one
// when a publisher drains it; with no bus attached, nothing ever drains it.

import { assertRetentionTarget } from '../privacy/erasure'
import { getContextEngine, emitObjectEvent } from '../context/engine'

export interface RetentionOutcome {
  target: string
  removed: number
  kept: number
}

// The queue depth to retain. Deep enough that a bus attaching later still finds
// a useful recent backlog to publish; shallow enough that the table stays flat.
export const OUTBOX_KEEP = 5_000

// Sweep the transactional outbox down to its cap.
//
// Note on the audit record: this deliberately does NOT reuse
// `applyRetentionPolicyEvent()` from context/workspaceMemory. That helper's
// `RetentionPolicy` is age-based (`maxAgeDays`), and this cap is count-based —
// calling it would require inventing a maxAgeDays that was never applied,
// which would put a false number in an auditable record. The guard that
// actually matters (`assertRetentionTarget`) is invoked directly instead, and
// the emitted Event describes what genuinely happened.
export function sweepOutbox(keep = OUTBOX_KEEP): RetentionOutcome {
  const target = 'event_outbox'
  assertRetentionTarget(target) // throws for 'events' — see the header

  const engine = getContextEngine()
  const removed = engine.events.pruneOutbox(keep)
  const kept = (engine.db.prepare('SELECT COUNT(*) AS n FROM event_outbox').get() as { n: number }).n

  // Applying retention is itself an auditable act (PLX-PRD-034 / PLX-DATA-010).
  // Emit only when rows actually moved, so a steady-state boot stays silent
  // rather than writing an unprunable Event to say it did nothing.
  if (removed > 0) {
    emitObjectEvent({
      eventType: 'RetentionPolicyApplied',
      category: 'administrative',
      currentState: { target, policy: 'keep-newest', keep, removed, kept },
      changeSummary: `Retention applied to ${target}: ${removed} queued rows released, ${kept} retained`
    })
  }

  return { target, removed, kept }
}

// Run every bounded-table sweep. Non-fatal by contract: retention is
// housekeeping and must never be able to take the app down with it.
export function runRetentionSweep(): RetentionOutcome[] {
  const outcomes: RetentionOutcome[] = []
  try {
    outcomes.push(sweepOutbox())
  } catch (err) {
    console.warn('[retention] outbox sweep failed (non-fatal):', (err as Error).message)
  }
  return outcomes
}
