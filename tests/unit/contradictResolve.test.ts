import { describe, it, expect } from 'vitest'
import {
  extractNumericClaims,
  valuesConflict,
  resolveContradictions,
  type ClaimSource
} from '@shared/contradictResolve'

// Unit lock for the PURE numeric-claim contradiction resolver (plexi-brain P3 — Layer 3:
// the "sources disagree" guard). Two provenance-independent sources asserting DIFFERENT
// numeric values for the SAME subject = a contradiction; a paraphrase (same value) or an
// echo (same source root) is NOT.
//
// THE KEEL (DEC-016, DEC-011 §D safe-asymmetry): a FALSE contradiction annotates a correct
// result with a wrong "sources disagree" chip — worse than missing one. So these locks are
// dominated by the false-positive guards: no shared subject, same-value paraphrase, or
// shared provenance ⇒ NO contradiction.
//
// The POSITIVE case uses the REAL seeded dogfood pair verbatim.

const CRUX = 'the P0 prototype beat today cosine baseline 100 versus 70 on precision, a decisive win on the synthetic corpus.'
const SOURCES = 'early prototype precision was around 85 percent, not a firm number, because the synthetic labels carried circular-benchmark risk.'

describe('extractNumericClaims — reads (subject, value) tuples from prose', () => {
  it('reads "precision was around 85 percent" → subject precision, value 85, unit %', () => {
    const claims = extractNumericClaims(SOURCES)
    const p = claims.find((c) => c.subject === 'precision')
    expect(p).toBeTruthy()
    expect(p!.value).toBe(85)
    expect(p!.unit).toBe('%')
  })

  it('reads "100 versus 70 on precision" → two precision claims (100 and 70)', () => {
    const claims = extractNumericClaims(CRUX).filter((c) => c.subject === 'precision')
    const values = claims.map((c) => c.value).sort((a, b) => a - b)
    expect(values).toContain(100)
    expect(values).toContain(70)
  })

  it('a bare number with NO nearby subject term is NOT a claim (conservative)', () => {
    expect(extractNumericClaims('the meeting is at 3 today, room 204')).toHaveLength(0)
  })

  it('empty / whitespace / null-ish input returns nothing, never throws', () => {
    expect(extractNumericClaims('')).toHaveLength(0)
    // @ts-expect-error — prove the guard holds for a non-string
    expect(extractNumericClaims(null)).toHaveLength(0)
  })
})

describe('valuesConflict — tolerance separates paraphrase from real conflict', () => {
  it('85 vs 100 conflict (17% apart)', () => {
    expect(valuesConflict(85, 100)).toBe(true)
  })
  it('85 vs 85 do NOT conflict (identical)', () => {
    expect(valuesConflict(85, 85)).toBe(false)
  })
  it('85 vs 86 do NOT conflict (within 5% tolerance — rounding/paraphrase)', () => {
    expect(valuesConflict(85, 86)).toBe(false)
  })
})

describe('resolveContradictions — the seeded pair + the safe-asymmetry guards', () => {
  it('THE seeded contradiction: Crux "100 vs 70 on precision" vs Sources "precision 85%" fires', () => {
    const srcs: ClaimSource[] = [
      { sourceId: 'crux-widget', roomId: 'room-crux', text: CRUX },
      { sourceId: 'sources-widget', roomId: 'room-sources', text: SOURCES }
    ]
    const found = resolveContradictions(srcs)
    expect(found.length).toBeGreaterThan(0)
    const c = found.find((x) => x.subject === 'precision')
    expect(c).toBeTruthy()
    // The two source ids are the conflicting pair (order-independent).
    expect([c!.aSourceId, c!.bSourceId].sort()).toEqual(['crux-widget', 'sources-widget'])
  })

  it('a PARAPHRASE does NOT fire — "~85%" vs "85 percent" is the same claim', () => {
    const srcs: ClaimSource[] = [
      { sourceId: 'a', roomId: 'r1', text: 'precision was around 85 percent' },
      { sourceId: 'b', roomId: 'r2', text: 'the precision is ~85%' }
    ]
    expect(resolveContradictions(srcs)).toHaveLength(0)
  })

  it('an ECHO does NOT fire — the same source restating itself is one claim, not a disagreement', () => {
    // Same sourceId on both = one provenance root → never a contradiction with itself.
    const srcs: ClaimSource[] = [
      { sourceId: 'same-root', roomId: 'r1', text: 'precision was 85 percent' },
      { sourceId: 'same-root', roomId: 'r2', text: 'precision was 100 percent' }
    ]
    expect(resolveContradictions(srcs)).toHaveLength(0)
  })

  it('DIFFERENT subjects do NOT conflict — "precision 85" vs "latency 100" is not a disagreement', () => {
    const srcs: ClaimSource[] = [
      { sourceId: 'a', roomId: 'r1', text: 'precision was 85 percent' },
      { sourceId: 'b', roomId: 'r2', text: 'latency was 100 ms' }
    ]
    expect(resolveContradictions(srcs)).toHaveLength(0)
  })

  it('two sources AGREEING on the same value do NOT fire', () => {
    const srcs: ClaimSource[] = [
      { sourceId: 'a', roomId: 'r1', text: 'precision hit 90 percent' },
      { sourceId: 'b', roomId: 'r2', text: 'we measured precision at 90%' }
    ]
    expect(resolveContradictions(srcs)).toHaveLength(0)
  })
})
