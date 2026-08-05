import { describe, it, expect } from 'vitest'
import {
  buildEnrichPrompt,
  parseEnrichResponse,
  countWords,
  ENRICH_CHARS
} from '../../src/main/ai/enrichParse'
import { groundingBlock } from '../../src/main/ai/grounding'

// Pure-logic tests for local-model document enrichment: the prompt builder, the
// tolerant JSON parser, and the grounding-block assembler. No model, no db.

describe('parseEnrichResponse', () => {
  it('parses a clean JSON reply into bounded fields', () => {
    const r = parseEnrichResponse(
      JSON.stringify({
        summary: 'A rollout guide.',
        category: 'Implementation-Guide',
        entities: ['Campfire.AI', 'Cynder'],
        dates: ['30-60-90 day'],
        keywords: ['rollout', 'erp'],
        language: 'en'
      })
    )
    expect(r).not.toBeNull()
    expect(r!.summary).toBe('A rollout guide.')
    expect(r!.category).toBe('implementation-guide') // lowercased
    expect(r!.entities).toEqual(['Campfire.AI', 'Cynder'])
    expect(r!.keywords).toEqual(['rollout', 'erp'])
    expect(r!.language).toBe('en')
  })

  it('tolerates a ```json fence around the object', () => {
    const r = parseEnrichResponse('```json\n{"summary":"x","category":"note","entities":[],"dates":[],"keywords":["a"]}\n```')
    expect(r?.summary).toBe('x')
    expect(r?.keywords).toEqual(['a'])
  })

  it('tolerates leading/trailing prose around the JSON', () => {
    const r = parseEnrichResponse('Here is the JSON you asked for: {"summary":"hi","category":"","entities":["Bob"],"dates":[],"keywords":[]} — done')
    expect(r?.summary).toBe('hi')
    expect(r?.entities).toEqual(['Bob'])
  })

  it('returns null for non-JSON', () => {
    expect(parseEnrichResponse('I could not analyse this document.')).toBeNull()
  })

  it('returns null when there is no signal (nothing to store)', () => {
    expect(parseEnrichResponse('{"summary":"","category":"","entities":[],"dates":[],"keywords":[]}')).toBeNull()
  })

  it('bounds array length and trims/drops blank items', () => {
    const many = Array.from({ length: 30 }, (_, i) => `  e${i}  `)
    const r = parseEnrichResponse(
      JSON.stringify({ summary: 's', category: 'c', entities: [...many, '', '   '], dates: [], keywords: [] })
    )
    expect(r!.entities.length).toBe(16) // capped
    expect(r!.entities[0]).toBe('e0') // trimmed
    expect(r!.entities.every((e) => e.length > 0)).toBe(true) // blanks dropped
  })

  it('caps an over-long summary', () => {
    const r = parseEnrichResponse(JSON.stringify({ summary: 'x'.repeat(2000), category: 'c', entities: [], dates: [], keywords: [] }))
    expect(r!.summary.length).toBe(600)
  })

  it('ignores non-string / non-array field types instead of throwing', () => {
    const r = parseEnrichResponse(JSON.stringify({ summary: 42, category: null, entities: 'nope', dates: {}, keywords: ['ok'] }))
    // summary/category coerced to empty; entities/dates coerced to []; one keyword survives -> has signal.
    expect(r).not.toBeNull()
    expect(r!.summary).toBe('')
    expect(r!.entities).toEqual([])
    expect(r!.keywords).toEqual(['ok'])
  })
})

describe('buildEnrichPrompt', () => {
  it('includes the title, the schema fields, and collapses whitespace', () => {
    const p = buildEnrichPrompt('My Contract', 'line one\n\n\n   line   two')
    expect(p).toContain('Title: My Contract')
    expect(p).toContain('"summary"')
    expect(p).toContain('"category"')
    expect(p).toContain('"entities"')
    expect(p).toContain('line one line two') // whitespace collapsed
  })

  it('uses (untitled) when the title is blank', () => {
    expect(buildEnrichPrompt('', 'body')).toContain('Title: (untitled)')
  })

  it('truncates a very long body to the cap', () => {
    const p = buildEnrichPrompt('T', 'a'.repeat(ENRICH_CHARS + 5000))
    // The prompt has framing around the body, but the body itself can't exceed the cap.
    expect(p).not.toContain('a'.repeat(ENRICH_CHARS + 1))
    expect(p).toContain('a'.repeat(ENRICH_CHARS))
  })
})

describe('groundingBlock', () => {
  it('renders a plain block (no header lines) when there is no metadata', () => {
    const b = groundingBlock({ docId: 'd1', title: 'Notes', docType: 'doc', text: 'body here' }, 0)
    expect(b).toBe('[1] Notes (doc)\nbody here')
  })

  it('prepends metadata header lines when present, in order, then the body', () => {
    const b = groundingBlock(
      {
        docId: 'd2',
        title: 'Rollout',
        docType: 'docx',
        text: 'the body',
        category: 'implementation-guide',
        dates: ['2026-08-01'],
        entities: ['Campfire', 'Cynder'],
        summary: 'A 30-60-90 plan.'
      },
      2
    )
    expect(b).toBe(
      '[3] Rollout (docx)\n' +
        'Category: implementation-guide\n' +
        'Dates: 2026-08-01\n' +
        'Mentions: Campfire, Cynder\n' +
        'Summary: A 30-60-90 plan.\n' +
        'the body'
    )
  })

  it('caps dates and entities at 8 in the header', () => {
    const dates = Array.from({ length: 12 }, (_, i) => `d${i}`)
    const entities = Array.from({ length: 12 }, (_, i) => `e${i}`)
    const b = groundingBlock({ docId: 'd3', title: 'T', docType: 'doc', text: 'x', dates, entities }, 0)
    expect(b).toContain('Dates: d0, d1, d2, d3, d4, d5, d6, d7\n')
    expect(b).not.toContain('d8')
    expect(b).toContain('Mentions: e0, e1, e2, e3, e4, e5, e6, e7\n')
    expect(b).not.toContain('e8')
  })
})

describe('countWords', () => {
  it('counts words and handles empty', () => {
    expect(countWords('one two three')).toBe(3)
    expect(countWords('   ')).toBe(0)
    expect(countWords('')).toBe(0)
  })
})
