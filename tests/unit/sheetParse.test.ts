// Unit tests for the Sheets AI-fill parser. The bug it fixes: the model often
// returns a bare JSON array instead of {"rows":[...]}, which the old
// object-only extractor rejected with "No JSON object in response".

import { describe, it, expect } from 'vitest'
import { parseSheetRows, parseSheetColumns } from '../../src/main/ai/sheetParse'

describe('parseSheetRows', () => {
  it('parses the requested {"rows": [[...]]} object form', () => {
    const r = parseSheetRows('{"rows": [["a","b"],["c","d"]]}')
    expect(r).toEqual([
      ['a', 'b'],
      ['c', 'd']
    ])
  })

  it('parses a BARE top-level array (the case that used to error)', () => {
    const r = parseSheetRows('[["1","2"],["3","4"]]')
    expect(r).toEqual([
      ['1', '2'],
      ['3', '4']
    ])
  })

  it('tolerates a ```json fence and surrounding prose', () => {
    const r = parseSheetRows('Here you go:\n```json\n{"rows":[["x"]]}\n```\nHope that helps.')
    expect(r).toEqual([['x']])
  })

  it('stringifies non-string cells (numbers, formulas, null)', () => {
    const r = parseSheetRows('[[1, "=B2/B1-1", null, true]]')
    expect(r).toEqual([['1', '=B2/B1-1', '', 'true']])
  })

  it('returns null for prose with no JSON', () => {
    expect(parseSheetRows('I cannot do that.')).toBeNull()
  })

  it('returns null for an empty matrix', () => {
    expect(parseSheetRows('{"rows": []}')).toBeNull()
    expect(parseSheetRows('[]')).toBeNull()
  })

  it('returns null for truncated/invalid JSON rather than throwing', () => {
    expect(parseSheetRows('{"rows": [["a","b"],["c",')).toBeNull()
  })

  it('falls back to the inner array when the object wrapper is malformed but an array is present', () => {
    // No closing brace, but a complete inner array is recoverable.
    const r = parseSheetRows('{"rows": [["a","b"]] ')
    expect(r).toEqual([['a', 'b']])
  })
})

describe('parseSheetColumns', () => {
  it('parses the requested {"columns": [...]} object form', () => {
    expect(parseSheetColumns('{"columns": ["Task","Owner","Status"]}')).toEqual([
      'Task',
      'Owner',
      'Status'
    ])
  })

  it('parses a bare top-level array of names', () => {
    expect(parseSheetColumns('["Name","ARR","Growth %"]')).toEqual(['Name', 'ARR', 'Growth %'])
  })

  it('tolerates a ```json fence and surrounding prose', () => {
    expect(parseSheetColumns('Sure:\n```json\n{"columns":["A","B"]}\n```')).toEqual(['A', 'B'])
  })

  it('trims, drops blanks, and de-duplicates case-insensitively', () => {
    expect(parseSheetColumns('[" Task ", "task", "", "Owner"]')).toEqual(['Task', 'Owner'])
  })

  it('returns null for prose with no list', () => {
    expect(parseSheetColumns('I cannot do that.')).toBeNull()
  })

  it('returns null for an empty list', () => {
    expect(parseSheetColumns('{"columns": []}')).toBeNull()
    expect(parseSheetColumns('[]')).toBeNull()
  })

  it('returns null for truncated/invalid JSON rather than throwing', () => {
    expect(parseSheetColumns('{"columns": ["Task","Own')).toBeNull()
  })
})
