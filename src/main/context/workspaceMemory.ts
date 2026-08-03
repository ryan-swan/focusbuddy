// Workspace Memory (spec §13, §66, REQ-PRD). Capture is automatic — there is
// deliberately no "save context" action to forget (PRD-030). Sessions snapshot on
// exit, on timeout, and at least every 60 seconds of active work (PRD-031).
// Compression is non-destructive: it produces a derived summary that references the
// underlying Events and is always expandable back to them (PRD-032/033). Memory
// layers carry configurable retention that emits an auditable Event and can never
// prune Events or Decision alternatives (PRD-034 / DATA-010/012).

import type { AppendInput } from '../db/eventStore'
import { assertRetentionTarget } from '../privacy/erasure'

// ── Automatic capture (PRD-030) ──────────────────────────────────────────────
// Capture is a property of the platform, not a user action. This module exposes no
// save() by design; the detection test asserts that absence holds.
export const CAPTURE_MODE = 'automatic' as const

// ── Session snapshots (PRD-031) ──────────────────────────────────────────────
export const SNAPSHOT_INTERVAL_MS = 60_000 // at most 60s during active work
export type SnapshotReason = 'desk-exit' | 'session-timeout' | 'interval'

// Whether a snapshot must be written now. Exit and timeout always snapshot; during
// active work, a snapshot is due once the interval has elapsed.
export function shouldSnapshot(reason: SnapshotReason, elapsedSinceLastMs = 0): boolean {
  if (reason === 'desk-exit' || reason === 'session-timeout') return true
  return elapsedSinceLastMs >= SNAPSHOT_INTERVAL_MS
}

// ── Non-destructive compression (PRD-032/033) ────────────────────────────────
export interface CompressedSummary {
  text: string
  sourceEventIds: string[] // the Events this summary derives from — never deleted
  derived: true
}

// Compress a set of Events into a derived summary. The Events are not passed by
// mutation and are never altered here; the summary only references them (PRD-032).
export function compress(eventIds: string[], text: string): CompressedSummary {
  if (eventIds.length === 0) throw new Error('A compressed summary MUST reference the Events it derives from (PLX-PRD-032).')
  return { text, sourceEventIds: [...eventIds], derived: true }
}

// A compressed summary is always expandable back to its underlying Event set on
// request (PRD-033).
export function expand(summary: CompressedSummary): string[] {
  return [...summary.sourceEventIds]
}

// ── Retention policy (PRD-034 / DATA-010) ────────────────────────────────────
export interface RetentionPolicy {
  layer: string // e.g. 'working', 'episodic', 'semantic'
  target: string // what the policy prunes
  maxAgeDays: number
}

// Applying a retention policy emits an auditable Event (PRD-034 / DATA-010) and
// refuses protected targets — Events and Decision alternatives are never prunable
// (DATA-012).
export function applyRetentionPolicyEvent(organisationId: string, actor: string, policy: RetentionPolicy): AppendInput {
  assertRetentionTarget(policy.target) // throws for 'events' / 'alternatives' (DATA-012)
  return {
    eventType: 'RetentionPolicyApplied',
    category: 'administrative',
    actor,
    organisationId,
    currentState: { layer: policy.layer, target: policy.target, maxAgeDays: policy.maxAgeDays },
    changeSummary: `Retention policy applied to ${policy.layer}/${policy.target}`
  }
}

// ── Embedding policy (PRD-014) ───────────────────────────────────────────────
// Every Object is either semantically indexed or explicitly excluded WITH the
// exclusion recorded — never silently skipped.
export type EmbeddingStatus = { indexed: true } | { indexed: false; exclusionReason: string }
export function embeddingStatus(indexed: boolean, exclusionReason?: string): EmbeddingStatus {
  if (indexed) return { indexed: true }
  if (!exclusionReason) throw new Error('An Object excluded from semantic indexing MUST record the exclusion (PLX-PRD-014).')
  return { indexed: false, exclusionReason }
}

// ── Optional intent declaration (PRD-023) ────────────────────────────────────
export interface DeclaredIntent {
  currentQuestion: string | null
  expectedNextAction: string | null
}
// Declaring intent is a low-friction affordance and is never required (PRD-023).
export const INTENT_REQUIRED = false
export function declareIntent(currentQuestion?: string, expectedNextAction?: string): DeclaredIntent {
  return { currentQuestion: currentQuestion ?? null, expectedNextAction: expectedNextAction ?? null }
}
