import type { Widget } from '@shared/types'

// Format-aware delivery. When a wire or a desk agent pushes text into a linked
// widget, the text must land in the SHAPE that widget kind stores — otherwise a
// card shows raw JSON-less text, a page shows nothing, a field breaks. This maps
// a piece of text into the right content for the target so linked items update
// cleanly. (Tables are handled separately via the table AI build — their content
// is a table id, not text.)

function safeParse<T>(s: string | undefined | null): T | null {
  if (!s) return null
  try {
    return JSON.parse(s) as T
  } catch {
    return null
  }
}

interface TiptapNode {
  type: string
  attrs?: Record<string, unknown>
  content?: TiptapNode[]
  text?: string
}

// Minimal, robust text/markdown → Tiptap document. Headings (#, ##, ###),
// bullet lists (-, *) and paragraphs; everything else is a paragraph. Always
// returns a valid doc so the page editor never chokes.
function textToTiptap(text: string): string {
  const out: TiptapNode[] = []
  let list: TiptapNode[] | null = null
  const flush = (): void => {
    if (list && list.length) out.push({ type: 'bulletList', content: list })
    list = null
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '')
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line)
    if (bullet) {
      ;(list ??= []).push({
        type: 'listItem',
        content: [
          { type: 'paragraph', content: bullet[1] ? [{ type: 'text', text: bullet[1] }] : [] }
        ]
      })
      continue
    }
    flush()
    const heading = /^(#{1,3})\s+(.*)$/.exec(line)
    if (heading) {
      out.push({
        type: 'heading',
        attrs: { level: heading[1].length },
        content: [{ type: 'text', text: heading[2] }]
      })
      continue
    }
    out.push({ type: 'paragraph', content: line ? [{ type: 'text', text: line }] : [] })
  }
  flush()
  if (out.length === 0) out.push({ type: 'paragraph' })
  return JSON.stringify({ type: 'doc', content: out })
}

// Returns the content string to write into `target` for the given text. Returns
// null to mean "leave it as-is, deliver the text unchanged" for plain-text kinds.
export function coerceToWidgetContent(target: Widget, text: string): string {
  switch (target.kind) {
    case 'card': {
      const prev = safeParse<{ accent?: string }>(target.content)
      const lines = text.split(/\r?\n/)
      const firstNonEmpty = lines.find((l) => l.trim()) ?? ''
      const title = firstNonEmpty.replace(/^#+\s*/, '').replace(/^[-*]\s*/, '').slice(0, 100)
      const bodyStart = lines.indexOf(firstNonEmpty) + 1
      const body = lines.slice(bodyStart).join('\n').trim()
      return JSON.stringify({
        title: title || 'Note',
        body: body || (title ? '' : text),
        accent: prev?.accent ?? '#6366f1'
      })
    }
    case 'page':
      return textToTiptap(text)
    case 'field': {
      // Keep the field's definition; set its value to the text.
      const prev = safeParse<{ def?: unknown; value?: unknown }>(target.content)
      if (prev?.def) return JSON.stringify({ def: prev.def, value: text })
      return text
    }
    // sticky / note / markdown and anything else: plain text is the right shape.
    default:
      return text
  }
}
