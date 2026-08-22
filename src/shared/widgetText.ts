// One shared widget-to-text extractor, used by every AI surface so "what the
// assistant can read" is identical no matter which path assembles the context.
// Before this, three separate extractors (the desk assistant's attachments, the
// assistant's prompt summary, and the desk agent's inputs) each covered a
// different, narrow set of widget kinds, which is why the AI could read some
// tools and not others. This module is the single source of truth.
//
// It is deliberately synchronous and pure. Anything that needs IO (a table's
// rows, an office document's body, a live browser page) is supplied by the
// caller through resolvers, so the same logic runs in the main process (backed
// by the DB) and in the renderer (backed by the stores and the live webview).
// It never fabricates: a widget it cannot read yields an honest short label, not
// invented content.

import type { Widget, WidgetKind } from './types'

// The widget kinds whose content is worth carrying as a FULL-text attachment —
// the deep channel every AI surface shares. Chrome-only kinds (sections,
// minimaps, timers, colour chips) are excluded: they render UI, not content.
// Lives here beside the extractor so "what can ride a request" and "what can be
// read" stay one list — the renderer's attachment gathering and the assistant's
// click-to-pin rule both consume it.
export const ATTACHABLE_WIDGET_KINDS: ReadonlySet<WidgetKind> = new Set<WidgetKind>([
  'note', 'sticky', 'markdown', 'page', 'living-doc', 'card', 'custom-block',
  'webview', 'pdf', 'gdoc', 'gsheet', 'gslide', 'email',
  'doc', 'sheet', 'slides', 'map', 'design',
  'table', 'chart', 'diagram', 'mindmap', 'agent', 'field'
])

// A table reduced to the shape the summariser needs. The caller adapts its own
// table source (main getTable/listRows, renderer store) into this.
export interface ResolvedTable {
  title?: string
  columns: Array<{ id: string; label: string; type?: string }>
  rows: Array<Record<string, unknown>>
}

export interface WidgetTextResolvers {
  // A table widget's content is a table id; resolve it to columns + rows.
  table?: (tableId: string) => ResolvedTable | null
  // An office widget's content is a document id; resolve it to plain text.
  docText?: (docId: string) => string | null
  // A live browser/pdf/doc webview's rendered page text, when the caller has it.
  liveText?: (widgetId: string) => string | null
}

export interface WidgetText {
  kind: WidgetKind
  title: string
  text: string
  // For webview-family widgets, the URL, surfaced separately so a caller can
  // show it as the source of the attachment.
  source?: string
}

const MAX_TABLE_ROWS = 40
const MAX_MINDMAP_NODES = 200

// Collapse runs of whitespace; trim. Keeps single newlines out of the way for
// the compact prompt paths while leaving the text intact for the full paths.
function squash(s: string): string {
  return s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

// Recursively pull text out of a Tiptap/ProseMirror node tree. Adds a newline
// after block nodes so paragraphs and headings do not run together. Shared by
// both processes (previously main and renderer had two divergent copies).
export function tiptapToText(node: unknown): string {
  if (!node || typeof node !== 'object') return ''
  const n = node as { type?: unknown; text?: unknown; content?: unknown }
  let out = ''
  if (typeof n.text === 'string') out += n.text
  if (Array.isArray(n.content)) {
    for (const child of n.content) out += tiptapToText(child)
  }
  if (n.type === 'paragraph' || n.type === 'heading' || n.type === 'listItem') out += '\n'
  return out
}

// Turn a stored string that may be Tiptap JSON, HTML, or plain text into plain
// text. This is the single implementation both sides now use.
export function contentToPlainText(content: string | null | undefined): string {
  const raw = (content ?? '').trim()
  if (!raw) return ''
  if (raw.startsWith('{') || raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw)
      const walked = tiptapToText(parsed)
      if (walked.trim()) return squash(walked)
    } catch {
      // fall through to tag-strip
    }
  }
  return squash(raw.replace(/<[^>]+>/g, ' '))
}

