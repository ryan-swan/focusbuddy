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
  // Optional AI-enriched metadata (local model), present for documents that have
  // been enriched. Used to build a richer grounding header (so the model sees a
  // source's category, dates, key entities and a summary before its body) without
  // changing behaviour for un-enriched sources, where these are simply absent.
  summary?: string
  category?: string
  dates?: string[]
  entities?: string[]
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

// The ceiling extractDocText applies to every document body. Exported — purely
// additive, no behaviour change — so callers that must be honest about
// truncation can tell "this document is exactly this long" from "this is merely
// where the cut fell". @-mention resolution needs that distinction: quoting
// 12000 as a document's full length when it is only the cap would state a
// number that is not true.
export const DOC_TEXT_CAP = 12000

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

// Split text into ~size-char chunks on paragraph/line boundaries so ranking can
// find a passage buried deep in a long document instead of only its head.
export function chunkText(text: string, size = 800): string[] {
  const clean = (text || '').replace(/\r/g, '').trim()
  if (clean.length <= size) return clean ? [clean] : []
  const chunks: string[] = []
  let cur = ''
  for (const piece of clean.split(/\n{2,}|\n/)) {
    if (cur && (cur.length + piece.length + 1) > size) {
      chunks.push(cur.trim())
      cur = piece
    } else {
      cur = cur ? `${cur}\n${piece}` : piece
    }
    // A single very long line (e.g. a wide sheet row) is hard-split.
    while (cur.length > size * 1.5) {
      chunks.push(cur.slice(0, size).trim())
      cur = cur.slice(size)
    }
  }
  if (cur.trim()) chunks.push(cur.trim())
  return chunks
}

function scoreHay(hay: string, terms: string[]): number {
  let s = 0
  for (const t of terms) s += Math.min(hay.split(t).length - 1, 6)
  return s
}

// Score each document, title matches weighted higher AND the body scored per
// chunk so a mid-document match counts. The returned source text is the top
// matching chunk(s), not the document head, so the model is grounded on the
// passage that actually answers the query. Returns [] for an empty/short query.
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
    let titleScore = 0
    for (const t of terms) if (titleLower.includes(t)) titleScore += 4

    const chunks = chunkText(d.text)
    const ranked = chunks
      .map((text) => ({ text, score: scoreHay(text.toLowerCase(), terms) }))
      .sort((a, b) => b.score - a.score)
    const top = ranked.filter((c) => c.score > 0).slice(0, 2)
    const bodyScore = top.reduce((a, c) => a + c.score, 0)
    const score = titleScore + bodyScore

    if (score > 0) {
      // Ground on the best-matching passages; fall back to the head if the match
      // was title-only.
      const passages = top.length ? top.map((c) => c.text) : [chunks[0] ?? d.text.slice(0, 800)]
      scored.push({
        docId: d.docId,
        title: d.title || 'Untitled',
        docType: d.docType,
        snippet: makeSnippet(top[0]?.text ?? d.text, terms),
        text: passages.join('\n…\n').slice(0, 6000),
        score
      })
    }
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit)
}
