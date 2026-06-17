// Find-and-replace matching core for the document editor.
//
// The editor's Find & Replace panel needs to locate every occurrence of a query
// in the document's text and step through them, optionally replacing. The actual
// highlighting and selection happen against the ProseMirror document, but the
// matching itself is pure string work, so it lives here where it can be tested
// without mounting an editor. Positions are plain character offsets into the
// concatenated text; the caller maps them onto document positions.

export interface FindOptions {
  caseSensitive?: boolean
  wholeWord?: boolean
}

export interface FindMatch {
  start: number
  end: number
}

// A character is part of a "word" for whole-word matching when it is a letter,
// digit or underscore. Matches the common \w intuition without locale surprises.
function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z0-9_]/.test(ch)
}

// All non-overlapping matches of `query` in `text`, left to right. An empty
// query yields no matches (rather than a match at every position).
export function findMatches(text: string, query: string, opts: FindOptions = {}): FindMatch[] {
  if (!query) return []
  const hay = opts.caseSensitive ? text : text.toLowerCase()
  const needle = opts.caseSensitive ? query : query.toLowerCase()
  const out: FindMatch[] = []
  let from = 0
  for (;;) {
    const idx = hay.indexOf(needle, from)
    if (idx === -1) break
    const end = idx + needle.length
    if (opts.wholeWord) {
      const before = text[idx - 1]
      const after = text[end]
      // A whole-word match must not be flanked by word characters on either side.
      if (isWordChar(before) || isWordChar(after)) {
        from = idx + 1
        continue
      }
    }
    out.push({ start: idx, end })
    // Advance past this match; +1 (not +len) is unnecessary because matches are
    // non-overlapping and len >= 1 here.
    from = end
  }
  return out
}

// Replace every match of `query` with `replacement` in `text`. Pure string
// result, used for the plain-text path and unit tests; the editor performs the
// real replacement as a single transaction over match ranges back-to-front so
// document positions stay valid.
export function replaceAll(
  text: string,
  query: string,
  replacement: string,
  opts: FindOptions = {}
): { text: string; count: number } {
  const matches = findMatches(text, query, opts)
  if (matches.length === 0) return { text, count: 0 }
  let result = ''
  let cursor = 0
  for (const m of matches) {
    result += text.slice(cursor, m.start) + replacement
    cursor = m.end
  }
  result += text.slice(cursor)
  return { text: result, count: matches.length }
}

// Given the current match index and a direction, return the next index, wrapping
// around the ends. Returns -1 when there are no matches.
export function stepMatch(count: number, current: number, dir: 1 | -1): number {
  if (count <= 0) return -1
  if (current < 0) return dir === 1 ? 0 : count - 1
  return (current + dir + count) % count
}
