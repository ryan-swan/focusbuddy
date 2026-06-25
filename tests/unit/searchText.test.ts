// Unit tests for the pure global-search text helpers (src/main/db/searchText.ts).

import { describe, it, expect } from 'vitest'
import {
  contentToText,
  makeSnippet,
  escapeLike,
  scoreMatch,
  knowledgeHitScore
} from '../../src/main/db/searchText'

describe('contentToText', () => {
  it('passes raw (non-JSON) text through', () => {
    expect(contentToText('just a sticky note')).toBe('just a sticky note')
  })
  it('extracts prose from a Tiptap doc, skipping type tags', () => {
    const doc = JSON.stringify({
      type: 'doc',
      content: [
        { type: 'heading', content: [{ type: 'text', text: 'Budget' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Q3 plan and numbers' }] }
      ]
    })
    const text = contentToText(doc)
    expect(text).toContain('Budget')
    expect(text).toContain('Q3 plan and numbers')
    expect(text).not.toContain('paragraph')
    expect(text).not.toContain('doc')
  })
  it('flattens arbitrary JSON string values (sheet/slides-like)', () => {
    const body = JSON.stringify({ cells: { a1: 'Revenue', b1: 'Forecast' }, meta: 42 })
    const text = contentToText(body)
    expect(text).toContain('Revenue')
    expect(text).toContain('Forecast')
  })
  it('returns empty for nullish', () => {
    expect(contentToText(null)).toBe('')
    expect(contentToText(undefined)).toBe('')
    expect(contentToText('')).toBe('')
  })
})

describe('makeSnippet', () => {
  it('centres on the match with ellipses', () => {
    const text = 'a'.repeat(100) + ' findme ' + 'b'.repeat(100)
    const s = makeSnippet(text, 'findme', 20)
    expect(s).toContain('findme')
    expect(s.startsWith('…')).toBe(true)
    expect(s.endsWith('…')).toBe(true)
  })
  it('is case-insensitive', () => {
    expect(makeSnippet('The Quarterly Report', 'quarterly', 50)).toContain('Quarterly')
  })
  it('falls back to the head when no match', () => {
    expect(makeSnippet('hello world', 'zzz', 50)).toBe('hello world')
  })
})

describe('escapeLike', () => {
  it('escapes LIKE wildcards and backslash', () => {
    expect(escapeLike('50%_off\\x')).toBe('50\\%\\_off\\\\x')
  })
})

describe('scoreMatch', () => {
  it('ranks title over body, exact over prefix over contains', () => {
    expect(scoreMatch('Budget', '', 'budget')).toBeGreaterThan(scoreMatch('Budget plan', '', 'budget'))
    expect(scoreMatch('Budget plan', '', 'budget')).toBeGreaterThan(scoreMatch('My budget', '', 'budget'))
    expect(scoreMatch('unrelated', 'has budget inside', 'budget')).toBeGreaterThan(0)
    expect(scoreMatch('unrelated', 'unrelated', 'budget')).toBe(0)
  })
  it('a title match outranks a body-only match', () => {
    expect(scoreMatch('Budget', 'x', 'budget')).toBeGreaterThan(scoreMatch('x', 'budget', 'budget'))
  })
})

describe('knowledgeHitScore', () => {
  it('uses the keyword score directly when there is a keyword match', () => {
    expect(knowledgeHitScore(250, 0, true)).toBe(250)
    expect(knowledgeHitScore(80, 5, false)).toBe(80)
  })
  it('gives a semantic-only match a mid-band discovery score that decays by rank', () => {
    expect(knowledgeHitScore(0, 0, true)).toBe(220)
    expect(knowledgeHitScore(0, 0, true)).toBeGreaterThan(knowledgeHitScore(0, 3, true))
  })
  it('never drops a semantic-only discovery below the floor', () => {
    expect(knowledgeHitScore(0, 100, true)).toBe(60)
  })
  it('scores a keyword-less entry zero when semantic search is inactive', () => {
    expect(knowledgeHitScore(0, 0, false)).toBe(0)
    expect(knowledgeHitScore(0, 2, false)).toBe(0)
  })
})
