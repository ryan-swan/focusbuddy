// Gather the deep, full-text content the user has open on the canvas so the
// assistant can act on it (e.g. "add the events from this booking page to my
// calendar"). This is the rich channel: full text for the focused widget and a
// few others, capped so a huge page cannot flood the request. The assistant's
// prompt separately carries a shorter summary of every widget. Both now go
// through the one shared extractor (src/shared/widgetText.ts), so coverage is
// identical everywhere and every data-bearing widget kind is readable, not just
// notes and browsers. No fabrication: a widget we cannot read is skipped.

import type { ChatAttachment, WidgetKind, WidgetLink } from '@shared/types'
import { useWidgetStore } from '../stores/widgets'
import { useTablesStore } from '../stores/tables'
import { useLinksStore } from '../stores/links'
import { extractWebviewText } from './webviewRegistry'
import {
  widgetToText,
  contentToPlainText,
  docBodyToText,
  type WidgetTextResolvers,
  type ResolvedTable
} from '@shared/widgetText'

const WEBVIEW_KINDS = new Set<WidgetKind>(['webview', 'pdf', 'gdoc', 'gsheet', 'gslide', 'email'])
const OFFICE_KINDS = new Set<WidgetKind>(['doc', 'sheet', 'slides', 'map', 'design'])

// Kinds worth sending as a FULL-text attachment (the deep channel). Chrome-only
// kinds (section, minimap, timers, colours) are excluded here; they still appear
// in the assistant's prompt summary via the same extractor.
const ATTACH_KINDS = new Set<WidgetKind>([
  'note', 'sticky', 'markdown', 'page', 'living-doc', 'card', 'custom-block',
  'webview', 'pdf', 'gdoc', 'gsheet', 'gslide', 'email',
  'doc', 'sheet', 'slides', 'map', 'design',
  'table', 'chart', 'diagram', 'mindmap', 'agent', 'field'
])

const MAX_WIDGETS = 8
const PER_WIDGET = 8000

// Re-exported so other renderer code keeps a single plaintext implementation.
export { contentToPlainText as plainTextFromContent }

// The human relationship a wire expresses, from the focused widget's point of
// view. Used to label linked attachments so the assistant knows WHY a widget is
// included, not just that it is.
function wireRelationship(link: WidgetLink): string {
  if (link.type === 'transform') return link.verb ? `feeds (${link.verb}) into` : 'transforms into'
  if (link.type === 'mirror') return 'mirrors'
  return 'is linked as context to'
}

export async function gatherCanvasAttachments(taskId: string | null): Promise<ChatAttachment[]> {
  const state = useWidgetStore.getState()
  const focusedId = state.focusedWidgetId
  const all = state.widgets.filter((w) => (taskId ? w.taskId === taskId : true))
  const candidates = all.filter((w) => ATTACH_KINDS.has(w.kind))

  // Link-aware selection: when a widget is focused, the widgets wired to it
  // (either direction, enabled links) are pulled in as context even if they
  // would not otherwise make the position-based cut. This is what makes "ask
  // about this, and its linked spec/notes come too" actually work. Each linked
  // widget is annotated with the relationship so the model uses it correctly.
  const links = useLinksStore.getState().links.filter((l) => l.enabled !== false)
  const linkedRel = new Map<string, string>()
  if (focusedId) {
    for (const l of links) {
      if (l.sourceWidgetId === focusedId) linkedRel.set(l.targetWidgetId, wireRelationship(l))
      else if (l.targetWidgetId === focusedId) linkedRel.set(l.sourceWidgetId, wireRelationship(l))
    }
  }

  // Order: focused first, then widgets linked to it, then the rest.
  const rank = (w: { id: string }): number => (w.id === focusedId ? 0 : linkedRel.has(w.id) ? 1 : 2)
  candidates.sort((a, b) => rank(a) - rank(b))
  const chosen = candidates.slice(0, MAX_WIDGETS)

  // Pre-load the async sources (live pages, table rows, office bodies) for the
  // chosen widgets, then hand the shared extractor synchronous resolvers.
  const liveText = new Map<string, string>()
  const tableCache = new Map<string, ResolvedTable | null>()
  const docCache = new Map<string, string | null>()
  const tables = useTablesStore.getState()

  const loadTable = async (tableId: string): Promise<void> => {
    if (tableCache.has(tableId)) return
    try {
      const tbl = await tables.ensureTableLoaded(tableId)
      const rows = await tables.ensureRowsLoaded(tableId)
      tableCache.set(
        tableId,
        tbl
          ? {
              title: tbl.title,
              columns: tbl.schema.columns.map((c) => ({ id: c.id, label: c.label, type: c.type })),
              rows: rows.map((r) => r.cells)
            }
          : null
      )
    } catch {
      tableCache.set(tableId, null)
    }
  }

  await Promise.all(
    chosen.map(async (w) => {
      if (WEBVIEW_KINDS.has(w.kind)) {
        const t = await extractWebviewText(w.id)
        if (t) liveText.set(w.id, t)
      } else if (w.kind === 'table' && w.content) {
        await loadTable(w.content)
      } else if (w.kind === 'chart' && w.content) {
        try {
          const cfg = JSON.parse(w.content) as { tableId?: string | null }
          if (cfg.tableId) await loadTable(cfg.tableId)
        } catch {
          // ignore malformed chart config
        }
      } else if (OFFICE_KINDS.has(w.kind) && w.content) {
        try {
          const d = await window.api.documents.get(w.content)
          docCache.set(w.content, d ? docBodyToText(d.docType, d.body) : null)
        } catch {
          docCache.set(w.content, null)
        }
      }
    })
  )

  const resolvers: WidgetTextResolvers = {
    table: (id) => tableCache.get(id) ?? null,
    docText: (id) => docCache.get(id) ?? null,
    liveText: (id) => liveText.get(id) ?? null
  }

  const out: ChatAttachment[] = []
  for (const w of chosen) {
    // A browser with no readable live page contributes nothing useful; skip
    // rather than attach a bare URL.
    if (WEBVIEW_KINDS.has(w.kind) && !liveText.has(w.id)) continue
    const r = widgetToText(w, resolvers)
    let text = (r.text ?? '').trim()
    // Skip empty widgets and pure placeholders like "(empty document)".
    if (!text || /^\(.*\)$/.test(text)) continue
    const rel = linkedRel.get(w.id)
    if (rel) text = `[This widget ${rel} the item you are focused on]\n${text}`
    out.push({
      widgetId: w.id,
      kind: labelForKind(w.kind),
      title: w.title || '',
      source: r.source,
      text: text.slice(0, PER_WIDGET)
    })
  }
  return out
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
    case 'doc':
      return 'document'
    case 'sheet':
      return 'spreadsheet'
    case 'slides':
      return 'slides'
    case 'map':
      return 'diagram'
    case 'table':
      return 'table'
    case 'chart':
      return 'chart'
    case 'diagram':
      return 'diagram'
    case 'mindmap':
      return 'mind map'
    case 'agent':
      return 'desk agent'
    case 'field':
      return 'field'
    default:
      return 'note'
  }
}
