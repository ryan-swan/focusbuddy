// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { cleanTitle } from '../../src/main/ai/dailyBriefContext'

// Guards the defensive title cleanup that keeps raw machine content (most often a
// mindmap/map whose title is its serialised body JSON) out of the standup, the
// daily brief, and the AI prompt.

describe('cleanTitle', () => {
  it('recovers a human label from a serialised MapBody title', () => {
    const json = '{"root":{"id":"root","label":"Competitor research CRMs","kind":"idea","children":[]}}'
    expect(cleanTitle(json, 'Mindmap')).toBe('Competitor research CRMs')
  })

  it('falls back when JSON has no usable label', () => {
    expect(cleanTitle('{"nodes":[1,2,3]}', 'Mindmap')).toBe('Mindmap')
    expect(cleanTitle('[1,2,3]', 'Mindmap')).toBe('Mindmap')
  })

  it('uses the fallback for empty / whitespace titles', () => {
    expect(cleanTitle('', 'Untitled desk')).toBe('Untitled desk')
    expect(cleanTitle('   ', 'Untitled desk')).toBe('Untitled desk')
    expect(cleanTitle(null, 'Document')).toBe('Document')
    expect(cleanTitle(undefined, 'Document')).toBe('Document')
  })

  it('collapses whitespace/newlines and truncates very long titles', () => {
    expect(cleanTitle('Line one\n\n  line   two')).toBe('Line one line two')
    const long = 'x'.repeat(200)
    const out = cleanTitle(long)
    expect(out.length).toBe(60)
    expect(out.endsWith('…')).toBe(true)
  })

  it('passes a normal human title through unchanged', () => {
    expect(cleanTitle('Shared mindmap')).toBe('Shared mindmap')
    expect(cleanTitle('GroundTruth Desk 1785635490514')).toBe('GroundTruth Desk 1785635490514')
  })
})
