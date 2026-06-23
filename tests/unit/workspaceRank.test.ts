import { describe, it, expect } from 'vitest'
import { rankSources, extractDocText } from '../../src/main/workspaceRank'

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
})
