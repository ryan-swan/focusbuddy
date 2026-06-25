// Grounded retrieval over the workspace's documents — the substrate for
// "ask your workspace". Reads every non-archived document, extracts its text,
// and ranks by keyword overlap with the question. The pure extraction + ranking
// live in workspaceRank.ts so they can be unit-tested without the database.
// No embeddings yet; keyword retrieval plus the model reading the real text is
// enough for a grounded, cited first version, and it keeps everything local.

import { listDocuments, getDocument } from './db/documents'
import { listKnowledge } from './db/knowledge'
import { extractDocText, rankSources, type WorkspaceSource } from './workspaceRank'

export type { WorkspaceSource } from './workspaceRank'
export { extractDocText } from './workspaceRank'

export function retrieveSources(query: string, limit = 6): WorkspaceSource[] {
  const docs = listDocuments()
    .map((m) => {
      const full = getDocument(m.id)
      if (!full) return null
      return { docId: m.id, title: m.title, docType: m.docType as string, text: extractDocText(m.docType, full.body) }
    })
    .filter((d): d is { docId: string; title: string; docType: string; text: string } => d !== null && d.text.length > 0)

  // PlexiBrain entries are curated company truth, so they join the same grounding
  // corpus as documents. Listed first so they win ties against looser document
  // matches when relevance is otherwise equal.
  const knowledge = listKnowledge()
    .map((e) => ({
      docId: e.id,
      title: e.title,
      docType: 'knowledge',
      text: `${e.title}\n${e.tags.join(' ')}\n${e.body}`
    }))
    .filter((k) => k.text.trim().length > 0)

  return rankSources(query, [...knowledge, ...docs], limit)
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
