// Grounded retrieval over the workspace — the substrate for "ask your workspace".
// PlexiBrain knowledge is ranked by meaning (semantic embeddings blended with
// keyword) when an embedding key is configured, and documents are keyword-ranked.
// With no key everything degrades to keyword, so grounding never fabricates a
// match. The pure ranking lives in workspaceRank.ts; the semantic side in
// semanticRetrieval.ts. Both are unit-testable without the database.

import { listDocuments, getDocument } from './db/documents'
import { extractDocText, rankSources, relevanceGate, type WorkspaceSource } from './workspaceRank'
import { semanticSearchKnowledge } from './semanticRetrieval'
import { semanticSearchDocuments } from './documentRetrieval'
import { chunkIndexActive, chunkSearchDocuments } from './chunkIndex'
import { collectExtraSources } from './workspaceExtras'

export type { WorkspaceSource } from './workspaceRank'
export { extractDocText } from './workspaceRank'

// How many sources ground an answer (M1 defect #4). The old 6, round-robined
// across three pools, meant AT MOST 2 documents could ever reach the assistant
// no matter how many matched. 10 slots let ~4 documents through while
// tasks/tables/notes and knowledge keep their fair rounds; the per-source
// prompt cap (grounding.ts SOURCE_PROMPT_CAP) bounds the total prompt cost.
export const RETRIEVAL_SOURCE_LIMIT = 10

export async function retrieveSources(
  query: string,
  limit = RETRIEVAL_SOURCE_LIMIT,
  scopeNodeIds?: string[]
): Promise<WorkspaceSource[]> {
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

  // Documents ride the chunk index (A2, R10): passage-level BM25 over
  // fb_chunks_fts, so a question matches the paragraph that answers it
  // rather than a substring of a document's opening (defect #2). A fresh
  // profile before its first sweep falls back to the legacy whole-document
  // path — the same results as before, never fewer.
  const docSources = chunkIndexActive()
    ? chunkSearchDocuments(query, limit)
    : await semanticSearchDocuments(query, limit)

  // Extras: tasks, tables and canvas notes — the rest of the environment, so the
  // brain is grounded in more than documents. Keyword-ranked.
  const extraSources = collectExtraSources(query, limit, scopeNodeIds)

  // Interleave the three pools round-robin so documents, tasks/tables/notes and
  // knowledge all get a fair shot at the limited source slots. Curated knowledge
  // still leads each round. Each pool passes the relevance gate first: a weak
  // single-term coincidence must not ride into the trace looking analysed
  // (Caleb's drive: an SDR question dragged in every doc containing
  // "research"). An emptied pool is an honest result — the trace says
  // "nothing relevant" and web results lead.
  const pools = [kSources, docSources, extraSources].map((p) => relevanceGate(query, p))
  const merged: WorkspaceSource[] = []
  const seen = new Set<string>()
  for (let i = 0; merged.length < limit && pools.some((p) => p[i]); i++) {
    for (const pool of pools) {
      const s = pool[i]
      if (s && !seen.has(s.docId) && merged.length < limit) {
        seen.add(s.docId)
        merged.push(s)
      }
    }
  }
  return merged
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
