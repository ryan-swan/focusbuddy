// Pure text extraction + keyword ranking for "ask your workspace". No database
// or native dependencies, so it is unit-testable on its own. workspaceSearch.ts
// wraps these with the document store.

export interface WorkspaceSource {
  docId: string
  title: string
  docType: string
  snippet: string
  // Truncated extracted text, fed to the model as the grounding for this source.
  text: string
  score: number
}

// Best-effort plain text from a document body, by type. Shared with the
// auto-filing tag suggester so both read documents the same way.
export function collectTiptapText(node: unknown): string {
  if (!node || typeof node !== 'object') return ''
  const n = node as { type?: string; text?: string; content?: unknown[] }
  if (typeof n.text === 'string') return n.text
  const kids = Array.isArray(n.content) ? n.content : []
  const block = n.type === 'paragraph' || n.type === 'heading'
  const inner = kids.map(collectTiptapText).join(block ? '' : ' ')
  return block ? inner + '\n' : inner
}

export function extractDocText(docType: string, body: unknown): string {
  try {
    const b = (body ?? {}) as Record<string, unknown>
    if (docType === 'doc') {
      const root = (b.doc as unknown) ?? body
      return collectTiptapText(root).trim().slice(0, 12000)
    }
    if (docType === 'sheet') {
      const sheets = (b.sheets as Array<{ columns?: string[]; rows?: string[][] }>) ?? []
      return sheets
        .map((t) => {
          const header = (t.columns ?? []).join(' | ')
          const rows = (t.rows ?? []).slice(0, 40).map((r) => (r ?? []).join(' | ')).join('\n')
          return `${header}\n${rows}`
        })
        .join('\n')
        .trim()
        .slice(0, 12000)
    }
    if (docType === 'slides') {
      const slides =
        (b.slides as Array<{
          notes?: string
          elements?: Array<{ type?: string; paragraphs?: Array<{ runs?: Array<{ text?: string }> }> }>
        }>) ?? []
      return slides
        .map((s) => {
          const text = (s.elements ?? [])
            .filter((e) => e.type === 'text')
            .map((e) => (e.paragraphs ?? []).map((p) => (p.runs ?? []).map((r) => r.text ?? '').join('')).join(' '))
            .join(' ')
          return s.notes ? `${text}\n${s.notes}` : text
        })
        .join('\n')
        .trim()
        .slice(0, 12000)
    }
  } catch {
    /* best-effort */
  }
  return ''
}

// A short excerpt around the first matching term, for showing under a citation.
function makeSnippet(text: string, terms: string[]): string {
  const lower = text.toLowerCase()
  let at = -1
  for (const t of terms) {
    const i = lower.indexOf(t)
    if (i >= 0 && (at === -1 || i < at)) at = i
  }
  if (at === -1) return text.slice(0, 160).trim()
  const start = Math.max(0, at - 60)
  return (start > 0 ? '…' : '') + text.slice(start, start + 200).trim() + (text.length > start + 200 ? '…' : '')
}

// Common words carry no signal and, in a long "related documents" query (where
// the query is a whole document), would otherwise dominate the score.
const STOPWORDS = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'from', 'are', 'was', 'but', 'not', 'you', 'your', 'our', 'its',
  'has', 'have', 'had', 'will', 'can', 'all', 'any', 'out', 'who', 'what', 'when', 'how', 'why', 'were', 'they',
  'their', 'them', 'then', 'than', 'into', 'over', 'per', 'via', 'etc', 'also', 'such', 'each', 'about', 'would',
  'there', 'which', 'been', 'more', 'some', 'one', 'two', 'get', 'got', 'use', 'using', 'new'
])

// Score each document by how many query terms it contains, title matches weighted
// higher; return the top `limit`. Returns [] for an empty/too-short query.
export function rankSources(
  query: string,
  docs: Array<{ docId: string; title: string; docType: string; text: string }>,
  limit = 6
): WorkspaceSource[] {
  const terms = [...new Set(query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !STOPWORDS.has(t)))]
  if (!terms.length) return []
  const scored: WorkspaceSource[] = []
  for (const d of docs) {
    const titleLower = (d.title || '').toLowerCase()
    const hay = `${titleLower}\n${d.text.toLowerCase()}`
    let score = 0
    for (const t of terms) {
      if (titleLower.includes(t)) score += 4
      const count = hay.split(t).length - 1
      score += Math.min(count, 6)
    }
    if (score > 0) {
      scored.push({
        docId: d.docId,
        title: d.title || 'Untitled',
        docType: d.docType,
        snippet: makeSnippet(d.text, terms),
        text: d.text.slice(0, 6000),
        score
      })
    }
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit)
}
