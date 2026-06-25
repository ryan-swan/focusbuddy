import { getDb } from './database'
import { contentToText, makeSnippet, escapeLike, scoreMatch, semanticHitScore } from './searchText'
import { semanticSearchKnowledge, knowledgeSemanticActive } from '../semanticRetrieval'
import { semanticSearchDocuments, documentSemanticActive } from '../documentRetrieval'
import type { SearchHit, DocType } from '@shared/types'

// Global "find anything" search across the local workspace: node titles +
// descriptions, widget text, document bodies, table-row cells, file names, and
// PlexiBrain knowledge. Most categories use plain SQL LIKE, which stays
// dependency-free and instant for a personal-sized DB; knowledge is ranked by
// meaning (semantic embeddings blended with keyword) when an embedding key is
// configured and by keyword otherwise, so the palette finds a "time off" note
// titled "annual leave" without ever inventing a match. The searchText helpers
// turn JSON bodies into readable snippets. Trashed and archived content is
// excluded so search only surfaces live things.

const PER_CATEGORY = 20
const TOTAL = 40
const ESC = " ESCAPE '\\'"

export async function searchAll(rawQuery: string): Promise<SearchHit[]> {
  const query = rawQuery.trim()
  if (query.length < 2) return []
  const db = getDb()
  const like = `%${escapeLike(query)}%`
  const hits: SearchHit[] = []

  // Folders + tasks.
  const nodeRows = db
    .prepare(
      `SELECT id, kind, title, description FROM nodes
       WHERE trashed_at IS NULL AND archived = 0
       AND (title LIKE ?${ESC} OR description LIKE ?${ESC}) LIMIT ?`
    )
    .all(like, like, PER_CATEGORY) as Array<{
    id: string
    kind: 'folder' | 'task'
    title: string
    description: string
  }>
  for (const r of nodeRows) {
    const body = r.description ?? ''
    hits.push({
      type: r.kind === 'folder' ? 'folder' : 'task',
      id: r.id,
      title: r.title || (r.kind === 'folder' ? 'Untitled folder' : 'Untitled task'),
      snippet: makeSnippet(body || r.title, query),
      score: scoreMatch(r.title, body, query)
    })
  }

  // Widgets — sticky / note / page / markdown etc. Their text routes to the
  // task canvas they live on.
  const widgetRows = db
    .prepare(
      `SELECT id, task_id, kind, title, content FROM widgets
       WHERE trashed_at IS NULL AND archived = 0
       AND (title LIKE ?${ESC} OR content LIKE ?${ESC}) LIMIT ?`
    )
    .all(like, like, PER_CATEGORY) as Array<{
    id: string
    task_id: string
    kind: string
    title: string
    content: string
  }>
  for (const r of widgetRows) {
    const text = contentToText(r.content)
    hits.push({
      type: 'widget',
      id: r.id,
      title: r.title || `${r.kind} widget`,
      snippet: makeSnippet(text || r.title, query),
      score: scoreMatch(r.title, text, query),
      taskId: r.task_id,
      widgetKind: r.kind
    })
  }

  // Documents (doc / sheet / slides) ranked by meaning when an embedding key is
  // set and by keyword otherwise, the same blend knowledge uses, so the results
  // list honours "ranks by meaning, not just exact words" rather than only the
  // AI answer. semanticSearchDocuments returns only documents the blend judged
  // relevant; each is placed on the shared score scale via semanticHitScore.
  const docSemanticActive = documentSemanticActive()
  const docHits = await semanticSearchDocuments(query, PER_CATEGORY)
  docHits.forEach((d, rank) => {
    const keyword = scoreMatch(d.title, d.text, query)
    hits.push({
      type: 'document',
      id: d.docId,
      title: d.title || 'Untitled document',
      snippet: d.snippet,
      score: semanticHitScore(keyword, rank, docSemanticActive),
      docType: d.docType as DocType
    })
  })

  // A document whose body extracts to nothing (e.g. titled but not yet written)
  // is skipped by the semantic pool, so a light title-only pass keeps it findable
  // by name. Dedupe below merges these with the ranked hits, keeping the best score.
  const docTitleRows = db
    .prepare(
      `SELECT id, doc_type, title FROM documents
       WHERE archived = 0 AND title LIKE ?${ESC} LIMIT ?`
    )
    .all(like, PER_CATEGORY) as Array<{ id: string; doc_type: 'doc' | 'sheet' | 'slides'; title: string }>
  for (const r of docTitleRows) {
    hits.push({
      type: 'document',
      id: r.id,
      title: r.title || 'Untitled document',
      snippet: makeSnippet(r.title, query),
      score: scoreMatch(r.title, '', query),
      docType: r.doc_type
    })
  }

  // Table rows — resolve to the table's task so a hit opens that canvas. Tables
  // not scoped to a task can't be routed, so they're skipped.
  const rowRows = db
    .prepare(
      `SELECT r.cells_json AS cells, t.id AS tid, t.task_id AS task_id, t.title AS ttitle
       FROM fb_rows r JOIN fb_tables t ON r.table_id = t.id
       WHERE r.cells_json LIKE ?${ESC} LIMIT ?`
    )
    .all(like, PER_CATEGORY) as Array<{
    cells: string
    tid: string
    task_id: string | null
    ttitle: string
  }>
  for (const r of rowRows) {
    if (!r.task_id) continue
    const text = contentToText(r.cells)
    hits.push({
      type: 'table-row',
      id: r.tid,
      title: r.ttitle || 'Table',
      snippet: makeSnippet(text, query),
      score: scoreMatch(r.ttitle, text, query) || 90,
      taskId: r.task_id
    })
  }

  // Tables by name. The row scan above only finds a table when a cell matches;
  // this also surfaces a table whose title matches even if no row text does.
  // Tables not scoped to a task can't be routed, so they're skipped, same as
  // the row path. Shares the 'table-row' type so a name and a row hit dedupe.
  const tableRows = db
    .prepare(
      `SELECT id, task_id, title FROM fb_tables
       WHERE task_id IS NOT NULL AND title LIKE ?${ESC} LIMIT ?`
    )
    .all(like, PER_CATEGORY) as Array<{ id: string; task_id: string; title: string }>
  for (const r of tableRows) {
    hits.push({
      type: 'table-row',
      id: r.id,
      title: r.title || 'Table',
      snippet: makeSnippet(r.title, query),
      score: scoreMatch(r.title, '', query),
      taskId: r.task_id
    })
  }

  // File-manager entries (by name).
  const fileRows = db
    .prepare(
      `SELECT id, original_name, display_name FROM fb_files
       WHERE trashed_at IS NULL
       AND (original_name LIKE ?${ESC} OR display_name LIKE ?${ESC}) LIMIT ?`
    )
    .all(like, like, PER_CATEGORY) as Array<{
    id: string
    original_name: string
    display_name: string | null
  }>
  for (const r of fileRows) {
    const name = r.display_name || r.original_name
    hits.push({
      type: 'file',
      id: r.id,
      title: name,
      snippet: '',
      score: scoreMatch(name, '', query)
    })
  }

  // PlexiBrain knowledge — ranked by meaning when an embedding key is set, by
  // keyword otherwise. semanticSearchKnowledge already returns only entries the
  // blend judged relevant (and ordered best-first), so here we just place each
  // on the shared global-search score scale: a keyword match keeps its plain
  // score, a semantic-only discovery gets a mid-band score by rank. With no key
  // and no keyword overlap an entry never reaches this loop, so nothing is faked.
  const semanticActive = knowledgeSemanticActive()
  const kEntries = await semanticSearchKnowledge(query, PER_CATEGORY)
  kEntries.forEach((e, rank) => {
    const haystack = `${e.body} ${e.tags.join(' ')}`
    const keyword = scoreMatch(e.title, haystack, query)
    hits.push({
      type: 'knowledge',
      id: e.id,
      title: e.title || 'Untitled entry',
      snippet: makeSnippet(e.body || e.tags.join(' ') || e.title, query),
      score: semanticHitScore(keyword, rank, semanticActive)
    })
  })

  // Dedupe (a table can match on several rows) by type+id, keeping the best
  // score, then rank and cap.
  const best = new Map<string, SearchHit>()
  for (const h of hits) {
    if (h.score <= 0) continue
    const key = `${h.type}:${h.id}`
    const prev = best.get(key)
    if (!prev || h.score > prev.score) best.set(key, h)
  }
  return Array.from(best.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, TOTAL)
}
