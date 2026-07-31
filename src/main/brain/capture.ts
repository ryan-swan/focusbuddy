// The capture DRIVER (plexi-brain P2 — capture-as-decomposition). Executes a pure
// CapturePlan (src/shared/capture.ts) against the P1 spine: upserts the born node
// idempotently BY its base-app source row, attaches a walkable provenance edge back
// to the utterance's activity_log row, and appends the change-log row. This is the
// moment a node stops being only PROJECTED from existing tables (P1) and starts being
// BORN from live capture.
//
// ── The convergence guarantee (operator decision, 2026-07-18) ──────────────────
// A captured node SHARES the base-row back-pointer with the projected node: capture
// upserts by (source_table, source_id) = the real base-app row the apply produced
// (e.g. 'nodes' + the new task id). So when the projector later runs over that same
// row, upsertBrainNodeBySource finds the SAME node and updates in place — capture and
// projection CONVERGE on one node, never a duplicate. This is the whole reason the
// driver needs the base row id (from the renderer's resolvedIds map) — see the
// brain:captureApplied IPC (increment 6).
//
// ── The hybrid architecture (operator decision, 2026-07-18) ────────────────────
// Decompose/type/resolve runs main-side (here); the graph WRITE is triggered by an
// apply-confirm signal (brain:captureApplied) AFTER the renderer's applyProposal
// succeeds — so no node is born for a proposal the user dismisses, and the renderer's
// apply path stays byte-identical (the DEC-012 OFF→ON→OFF lock stays clean).
//
// DEC-012: gated on isBrainEnabled() — brain OFF ⇒ this is never called, brain_* stay
// dormant, the base app is untouched. No AI in this driver: the confidence stamp is
// the deterministic classifier (an optional LLM typing pass, DEC-015, is applied in
// the pure core via downgradeOnly and routed through the model router by the caller —
// never here, so the driver stays local + cheap).
//
// ⚠ DEC-014: node type comes from structure (the pure kind→type map, grep-locked in
// capture.test.ts) — never a domain inference. This driver imports no domain vocab.

import { isBrainEnabled } from '../brainPref'
import { upsertBrainNodeBySource, appendChangeLog, createBrainNode, listBrainNodes } from '../db/brainNodes'
import { ensureProvenance, ensureNodeEdge } from '../db/brainEdges'
import { emitAutomationEvent } from '../db/automationEvents'
import { decomposeProposal, type CapturableProposal } from '@shared/capture'
import { extractPersonName, resolvePersonWithinScope, type PersonCandidate } from '@shared/entityResolve'
import type { Confidence } from '@shared/brainGraph'

// What the driver needs to commit a capture: the proposal, the utterance text (for
// the confidence stamp), the REAL base-app row the apply created (so the brain node
// converges with projection), and the utterance's activity_log row id (for provenance).
export interface CaptureCommit {
  proposal: CapturableProposal
  utteranceText: string
  // The real base-app row id the apply produced (from the renderer's resolvedIds).
  // Together with the kind's source table this is the convergence back-pointer.
  sourceRowId: string
  // The activity_log row id where the raw utterance was filed (store-anyway floor,
  // increment 3). The provenance edge walks back to this — "what I said".
  utteranceActivityId: string
  // An optional LLM-proposed confidence (DEC-015 typing pass, routed through the model
  // router by the caller). downgradeOnly() in the pure core ensures it can only lower
  // the stamp, never raise it. Absent (no key / skipped) ⇒ classifier stamp stands.
  llmProposedConfidence?: Confidence
  // The room the captured node lives in (the aperture). Null ⇒ org-visible.
  roomId?: string | null
  // When the captured thing is dated (schedule-event), the real occurs-at ms.
  occursAt?: number | null
}

export interface CaptureResult {
  committed: boolean // false ⇒ brain OFF or the kind produces no node (utterance still filed)
  nodeId?: string
  nodeType?: string
  confidence?: Confidence
  why?: string
  // Entity resolution outcome (increment 5): if the utterance named a person, whether
  // we linked to an existing person node or minted a new one (safe-asymmetry).
  person?: { nodeId: string; action: 'link' | 'mint'; name: string }
}

