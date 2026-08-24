import { describe, it, expect, vi } from 'vitest'

// M1 — the retrieval ceilings, tested on the REAL path.
//
// The defect audit's finding was structural: every e2e spec stubs
// `chat:sendStream` at the IPC boundary, so no test had ever exercised what the
// retriever actually hands the prompt. The 600-char source cut, the
// head-not-passage document text, and the 2-documents-max round-robin all
// survived invisible by construction. This suite is the gate that stops them
// silently returning: it seeds a fake database (the vi.mock Map convention this
// suite uses elsewhere) and then runs the REAL workspaceSearch →
// documentRetrieval → workspaceRank pipeline and the REAL prompt line renderer,
// asserting on what would reach the model.
//
// The canonical scenario throughout is the audit's own: "a question whose
// answer is on page 9 of a known document" — a distinctive fact buried deep in
// a long body, past every old ceiling.

const docs = new Map<string, { id: string; docType: string; title: string; body: unknown }>()
const docMeta = new Map<string, { id: string; title: string; docType: string }>()
const knowledge: Array<{ id: string; title: string; body: string; tags: string[]; pinned: boolean }> = []
const taskNodes: Array<{ id: string; kind: string; title: string; description?: string }> = []

vi.mock('../../src/main/db/documents', () => ({
  listDocuments: () => [...docMeta.values()],
  getDocument: (id: string) => docs.get(id) ?? null
}))
vi.mock('../../src/main/db/knowledge', () => ({
  listKnowledge: () => [...knowledge]
}))
vi.mock('../../src/main/db/embeddings', () => ({
  setEmbedding: () => undefined,
  listEmbeddings: () => new Map<string, number[]>(),
  listEmbeddingsTagged: () => new Map<string, { vector: number[]; model: string }>(),
  hasEmbedding: () => false
}))
vi.mock('../../src/main/db/docMetadata', () => ({
  listDocMetadata: () => new Map(),
  getDocMetadata: () => null
}))
vi.mock('../../src/main/db/nodes', () => ({
  listNodes: () => [...taskNodes]
}))
vi.mock('../../src/main/db/tables', () => ({
  listTables: () => [],
  listRows: () => []
}))
vi.mock('../../src/main/db/widgets', () => ({
  listWidgetsByKind: () => []
}))
// No embedding key configured — the exact state of the real install this cap
// audit was measured on: embedQuery yields null and everything is keyword.
vi.mock('../../src/main/ai/embeddings', () => ({
  embedQuery: async () => null,
  embedQueryTagged: async () => null,
  embedTexts: async () => ({ ok: false as const, reason: 'no_key' })
}))
vi.mock('../../src/main/ai/answerCache', () => ({
  bumpAnswerCacheVersion: () => undefined
}))

import { retrieveSources } from '../../src/main/workspaceSearch'
import {
  extractDocText,
  selectPassages,
  DOC_TEXT_CAP,
  SHEET_ROW_CAP
} from '../../src/main/workspaceRank'
import { retrievalSourceLine, SOURCE_PROMPT_CAP } from '../../src/main/ai/grounding'

// A Tiptap doc body whose paragraphs are the given strings.
function tiptapBody(paragraphs: string[]): unknown {
  return {
    doc: {
      type: 'doc',
      content: paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] }))
    }
  }
}

// Filler paragraphs that share no terms with any query used below.
function filler(count: number, seed: string): string[] {
  return Array.from(
    { length: count },
    (_, i) => `${seed} filler paragraph ${i} about ordinary unrelated matters and routine housekeeping items.`
  )
}

function seedDoc(id: string, title: string, paragraphs: string[]): void {
  docs.set(id, { id, docType: 'doc', title, body: tiptapBody(paragraphs) })
  docMeta.set(id, { id, title, docType: 'doc' })
}

describe('M1 ceilings — extractDocText (defect #3)', () => {
  it('keeps text far past the old 12000-char cut', () => {
    const marker = 'the signing bonus clause appears here'
    const paras = [...filler(300, 'alpha'), marker, ...filler(20, 'omega')]
    const text = extractDocText('doc', tiptapBody(paras))
    expect(text.length).toBeGreaterThan(12000)
    expect(text).toContain(marker)
    expect(text.length).toBeLessThanOrEqual(DOC_TEXT_CAP)
  })

  it('keeps sheet rows far past the old 40-row cut', () => {
    const rows = Array.from({ length: 480 }, (_, i) => [`item-${i}`, String(i * 10)])
    const text = extractDocText('sheet', { sheets: [{ columns: ['Name', 'Amount'], rows }] })
    expect(text).toContain('item-450')
    expect(text).toContain('item-479')
  })

  it('pins the ceilings so a silent lowering fails a test, not a user', () => {
    expect(DOC_TEXT_CAP).toBe(48000)
    expect(SHEET_ROW_CAP).toBe(500)
  })
})

