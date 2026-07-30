// Resume Card and presentation-logic contracts (spec §23, §24, §27, REQ-UX). These
// are the data-side rules behind the interface: the complete disclosure path from
// summary down to raw Events (UX-051), materiality-ordered change lists with a
// chronological alternative (UX-013), evidence reachable from every assertion
// (UX-015), a documented confidence methodology that is never raw model self-report
// (UX-063/052), suggested actions that never appear without evidence (UX-014), and a
// hard separation of semantic state from presentation state (UX-090).

// ── Disclosure path (UX-051) ─────────────────────────────────────────────────
export const DISCLOSURE_LEVELS = ['summary', 'details', 'evidence', 'history', 'raw-events'] as const
export type DisclosureLevel = (typeof DISCLOSURE_LEVELS)[number]
export function disclosurePath(): DisclosureLevel[] {
  return [...DISCLOSURE_LEVELS]
}
// The next level down from any level; null at the deepest (raw Events).
export function drillDown(level: DisclosureLevel): DisclosureLevel | null {
  const i = DISCLOSURE_LEVELS.indexOf(level)
  return i >= 0 && i < DISCLOSURE_LEVELS.length - 1 ? DISCLOSURE_LEVELS[i + 1] : null
}

// ── Materiality vs chronological ordering (UX-013) ───────────────────────────
export interface OrderableChange {
  id: string
  materialityScore: number
  at: string
}
// Default order is by materiality, highest first (UX-013).
export function orderByMateriality<T extends OrderableChange>(items: T[]): T[] {
  return [...items].sort((a, b) => b.materialityScore - a.materialityScore)
}
// The chronological alternative MUST also be available (UX-013).
export function orderByChronology<T extends OrderableChange>(items: T[]): T[] {
  return [...items].sort((a, b) => a.at.localeCompare(b.at))
}

// ── Suggested next action (UX-014) ───────────────────────────────────────────
export type SuggestedAction =
  | { kind: 'action'; text: string; evidenceEventIds: string[] }
  | { kind: 'none'; reason: string }
// A suggested action is derived from evidence, or the Desk explicitly states no
// action is recommended. An action with no evidence is never presented (UX-014).
export function suggestedNextAction(text: string | null, evidenceEventIds: string[]): SuggestedAction {
  if (!text) return { kind: 'none', reason: 'No action recommended right now.' }
  if (evidenceEventIds.length === 0) throw new Error('A Suggested Next Action MUST be derived from evidence (PLX-UX-014).')
  return { kind: 'action', text, evidenceEventIds }
}

// ── Evidence within one interaction (UX-015) ─────────────────────────────────
export interface EvidenceBearing {
  assertion: string
  evidenceEventIds: string[]
}
// Every recommendation, health transition and resume assertion exposes its evidence
// within one interaction. An assertion with no reachable evidence is a defect.
export function evidenceFor(item: EvidenceBearing): string[] {
  if (item.evidenceEventIds.length === 0) throw new Error('Every assertion MUST expose its evidence (PLX-UX-015).')
  return item.evidenceEventIds
}

// ── Confidence methodology (UX-052 / UX-063) ─────────────────────────────────
export type ConfidenceSource = 'deterministic' | 'calibrated-model' | 'model-self-report'
export interface DisplayConfidence {
  score: number
  source: ConfidenceSource
}
// The documented, plain-language meaning of the score, shown in-product (UX-052).
export const CONFIDENCE_MEANING =
  'Confidence reflects how much evidence supports this. High means multiple confirmed sources agree; low means a single weak signal, offered as a question rather than a claim.'
// A confidence shown to a user must come from a documented, calibrated method — a
// raw model self-report is never surfaced as a score (UX-063).
export function assertDisplayableConfidence(c: DisplayConfidence): void {
  if (c.source === 'model-self-report') {
    throw new Error('Uncalibrated model self-report MUST NOT be surfaced as a confidence score (PLX-UX-063).')
  }
}

// ── Semantic vs presentation state (UX-090) ──────────────────────────────────
const PRESENTATION_KEYS = new Set(['layout', 'viewport', 'deviceClass', 'x', 'y', 'width', 'height', 'zoom', 'scroll', 'zIndex', 'selection'])
// Semantic records (Context, Relationship, Decision, Resume) MUST NOT carry
// presentation-specific fields; presentation state is stored separately (UX-090).
export function assertNoPresentationState(semantic: Record<string, unknown>): void {
  const leaked = Object.keys(semantic).filter((k) => PRESENTATION_KEYS.has(k))
  if (leaked.length > 0) {
    throw new Error(`Semantic data MUST NOT store presentation state: ${leaked.join(', ')} (PLX-UX-090).`)
  }
}
