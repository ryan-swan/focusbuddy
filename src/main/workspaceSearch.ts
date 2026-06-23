// Grounded retrieval over the workspace's documents — the substrate for
// "ask your workspace". Reads every non-archived document, extracts its text,
// and ranks by keyword overlap with the question. The pure extraction + ranking
// live in workspaceRank.ts so they can be unit-tested without the database.
// No embeddings yet; keyword retrieval plus the model reading the real text is
// enough for a grounded, cited first version, and it keeps everything local.

import { listDocuments, getDocument } from './db/documents'
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
  return rankSources(query, docs, limit)
}
