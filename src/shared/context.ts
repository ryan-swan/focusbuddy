// Context Engine model (spec §12 Cognitive Context, §38 Context Entity).
//
// The "brain" of Plexi 4.0. This is the contextual-awareness data model the
// Event Store feeds and the Context Health / decision-alert surfaces read from.
// Its central discipline: any value the system INFERS must be labelled as such
// and carry its confidence and evidence, so inference is never shown as fact
// (PLX-PRD-020/021/022, PLX-CTX-002). Deterministic, no AI in this module.

// A confidence carries both a numeric score (for thresholding) and a display
// band (for surfaces). Kept together so a value can be thresholded and rendered
// without recomputation.
export type ConfidenceLevel = 'low' | 'medium' | 'high'
export interface ConfidenceBand {
  score: number // 0..1
  level: ConfidenceLevel
}

// Below this, inferred context must not be shown as an assertion (PLX-PRD-022).
export const PLATFORM_CONFIDENCE_THRESHOLD = 0.6

export function bandFor(score: number): ConfidenceLevel {
  if (score < 0.4) return 'low'
  if (score < 0.75) return 'medium'
  return 'high'
}
export function confidence(score: number): ConfidenceBand {
  const s = Math.max(0, Math.min(1, score))
  return { score: s, level: bandFor(s) }
}

// How a context value was acquired (PLX-PRD-020).
export type AcquisitionMethod = 'declared' | 'inferred' | 'absent'

export interface EvidenceRef {
  eventId?: string
  objectId?: string
  note?: string
}

// A single context value with its provenance (§38 CognitiveField, PLX-CTX-002).
export interface CognitiveField {
  value: string
  source: AcquisitionMethod
  confidence: ConfidenceBand | null // REQUIRED when inferred
  evidence: EvidenceRef[] // REQUIRED (non-empty) when inferred
}

/** A user-stated value. Declared context is authoritative and needs no evidence. */
export function declaredField(value: string): CognitiveField {
  return { value, source: 'declared', confidence: null, evidence: [] }
}

/**
 * A model-derived value. Inference MUST carry confidence and evidence
 * (PLX-CTX-002, PLX-PRD-021); this throws otherwise so an unfounded inference
 * can never be constructed.
 */
export function inferredField(value: string, conf: ConfidenceBand, evidence: EvidenceRef[]): CognitiveField {
  if (!conf) throw new Error('Inferred context MUST carry a confidence (PLX-PRD-021).')
  if (!evidence || evidence.length === 0) throw new Error('Inferred context MUST carry evidence (PLX-CTX-002).')
  return { value, source: 'inferred', confidence: conf, evidence }
}

/** The absence of a value, stated honestly rather than guessed (PLX-PRD-020). */
export function absentField(): CognitiveField {
  return { value: '', source: 'absent', confidence: null, evidence: [] }
}

/**
 * Whether a field may be shown as an assertion. Declared values always may;
 * inferred values may only at or above the platform confidence threshold;
 * below it, callers must offer it as a question instead (PLX-PRD-022).
 */
export function isDisplayableAsAssertion(f: CognitiveField, threshold = PLATFORM_CONFIDENCE_THRESHOLD): boolean {
  if (f.source === 'declared') return true
  if (f.source === 'absent') return false
  return !!f.confidence && f.confidence.score >= threshold
}

// ── Context Object (§38) ──────────────────────────────────────────────────────
export type RiskLevel = 'none' | 'low' | 'medium' | 'high'

export interface Objective {
  statement: string
  setBy: string
  setAt: string
  source: AcquisitionMethod
  confidence: ConfidenceBand | null
}

export interface AttentionItem {
  kind: 'decision-risk' | 'blocked' | 'stale-context' | 'dependency-changed' | 'review-needed'
  subjectId: string // object/desk/decision id
  summary: string
  risk: RiskLevel
  evidence: EvidenceRef[]
  raisedAt: string
}

export interface Recommendation {
  action: string
  rationale: string
  evidence: EvidenceRef[] // a recommendation without evidence must not be shown (PLX-UX-060)
  confidence: ConfidenceBand | null
}

// A per-Desk snapshot of contextual awareness. Versioned and retained
// (PLX-CTX-001); persistence of the version history is a following increment.
export interface ContextObject {
  id: string
  version: number
  deskId: string
  organisationId: string
  currentGoal: Objective | null
  currentQuestion: CognitiveField | null
  recentDecisionIds: string[]
  pendingWorkIds: string[]
  dependencyIds: string[]
  attentionItems: AttentionItem[]
  riskLevel: RiskLevel
  suggestedNextAction: Recommendation | null
  confidence: ConfidenceBand | null
  generatedAt: string
  reviewedAt: string | null
  reviewedBy: string | null
}
