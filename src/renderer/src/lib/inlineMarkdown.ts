// A tiny inline-markdown tokenizer for the card body (and any other lightweight
// rich surface). It recognises **bold**, *italic*, [text](url) links, and bare
// http(s) URLs, and returns a flat token list the component renders to JSX.
// Deliberately small: no nesting, no block constructs. Kept pure so it is
// unit-testable away from React.

export type InlineToken =
  | { type: 'text'; value: string }
  | { type: 'bold'; value: string }
  | { type: 'italic'; value: string }
  | { type: 'link'; text: string; href: string }

// One combined matcher, tried left to right at each position. Order inside the
// alternation matters: markdown links before bare URLs, bold (**) before
// italic (*) so "**x**" is not read as two italics.
const TOKEN_RE =
  /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|\*\*([^*]+?)\*\*|\*([^*]+?)\*|(https?:\/\/[^\s)]+)/g

export function parseInline(input: string): InlineToken[] {
  const tokens: InlineToken[] = []
  let last = 0
  let m: RegExpExecArray | null
  TOKEN_RE.lastIndex = 0
  while ((m = TOKEN_RE.exec(input)) !== null) {
    if (m.index > last) tokens.push({ type: 'text', value: input.slice(last, m.index) })
    if (m[1] !== undefined && m[2] !== undefined) {
      tokens.push({ type: 'link', text: m[1], href: m[2] })
    } else if (m[3] !== undefined) {
      tokens.push({ type: 'bold', value: m[3] })
    } else if (m[4] !== undefined) {
      tokens.push({ type: 'italic', value: m[4] })
    } else if (m[5] !== undefined) {
      tokens.push({ type: 'link', text: m[5], href: m[5] })
    }
    last = m.index + m[0].length
  }
  if (last < input.length) tokens.push({ type: 'text', value: input.slice(last) })
  return tokens
}
