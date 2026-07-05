// Gather the live text the user has open on the canvas — browser pages, docs,
// notes, PDFs — so the assistant can act on it (e.g. "add the events from this
// booking page to my calendar"). Browser/pdf/gdoc widgets are read live from
// their <webview> (authenticated, rendered text); native text widgets read their
// stored body. Bounded so a huge page can't flood the request. No fabrication:
// only real gathered text is returned; a widget we can't read is skipped.

import type { ChatAttachment, Widget, WidgetKind } from '@shared/types'
import { useWidgetStore } from '../stores/widgets'
import { extractWebviewText } from './webviewRegistry'

// Widget kinds rendered in a <webview> (their text lives in the guest page).
const WEBVIEW_KINDS = new Set<WidgetKind>(['webview', 'pdf', 'gdoc', 'gsheet', 'gslide', 'email'])
// Native text widgets whose body we can read directly.
const TEXT_KINDS = new Set<WidgetKind>(['note', 'sticky', 'markdown', 'page', 'living-doc', 'card', 'custom-block'])

const MAX_WIDGETS = 6
const PER_WIDGET = 8000

// Pull readable plain text out of a native text widget's stored content, which
// may be plain text, HTML, or a Tiptap/ProseMirror JSON document.
function plainTextFromContent(content: string | null | undefined): string {
  const raw = (content ?? '').trim()
  if (!raw) return ''
  if (raw.startsWith('{') || raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw)
      const parts: string[] = []
      const walk = (n: unknown): void => {
        if (!n || typeof n !== 'object') return
        const node = n as { text?: unknown; content?: unknown; type?: unknown }
        if (typeof node.text === 'string') parts.push(node.text)
        if (Array.isArray(node.content)) node.content.forEach(walk)
      }
      walk(parsed)
      if (parts.length) return parts.join(' ').replace(/\s+/g, ' ').trim()
    } catch {
      // fall through to tag-strip
    }
  }
  // HTML or plain — strip tags, collapse whitespace.
  return raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Order widgets so the FOCUSED one (what the user is looking at) comes first,
// then browser/pdf/doc widgets, capped. Only widgets on the active task.
export async function gatherCanvasAttachments(taskId: string | null): Promise<ChatAttachment[]> {
  const state = useWidgetStore.getState()
  const focusedId = state.focusedWidgetId
  const all = state.widgets.filter((w) => (taskId ? w.taskId === taskId : true))
  const readable = all.filter((w) => WEBVIEW_KINDS.has(w.kind) || TEXT_KINDS.has(w.kind))
  readable.sort((a, b) => {
    if (a.id === focusedId) return -1
    if (b.id === focusedId) return 1
    return 0
  })

  const out: ChatAttachment[] = []
  for (const w of readable.slice(0, MAX_WIDGETS)) {
    const text = await textForWidget(w)
    if (!text) continue
    out.push({
      widgetId: w.id,
      kind: labelForKind(w.kind),
      title: w.title || '',
      source: WEBVIEW_KINDS.has(w.kind) ? w.content || undefined : undefined,
      text: text.slice(0, PER_WIDGET)
    })
  }
  return out
}

async function textForWidget(w: Widget): Promise<string> {
  if (WEBVIEW_KINDS.has(w.kind)) {
    const live = await extractWebviewText(w.id)
    return live ?? ''
  }
  return plainTextFromContent(w.content)
}

function labelForKind(kind: WidgetKind): string {
  switch (kind) {
    case 'webview':
      return 'browser page'
    case 'pdf':
      return 'PDF'
    case 'gdoc':
      return 'Google Doc'
    case 'gsheet':
      return 'Google Sheet'
    case 'gslide':
      return 'Google Slides'
    case 'email':
      return 'email'
    case 'page':
    case 'living-doc':
      return 'document'
    default:
      return 'note'
  }
}