// Turn a parsed office-document body into plain text. Covers doc, sheet (both
// the V2 { sheets: [...] } shape and the legacy V1 { columns, rows } shape),
// slides, and map. Design bodies fall back to any element text. Mirrors and
// extends the main-only extractDocText so office widgets are finally readable in
// every AI surface, not just the workspace search.
export function docBodyToText(docType: string, body: unknown): string {
  if (!body || typeof body !== 'object') return ''
  const b = body as Record<string, unknown>
  if (docType === 'doc') {
    return squash(tiptapToText(b.doc ?? b)).slice(0, 12000)
  }
  if (docType === 'sheet') {
    const tabs = Array.isArray(b.sheets)
      ? (b.sheets as Array<{ name?: string; columns?: string[]; rows?: string[][] }>)
      : // Legacy V1: columns + rows at the top level.
        [{ columns: b.columns as string[] | undefined, rows: b.rows as string[][] | undefined }]
    const parts: string[] = []
    for (const tab of tabs) {
      if (tab?.name) parts.push(String(tab.name))
      if (Array.isArray(tab?.columns)) parts.push(tab.columns.join(' | '))
      if (Array.isArray(tab?.rows)) {
        for (const row of tab.rows.slice(0, 200)) parts.push(row.join(' | '))
      }
    }
    return squash(parts.join('\n')).slice(0, 12000)
  }
  if (docType === 'slides') {
    const slides = Array.isArray(b.slides) ? (b.slides as Array<Record<string, unknown>>) : []
    const parts: string[] = []
    slides.forEach((slide, i) => {
      const els = Array.isArray(slide.elements) ? (slide.elements as Array<Record<string, unknown>>) : []
      const texts: string[] = []
      for (const el of els) {
        if (el.type !== 'text') continue
        const paras = Array.isArray(el.paragraphs) ? (el.paragraphs as Array<Record<string, unknown>>) : []
        for (const p of paras) {
          const runs = Array.isArray(p.runs) ? (p.runs as Array<{ text?: unknown }>) : []
          texts.push(runs.map((r) => (typeof r.text === 'string' ? r.text : '')).join(''))
        }
      }
      const notes = typeof slide.notes === 'string' ? slide.notes : ''
      const chunk = [texts.join('\n'), notes].filter(Boolean).join('\n')
      if (chunk.trim()) parts.push(`Slide ${i + 1}: ${chunk}`)
    })
    return squash(parts.join('\n')).slice(0, 12000)
  }
  if (docType === 'map') {
    const nodes = Array.isArray(b.nodes) ? (b.nodes as Array<Record<string, unknown>>) : []
    const edges = Array.isArray(b.edges) ? (b.edges as Array<Record<string, unknown>>) : []
    const labels = nodes
      .map((n) => {
        const data = (n.data as Record<string, unknown> | undefined) ?? {}
        return String(data.label ?? n.label ?? '')
      })
      .filter(Boolean)
    const out = [`Diagram with ${nodes.length} nodes, ${edges.length} connections`, labels.join(', ')]
    return squash(out.join('\n')).slice(0, 12000)
  }
  // design or unknown: best-effort element text.
  const els = Array.isArray(b.elements) ? (b.elements as Array<Record<string, unknown>>) : []
  const txt = els.map((e) => (typeof e.text === 'string' ? e.text : '')).filter(Boolean).join('\n')
  return squash(txt).slice(0, 12000)
}

function safeParse<T>(raw: string | null | undefined): T | null {
  try {
    return JSON.parse(raw || 'null') as T
  } catch {
    return null
  }
}

function tableToText(t: ResolvedTable): string {
  const header = t.columns.map((c) => c.label).join(' | ')
  const rows = t.rows
    .slice(0, MAX_TABLE_ROWS)
    .map((r) => t.columns.map((c) => String(r[c.id] ?? '')).join(' | '))
  const title = t.title ? `Table "${t.title}"` : 'Table'
  const more = t.rows.length > MAX_TABLE_ROWS ? `\n(+${t.rows.length - MAX_TABLE_ROWS} more rows)` : ''
  return [title, header, ...rows].join('\n') + more
}

function mindmapText(root: unknown): string {
  const labels: string[] = []
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object' || labels.length >= MAX_MINDMAP_NODES) return
    const n = node as { label?: unknown; children?: unknown }
    if (typeof n.label === 'string' && n.label.trim()) labels.push(n.label.trim())
    if (Array.isArray(n.children)) n.children.forEach(walk)
  }
  walk(root)
  return labels.join('\n')
}

