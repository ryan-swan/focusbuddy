// Engineering standards, made machine-checkable (spec §72, §74, REQ-ENG). Two of
// these are meta-requirements the platform must be able to prove about itself:
// requirement-to-test traceability must be computable (ENG-021), and every
// invariant must have an automated detection test (ENG-001/014). This module
// encodes both as real, testable logic rather than prose.

// ── Requirement-to-test traceability (ENG-021) ───────────────────────────────

export interface TraceResult {
  total: number
  covered: string[]
  uncovered: string[]
  pct: number
}

// Compute which requirement ids have at least one citing test. This is the same
// computation the spec:trace CI harness runs, exposed as a pure function so it can
// be tested and called in-process (ENG-021).
export function computeTraceability(requirementIds: string[], citedIds: string[]): TraceResult {
  const cited = new Set(citedIds)
  const covered: string[] = []
  const uncovered: string[] = []
  for (const id of requirementIds) (cited.has(id) ? covered : uncovered).push(id)
  return { total: requirementIds.length, covered, uncovered, pct: requirementIds.length ? covered.length / requirementIds.length : 0 }
}

// ── Invariant detection coverage (ENG-001 / ENG-014) ─────────────────────────

// Each invariant this build enforces is mapped to the detection test(s) that fail
// when it is violated. An invariant with an empty list is asserted-in-docs-only,
// which ENG-001 forbids — the coverage test flags it.
export const INVARIANT_DETECTION_TESTS: Record<string, string[]> = {
  'PLX-INV-03': ['test_plx_gph_001_rejects_empty_evidence'], // evidence-backed relationships
  'PLX-INV-04': ['test_plx_inv_04_generated_content_must_be_grounded', 'test_plx_ai_042_no_invented_org_facts'], // AI never bypasses structured data
  'PLX-INV-05': ['test_plx_inv_05_erasure_destroys_key_not_events', 'test_plx_data_012_protected_targets_refused'], // nothing deletes memory
  'PLX-INV-06': ['test_plx_gph_010_traversal_omits_unreadable_and_does_not_leak_count'], // permissions propagate through relationships
  'PLX-INV-07': ['test_plx_dom_013_materialised_refs_name_their_source_of_truth'] // everything remains inspectable
}

export function invariantHasDetection(invariantId: string): boolean {
  const tests = INVARIANT_DETECTION_TESTS[invariantId]
  return !!tests && tests.length > 0
}

// Invariants that this build claims to enforce but have no detection test — must be
// empty (ENG-001).
export function invariantsMissingDetection(): string[] {
  return Object.keys(INVARIANT_DETECTION_TESTS).filter((inv) => !invariantHasDetection(inv))
}
