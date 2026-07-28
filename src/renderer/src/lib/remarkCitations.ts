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