// The core switch. Returns readable text for any widget kind. The `text` may be
// long; callers cap it to their own budget.
export function widgetToText(w: Widget, r: WidgetTextResolvers = {}): WidgetText {
  const base = { kind: w.kind, title: w.title ?? '' }
  const raw = w.content ?? ''

  switch (w.kind) {
    case 'sticky':
    case 'note':
    case 'markdown':
      return { ...base, text: squash(raw) }

    case 'page':
    case 'living-doc':
      return { ...base, text: contentToPlainText(raw) }

    case 'card': {
      const p = safeParse<{ title?: string; body?: string }>(raw)
      if (p) return { ...base, text: squash([p.title ?? '', p.body ?? ''].filter(Boolean).join('\n')) }
      return { ...base, text: squash(raw) }
    }

    case 'custom-block': {
      const p = safeParse<{ title?: string; fields?: Array<{ label?: string; value?: unknown; type?: string }> }>(raw)
      if (p) {
        const parts = [p.title ?? '']
        for (const f of p.fields ?? []) {
          if (f.type === 'heading' || f.type === 'divider') continue
          parts.push(`${f.label ?? ''}: ${String(f.value ?? '')}`.trim())
        }
        return { ...base, text: squash(parts.filter(Boolean).join('\n')) }
      }
      return { ...base, text: contentToPlainText(raw) }
    }

    case 'table': {
      const t = raw && r.table ? r.table(raw) : null
      return { ...base, text: t ? tableToText(t) : raw ? '(table)' : '(empty table)' }
    }

    case 'field': {
      const p = safeParse<{ def?: { label?: string }; value?: unknown }>(raw)
      if (p) return { ...base, text: `${p.def?.label ?? 'Field'}: ${JSON.stringify(p.value ?? '')}` }
      return { ...base, text: squash(raw) }
    }

    case 'agent': {
      const p = safeParse<{ instruction?: string; lastOutput?: string }>(raw)
      if (p) {
        const parts = [
          p.instruction ? `Agent instruction: ${p.instruction}` : '',
          p.lastOutput ? `Latest output: ${p.lastOutput}` : ''
        ].filter(Boolean)
        return { ...base, text: squash(parts.join('\n')) }
      }
      return { ...base, text: '' }
    }

    case 'webview':
    case 'pdf':
    case 'gdoc':
    case 'gsheet':
    case 'gslide':
    case 'email': {
      const live = r.liveText ? r.liveText(w.id) : null
      const url = raw || '(no URL)'
      const text = live && live.trim() ? live : w.title ? `${w.title} (${url})` : url
      return { ...base, text, source: raw || undefined }
    }

    case 'doc':
    case 'sheet':
    case 'slides':
    case 'map':
    // Design was listed as attachable but had no case, so it fell to the
    // default placeholder both consumers reject — permanently unreadable
    // (defect #10). Its content is a document id exactly like the other
    // office kinds; the docText resolver's design branch reads element text.
    case 'design': {
      const docText = raw && r.docText ? r.docText(raw) : null
      return { ...base, text: docText && docText.trim() ? docText : '(empty document)' }
    }

    case 'chart': {
      const p = safeParse<{
        type?: string
        title?: string
        tableId?: string | null
        series?: Array<{ columnId?: string; agg?: string; label?: string }>
      }>(raw)
      if (p) {
        const series = (p.series ?? []).map((s) => `${s.label ?? s.columnId ?? '?'} (${s.agg ?? 'sum'})`).join(', ')
        const src = p.tableId && r.table ? r.table(p.tableId) : null
        const dataNote = src ? ` over ${src.rows.length} rows of ${src.title ?? 'a table'}` : ''
        return { ...base, text: squash(`${p.type ?? 'chart'} chart${p.title ? ` "${p.title}"` : ''}: ${series}${dataNote}`) }
      }
      return { ...base, text: '(chart)' }
    }

    case 'diagram': {
      const p = safeParse<{ nodes?: Array<{ data?: { label?: string } }>; edges?: unknown[] }>(raw)
      if (p) {
        const labels = (p.nodes ?? []).map((n) => n.data?.label ?? '').filter(Boolean)
        return {
          ...base,
          text: squash(`Diagram: ${labels.length} shapes, ${(p.edges ?? []).length} connections\n${labels.join(', ')}`)
        }
      }
      return { ...base, text: '(diagram)' }
    }

    case 'mindmap': {
      const p = safeParse<{ root?: unknown }>(raw)
      const text = p?.root ? mindmapText(p.root) : ''
      return { ...base, text: text ? `Mind map:\n${text}` : '(empty mind map)' }
    }

    case 'scratchpad': {
      const p = safeParse<{ strokes?: unknown[] }>(raw)
      return { ...base, text: `(freehand drawing, ${p?.strokes?.length ?? 0} strokes)` }
    }

    case 'portal': {
      const p = safeParse<{ targetTaskId?: string | null }>(raw)
      return { ...base, text: p?.targetTaskId ? `(portal to desk ${p.targetTaskId})` : '(portal, no target)' }
    }

    case 'task-link':
      return { ...base, text: raw ? `(link to task ${raw.trim()})` : '(task link, no target)' }

    case 'file':
    case 'image':
      return { ...base, text: raw ? `File/link: ${raw}` : '(empty file)' }

    case 'calculator':
      return { ...base, text: raw ? `Calculator: ${raw}` : '(calculator)' }

    case 'color':
      return { ...base, text: raw ? `Colour ${raw}` : '(colour swatch)' }

    case 'timer': {
      const p = safeParse<{ targetSec?: number; state?: string }>(raw)
      return { ...base, text: p ? `Timer ${p.targetSec ?? 0}s (${p.state ?? 'idle'})` : '(timer)' }
    }

    case 'chat-thread': {
      const p = safeParse<{ channelName?: string }>(raw)
      return { ...base, text: p?.channelName ? `Chat thread: ${p.channelName}` : '(chat thread)' }
    }

    case 'streamdeck': {
      const p = safeParse<{ taskDeck?: { pages?: Record<string, { buttons?: Record<string, { label?: string }> }> } }>(raw)
      const labels: string[] = []
      const pages = p?.taskDeck?.pages ?? {}
      for (const page of Object.values(pages)) {
        for (const btn of Object.values(page.buttons ?? {})) if (btn?.label) labels.push(btn.label)
      }
      return { ...base, text: labels.length ? `Stream Deck: ${labels.join(', ')}` : '(stream deck)' }
    }

    default:
      // video, drive, voice-recorder, local-app-launcher, section, minimap,
      // shape: no meaningful text; return the title or a short label rather than
      // dumping raw JSON into the prompt.
      return { ...base, text: w.title ? `(${w.kind}: ${w.title})` : `(${w.kind})` }
  }
}
