import { getTable, listRows } from '../db/tables'
import { getDocument } from '../db/documents'
import type { Widget } from '@shared/types'
import { widgetToText, docBodyToText, type WidgetTextResolvers } from '@shared/widgetText'

// Main-process resolvers for the shared widget extractor: a table widget's rows
// come from the DB, an office widget's body is fetched and turned into text with
// the shared office-body extractor. This is what lets the desk agent and the
// assistant prompt finally read tables and office documents, not just their ids.
export function mainWidgetResolvers(): WidgetTextResolvers {
  return {
    table: (id) => {
      const t = getTable(id)
      if (!t) return null
      return {
        title: t.title,
        columns: t.schema.columns.map((c) => ({ id: c.id, label: c.label, type: c.type })),
        rows: listRows(id).map((r) => r.cells)
      }
    },
    docText: (id) => {
      const d = getDocument(id)
      if (!d) return null
      return docBodyToText(d.docType, d.body)
    }
  }
}

// Shared, synchronous per-widget summariser. Used for resolving a single agent
// input and for aggregating a whole desk behind a portal. Network-free: a
// browser contributes its URL + title here (a deep page read happens when a
// browser is wired directly into an agent, via the live webview in agentInputs).
export function summariseWidget(w: Widget): string {
  return widgetToText(w, mainWidgetResolvers()).text
}
