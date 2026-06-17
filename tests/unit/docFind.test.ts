import { describe, it, expect } from 'vitest'
import { findMatches, replaceAll, stepMatch } from '@renderer/lib/docFind'

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
