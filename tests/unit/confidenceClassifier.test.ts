import { describe, it, expect } from 'vitest'
import { classifyConfidence, downgradeOnly } from '@shared/confidenceClassifier'

// ═══ THE §10 P1-EXIT GATE: confident-typing adversarial locks ═══════════════════
// (DEC-011 §10; 06-PLAN.md P1 honest risks; verification-and-quality.md §1a.)
//
// These are PLANTED-RED-THEN-GREEN adversarial locks. The failure class they guard is
// CONFIDENT BLINDNESS: a mis-read fact stamped `typed` that the spine then trusts,
// ranks, and never flags. Each lock is an adversarial input that a naive classifier
// (return 'typed' always) gets WRONG — negation/quantifier/attribution traps. The
// classifier MUST NOT stamp any of these `typed`.
//
// RED-GREEN evidence (performed, not claimed): with the classifier stubbed to
// `return { confidence: 'typed', ... }` (the naive baseline), EVERY test in the three
// adversarial blocks below goes RED. With the real rule-based classifier, they go
// GREEN. A lock that has never failed is theater; these were shown to catch the
// naive-typing regression.

describe('§10 lock — NEGATION must not be typed (polarity flip is the classic mis-read)', () => {
  const cases = [
    'The launch is not delayed',
    'We are no longer shipping in Q3',
    "The contract isn't signed",
    'Revenue did not hit the target',
    'Neither option was approved',
    'The vendor cannot deliver by Friday'
  ]
  for (const text of cases) {
    it(`"${text}" → NOT typed`, () => {
      const v = classifyConfidence(text)
      expect(v.confidence, `negation must downgrade: got ${v.confidence}`).not.toBe('typed')
      expect(v.hazards).toContain('negation')
    })
  }

  it('a flat assertion of the SAME topic (no negation) IS typed — the rule is specific, not blanket', () => {
    expect(classifyConfidence('The launch is delayed').confidence).toBe('typed')
    expect(classifyConfidence('We are shipping in Q3').confidence).toBe('typed')
  })
})

describe('§10 lock — QUANTIFIER / HEDGE must not be typed (not a flat assertion)', () => {
  const cases = [
    'Some customers want the refund',
    'Most of the team prefers Slack',
    'The launch might slip to Q4',
    'Revenue is roughly $40k',
    'The deal will probably close',
    'It seems the vendor is reliable'
  ]
  for (const text of cases) {
    it(`"${text}" → NOT typed`, () => {
      const v = classifyConfidence(text)
      expect(v.confidence, `hedge must downgrade: got ${v.confidence}`).not.toBe('typed')
      expect(v.hazards).toContain('quantifier')
    })
  }
})

describe('§10 lock — ATTRIBUTION must not be typed (a view, not a settled fact)', () => {
  const cases = [
    'Bob thinks the launch is delayed',
    'Sarah says the budget is approved',
    'The analyst claims revenue will double',
    'According to legal, the contract is void',
    'We believe the vendor is reliable',
    'In my opinion the design is finished'
  ]
  for (const text of cases) {
    it(`"${text}" → NOT typed (inferred/ambiguous — the attribution is preserved by P2)`, () => {
      const v = classifyConfidence(text)
      expect(v.confidence, `attribution must downgrade: got ${v.confidence}`).not.toBe('typed')
      expect(v.hazards).toContain('attribution')
    })
  }

  it('the SAME fact stated flatly (no attribution) IS typed', () => {
    expect(classifyConfidence('The launch is delayed').confidence).toBe('typed')
    expect(classifyConfidence('The budget is approved').confidence).toBe('typed')
  })
})

describe('confidence classifier — honest baseline behavior', () => {
  it('a clean flat assertion is typed', () => {
    expect(classifyConfidence('The Q3 deck is due Friday').confidence).toBe('typed')
  })

  it('empty / degenerate text is ambiguous, never typed', () => {
    expect(classifyConfidence('').confidence).toBe('ambiguous')
    expect(classifyConfidence('  ').confidence).toBe('ambiguous')
    expect(classifyConfidence('x').confidence).toBe('ambiguous')
  })

  it('MULTIPLE hazards stack to ambiguous (surface a "?")', () => {
    // negation + attribution → two hazards → ambiguous
    const v = classifyConfidence('Bob does not think the launch is delayed')
    expect(v.confidence).toBe('ambiguous')
    expect(v.hazards.length).toBeGreaterThanOrEqual(2)
  })

  it('a single hazard downgrades to inferred (weakened, but content is real — mark, not drop I4)', () => {
    expect(classifyConfidence('Bob thinks the launch is delayed').confidence).toBe('inferred')
  })

  it('word-boundary matching: "annotation" does not false-match the negation "not"', () => {
    // 'annotation' contains 'not' but must NOT trip the negation rule.
    const v = classifyConfidence('The annotation layer is complete')
    expect(v.hazards).not.toContain('negation')
    expect(v.confidence).toBe('typed')
  })
})

describe('downgradeOnly — the deterministic floor P2 can only make MORE cautious', () => {
  it('a later pass can LOWER confidence', () => {
    expect(downgradeOnly('typed', 'inferred')).toBe('inferred')
    expect(downgradeOnly('inferred', 'ambiguous')).toBe('ambiguous')
  })
  it('a later pass can NEVER RAISE confidence (a hazard-flagged fact stays down)', () => {
    expect(downgradeOnly('inferred', 'typed')).toBe('inferred')
    expect(downgradeOnly('ambiguous', 'typed')).toBe('ambiguous')
  })
})