// Resolve a person named in the utterance against the people already in SCOPE (same
// room, else org-visible), then draw a task--involves-->person edge. Safe-asymmetry
// (DEC-011 §D): link only on a confident exact-name match; otherwise MINT a new person
// node (a duplicate is harmless; a wrong merge silently corrupts). Cross-room `same-as`
// unification is P3 — here we resolve WITHIN scope only. Returns the person outcome, or
// null if the utterance named no clear person (then no person edge — the task still
// stands; nothing is forced).
function resolveAndLinkPerson(
  utteranceText: string,
  taskNodeId: string,
  roomId: string | null,
  personConfidence: Confidence
): { nodeId: string; action: 'link' | 'mint'; name: string } | null {
  const rawName = extractPersonName(utteranceText)
  if (!rawName) return null

  // Candidate people IN SCOPE: same room if the capture is room-scoped, plus
  // org-visible (null-room) people. Never reach across rooms — that's P3's job.
  const candidates: PersonCandidate[] = listBrainNodes()
    .filter((n) => n.type === 'person')
    .filter((n) => n.roomId === roomId || n.roomId === null)
    .map((n) => ({ nodeId: n.id, name: n.title }))

  const resolved = resolvePersonWithinScope(rawName, candidates)

  const personNodeId =
    resolved.action === 'link' && resolved.matchedNodeId
      ? resolved.matchedNodeId
      : createBrainNode({
          type: 'person',
          title: resolved.normalizedName,
          roomId,
          // A person minted from a mention is inferred, not typed — we read a name, we
          // didn't confirm an identity. Honest stamp; the store-anyway floor keeps it.
          confidence: personConfidence
        }).id

  // task --involves--> person (role-qualified edges are P3+; a plain involves here).
  ensureNodeEdge(taskNodeId, personNodeId, 'involves')

  return { nodeId: personNodeId, action: resolved.action, name: resolved.normalizedName }
}

// Commit a single captured proposal to the graph. Idempotent by (source_table,
// source_row_id): re-committing the same apply (or a later projection of the same
// row) yields ONE node. Returns { committed:false } when brain is OFF or the kind
// produces no durable node — the caller still filed the utterance (I3), so nothing
// is lost either way.
export function commitCapture(commit: CaptureCommit): CaptureResult {
  // DEC-012 gate: brain OFF ⇒ never write brain_* rows.
  if (!isBrainEnabled()) return { committed: false }

  const plan = decomposeProposal(commit.proposal, commit.utteranceText, commit.llmProposedConfidence)
  if (!plan) return { committed: false } // ephemeral/navigational/draft-only kind → no node

  // 1. Upsert the born node BY its base-app source row (the convergence back-pointer).
  const node = upsertBrainNodeBySource(plan.sourceTable, commit.sourceRowId, {
    roomId: commit.roomId ?? null,
    type: plan.node.type,
    title: plan.node.title,
    body: plan.node.body,
    confidence: plan.node.confidence,
    occursAt: commit.occursAt ?? plan.node.occursAt
  })

  // 2. Provenance: node --produced--> the utterance's activity_log row (walkable back
  //    to "what I said"). The edge carries the BORN confidence — a hazard-flagged
  //    utterance gets a non-typed provenance edge, honestly. Idempotent.
  ensureProvenance(node.id, { table: plan.provenance.dstSourceTable, id: commit.utteranceActivityId }, plan.node.confidence)

  // 3. Change-log: record the birth (spine part 6 — "what changed / when / by whom").
  //    Only log on FIRST birth: if the upsert updated an existing (already-projected)
  //    node, the node predates this capture and 'created' would be a lie. We detect
  //    first-birth by whether created_at === updated_at on a freshly-made node.
  if (node.createdAt === node.updatedAt) {
    appendChangeLog(node.id, plan.changeLog.field, plan.changeLog.fromVal, plan.changeLog.toVal, plan.changeLog.actor)
  }

  // 4. Entity resolution (increment 5): if the utterance named a person, link the node
  //    to that person (safe-asymmetry — link on a confident match, else mint). Only for
  //    kinds where a person edge is meaningful (a task/event to do WITH someone); a
  //    note/document about no one skips it. WITHIN-SCOPE only (cross-room same-as = P3).
  let person: CaptureResult['person']
  if (node.type === 'project' || node.type === 'task' || node.type === 'event') {
    const linked = resolveAndLinkPerson(commit.utteranceText, node.id, node.roomId, node.confidence)
    if (linked) person = linked
  }

  // 5. Emit the P6 co-working presence seam (DEC-013): the human's attention is on the
  //    node they just captured. NOTHING consumes this until P6 — but emitting it now
  //    exercises the reserved seam so it can't silently drift (the emission test locks
  //    that it fires). No-op today (no dispatcher registered for 'human-focus'); the
  //    suppressDepth guard + try/catch in emitAutomationEvent make this always safe.
  emitAutomationEvent({ name: 'human-focus', brainNodeId: node.id })

  return {
    committed: true,
    nodeId: node.id,
    nodeType: node.type,
    confidence: node.confidence,
    why: plan.why,
    person
  }
}
