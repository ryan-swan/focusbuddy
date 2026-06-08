import type { Widget } from '@shared/types'
import { coerceCellValue } from './actionExecutor'

// Format-aware delivery. When a wire or a desk agent pushes text into a linked
// widget, the text must land in the SHAPE that widget kind stores — otherwise a
// card shows nothing useful, a page is blank, and (worse) a structured widget
// like another agent, a timer or a mindmap gets its JSON config overwritten by
// raw text and breaks.
//
// coerceToWidgetContent returns:
//   - a string  → write this as the target's new content
//   - null      → SKIP delivery (don't overwrite — text isn't meaningful here)
//
// Tables are handled separately by the table AI build (their content is an id).

function safeParse<T>(s: string | undefined | null): T | null {
  if (!s) return null
  try {
    return JSON.parse(s) as T
  } catch {
    return null
  }
}

function firstLine(text: string): string {
  return (text.split(/\r?\n/).find((l) => l.trim()) ?? '').trim()
}

function looksLikeUrl(text: string): string | null {
  const t = text.trim().split(/\s+/)[0] ?? ''
  if (/^https?:\/\/\S+$/i.test(t)) return t
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(t)) return `https://${t}`
  return null
}

interface TiptapNode {
  type: string
  attrs?: Record<string, unknown>
  content?: TiptapNode[]
  text?: string
}

// Minimal, robust text/markdown → Tiptap document. Always returns a valid doc.
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

// Text outline → mindmap: first line is the root, the rest become children.
function textToMindmap(text: string): string | null {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s>#*-]+/, '').trim())
    .filter(Boolean)
  if (lines.length === 0) return null
  const root = {
    id: 'root',
    label: lines[0].slice(0, 120),
    kind: 'idea',
    children: lines.slice(1, 25).map((l, i) => ({
      id: `n-${i}`,
      label: l.slice(0, 120),
      kind: 'idea',
      children: []
    }))
  }
  return JSON.stringify({ root })
}

export function coerceToWidgetContent(target: Widget, text: string): string | null {
  switch (target.kind) {
    // ── Plain-text widgets: text IS the content ──────────────────────────────
    case 'sticky':
    case 'note':
    case 'markdown':
      return text

    // ── Structured widgets with a sensible text mapping ──────────────────────
    case 'card': {
      const prev = safeParse<{ accent?: string }>(target.content)
      const lines = text.split(/\r?\n/)
      const head = lines.find((l) => l.trim()) ?? ''
      const title = head.replace(/^#+\s*/, '').replace(/^[-*]\s*/, '').slice(0, 100)
      const body = lines.slice(lines.indexOf(head) + 1).join('\n').trim()
      return JSON.stringify({
        title: title || 'Note',
        body: body || (title ? '' : text),
        accent: prev?.accent ?? '#6366f1'
      })
    }
    case 'page':
      return textToTiptap(text)
    case 'mindmap':
      return textToMindmap(text)
    case 'shape': {
      // Set the shape's label; keep its look. (No look yet → skip, a label-less
      // shape change isn't meaningful.)
      const prev = safeParse<Record<string, unknown>>(target.content)
      if (!prev) return null
      return JSON.stringify({ ...prev, label: firstLine(text).slice(0, 60) })
    }
    case 'field': {
      // Keep the field's definition, set its value COERCED to the field's type
      // (a number field gets a number, a checkbox gets a boolean, a date a
      // timestamp, a select an option id). Same coercion tables use. No def → skip.
      const prev = safeParse<{ def?: { type?: string; config?: unknown }; value?: unknown }>(
        target.content
      )
      if (!prev?.def) return null
      const value = coerceCellValue((prev.def.type as never) ?? 'text-short', text, prev.def.config as never)
      return JSON.stringify({ def: prev.def, value })
    }

    // ── URL-based widgets: only if the text is actually a URL ─────────────────
    case 'webview':
    case 'file':
    case 'image': {
      const url = looksLikeUrl(text)
      return url ?? null
    }

    // ── Everything else stores typed config we must NOT clobber with text ─────
    // (agent, portal, timer, color, calculator, streamdeck, diagram, scratchpad,
    //  custom-block, voice-recorder, task-link, local-app-launcher, section,
    //  minimap, table, gdoc/gsheet/gslide/email/pdf/video). An agent target, for
    //  example, reads its source as an INPUT — it must never have its config
    //  overwritten by a delivery.
    default:
      return null
  }
}
