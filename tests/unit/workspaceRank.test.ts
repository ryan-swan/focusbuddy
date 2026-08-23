import { describe, it, expect } from 'vitest'
import { rankSources, extractDocText, chunkText, relevanceGate, mergeScopedPools, termVariants, termMatches } from '../../src/main/workspaceRank'
import type { WorkspaceSource } from '../../src/main/workspaceRank'

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

describe('relevanceGate (A1 drive feedback: coincidences must not pad the trace)', () => {
  const src = (docId: string, title: string, text: string, score: number): WorkspaceSource => ({
    docId,
    title,
    docType: 'document',
    snippet: '',
    text,
    score
  })

  it('drops single-term coincidences on a wordy query — the SDR scenario', () => {
    const q = 'Research the best ways to be an SDR in 2026'
    const kept = relevanceGate(q, [
      src('a', 'SDR outreach playbook', 'sdr research: the ways teams prospect in 2026', 10),
      src('b', 'Research & Intake — index', 'an index of intake material', 4),
      src('c', 'Sales SOPs — index', 'standard operating procedures', 3)
    ])
    expect(kept.map((s) => s.docId)).toEqual(['a'])
  })

  it('a short query still matches on a single hit', () => {
    const kept = relevanceGate('Henderson', [
      src('a', 'Henderson renewal', 'the henderson contract terms', 5)
    ])
    expect(kept).toHaveLength(1)
  })

  it('a strong match pushes the weak tail out even when coverage passes', () => {
    const kept = relevanceGate('wedding venue budget', [
      src('a', 'Wedding budget', 'venue wedding budget ceiling and totals', 20),
      src('b', 'Old note', 'wedding venue mentioned once in passing', 2)
    ])
    expect(kept.map((s) => s.docId)).toEqual(['a'])
  })

  it('passes everything through when the query carries no signal terms', () => {
    expect(relevanceGate('a of the', [src('a', 'T', 'x', 1)])).toHaveLength(1)
  })
})

describe('mergeScopedPools — desk scope demotes, never excludes (#12)', () => {
  const src = (docId: string, score: number): WorkspaceSource => ({
    docId,
    title: docId,
    docType: 'note',
    snippet: '',
    text: 'x',
    score
  })

  it('keeps off-scope sources in the pool at a demoted rank', () => {
    const merged = mergeScopedPools([src('on', 10)], [src('off', 10)], 6)
    expect(merged.map((s) => s.docId)).toEqual(['on', 'off'])
    expect(merged[1].score).toBeLessThan(merged[0].score)
  })

  it('lets a strong off-scope match outrank a weak on-scope one', () => {
    const merged = mergeScopedPools([src('weak-on', 1)], [src('strong-off', 10)], 6)
    expect(merged[0].docId).toBe('strong-off')
  })

  it('respects the limit across both pools', () => {
    const ins = [src('a', 9), src('b', 8)]
    const offs = [src('c', 20), src('d', 1)]
    const merged = mergeScopedPools(ins, offs, 3)
    expect(merged).toHaveLength(3)
    expect(merged.map((s) => s.docId)).toEqual(['a', 'c', 'b'])
  })

  it('is a plain sort when there is nothing off-scope', () => {
    const merged = mergeScopedPools([src('a', 1), src('b', 5)], [], 6)
    expect(merged.map((s) => s.docId)).toEqual(['b', 'a'])
  })
})

describe('termVariants / termMatches (#28) and the recall query', () => {
  it('strips plural and past-tense suffixes, never below 3 chars', () => {
    expect(termVariants('renewals')).toContain('renewal')
    expect(termVariants('decided')).toContain('decide')
    expect(termVariants('policies')).toContain('policy')
    expect(termVariants('sdr')).toEqual(['sdr'])
  })

  it('matches across inflections in both directions', () => {
    expect(termMatches('the renewal clause', 'renewals')).toBe(true)
    expect(termMatches('we decided pricing', 'decide')).toBe(true)
    expect(termMatches('unrelated text', 'renewals')).toBe(false)
  })

  it("the canonical recall question survives the gate (Caleb's #18 phrase)", () => {
    const src: WorkspaceSource = {
      docId: 'c1',
      title: 'Pricing strategy',
      docType: 'chat',
      snippet: '',
      text: 'You: What should our pricing be?\nPlexii: We decided pricing is three numbers on one page.',
      score: 8
    }
    const kept = relevanceGate('What did we decide about pricing last week?', [src])
    expect(kept).toHaveLength(1)
  })
})
