import { describe, it, expect } from 'vitest'
import { buildMemoryPrompt, parseMemoryResponse } from '../../src/main/ai/memoryExtract'

// Pure tests for local-model memory extraction: the prompt builder and the
// tolerant parser that flattens facts/preferences/commitments into typed drafts.

describe('parseMemoryResponse', () => {
  it('flattens facts, preferences and commitments into typed drafts', () => {
    const raw = JSON.stringify({
      facts: [{ text: 'Ana is the design lead at Acme', subject: 'Ana' }],
      preferences: [{ text: 'The user never wants em dashes in copy' }],
      commitments: [{ text: 'Send Ana the Q3 brief', subject: 'the user', due: 'by Friday' }]
    })
    const out = parseMemoryResponse(raw)
    expect(out).toEqual([
      { kind: 'fact', text: 'Ana is the design lead at Acme', subject: 'Ana', due: '' },
      { kind: 'preference', text: 'The user never wants em dashes in copy', subject: '', due: '' },
      { kind: 'commitment', text: 'Send Ana the Q3 brief', subject: 'the user', due: 'by Friday' }
    ])
  })

  it('drops items with no text and tolerates missing arrays', () => {
    const out = parseMemoryResponse(JSON.stringify({ facts: [{ subject: 'x' }, { text: '   ' }, { text: 'real fact' }] }))
    expect(out).toEqual([{ kind: 'fact', text: 'real fact', subject: '', due: '' }])
  })

  it('tolerates a ```json fence and surrounding prose', () => {
    const out = parseMemoryResponse('Here you go:\n```json\n{"facts":[{"text":"F","subject":""}],"commitments":[]}\n```')
    expect(out).toEqual([{ kind: 'fact', text: 'F', subject: '', due: '' }])
  })

  it('returns [] for unparseable output (never fabricates memory)', () => {
    expect(parseMemoryResponse('I could not find anything.')).toEqual([])
    expect(parseMemoryResponse('')).toEqual([])
  })

  it('ignores non-array fields instead of throwing', () => {
    expect(parseMemoryResponse(JSON.stringify({ facts: 'nope', preferences: 5, commitments: null }))).toEqual([])
  })

  it('bounds the total to 20 items', () => {
    const facts = Array.from({ length: 30 }, (_, i) => ({ text: `f${i}`, subject: '' }))
    expect(parseMemoryResponse(JSON.stringify({ facts })).length).toBe(20)
  })
})

describe('buildMemoryPrompt', () => {
  it('includes the title + the three arrays + collapses whitespace', () => {
    const p = buildMemoryPrompt('Kickoff notes', 'line\n\n  one   two')
    expect(p).toContain('Title: Kickoff notes')
    expect(p).toContain('"facts"')
    expect(p).toContain('"preferences"')
    expect(p).toContain('"commitments"')
    expect(p).toContain('line one two')
  })
})
