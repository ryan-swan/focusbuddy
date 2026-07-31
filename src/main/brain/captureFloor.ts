// The STORE-ANYWAY FLOOR (plexi-brain P2 — invariant I3: nothing is ever dropped).
//
// Every incoming capture utterance is filed to activity_log as a 'captured' row —
// BEFORE any typing, entity-resolution, or node-birth is attempted, and REGARDLESS of
// whether a node is ever born. This is the guarantee behind "never loses the thread":
//   • a garbled fragment that produces zero proposals is STILL logged + keyword-findable
//   • no-key / no-AI input is STILL logged (capture never blocks on AI)
//   • the row id this returns is what a born node's provenance edge walks back to
//     ("what I said") — so provenance is grounded in the real utterance, not a guess.
//
// This writes to the SAME activity_log the base app already uses (recordActivity) —
// additive, no schema change, no new table. The 'captured' kind was appended to
// ActivityKind (never repurposing an existing kind).
//
// DEC-012: unlike the graph write (commitCapture, gated on isBrainEnabled), the floor
// is DELIBERATELY NOT brain-gated for FINDABILITY — an utterance being searchable is
// base-app behavior, not brain behavior. But we only file it from the brain capture
// path, which only runs when the brain feature is engaged; when brain is OFF the app's
// normal capture (voiceCommand → applyProposal) runs unchanged and never calls here.
// So: no base-app view changes (the OFF→ON→OFF lock holds), and the floor is honest.
//
// No AI here — filing text is a local DB write. The confidence STAMP (from the pure
// classifier) is computed by the caller and stored on the node; the raw utterance
// itself is stored verbatim so it's always recoverable exactly as said.

import { randomUUID } from 'crypto'
import { getDb } from '../db/database'
import { getActiveOrgId } from '../db/activeOrg'
import type { Confidence } from '@shared/brainGraph'

export interface UtteranceRecord {
  activityId: string // the activity_log row id — a provenance edge walks back to this
}

// File a raw capture utterance to activity_log and return its row id. Never throws on
// empty/garbled text — the whole point is that even unusable input is preserved. The
// stamped confidence + which proposal ids (if any) it fanned out to are kept in the
// payload so the log row is self-describing (and the store-anyway floor is auditable:
// "here is exactly what was said, how sure we were, and what it became").
export function recordCaptureUtterance(opts: {
  text: string
  taskId?: string | null
  confidence?: Confidence
  proposalIds?: string[]
}): UtteranceRecord {
  const db = getDb()
  const id = randomUUID()
  const payload = {
    text: opts.text ?? '',
    // Present so a later reader knows how the floor stamped this utterance without
    // re-running the classifier; absent when the caller hasn't classified yet.
    ...(opts.confidence ? { confidence: opts.confidence } : {}),
    ...(opts.proposalIds && opts.proposalIds.length ? { proposalIds: opts.proposalIds } : {})
  }
  db.prepare(
    `INSERT INTO activity_log (id, task_id, ts, kind, payload, org_id) VALUES (@id, @taskId, @ts, @kind, @payload, @orgId)`
  ).run({
    id,
    taskId: opts.taskId ?? null,
    ts: Date.now(),
    kind: 'captured',
    payload: JSON.stringify(payload),
    orgId: getActiveOrgId()
  })
  return { activityId: id }
}
