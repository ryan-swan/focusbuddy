// Pure helpers for global search: turn stored content (raw text or a JSON body
// like a Tiptap doc, a sheet, or a slide deck) into searchable plain text, build
// a readable snippet around a match, and escape a query for a SQL LIKE filter.
// Kept dependency-free so they can be unit-tested without the database.

// Flatten arbitrary stored content to plain text. Raw strings (sticky / note /
// markdown) pass through; JSON bodies are walked, preferring a node's `text`
// field (Tiptap text nodes) and skipping structural `type` tags so the result
// reads like prose rather than markup.
export function contentToText(raw: string | null | undefined): string {
  if (!raw) return ''
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return raw // not JSON — already plain text
  }
  if (typeof parsed === 'string') return parsed
  const out: string[] = []
  const walk = (v: unknown): void => {
    if (typeof v === 'string') {
      out.push(v)
      return
    }
    if (Array.isArray(v)) {
      for (const item of v) walk(item)
      return
    }
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>
      if (typeof o.text === 'string') {
        out.push(o.text)
        if (o.content) walk(o.content)
        return
      }
      for (const k of Object.keys(o)) {
        if (k === 'type') continue // skip Tiptap/structural node-type tags
        walk(o[k])
      }
    }
  }
  walk(parsed)
  return out.join(' ').replace(/\s+/g, ' ').trim()
}

// A snippet of `text` centred on the first case-insensitive occurrence of
// `query`, with ellipses where it was clipped. Falls back to the head of the
// text when the match isn't in the extracted text (e.g. it matched raw JSON
// markup that didn't survive extraction).
export function makeSnippet(text: string, query: string, radius = 64): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!query) return clean.slice(0, radius * 2).trim()
  const i = clean.toLowerCase().indexOf(query.toLowerCase())
  if (i < 0) return clean.slice(0, radius * 2).trim()
  const start = Math.max(0, i - radius)
  const end = Math.min(clean.length, i + query.length + radius)
  let s = clean.slice(start, end).trim()
  if (start > 0) s = '… ' + s
  if (end < clean.length) s = s + ' …'
  return s
}

// Escape a user query for use inside a SQL LIKE pattern (with ESCAPE '\').
export function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (c) => '\\' + c)
}

// Score a semantically-retrieved hit (knowledge or document) on the same
// global-search scale as everything else. A keyword match uses its plain
// `scoreMatch` value so the hit interleaves naturally with tasks, files and the
// rest. An item with no keyword overlap that surfaced only because its meaning is
// close (semantic search active) gets a mid-band discovery score by rank, so it
// appears without ever outranking a strong keyword hit. With semantic search
// inactive a keyword-less item scores 0 and drops out, exactly as the old
// keyword-only search behaved. Nothing is invented: the item was already judged
// relevant by the blend before it reached here.
export function semanticHitScore(keyword: number, rank: number, semanticActive: boolean): number {
  if (keyword > 0) return keyword
  if (!semanticActive) return 0
  return Math.max(60, 220 - rank * 8)
}

// Score a hit so titles outrank body matches and earlier/exact matches outrank
// late ones. Higher is better; 0 means no match.
export function scoreMatch(title: string, body: string, query: string): number {
  const q = query.toLowerCase().trim()
  if (!q) return 0
  const t = title.toLowerCase()
  const b = body.toLowerCase()
  let score = 0
  if (t === q) score = 1000
  else if (t.startsWith(q)) score = 600
  else if (t.includes(` ${q}`)) score = 400
  else if (t.includes(q)) score = 250
  if (score === 0) {
    if (b.includes(` ${q}`)) score = 120
    else if (b.includes(q)) score = 80
  } else if (b.includes(q)) {
    score += 10 // title + body both match — slightly stronger
  }
  return score
}
