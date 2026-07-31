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
import { collectExtraSources } from './workspaceExtras'
import { isBrainEnabled } from './brainPref'
import { retrieveViaBrain } from './brain/retriever'

export type { WorkspaceSource } from './workspaceRank'
export { extractDocText } from './workspaceRank'

// The retrieval seam (plexi-brain P0, DEC-008/011/012). Its SIGNATURE is fixed; only the
// body changed. Brain ENABLED -> the chunked brain retriever (RRF fusion over a BM25 leg
// and a vector leg). Brain DISABLED (the default) -> the EXACT prior path, byte-for-byte.
// Nothing in the base app depends on the brain (DEC-012.1).
//
// scopeNodeIds is deliberately NOT routed through the brain. It encodes user-driven
// scoping (focus mode, pinned widgets) and retrieveViaBrain has no scoping parameter, so
// sending a scoped query to the brain would silently return unscoped results — the user
// would be shown content they had explicitly narrowed away from. A scoped query therefore
// stays on the legacy path until the brain grows a scope-aware retrieve.
export async function retrieveSources(
  query: string,
  limit = 6,
  scopeNodeIds?: string[]
): Promise<WorkspaceSource[]> {
  // Brain ON, and the query is unscoped: chunk-level recall + RRF fusion. If the index is
  // not built yet (returns []), fall through so retrieval always answers.
  if (isBrainEnabled() && (!scopeNodeIds || scopeNodeIds.length === 0)) {
    try {
      const brain = await retrieveViaBrain(query, limit)
      if (brain.length > 0) return brain
    } catch {
      // Any brain-path failure degrades to the legacy path — never breaks retrieval.
    }
  }
  return retrieveSourcesLegacy(query, limit, scopeNodeIds)
}

// The unchanged prior retrieval — three pools (knowledge, documents, extras) interleaved
// round-robin. This is exactly what "brain OFF" returns.
async function retrieveSourcesLegacy(
  query: string,
  limit = 6,
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

  // Documents are ranked by meaning when an embedding key is set and by keyword
  // otherwise, the same honest fallback knowledge uses. semanticSearchDocuments
  // builds the document pool itself, so the duplicate listDocuments walk that
  // used to live here is gone.
  const docSources = await semanticSearchDocuments(query, limit)

  // Extras: tasks, tables and canvas notes — the rest of the environment, so the
  // brain is grounded in more than documents. Keyword-ranked.
  const extraSources = collectExtraSources(query, limit, scopeNodeIds)

  // Interleave the three pools round-robin so documents, tasks/tables/notes and
  // knowledge all get a fair shot at the limited source slots. Curated knowledge
  // still leads each round.
  const pools = [kSources, docSources, extraSources]
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
