// Pure prompt-building and response-parsing for document enrichment. Kept
// dependency-free (no db, no Electron, no model client) so the exact contract is
// unit-testable and visible in one place. enrichDocuments.ts wires these to the
// local model + the metadata store.

// Cap the body we hand the local model so a very long doc stays inside its
// context window; the head carries the title, abstract and structure, which is
// what a summary/category/entity pass needs most.
export const ENRICH_CHARS = 6000

export const ENRICH_SYSTEM =
  'You are a precise document indexer. You read a document and return STRICT JSON ' +
  'describing it, for a search index. Extract only what is actually present. Never ' +
  'invent facts, names, or dates. If a field has nothing, use an empty string or empty array.'

// Build the enrichment prompt. Pure + exported so the exact contract stays in one
// place and can be asserted in tests.
export function buildEnrichPrompt(title: string, text: string): string {
  const body = text.replace(/\s+/g, ' ').trim().slice(0, ENRICH_CHARS)
  return (
    `Title: ${title || '(untitled)'}\n\n` +
    `Document:\n${body}\n\n` +
    'Return ONLY a JSON object with exactly these fields:\n' +
    '{\n' +
    '  "summary": "2-3 sentence plain summary of what this document is and covers",\n' +
    '  "category": "one short label, e.g. contract, proposal, meeting-notes, spec, invoice, research, personal",\n' +
    '  "entities": ["people, organisations, products actually named in the document"],\n' +
    '  "dates": ["explicit dates or deadlines mentioned, verbatim"],\n' +
    '  "keywords": ["5-8 short topic tags"],\n' +
    '  "language": "ISO code like en, or the language name"\n' +
    '}'
  )
}

export interface ParsedEnrichment {
  summary: string
  category: string
  entities: string[]
  dates: string[]
  keywords: string[]
  language: string
}

function strArray(v: unknown, max: number, itemMax = 80): string[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((x): x is string => typeof x === 'string')
    .map((s) => s.trim().slice(0, itemMax))
    .filter((s) => s.length > 0)
    .slice(0, max)
}

// Parse the local model's JSON reply into clean, bounded fields. Returns null when
// the reply isn't usable JSON or carries no signal, so the caller writes nothing
// rather than storing garbage. Tolerant of a stray code fence or prose around the
// JSON, which small local models sometimes add despite instructions.
export function parseEnrichResponse(raw: string): ParsedEnrichment | null {
  let jsonStr = raw.trim()
  const fence = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) jsonStr = fence[1].trim()
  if (jsonStr[0] !== '{') {
    const i = jsonStr.indexOf('{')
    const j = jsonStr.lastIndexOf('}')
    if (i >= 0 && j > i) jsonStr = jsonStr.slice(i, j + 1)
  }
  let obj: Record<string, unknown>
  try {
    const p = JSON.parse(jsonStr)
    if (!p || typeof p !== 'object' || Array.isArray(p)) return null
    obj = p as Record<string, unknown>
  } catch {
    return null
  }
  const summary = typeof obj.summary === 'string' ? obj.summary.trim().slice(0, 600) : ''
  const category = typeof obj.category === 'string' ? obj.category.trim().toLowerCase().slice(0, 40) : ''
  const language = typeof obj.language === 'string' ? obj.language.trim().slice(0, 20) : ''
  const entities = strArray(obj.entities, 16)
  const dates = strArray(obj.dates, 16)
  const keywords = strArray(obj.keywords, 12, 40)
  // Require at least SOME signal, else treat as a non-result (don't store empties).
  if (!summary && !category && entities.length === 0 && keywords.length === 0) return null
  return { summary, category, entities, dates, keywords, language }
}

export function countWords(text: string): number {
  const t = text.trim()
  return t ? t.split(/\s+/).length : 0
}