describe('M1 passages — selectPassages (defect #2)', () => {
  it('returns the deep matching passage, not the document head', () => {
    const marker = 'The Henderson renewal fee is $4,200 payable each March.'
    const text = [...filler(400, 'beta'), marker, ...filler(30, 'gamma')].join('\n\n')
    const picked = selectPassages('henderson renewal fee', text)
    expect(picked).toContain('$4,200')
    expect(picked).not.toContain('beta filler paragraph 0')
  })

  it('falls back to the head when nothing matches (title-only match)', () => {
    const text = filler(40, 'delta').join('\n\n')
    const picked = selectPassages('completely absent terms', text)
    expect(picked).toContain('delta filler paragraph 0')
  })
})

describe('M1 prompt line — retrievalSourceLine (defect #1)', () => {
  it('carries a full passage where the old cut kept 600 chars', () => {
    const text = 'x'.repeat(5000)
    const line = retrievalSourceLine({ docType: 'doc', title: 'T', text }, 0)
    expect(line).toContain('x'.repeat(5000))
    expect(line.startsWith('[1] (doc) T: ')).toBe(true)
  })

  it('still bounds a pathological source at SOURCE_PROMPT_CAP', () => {
    const line = retrievalSourceLine({ docType: 'doc', title: 'T', text: 'y'.repeat(20000) }, 2)
    expect(line.length).toBeLessThanOrEqual(SOURCE_PROMPT_CAP + 20)
    expect(line.startsWith('[3] ')).toBe(true)
  })
})

describe('M1 real path — retrieveSources over a seeded workspace (defect #4)', () => {
  it('lets more than 2 documents through, and grounds the deep passage', async () => {
    docs.clear()
    docMeta.clear()
    knowledge.length = 0
    taskNodes.length = 0

    // Six matching documents. The old round-robin against limit=6 admitted
    // exactly 2 of these, however strong the match.
    for (let i = 1; i <= 5; i++) {
      seedDoc(
        `d${i}`,
        `Lighthouse note ${i}`,
        [`Working notes on the lighthouse budget, revision ${i}.`, ...filler(3, `doc${i}`)]
      )
    }
    // The "page 9" document: the answer sits past the old 12000-char ceiling.
    const deepMarker = 'Approved lighthouse budget total: $87,500 for the pilot year.'
    seedDoc('d-deep', 'Lighthouse master plan', [...filler(320, 'plan'), deepMarker, ...filler(10, 'tail')])

    knowledge.push(
      { id: 'k1', title: 'Lighthouse overview', body: 'The lighthouse budget process, summarized.', tags: [], pinned: false },
      { id: 'k2', title: 'Budget policy', body: 'How budget approvals work for the lighthouse team.', tags: [], pinned: false }
    )
    taskNodes.push(
      { id: 't1', kind: 'task', title: 'Review lighthouse budget', description: 'walk the numbers' },
      { id: 't2', kind: 'task', title: 'Draft budget memo', description: 'lighthouse pilot' }
    )

    const sources = await retrieveSources('lighthouse budget total')

    // The raised slot count is honoured and never exceeded.
    expect(sources.length).toBeLessThanOrEqual(10)
    // More than 2 documents reach the assistant (defect #4 dead).
    const docSources = sources.filter((s) => s.docType === 'doc')
    expect(docSources.length).toBeGreaterThanOrEqual(4)
    // Knowledge and extras still get their rounds — no pool starves another.
    expect(sources.some((s) => s.docType === 'knowledge')).toBe(true)
    expect(sources.some((s) => s.docType === 'task')).toBe(true)

    // The end-to-end "page 9" assertion: the deep document is retrieved AND its
    // source text (what the prompt renders) contains the buried answer, which
    // sat beyond both the old 12000-char extraction ceiling and the old
    // head-only document text.
    const deep = sources.find((s) => s.docId === 'd-deep')
    expect(deep).toBeDefined()
    expect(deep!.text).toContain('$87,500')
    // And the rendered prompt line — the actual model-facing string — keeps it.
    expect(retrievalSourceLine(deep!, 0)).toContain('$87,500')
  })
})
