import { describe, it, expect } from 'vitest'
import { rankSources, extractDocText, chunkText } from '../../src/main/workspaceRank'

describe('extractDocText', () => {
  it('pulls text from a Tiptap document body', () => {
    const body = { doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Acme invoice total $48k' }] }] } }
    expect(extractDocText('doc', body)).toContain('Acme invoice total $48k')
  })
  it('pulls headers + rows from a sheet body', () => {
    const body = { sheets: [{ columns: ['Name', 'Amount'], rows: [['Acme', '48000']] }] }
    const t = extractDocText('sheet', body)
    expect(t).toContain('Name | Amount')
    expect(t).toContain('Acme | 48000')
  })
})

describe('rankSources', () => {
  const docs = [
    { docId: 'a', title: 'Acme proposal', docType: 'doc', text: 'pricing total $48k per year for acme' },
    { docId: 'b', title: 'Holiday plans', docType: 'doc', text: 'a beach trip in july' },
    { docId: 'c', title: 'Budget', docType: 'sheet', text: 'acme 48000 supplier' }
  ]

  it('ranks the best match first and drops non-matches', () => {
    const r = rankSources('acme pricing', docs)
    expect(r[0].docId).toBe('a')
    expect(r.map((s) => s.docId)).toContain('c')
    expect(r.map((s) => s.docId)).not.toContain('b')
  })
  it('returns nothing for a query with no usable terms', () => {
    expect(rankSources('a of', docs)).toEqual([])
  })
  it('returns nothing when nothing matches', () => {
    expect(rankSources('kangaroo telescope', docs)).toEqual([])
  })
  it('includes a snippet around the match', () => {
    const r = rankSources('supplier', docs)
    expect(r[0].docId).toBe('c')
    expect(r[0].snippet.toLowerCase()).toContain('supplier')
  })
  it('ignores stopwords so only meaningful terms drive the match', () => {
    const noise = [
      { docId: 'x', title: 'Notes', docType: 'doc', text: 'the and for that this with from over' },
      { docId: 'y', title: 'Acme deal', docType: 'doc', text: 'acme pricing for the supplier' }
    ]
    // "the" and "for" are stopwords; only "acme" should match → just doc y.
    expect(rankSources('the acme for', noise).map((s) => s.docId)).toEqual(['y'])
  })
})

describe('chunkText', () => {
  it('returns a single chunk for short text and none for empty', () => {
    expect(chunkText('short')).toEqual(['short'])
    expect(chunkText('   ')).toEqual([])
  })
  it('splits long text into multiple chunks', () => {
    const long = Array.from({ length: 50 }, (_, i) => `paragraph number ${i} with some words`).join('\n\n')
    const chunks = chunkText(long, 200)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every((c) => c.length <= 300)).toBe(true)
  })
  it('hard-splits a single very long line', () => {
    const chunks = chunkText('x'.repeat(3000), 800)
    expect(chunks.length).toBeGreaterThan(1)
  })
})

describe('rankSources — chunk-level grounding', () => {
  it('grounds on a passage buried deep in a long document, not just the head', () => {
    const filler = Array.from({ length: 60 }, (_, i) => `line ${i} generic filler text here`).join('\n')
    const buried = `${filler}\nThe quarterly refund policy allows thirty day returns.\n${filler}`
    const r = rankSources('refund policy returns', [{ docId: 'd', title: 'Ops manual', docType: 'doc', text: buried }])
    expect(r).toHaveLength(1)
    // The returned grounding text carries the matching passage, not the doc head.
    expect(r[0].text).toContain('refund policy allows thirty day returns')
    expect(r[0].snippet.toLowerCase()).toContain('refund')
  })
})
