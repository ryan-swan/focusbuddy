// Turn inline [n] citation markers in assistant prose into rendered chips.
//
// The model is told (see the RETRIEVED MATERIAL block in main/ai/anthropic.ts)
// to cite the numbered sources it used inline, e.g. "the cert is unsigned [2]".
// Left alone those markers render as literal text. This remark plugin rewrites
// each one into a `cite-ref` node that ChatBlockView maps to a chip component.
//
// Deliberately written without unist-util-visit: that package is only a
// transitive dependency of remark here, and depending on a transitive is how
// you get broken by someone else's minor bump. The mdast tree is plain objects,
// so walking it by hand is a dozen lines and has no such risk. Keeping it free
// of React/DOM imports also means it unit-tests as a pure function.

// Minimal structural view of the mdast nodes we touch. Not the full mdast type
// (that would mean depending on @types/mdast for three fields).
interface MdNode {
  type: string
  value?: string
  children?: MdNode[]
  data?: { hName?: string; hProperties?: Record<string, unknown> }
}

// A marker is one or more digits in square brackets. Bounded to 1-3 digits so a
// markdown link label like [12345](url) or an array literal in prose can't be
// mistaken for a citation.
const MARKER = /\[(\d{1,3})\]/g

// Split one text node into text + citation nodes. Returns null when the node
// holds no marker, so the caller can skip it without allocating.
export function splitCitations(value: string): MdNode[] | null {
  MARKER.lastIndex = 0
  if (!MARKER.test(value)) return null
  MARKER.lastIndex = 0

  const out: MdNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  while ((m = MARKER.exec(value)) !== null) {
    if (m.index > last) out.push({ type: 'text', value: value.slice(last, m.index) })
    out.push({
      type: 'citeRef',
      // hName/hProperties are how a custom mdast node survives the trip through
      // rehype into react-markdown. Deliberately a plain <span> carrying a data
      // attribute rather than a bespoke tag: react-markdown's `Components` type
      // only admits real HTML element names, so a custom tag would force a cast
      // that throws away the type checking on every other renderer override.
      //
      // The number ALSO rides as a text child (A1): hProperties keys are copied
      // into hast verbatim (no camelization), and for months the renderer
      // overrides looked up the camelized key, missed, and fell through to a
      // bare <span> — with no child, every inline citation rendered as an
      // INVISIBLE empty gap. The child is the belt to the override's braces:
      // even an un-overridden span now shows the number.
      children: [{ type: 'text', value: m[1] }],
      data: { hName: 'span', hProperties: { 'data-citation': m[1] } }
    })
    last = m.index + m[0].length
  }
  if (last < value.length) out.push({ type: 'text', value: value.slice(last) })
  return out
}

// Walk the tree, replacing text nodes that contain markers. Skips the subtrees
// where a bracketed number is meaningful as literal text rather than a citation:
// code spans, code blocks, and link labels (whose [..] is markdown syntax).
const SKIP = new Set(['code', 'inlineCode', 'link', 'linkReference', 'definition'])

export function transformCitations(node: MdNode): void {
  const kids = node.children
  if (!Array.isArray(kids)) return
  for (let i = 0; i < kids.length; i++) {
    const child = kids[i]
    if (SKIP.has(child.type)) continue
    if (child.type === 'text' && typeof child.value === 'string') {
      const parts = splitCitations(child.value)
      if (parts) {
        kids.splice(i, 1, ...parts)
        i += parts.length - 1
      }
      continue
    }
    transformCitations(child)
  }
}

export default function remarkCitations() {
  return (tree: MdNode): void => transformCitations(tree)
}

// ── Which sources the answer actually rests on ──────────────────────────────
//
// Retrieval is not grounding. The server retrieves on every message and hands
// back what it found; whether the answer USED any of it is a different question,
// and the honest signal for that is the [n] markers the model wrote. An answer
// reading "I don't have Ryan's email address in your canvas" cited nothing, and
// must therefore show no citation chips — even though six documents were pulled
// to establish that. The retrieved set still shows in the (ephemeral) trace.
//
// Markers are counted off the raw markdown rather than the parsed tree, because
// the chip row is derived before render. The regions stripped below are exactly
// the ones the plugin's SKIP set drops, so the two agree on every marker: strip
// less and a chip appears under a claim that never cites it; strip more and a
// real citation silently loses its chip.
//
// The SKIP set is matched against what remark-parse ACTUALLY produces, verified
// against the parser rather than assumed. Two cases are easy to get wrong:
//   • `[label][1]` with no matching definition stays plain text — remark only
//     builds a linkReference when a definition exists — so the renderer DOES
//     chip that [1], and stripping it here would hide a real citation. It is
//     deliberately left in.
//   • `[1]: https://example.com` on its own line IS parsed as a `definition`,
//     which the plugin skips, so it is stripped here.

// Fenced code blocks (``` or ~~~), including unterminated ones at end of input.
const FENCE = /^([ \t]*)(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:\n[ \t]*\2[^\n]*|$)/gm
// Inline code spans — one or more backticks, matched by run length.
const INLINE_CODE = /(`+)[^`]*?\1/g
// A markdown link or image label: the [..] there is syntax, not a citation.
const LINK_LABEL = /!?\[[^\]]*\]\(/g
// A link definition line — parsed as `definition`, which the plugin skips.
const REF_DEF = /^[ \t]{0,3}\[[^\]]*\]:[^\n]*$/gm
// A line indented four spaces or a tab is a code block in markdown.
const INDENTED_CODE = /^(?: {4}|\t)[^\n]*$/gm

function stripNonCitationRegions(markdown: string): string {
  return markdown
    .replace(FENCE, '')
    .replace(INDENTED_CODE, '')
    .replace(INLINE_CODE, '')
    .replace(REF_DEF, '')
    .replace(LINK_LABEL, '(')
}

// Every citation number the prose actually uses, as written. Numbers that don't
// correspond to a retrieved source are the caller's problem to filter — this
// reports what the text says, nothing more.
export function citedNumbers(markdown: string): Set<number> {
  const out = new Set<number>()
  if (!markdown) return out
  const text = stripNonCitationRegions(markdown)
  MARKER.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = MARKER.exec(text)) !== null) out.add(Number(m[1]))
  MARKER.lastIndex = 0
  return out
}
