import { describe, it, expect } from 'vitest'
import {
  admitChunk,
  admissionReason,
  hasDistinctiveToken,
  ADMIT_MIN_CHARS
} from '../../src/shared/admission'

// Regression locks for the plexi-brain I3 admission gate (D6 / DEC-022). Each lock guards a
// specific way the gate could regress; the comment names the broken policy it fails against.
// Thresholds are the ones measured against the real 379-chunk corpus (GT LOST = 0).

describe('admission/admitChunk — the SIGNAL/RARITY floor', () => {
  // GUARDS: a length-only gate (I1's coarse proxy). "A | B | ... | AV" over empty rows is
  // LONG (well past ADMIT_MIN_CHARS) but pure noise. 13 such chunks are in the live index
  // from V2 blank sheets, and F-19 makes the V1 blank grids extractable too. A length-only
  // policy admits them; the signal floor is the whole reason this gate is more than a length.
  it('rejects a long blank-spreadsheet grid (no distinctive token) — length alone would admit it', () => {
    const grid = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'].join(' | ')
    expect(grid.length).toBeGreaterThan(ADMIT_MIN_CHARS) // it clears the length floor…
    expect(admitChunk(grid)).toBe(false) // …and is still rejected, on signal
    expect(admissionReason(grid)).toBe('no-signal')
    // empty-row pipe noise too
    const emptyRows = '|  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |'
    expect(admitChunk(emptyRows)).toBe(false)
  })

  it('rejects a chunk built only from stopwords + punctuation', () => {
    // GUARDS: dropping the stopword check (would admit boilerplate word-salad).
    expect(hasDistinctiveToken('the and for that this with from over')).toBe(false)
    expect(admitChunk('the and for that this with, from — over the and')).toBe(false)
  })

  it('a token with a digit is always distinctive (ids / versions / codes)', () => {
    // GUARDS: treating digit-bearing ids as noise. `sk_test_`, `Q3`, `v2` must pass signal.
    expect(hasDistinctiveToken('Q3')).toBe(true)
    expect(hasDistinctiveToken('sk_test_51H')).toBe(true)
    expect(hasDistinctiveToken('build v2 shipped')).toBe(true)
  })
})

describe('admission/admitChunk — the LENGTH floor', () => {
  it('rejects the placeholder/default stubs that BM25 length-normalisation ranks #1', () => {
    // GUARDS: removing the length floor (these carry a distinctive token yet are pure filler).
    for (const stub of ['with', 'Untitled', 'New desk', 'Test one', 'Apex desk', 'Blank']) {
      expect(admitChunk(stub), stub).toBe(false)
      expect(admissionReason(stub), stub).toBe('too-short')
    }
  })

  it('admits genuine TERSE content — the gate must not eat real short answers', () => {
    // GUARDS: setting the floor too high. These are real, measured, must-keep content:
    // the 17-char task title and the ~30-char rare-token stickies the delete-path lock keeps.
    expect(admitChunk('Q3 Product Launch')).toBe(true) // 17 chars, GT for eval F01
    expect(admitChunk('Kessel Run smuggling record')).toBe(true) // rare-token, ~27 chars
    expect(admitChunk('Albert Sans is the workspace font')).toBe(true)
  })
})

describe('admission/admitChunk — real content is always admitted', () => {
  it('admits prose, a real table row, and an id-bearing warning', () => {
    expect(admitChunk('Every live trade requires explicit user approval; auto-execute is opt-in.')).toBe(true)
    expect(admitChunk('Caleb Wilton | Person | Co-founder | Ryan McQuillian, Michael Dean')).toBe(true)
    expect(admitChunk('Warning: never ship a key beginning sk_test_ to production')).toBe(true)
  })

  it('empty / whitespace text is rejected (nothing to index)', () => {
    expect(admitChunk('')).toBe(false)
    expect(admitChunk('   \n\t ')).toBe(false)
    expect(admissionReason('')).toBe('too-short')
  })

  it('admits real content in NON-LATIN scripts (CJK / Cyrillic / accented Latin)', () => {
    // GUARDS the ASCII-only tokenizer regression: /[^a-z0-9]/ discarded every non-Latin
    // character as a separator, leaving zero tokens, so admitChunk rejected ALL non-Latin
    // content — the brain then could not see any non-English user's notes. Each below is real
    // prose that clears the length floor and MUST be admitted.
    expect(admitChunk('这是一个关于产品发布会议的重要笔记内容')).toBe(true) // Chinese
    expect(admitChunk('Это важная заметка о запуске продукта')).toBe(true) // Russian
    expect(admitChunk('Notes de réunion sur le lancement du café')).toBe(true) // accented Latin
    expect(hasDistinctiveToken('产品发布会议')).toBe(true)
  })
})
