// The PURE confidence classifier (plexi-brain P1 — the §10 P1-EXIT gate: confident
// typing must not be fooled). This is the SEAM P2's capture pipeline will call to
// decide a captured fact's confidence stamp from its text. It ships in P1 — ahead of
// capture — so the confidence spine is TRUSTWORTHY before P2 builds on it, guarded by
// planted-red-then-green adversarial locks (confidenceClassifier.test.ts).
//
// The failure class this guards (verification-and-quality.md §1a; DEC-011 §10): a
// mis-read fact stamped `typed` becomes CONFIDENT BLINDNESS — the spine trusts it,
// ranks it, and the user never sees the uncertainty. Three linguistic hazards flip or
// weaken a fact's meaning and MUST prevent a confident `typed` stamp:
//   • NEGATION      — "launch is NOT delayed" ≠ "launch is delayed" (polarity flip)
//   • QUANTIFIER/HEDGE — "SOME say…", "MIGHT ship" (not a flat assertion)
//   • ATTRIBUTION   — "Bob THINKS launch is delayed" (a view, not a settled fact)
//
// The honest posture (I4): when unsure, MARK it (downgrade to inferred/ambiguous),
// never fake certainty. A downgrade is not a drop — the store-anyway floor (I3) keeps
// the content findable; it's just stamped honestly so the "?" can surface on it.
//
// PURE (no DB, no AI): rule-based, deterministic, cheap. P2 may LATER add an LLM
// typing pass on top — but this deterministic floor is the guarantee the LLM can only
// make MORE cautious, never less: P2 combines this with its classifier via
// downgradeOnly() so a hazard can only lower confidence, never raise it.

import type { Confidence } from './brainGraph'

// ── Hazard lexicons (word-boundary matched, case-insensitive) ───────────────────
// Deliberately conservative + explicit — each entry is a hazard that weakens a flat
// assertion. Not exhaustive (natural language never is); the point is the RULE that
// a matched hazard downgrades, red-green-locked so it can't silently regress.

const NEGATION = [
  'not', 'never', 'no longer', "n't", 'without', 'cannot', "can't", 'wont', "won't",
  'isnt', "isn't", 'arent', "aren't", 'didnt', "didn't", 'doesnt', "doesn't", 'none', 'neither', 'nor'
]

const QUANTIFIER_HEDGE = [
  'some', 'most', 'many', 'few', 'several', 'often', 'sometimes', 'usually', 'generally',
  'might', 'may', 'maybe', 'possibly', 'perhaps', 'probably', 'likely', 'could', 'seems',
  'appears', 'apparently', 'roughly', 'about', 'around', 'approximately', 'allegedly', 'reportedly'
]

// Attribution verbs — "<someone> THINKS/SAYS/CLAIMS <fact>": the fact is that someone's
// view, not a settled truth. The attribution must be PRESERVED (P2 keeps who-said-it),
// and the fact itself is `inferred`, never `typed`.
const ATTRIBUTION = [
  'thinks', 'think', 'believes', 'believe', 'claims', 'claim', 'says', 'said', 'argues',
  'suggests', 'suggested', 'assumes', 'assumed', 'feels', 'felt', 'reckons', 'guesses',
  'hopes', 'expects', 'according to', 'in my opinion', 'i think', 'we think'
]

export type Hazard = 'negation' | 'quantifier' | 'attribution'

export interface ConfidenceVerdict {
  confidence: Confidence
  hazards: Hazard[] // which hazards fired (empty = a clean flat assertion → typed)
  why: string // legible one-clause reason (the receipt headline)
}

// Match a lexicon against the text on word boundaries (so "cannot" matches but
// "annotation" does not falsely match "not"). Multi-word entries match as phrases.
function matchesAny(textLower: string, lexicon: string[]): boolean {
  for (const term of lexicon) {
    if (term.includes(' ') || term.startsWith("n't")) {
      // phrase / suffix — substring is correct here (e.g. "according to", "n't")
      if (textLower.includes(term)) return true
    } else {
      // single word — require word boundaries so we don't match inside another word
      const re = new RegExp(`(^|[^a-z])${escapeRe(term)}([^a-z]|$)`, 'i')
      if (re.test(textLower)) return true
    }
  }
  return false
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Classify a captured fact's confidence from its text. Empty/degenerate text is
// `ambiguous` (nothing to trust). A clean flat assertion is `typed`. Any hazard
// downgrades: attribution/quantifier → `inferred`; negation → `inferred` (the
// polarity is easy to mis-read, so never `typed` — but the content is still real, so
// not `ambiguous`). Multiple hazards or a hazard on very short text → `ambiguous`.
export function classifyConfidence(text: string): ConfidenceVerdict {
  const clean = (text ?? '').trim()
  if (clean.length < 2) {
    return { confidence: 'ambiguous', hazards: [], why: 'no content to classify' }
  }
  const lower = clean.toLowerCase()
  const hazards: Hazard[] = []
  if (matchesAny(lower, NEGATION)) hazards.push('negation')
  if (matchesAny(lower, QUANTIFIER_HEDGE)) hazards.push('quantifier')
  if (matchesAny(lower, ATTRIBUTION)) hazards.push('attribution')

  if (hazards.length === 0) {
    return { confidence: 'typed', hazards, why: 'a flat, unhedged assertion' }
  }
  // Two or more hazards stack the uncertainty → ambiguous (surface a "?").
  if (hazards.length >= 2) {
    return { confidence: 'ambiguous', hazards, why: `multiple hazards: ${hazards.join(', ')}` }
  }
  // A single hazard → inferred (weakened, but the content is real — mark, don't drop).
  return { confidence: 'inferred', hazards, why: `${hazards[0]} weakens a flat assertion` }
}

// Confidence ordering — used so a later (P2) classifier can only make a stamp MORE
// cautious, never less. This is the guarantee the deterministic floor gives: an LLM
// typing pass combines via downgradeOnly(), so it can lower confidence on a hazard it
// spots but can NEVER raise a hazard-flagged fact back to `typed`.
const RANK: Record<Confidence, number> = { typed: 2, inferred: 1, ambiguous: 0 }

export function downgradeOnly(base: Confidence, proposed: Confidence): Confidence {
  return RANK[proposed] < RANK[base] ? proposed : base
}
