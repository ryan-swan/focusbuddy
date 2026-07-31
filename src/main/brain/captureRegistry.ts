// The capture REGISTRY (plexi-brain P2 — the hybrid architecture's memory).
//
// The hybrid (operator decision, 2026-07-18): decomposition/typing/resolution runs
// MAIN-SIDE, but the graph WRITE is triggered by an apply-confirm signal from the
// renderer (brain:captureApplied) AFTER the user confirms a proposal. So main must
// REMEMBER, between "proposals fanned out" and "user clicked Apply", what utterance
// each proposal came from — the renderer only sends back a proposalId + the real base
// row id, never the utterance (which isn't a renderer prop; threading it through two
// ProposalCards copies + their parents is needless surface area / DEC-012 risk).
//
// This registry is that memory: proposalId → { utterance, the store-anyway activity
// row id, roomId }. It is filled when the voice/intent fan-out mints proposals (the
// utterance is in scope there) and drained when the apply-confirm arrives.
//
// ── Store-anyway floor (I3) at fan-out, not apply ──────────────────────────────
// The raw utterance is filed to activity_log (recordCaptureUtterance) the MOMENT it
// fans out — ONCE per command, not per proposal — so it's preserved even if every
// proposal is dismissed (nothing said is ever lost). The registry holds the resulting
// activityId so a born node's provenance edge can walk back to it.
//
// In-memory + bounded: entries are short-lived (fan-out → apply is seconds) and a cap
// evicts the oldest so a user who never applies can't leak memory. Not persisted —
// if the app restarts before apply, the utterance is still on the store-anyway floor
// (activity_log), only the node-birth is skipped (the projector will still pick up the
// base row later — convergence). DEC-012: only reached from the brain capture path.

import { recordCaptureUtterance } from './captureFloor'
import type { CapturableProposal } from '@shared/capture'
import type { Confidence } from '@shared/brainGraph'

interface RegistryEntry {
  utterance: string
  utteranceActivityId: string // the store-anyway floor row this proposal's node cites
  proposal: CapturableProposal
  roomId: string | null
  llmProposedConfidence?: Confidence
  at: number
}

const registry = new Map<string, RegistryEntry>()
const MAX_ENTRIES = 500 // bounded — evict oldest; fan-out→apply is seconds, this is generous

function evictIfNeeded(): void {
  if (registry.size <= MAX_ENTRIES) return
  // Evict the oldest entry (Map preserves insertion order → first key is oldest).
  const oldest = registry.keys().next().value
  if (oldest !== undefined) registry.delete(oldest)
}

// Remember a batch of proposals from ONE command. Files the raw utterance to the
// store-anyway floor ONCE (I3) and links every proposal in the batch to that row, so
// each born node's provenance walks back to the same utterance. Returns the activityId
// (also useful for tests / diagnostics).
export function rememberCapture(opts: {
  utterance: string
  proposals: CapturableProposal[]
  roomId?: string | null
  taskId?: string | null
  llmProposedConfidence?: Confidence
}): { utteranceActivityId: string } {
  // File the utterance ONCE — the floor guarantees it's preserved regardless of what
  // (if anything) the user applies. proposalIds recorded so the log row is self-describing.
  const { activityId } = recordCaptureUtterance({
    text: opts.utterance,
    taskId: opts.taskId ?? null,
    proposalIds: opts.proposals.map((p) => p.id)
  })
  for (const proposal of opts.proposals) {
    registry.set(proposal.id, {
      utterance: opts.utterance,
      utteranceActivityId: activityId,
      proposal,
      roomId: opts.roomId ?? null,
      llmProposedConfidence: opts.llmProposedConfidence,
      at: Date.now()
    })
    evictIfNeeded()
  }
  return { utteranceActivityId: activityId }
}

// Drain the entry for a proposal (get + delete — a capture is confirmed once). Returns
// null if unknown (e.g. the app restarted, or the proposal wasn't from a remembered
// command) — the caller then skips node-birth; the utterance is still on the floor.
export function takeCapture(proposalId: string): RegistryEntry | null {
  const entry = registry.get(proposalId)
  if (!entry) return null
  registry.delete(proposalId)
  return entry
}

// Test/diagnostic: current registry size.
export function registrySize(): number {
  return registry.size
}
