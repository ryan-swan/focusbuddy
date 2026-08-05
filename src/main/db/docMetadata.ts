import { getDb } from './database'

// ── fb_document_metadata (AI-enriched, local-model generated) ────────────────
// Structured metadata distilled from a document by the local model. Read at
// query time to enrich both the embedding text and the grounding header the
// workspace-ask answer sends the model. All list fields are stored as JSON string
// arrays. A missing row means "not enriched yet" — callers fall back gracefully.

export interface DocMetadata {
  docId: string
  summary: string
  category: string
  entities: string[]
  dates: string[]
  keywords: string[]
  language: string
  wordCount: number
  model: string
  enrichedAt: number
}

interface DocMetadataRow {
  doc_id: string
  summary: string
  category: string
  entities_json: string
  dates_json: string
  keywords_json: string
  language: string
  word_count: number
  model: string
  enriched_at: number
}

function parseArray(json: string): string[] {
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function rowToMeta(row: DocMetadataRow): DocMetadata {
  return {
    docId: row.doc_id,
    summary: row.summary,
    category: row.category,
    entities: parseArray(row.entities_json),
    dates: parseArray(row.dates_json),
    keywords: parseArray(row.keywords_json),
    language: row.language,
    wordCount: row.word_count,
    model: row.model,
    enrichedAt: row.enriched_at
  }
}

export function setDocMetadata(input: {
  docId: string
  summary: string
  category: string
  entities: string[]
  dates: string[]
  keywords: string[]
  language: string
  wordCount: number
  model: string
}): void {
  getDb()
    .prepare(
      `INSERT INTO fb_document_metadata
         (doc_id, summary, category, entities_json, dates_json, keywords_json, language, word_count, model, enriched_at)
       VALUES (@docId, @summary, @category, @entities, @dates, @keywords, @language, @wordCount, @model, @now)
       ON CONFLICT(doc_id) DO UPDATE SET
         summary = excluded.summary, category = excluded.category,
         entities_json = excluded.entities_json, dates_json = excluded.dates_json,
         keywords_json = excluded.keywords_json, language = excluded.language,
         word_count = excluded.word_count, model = excluded.model,
         enriched_at = excluded.enriched_at`
    )
    .run({
      docId: input.docId,
      summary: input.summary,
      category: input.category,
      entities: JSON.stringify(input.entities),
      dates: JSON.stringify(input.dates),
      keywords: JSON.stringify(input.keywords),
      language: input.language,
      wordCount: input.wordCount,
      model: input.model,
      now: Date.now()
    })
}

export function getDocMetadata(docId: string): DocMetadata | null {
  const row = getDb()
    .prepare('SELECT * FROM fb_document_metadata WHERE doc_id = ?')
    .get(docId) as DocMetadataRow | undefined
  return row ? rowToMeta(row) : null
}

// All enriched metadata as a map keyed by doc id — one query for the whole pool
// so retrieval/grounding can join without N round-trips.
export function listDocMetadata(): Map<string, DocMetadata> {
  const rows = getDb()
    .prepare('SELECT * FROM fb_document_metadata')
    .all() as DocMetadataRow[]
  const map = new Map<string, DocMetadata>()
  for (const r of rows) map.set(r.doc_id, rowToMeta(r))
  return map
}

export function hasDocMetadata(docId: string): boolean {
  const row = getDb()
    .prepare('SELECT 1 FROM fb_document_metadata WHERE doc_id = ?')
    .get(docId)
  return !!row
}

export function deleteDocMetadata(docId: string): void {
  getDb().prepare('DELETE FROM fb_document_metadata WHERE doc_id = ?').run(docId)
}
