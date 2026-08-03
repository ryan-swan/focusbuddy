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
  // P3 (Layer 3): another source disagrees with this one on a numeric claim ("sources
  // disagree"). Set by the brain retrieve path from `contradicts` edges; the UI surfaces
  // a disagree chip. Optional/absent on the legacy (non-brain) path.
  disagrees?: boolean
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
      // TWO SHAPES EXIST IN THE LIVE CORPUS and only V2 was ever read. 18 of the operator's 22
      // sheets are V1 — headers and rows at the TOP level rather than inside a `sheets` array — so
      // they extracted to '' and were unfindable. Five of those hold real content (342k · 29k ·
      // 563 · 560 · 399 chars); the other 13 are blank 100x48 default grids and must keep
      // extracting to nothing (locked in documentExtractCoverage.test.ts).
      //
      // V2 is the newer authority: where both shapes are present it wins outright rather than the
      // two being concatenated, so a migrated document is never counted twice.
      const tabs = (b.sheets as Array<{ columns?: string[]; rows?: string[][] }> | undefined) ?? [
        { columns: b.columns as string[] | undefined, rows: b.rows as string[][] | undefined }
      ]
      return arr(tabs).map(sheetTabText).join('\n').trim().slice(0, DOC_TEXT_CAP)
    }
    if (docType === 'slides') {
      // A real deck carries most of its text in `title` and `bullets`; the previous arm read only
      // `elements`, so those were dropped. Every deck in the live corpus is currently a single
      // "Title slide" scaffold, which stays correctly unadmissible.
      const slides = arr(b.slides) as Array<{
        title?: string
        bullets?: unknown
        notes?: string
        elements?: ElementList
      }>
      return slides
        .map((s) =>
          joinParts([
            typeof s?.title === 'string' ? s.title : '',
            arr(s?.bullets).filter((x): x is string => typeof x === 'string').join('\n'),
            elementsText(s?.elements),
            typeof s?.notes === 'string' ? s.notes : ''
          ])
        )
        .join('\n')
        .trim()
        .slice(0, DOC_TEXT_CAP)
    }
    if (docType === 'design') {
      // The same element/paragraph/run shape slides use, plus an optional `pages` array. Was
      // returning '' for every design document.
      const pages = arr(b.pages) as Array<{ elements?: ElementList }>
      return joinParts([elementsText(b.elements as ElementList), ...pages.map((p) => elementsText(p?.elements))])
        .trim()
        .slice(0, DOC_TEXT_CAP)
    }
    if (docType === 'map') {
      // A map is a labelled graph: node labels ARE the content, and an edge label carries the
      // relationship between them. Every map in the live corpus is a single "Start" node, which
      // the admission gate rejects — the extractor is correct, the documents are empty.
      const labelled = [...arr(b.nodes), ...arr(b.edges)] as Array<{ label?: string }>
      return joinParts(labelled.map((n) => (typeof n?.label === 'string' ? n.label : '')))
        .trim()
        .slice(0, DOC_TEXT_CAP)
    }
  } catch {
    /* best-effort */
  }
  return ''
}

type ElementList = Array<{ type?: string; paragraphs?: unknown }> | undefined

// Defensive array coercion. This runs over every document at index time, so a malformed body must
// degrade to empty rather than throw (locked: "malformed bodies degrade to empty").
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

// Drop empty parts before joining, and drop parts already seen. De-duplication matters because a
// slide's title is commonly ALSO rendered as a text element: counting it twice states one fact as
// two, the same error the V1/V2 sheet rule avoids. It also has a useful second-order effect — a
// default deck collapses from "Title slide\nTitle slide" to "Title slide", which falls below the
// admission floor on its own, with no need to special-case the words anywhere.
function joinParts(parts: string[]): string {
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of parts) {
    const t = p.trim()
    if (t.length === 0 || seen.has(t)) continue
    seen.add(t)
    out.push(p)
  }
  return out.join('\n')
}

// One spreadsheet tab: the header row plus up to 40 data rows, pipe-joined.
//
// A tab with NO filled data cell yields nothing at all. Measured on the live corpus: 13 of the
// operator's sheets are default grids whose "headers" are the column LETTERS (A, B, C … AV) over
// 100 empty rows. Emitting those produced ~6,000 characters of "A | B | C | …" per document, which
// passed the admission gate on sheer length and would have put pure chrome into search results.
// A spreadsheet's content is its DATA — headers describe data that is not there. This is DEC-022's
// "a blank-spreadsheet grid is not an answer", enforced at the extractor rather than left to the
// gate to notice.
function sheetTabText(t: unknown): string {
  const tab = (t ?? {}) as { columns?: unknown; rows?: unknown }
  const rows = arr(tab.rows).slice(0, 40)
  const hasData = rows.some((r) => arr(r).some((cell) => String(cell ?? '').trim().length > 0))
  if (!hasData) return ''
  const header = arr(tab.columns).join(' | ')
  return `${header}\n${rows.map((r) => arr(r).join(' | ')).join('\n')}`
}

// element → paragraph → run text, shared by slides and design. Runs are joined WITHOUT a separator:
// they are styling spans inside one sentence, so "Primary " + "navy" is one phrase, not two tokens.
function elementsText(elements: ElementList): string {
  return joinParts(
    arr(elements)
      .filter((e) => Boolean(e) && (e as { type?: string }).type === 'text')
      .map((e) =>
        joinParts(
          arr((e as { paragraphs?: unknown }).paragraphs).map((p) =>
            arr((p as { runs?: unknown })?.runs)
              .map((r) => (r as { text?: string })?.text ?? '')
              .join('')
          )
        )
      )
  )
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
