// DEC-046 — a highlighted LIST becomes several attention items.
//
// The operator's ask, with his own bar attached: only if it can be done fast
// and with high accuracy — "if it's going to be problematic, we can ignore
// it." The pressure test that shaped this module:
//
//   • Selections from MARKDOWN-SOURCE widgets keep their markers and
//     indentation → real structure is recoverable: header bullets become
//     PRIMARY items, sub-bullets become CHILDREN grouped under them — which
//     is exactly the one-level sibling grouping DEC-035 already built.
//   • Selections from RENDERED lists (pages, the AI chat) usually arrive
//     FLATTENED: markers and indentation are stripped by the browser's
//     selection serializer. Structure is NOT recoverable there, so those
//     lines become SIBLINGS — never a model's guess at hierarchy. A guess
//     would be slow (model round trip) and wrong often enough to break his
//     accuracy bar; a visible flat split costs one uncheck on the card.
//   • PROSE must never be shredded into fake items. Plain lines only count
//     as a list when there are 3+ of them and they READ like entries (short,
//     mostly unpunctuated line ends).
//
// Deterministic, capped, and always PREVIEWED: the split renders as the
// confirm card's pre-checked chips (the DEC-025 pattern) before anything
// files. Zero model calls — turnaround is identical to a single capture.

export interface SelectionListLine {
  text: string
  /** 0 = a primary item; 1 = a child of the nearest preceding primary. */
  depth: 0 | 1
}

export interface SelectionList {
  /** 'nested' only when explicit markers/indentation proved it. */
  kind: 'flat' | 'nested'
  lines: SelectionListLine[]
}

/** More than this and one gesture would flood the queue — fall back to a
 *  single item carrying the whole selection as notes. */
export const MAX_LIST_ITEMS = 12

const MARKER_RE = /^(\s*)(?:[-*•·]|\d{1,2}[.)]|\[[ xX]?\])\s+(.*)$/

/** Collapse the sloppy whitespace a rendered-selection copy carries: 3+
 *  newlines to a blank line, runs of blank lines between entries to one
 *  break, trailing spaces gone. The operator's "two or three spaces between
 *  each item" complaint — fixed before anything else sees the text. */
export function normalizeSelectionText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Parse a selection into list lines, or null when it is not a list.
 * Null means "keep today's behavior": one item, full selection in the notes.
 */
export function parseSelectionList(raw: string): SelectionList | null {
  const text = normalizeSelectionText(raw)
  if (!text) return null
  const rawLines = text.split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim())
  if (rawLines.length < 2) return null

  // ── Marker mode: explicit bullets/numbers/checkboxes. ──
  const markered = rawLines.map((l) => MARKER_RE.exec(l))
  const markerCount = markered.filter(Boolean).length
  if (markerCount >= 2 && markerCount >= rawLines.length - 1) {
    // Indent depths among the marker lines; two distinct levels = nesting.
    const indents = markered.filter(Boolean).map((m) => m![1].length)
    const minIndent = Math.min(...indents)
    const hasNesting = indents.some((i) => i > minIndent)
    const lines: SelectionListLine[] = []
    for (let i = 0; i < rawLines.length; i++) {
      const m = markered[i]
      if (m) {
        const depth: 0 | 1 = hasNesting && m[1].length > minIndent ? 1 : 0
        const t = m[2].trim()
        if (t) lines.push({ text: t, depth })
      } else {
        // A non-marker line inside a marker list is a continuation of the
        // previous entry, not its own item.
        const prev = lines[lines.length - 1]
        if (prev) prev.text = `${prev.text} ${rawLines[i].trim()}`
      }
    }
    // A child with no preceding primary (selection started mid-list) is
    // promoted — an orphan must stand, never vanish (DEC-035's own rule).
    while (lines.length && lines[0].depth === 1) lines[0] = { ...lines[0], depth: 0 }
    if (lines.length < 2 || lines.length > MAX_LIST_ITEMS) return null
    return { kind: lines.some((l) => l.depth === 1) ? 'nested' : 'flat', lines }
  }

  // ── Plain-line mode: rendered lists arrive flattened. 3+ short entry-like
  //    lines count; anything prose-like does not. ──
  if (rawLines.length < 3 || rawLines.length > MAX_LIST_ITEMS) return null
  const entryLike = rawLines.filter(
    (l) => l.trim().length <= 120 && !/[.!?]$/.test(l.trim())
  ).length
  if (entryLike < Math.ceil(rawLines.length * 0.7)) return null
  return { kind: 'flat', lines: rawLines.map((l) => ({ text: l.trim(), depth: 0 as const })) }
}
