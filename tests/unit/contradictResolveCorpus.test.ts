import { describe, it, expect } from 'vitest'
import { extractNumericClaims, resolveContradictions, type ClaimSource } from '@shared/contradictResolve'

// S-007 CORPUS LOCK — the false "sources disagree" regression, locked with REAL text.
//
// The sibling lock (contradictResolve.test.ts) passes, and yet the live graph carried 198
// `contradicts` edges that are wrong. That is the gap this file closes: the sibling's
// fixtures are single-topic sentences, where sharing the subject WORD genuinely means
// sharing the subject. A real multi-document corpus breaks that assumption.
//
// Every fixture below is VERBATIM indexed text from the operator's live corpus, taken from
// the exact claim sites that minted the false edges (extracted from fb_chunks, 2026-08-01).
// Nothing here is invented.
//
// Two distinct failure modes are locked:
//
//   1. THE NUMBER IS NOT THE QUANTITY. "Amend 1 — ... boosts confidence" mints
//      confidence=1 from an AMENDMENT NUMBER. "proposes 3 entries + durations, opens rate
//      table" mints rate=3 from a COUNT OF ENTRIES beside a PRICING table.
//   2. SAME WORD, DIFFERENT SUBJECT. A spine field-name list and a competitor-analysis
//      annotation both contain "confidence"; a labelling-realism percentage and an invoice
//      rate table both contain "rate". Neither pair is talking about the same thing.
//
// THE KEEL is unchanged (DEC-016): a false contradiction is worse than a missed one. So
// these are all NEGATIVE assertions, plus a positive re-assertion that the genuine seeded
// contradiction still fires — the fix must not buy silence by breaking true positives.

// ── Real corpus fixtures ──────────────────────────────────────────────────────
// seed-04-decisions-md — "confidence" as a word in a decision amendment; the 1 is "Amend 1".
const DECISIONS_LEDGER =
  'Two near-dupes. **Amend 1 — corroboration boosts confidence ONLY when provenance-independent:** N restatements of one origin are one claim.'

// wsp-plexidesk-...-doc2 — a REAL confidence annotation, about competitor identification.
const COMPETITOR_ANALYSIS =
  'Roam accomplishes it at the team-communication level; PlexiDesk accomplishes it at the individual-work-production level. Confidence: 0.65 — "Rome" is the founder\'s term; best-match identification is Roam.'

// seed-05-architecture-02-retrieval-architecture-md — a genuine labelling-realism rate.
const RETRIEVAL_ARCH =
  "Roughly a third of facts (plus 8% un-typed, the prototype's realism rate) have a wrong or absent node."

// seed-brainstorm-vault-workflows-expanded-md — "rate table" is a PRICING table; 3 is a count.
const WORKFLOWS =
  'The brain proposes 3 entries + durations, opens rate table for amounts; flags an untagged block for review.'

// The genuine seeded contradiction (same pair the sibling lock uses) — MUST still fire.
const CRUX = 'the P0 prototype beat today cosine baseline 100 versus 70 on precision, a decisive win on the synthetic corpus.'
const SOURCES = 'early prototype precision was around 85 percent, not a firm number, because the synthetic labels carried circular-benchmark risk.'

const pair = (aId: string, aText: string, bId: string, bText: string): ClaimSource[] => [
  { sourceId: aId, roomId: null, text: aText },
  { sourceId: bId, roomId: null, text: bText }
]

describe('S-007 — the number near a subject term is not automatically that subject\'s value', () => {
  it('"Amend 1 — ... boosts confidence" does NOT assert confidence = 1 (it is an amendment number)', () => {
    const c = extractNumericClaims(DECISIONS_LEDGER).filter((x) => x.subject === 'confidence')
    expect(c.map((x) => x.value)).not.toContain(1)
  })

  it('"proposes 3 entries + durations, opens rate table" does NOT assert rate = 3 (3 counts entries)', () => {
    const c = extractNumericClaims(WORKFLOWS).filter((x) => x.subject === 'rate')
    expect(c.map((x) => x.value)).not.toContain(3)
  })
})

describe('S-007 — two sources sharing only a generic term are not in disagreement', () => {
  it('a spine field-name list vs a competitor-analysis annotation: NO contradiction on "confidence"', () => {
    const found = resolveContradictions(pair('decisions', DECISIONS_LEDGER, 'competitor', COMPETITOR_ANALYSIS))
    expect(found).toHaveLength(0)
  })

  it('a labelling-realism percentage vs an invoice rate table: NO contradiction on "rate"', () => {
    const found = resolveContradictions(pair('retrieval', RETRIEVAL_ARCH, 'workflows', WORKFLOWS))
    expect(found).toHaveLength(0)
  })

  it('all four real sources together produce NO contradictions', () => {
    const srcs: ClaimSource[] = [
      { sourceId: 'decisions', roomId: null, text: DECISIONS_LEDGER },
      { sourceId: 'competitor', roomId: null, text: COMPETITOR_ANALYSIS },
      { sourceId: 'retrieval', roomId: null, text: RETRIEVAL_ARCH },
      { sourceId: 'workflows', roomId: null, text: WORKFLOWS }
    ]
    expect(resolveContradictions(srcs)).toHaveLength(0)
  })
})

describe('S-007 — the fix must not buy silence by breaking true positives', () => {
  it('the genuine seeded contradiction (precision 85% vs 100/70) STILL fires', () => {
    const found = resolveContradictions(pair('crux', CRUX, 'sources', SOURCES))
    const c = found.find((x) => x.subject === 'precision')
    expect(c).toBeTruthy()
    expect([c!.aSourceId, c!.bSourceId].sort()).toEqual(['crux', 'sources'])
  })

  it('two sources genuinely disagreeing about the SAME thing still fire', () => {
    const found = resolveContradictions(
      pair(
        'a',
        'the ingest pipeline sustained a throughput of 900 documents per hour on the pilot corpus.',
        'b',
        'on the same pilot corpus the ingest pipeline throughput measured 400 documents per hour.'
      )
    )
    expect(found.length).toBeGreaterThan(0)
  })
})
