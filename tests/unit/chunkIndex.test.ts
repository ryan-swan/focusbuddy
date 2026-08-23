// @vitest-environment node

import { describe, it, expect, beforeEach } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import {
  chunkText,
  ensureChunkTables,
  reindexSourceChunks,
  removeSourceChunks,
  searchChunks,
  ftsQuery,
  type ChunkDb
} from '../../src/main/chunkIndex'

// A2, R10 — the chunk index. These run REAL FTS5 queries through node:sqlite
// (same engine family as the app's better-sqlite3): the point of the module
// is ranking behaviour, and a mocked database cannot vouch for a MATCH
// expression or a BM25 weight.

function freshDb(): ChunkDb {
  const db = new DatabaseSync(':memory:') as unknown as ChunkDb
  ensureChunkTables(db)
  return db
}

const ORG = 'personal'

function seed(db: ChunkDb, id: string, title: string, text: string, org = ORG): void {
  reindexSourceChunks(db, {
    sourceType: 'document',
    sourceId: id,
    title,
    text,
    sourceKind: 'doc',
    orgId: org
  })
}

describe('chunkText — passage granularity', () => {
  it('keeps a normal paragraph whole and packs small ones together', () => {
    const text = 'Alpha paragraph.\n\nBeta paragraph.\n\nGamma paragraph.'
    const chunks = chunkText(text)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toContain('Alpha paragraph.')
    expect(chunks[0]).toContain('Gamma paragraph.')
  })

  it('splits an oversized paragraph at sentence bounds', () => {
    const long = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} carries some words along.`).join(' ')
    const chunks = chunkText(long)
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(1400)
    // Nothing lost.
    expect(chunks.join(' ').replace(/\s+/g, ' ')).toContain('Sentence number 39')
  })

  it('returns nothing for empty text', () => {
    expect(chunkText('   \n\n  ')).toEqual([])
  })
})

describe('reindexSourceChunks — content-hash cheap', () => {
  let db: ChunkDb
  beforeEach(() => {
    db = freshDb()
  })

  it('indexes, then skips an unchanged source', () => {
    seed(db, 'd1', 'Launch plan', 'The venue gates everything.\n\nBudget ceiling is $1,200.')
    const first = db.prepare(`SELECT id, created_at FROM fb_chunks WHERE source_id = 'd1'`).all()
    expect(first.length).toBeGreaterThan(0)
    seed(db, 'd1', 'Launch plan', 'The venue gates everything.\n\nBudget ceiling is $1,200.')
    const second = db.prepare(`SELECT id, created_at FROM fb_chunks WHERE source_id = 'd1'`).all()
    expect(second).toEqual(first)
  })

  it('re-cuts when the text changes and removes on removeSourceChunks', () => {
    seed(db, 'd1', 'Launch plan', 'Old text about catering.')
    seed(db, 'd1', 'Launch plan', 'New text about the runsheet.')
    const rows = db.prepare(`SELECT text FROM fb_chunks WHERE source_id = 'd1'`).all() as Array<{ text: string }>
    expect(rows).toHaveLength(1)
    expect(rows[0].text).toContain('runsheet')
    // The FTS mirror followed via triggers.
    const hits = searchChunks(db, 'runsheet', { orgId: ORG })
    expect(hits.map((h) => h.sourceId)).toEqual(['d1'])
    expect(searchChunks(db, 'catering', { orgId: ORG })).toEqual([])
    removeSourceChunks(db, 'document', 'd1')
    expect(searchChunks(db, 'runsheet', { orgId: ORG })).toEqual([])
  })
})

describe('searchChunks — passage-level BM25, org-scoped', () => {
  let db: ChunkDb
  beforeEach(() => {
    db = freshDb()
  })

  it('finds a term buried deep in a long document (defect #2)', () => {
    const filler = Array.from(
      { length: 12 },
      (_, i) => `Ordinary section ${i} talks about planning and scheduling at length, with several sentences of routine content that pad the document out well past a single chunk of text.`
    ).join('\n\n')
    const text = `${filler}\n\nThe hydraulic actuator budget hides in this final paragraph.`
    seed(db, 'deep', 'Operations handbook', text)
    seed(db, 'other', 'Unrelated memo', 'A note about lunch options and parking.')
    const hits = searchChunks(db, 'hydraulic actuator budget', { orgId: ORG })
    expect(hits[0]?.sourceId).toBe('deep')
    // The matched PASSAGE is returned, not the document head.
    expect(hits[0]?.passages[0]).toContain('hydraulic actuator')
  })

  it('weighs a title hit above a body mention', () => {
    seed(db, 'titled', 'Henderson contract', 'Terms and conditions apply to the agreement.')
    seed(db, 'body', 'Meeting notes', 'We discussed the henderson contract briefly among other things.')
    const hits = searchChunks(db, 'henderson contract', { orgId: ORG })
    expect(hits.map((h) => h.sourceId)).toEqual(['titled', 'body'])
  })

  it('never crosses the org boundary', () => {
    seed(db, 'mine', 'My doc', 'The zebra project timeline.', 'personal')
    seed(db, 'theirs', 'Their doc', 'The zebra project secrets.', 'org_other')
    const hits = searchChunks(db, 'zebra project', { orgId: 'personal' })
    expect(hits.map((h) => h.sourceId)).toEqual(['mine'])
  })

  it('groups chunks back to one source with passages capped', () => {
    const text = Array.from({ length: 8 }, (_, i) => `Chapter ${i}: the falcon initiative continues with more detail than before, described over enough words that each chapter forms its own sizeable paragraph for chunking purposes in this synthetic document.`).join('\n\n')
    seed(db, 'multi', 'Falcon initiative', text)
    const hits = searchChunks(db, 'falcon initiative', { orgId: ORG, passagesPerSource: 3 })
    expect(hits).toHaveLength(1)
    expect(hits[0].passages.length).toBeLessThanOrEqual(3)
  })

  it('builds a safe MATCH from messy input and returns nothing for none', () => {
    expect(ftsQuery('  ')).toBeNull()
    expect(ftsQuery('a')).toBeNull()
    expect(ftsQuery('venue "quoted" AND (paren)')).toBe('"venue" OR "quoted" OR "and" OR "paren"')
    // Operators and quotes in the user's text never reach FTS as syntax.
    seed(db, 'd1', 'Notes', 'Nothing special here.')
    expect(() => searchChunks(db, 'NEAR("x" OR *', { orgId: ORG })).not.toThrow()
  })
})
