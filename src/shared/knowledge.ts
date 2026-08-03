// PlexiBrain: the company knowledge base. A knowledge entry is a curated piece
// of company truth, a fact, a decision, a process, a snippet, that both people
// and the AI read from. It is the shared memory the assistant grounds its
// answers in, so replies come from your own documented truth rather than a
// generic guess.
//
// Stored locally per workspace for now (the same SQLite the rest of the app
// uses); cross-user sync rides on the same path as the other shared surfaces
// when that lands. Shared here so main and renderer agree on the shape.

export interface KnowledgeEntry {
  id: string
  title: string
  body: string
  tags: string[]
  // Pinned entries sort to the top and are surfaced first to the AI.
  pinned: boolean
  createdAt: number
  updatedAt: number
}

export interface KnowledgeDraft {
  title?: string
  body?: string
  tags?: string[]
  pinned?: boolean
}

export interface KnowledgePatch {
  title?: string
  body?: string
  tags?: string[]
  pinned?: boolean
}

// Pure relevance ranking, shared by the store's search and unit tests. Title and
// tag matches outweigh body matches; pinned entries get a small boost. Only real
// entries are returned, ranked; an empty query returns the list unchanged. Kept
// pure (no DB) so it is testable on its own.
export function rankKnowledge(entries: KnowledgeEntry[], query: string, limit = 20): KnowledgeEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return entries.slice(0, limit)
  const terms = q.split(/\s+/).filter(Boolean)
  return entries
    .map((e) => {
      const title = e.title.toLowerCase()
      const tags = e.tags.join(' ').toLowerCase()
      const body = e.body.toLowerCase()
      let termScore = 0
      for (const t of terms) {
        if (title.includes(t)) termScore += 5
        if (tags.includes(t)) termScore += 3
        if (body.includes(t)) termScore += 1
      }
      // The pin boost only breaks ties among genuine matches; it never pulls a
      // non-matching entry into the results.
      const score = termScore > 0 ? termScore + (e.pinned ? 1 : 0) : 0
      return { e, score }
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.e)
}
