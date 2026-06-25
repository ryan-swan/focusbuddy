// Grounded retrieval over the workspace — the substrate for "ask your workspace".
// PlexiBrain knowledge is ranked by meaning (semantic embeddings blended with
// keyword) when an embedding key is configured, and documents are keyword-ranked.
// With no key everything degrades to keyword, so grounding never fabricates a
// match. The pure ranking lives in workspaceRank.ts; the semantic side in
// semanticRetrieval.ts. Both are unit-testable without the database.

import { listDocuments, getDocument } from './db/documents'
import { extractDocText, rankSources, type WorkspaceSource } from './workspaceRank'
import { semanticSearchKnowledge } from './semanticRetrieval'
import { semanticSearchDocuments } from './documentRetrieval'

export type { WorkspaceSource } from './workspaceRank'
export { extractDocText } from './workspaceRank'

export async function retrieveSources(query: string, limit = 6): Promise<WorkspaceSource[]> {
  // Knowledge: curated company truth, ranked semantically (or keyword fallback)
  // and surfaced first so it grounds the answer ahead of looser document matches.
  const kEntries = await semanticSearchKnowledge(query, limit)
  const kSources: WorkspaceSource[] = kEntries
    .map((e, i) => {
      const text = `${e.title}\n${e.tags.join(' ')}\n${e.body}`
      return {
        docId: e.id,
        title: e.title,
        docType: 'knowledge',
        snippet: text.replace(/\s+/g, ' ').trim().slice(0, 200),
        text,
        // Descending by the semantic rank so curated knowledge leads the sources.
        score: 1 - i * 0.01
      }
    })
    .filter((k) => k.text.trim().length > 0)

  // Documents are ranked by meaning when an embedding key is set and by keyword
  // otherwise, the same honest fallback knowledge uses. semanticSearchDocuments
  // builds the document pool itself, so the duplicate listDocuments walk that
  // used to live here is gone.
  const docSources = await semanticSearchDocuments(query, limit)

  return [...kSources, ...docSources].slice(0, limit)
}

// The workspace connecting itself: the documents most related to this one, by
// content overlap. The document's own title + lead text is the query, ranked
// against every other document. No graph to build, no AI call — it just surfaces.
export function relatedDocuments(docId: string, limit = 5): WorkspaceSource[] {
  const self = getDocument(docId)
  if (!self) return []
  const selfMeta = listDocuments().find((m) => m.id === docId)
  const selfText = extractDocText(self.docType, self.body)
  // Title plus the opening of the body carries the document's topic without
  // letting a very long doc dilute the term set.
  const query = `${selfMeta?.title ?? ''} ${selfText}`.slice(0, 2000)
  const docs = listDocuments()
    .filter((m) => m.id !== docId)
    .map((m) => {
      const full = getDocument(m.id)
      if (!full) return null
      return { docId: m.id, title: m.title, docType: m.docType as string, text: extractDocText(m.docType, full.body) }
    })
    .filter((d): d is { docId: string; title: string; docType: string; text: string } => d !== null && d.text.length > 0)
  return rankSources(query, docs, limit)
}
