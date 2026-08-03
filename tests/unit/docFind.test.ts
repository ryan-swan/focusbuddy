import { describe, it, expect } from 'vitest'
import { findMatches, replaceAll, stepMatch, isValidRegex } from '@renderer/lib/docFind'

// Find & replace matching is pure string work; pin the case/whole-word options,
// non-overlap, replacement integrity, and the wrap-around stepping.

describe('findMatches', () => {
  it('finds all non-overlapping occurrences', () => {
    expect(findMatches('the cat sat on the mat', 'the')).toEqual([
      { start: 0, end: 3 },
      { start: 15, end: 18 }
    ])
  })

  it('is case-insensitive by default and case-sensitive on request', () => {
    expect(findMatches('The THE the', 'the')).toHaveLength(3)
    expect(findMatches('The THE the', 'the', { caseSensitive: true })).toEqual([
      { start: 8, end: 11 }
    ])
  })

  it('respects whole-word matching', () => {
    expect(findMatches('cat category cat', 'cat', { wholeWord: true })).toEqual([
      { start: 0, end: 3 },
      { start: 13, end: 16 }
    ])
  })

  it('returns nothing for an empty query', () => {
    expect(findMatches('anything', '')).toEqual([])
  })

  it('handles overlapping-looking patterns without overlap', () => {
    expect(findMatches('aaaa', 'aa')).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 }
    ])
  })
})

describe('replaceAll', () => {
  it('replaces every match and reports the count', () => {
    expect(replaceAll('the cat sat on the mat', 'the', 'a')).toEqual({
      text: 'a cat sat on a mat',
      count: 2
    })
  })

  it('is a no-op when there is no match', () => {
    expect(replaceAll('hello', 'zzz', 'x')).toEqual({ text: 'hello', count: 0 })
  })

  it('handles replacement longer than the match without position drift', () => {
    expect(replaceAll('a a a', 'a', 'bbb')).toEqual({ text: 'bbb bbb bbb', count: 3 })
  })

  it('honors whole-word during replace', () => {
    expect(replaceAll('cat category', 'cat', 'dog', { wholeWord: true })).toEqual({
      text: 'dog category',
      count: 1
    })
  })
})

// ── Regex find ────────────────────────────────────────────────────────────────

describe('isValidRegex', () => {
  it('returns false for an unclosed character class', () => {
    expect(isValidRegex('[')).toBe(false)
  })

  it('returns false for an unclosed group', () => {
    expect(isValidRegex('(abc')).toBe(false)
  })

  it('returns true for a valid digit pattern', () => {
    expect(isValidRegex('\\d+')).toBe(true)
  })

  it('returns true for a word-boundary anchored pattern', () => {
    expect(isValidRegex('\\bfoo\\b')).toBe(true)
  })

  it('returns false for an empty string', () => {
    expect(isValidRegex('')).toBe(false)
  })
})

describe('findMatches — regex mode', () => {
  it('finds all \\d+ matches in mixed text', () => {
    const matches = findMatches('a12 b34', '\\d+', { regex: true })
    expect(matches).toEqual([
      { start: 1, end: 3 },
      { start: 5, end: 7 }
    ])
  })

  it('is case-insensitive by default in regex mode', () => {
    const matches = findMatches('Foo foo FOO', 'foo', { regex: true })
    expect(matches).toHaveLength(3)
  })

  it('respects caseSensitive:true in regex mode', () => {
    const matches = findMatches('Foo foo FOO', 'foo', { regex: true, caseSensitive: true })
    expect(matches).toHaveLength(1)
    expect(matches[0]).toEqual({ start: 4, end: 7 })
  })

  it('returns nothing for an invalid pattern instead of throwing', () => {
    // "[" is an unclosed character class — would throw without the guard
    const matches = findMatches('anything', '[', { regex: true })
    expect(matches).toEqual([])
  })

  it('terminates and returns only non-empty matches for a zero-width pattern like "a*"', () => {
    // "a*" matches a zero-width position everywhere, which would infinite-loop
    // without the zero-width guard.
    const matches = findMatches('bab', 'a*', { regex: true })
    // Only the real 'a' at position 1 is non-empty; all the zero-width hits get skipped.
    expect(matches.length).toBeGreaterThan(0)
    // Every returned match must span at least one character.
    for (const m of matches) {
      expect(m.end).toBeGreaterThan(m.start)
    }
  })

  it('finds capturing-group patterns correctly', () => {
    const matches = findMatches('2024-01-15 and 2025-06-22', '\\d{4}-\\d{2}-\\d{2}', { regex: true })
    expect(matches).toHaveLength(2)
    expect(matches[0]).toEqual({ start: 0, end: 10 })
    expect(matches[1]).toEqual({ start: 15, end: 25 })
  })

  it('returns nothing for an empty query even in regex mode', () => {
    expect(findMatches('anything', '', { regex: true })).toEqual([])
  })
})

describe('stepMatch', () => {
  it('wraps forward and backward', () => {
    expect(stepMatch(3, 0, 1)).toBe(1)
    expect(stepMatch(3, 2, 1)).toBe(0)
    expect(stepMatch(3, 0, -1)).toBe(2)
  })

  it('returns -1 when there are no matches', () => {
    expect(stepMatch(0, -1, 1)).toBe(-1)
  })

  it('selects the first match forward / last match backward from no selection', () => {
    expect(stepMatch(3, -1, 1)).toBe(0)
    expect(stepMatch(3, -1, -1)).toBe(2)
  })
})
