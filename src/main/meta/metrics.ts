// Success metrics, computed from structured data (spec §8, REQ-MET). These are the
// metric DEFINITIONS as pure functions over data the platform already holds —
// Decision timestamps, the graph, the Event log — so the computation is correct by
// test. Live sampling/instrumentation and cost (MET-001/002/007/011/012) are
// deployment concerns and are not claimed here. Two governance rules also live
// here: primary metrics outrank secondary ones (MET-020), and engagement-maximising
// metrics are never adopted as success metrics (MET-021).

// ── MET-003 — catch-up estimate calibration ──────────────────────────────────
// Absolute error between the estimated catch-up time and the observed
// reconstruction time (both in minutes).
export function catchupCalibrationError(estimatedMin: number, observedMin: number): number {
  return Math.abs(estimatedMin - observedMin)
}

// ── MET-004 — duplicate work detected ────────────────────────────────────────
export function duplicatesConfirmed(relationships: Array<{ relationshipType: string; state: string }>): number {
  return relationships.filter((r) => r.relationshipType === 'Duplicates' && r.state === 'confirmed').length
}

// ── MET-005 — decision latency ───────────────────────────────────────────────
// Elapsed time from a Decision entering `proposed` to its terminal state.
export function decisionLatencyMs(proposedAtIso: string, terminalAtIso: string): number {
  return Math.max(0, Date.parse(terminalAtIso) - Date.parse(proposedAtIso))
}

// ── MET-006 — attention precision ────────────────────────────────────────────
// Proportion of Attention Required / Decision Risk transitions the user ACTS on
// rather than dismisses. Undefined (null) when there were no such transitions.
export interface AttentionOutcome {
  state: 'attention-required' | 'decision-risk' | string
  outcome: 'acted' | 'dismissed'
}
export function attentionPrecision(transitions: AttentionOutcome[]): number | null {
  const relevant = transitions.filter((t) => t.state === 'attention-required' || t.state === 'decision-risk')
  if (relevant.length === 0) return null
  return relevant.filter((t) => t.outcome === 'acted').length / relevant.length
}

// ── MET-008 — knowledge reuse ────────────────────────────────────────────────
// Proportion of new Objects that reference at least one pre-existing Object/Decision.
export function knowledgeReuse(newObjects: Array<{ referencesExisting: boolean }>): number | null {
  if (newObjects.length === 0) return null
  return newObjects.filter((o) => o.referencesExisting).length / newObjects.length
}

// ── MET-009 — onboarding time to first contribution ──────────────────────────
export function daysToFirstContribution(userCreatedIso: string, firstAuthoredIso: string): number {
  return Math.max(0, (Date.parse(firstAuthoredIso) - Date.parse(userCreatedIso)) / 86_400_000)
}

// ── MET-010 — AI recommendation trust (materiality-weighted) ─────────────────
export interface AiRecOutcome {
  accepted: boolean
  materiality: number
}
export function aiRecommendationTrust(recs: AiRecOutcome[]): number | null {
  const totalWeight = recs.reduce((s, r) => s + r.materiality, 0)
  if (totalWeight === 0) return null
  return recs.reduce((s, r) => s + (r.accepted ? r.materiality : 0), 0) / totalWeight
}

// ── MET-013 — attention precision is a release gate ──────────────────────────
// A release that reduces attention precision by more than the allowed drop is
// blocked (MET-013). Default allowed regression is zero beyond a small tolerance.
export function attentionPrecisionRegressionBlocked(previous: number, next: number, maxDrop = 0.02): boolean {
  return next < previous - maxDrop
}

// ── MET-020 / MET-021 — metric governance ────────────────────────────────────
export type MetricTier = 'primary' | 'secondary'
// Primary metrics take precedence: a change that helps a secondary metric but harms
// a primary one is not justified by the secondary gain (MET-020).
export function changeJustified(delta: { tier: MetricTier; improves: boolean }[]): boolean {
  const harmsPrimary = delta.some((d) => d.tier === 'primary' && !d.improves)
  return !harmsPrimary
}
// Engagement-maximising metrics are never success metrics (MET-021).
const BANNED_SUCCESS_METRICS = new Set(['time-in-product', 'session-length', 'daily-active-minutes', 'engagement-time'])
export function isBannedSuccessMetric(name: string): boolean {
  return BANNED_SUCCESS_METRICS.has(name)
}
export function assertSuccessMetricAllowed(name: string): void {
  if (isBannedSuccessMetric(name)) {
    throw new Error(`"${name}" is an engagement-maximising metric and MUST NOT be a success metric (PLX-MET-021).`)
  }
}
