import type { SheetBodyV1, SlidesBody, Widget } from '@shared/types'

// Fetching the bodies a public desk projection needs.
//
// Kept apart from the publisher hook so that converting a document to HTML --
// which needs the editor's whole extension tree to guarantee a round trip the
// editor can represent -- is loaded only when a desk actually contains one.

/**
 * Resolve the bodies a projection needs.
 *
 * The projection builder is pure and synchronous -- that is what makes the
 * disclosure rules testable -- so anything that requires IPC is fetched first
 * and read from a cache during the build. A widget whose body has not resolved
 * yet publishes as a placeholder rather than as empty content pretending to be
 * the real thing, and the next build after the warm pass carries it.
 */
export async function docHtmlFrom(
  body: unknown
): Promise<{ html: string; pageCount: number } | null> {
  try {
    // Loaded on demand: docToHtml drags in every editor extension, and a desk
    // of stickies should not pay for that.
    const [{ docToHtml }, { sanitizeHtml }] = await Promise.all([
      import('./docHtml'),
      import('./htmlSanitize')
    ])
    // Sanitised on the way out: this HTML is about to be public, and it is the
    // same sanitiser the editor trusts on the way in.
    const html = sanitizeHtml(docToHtml(body as never))
    return html ? { html, pageCount: 1 } : null
  } catch {
    return null
  }
}

export async function warmCache(widgets: Widget[], cache: Map<string, unknown>): Promise<boolean> {
  let learned = false
  const note = (key: string, value: unknown): void => {
    if (value != null && !cache.has(key)) {
      cache.set(key, value)
      learned = true
    }
  }

  for (const w of widgets) {
    const id = w.content
    if (!id) continue
    try {
      if (w.kind === 'table' && !cache.has(`t:${id}`)) {
        const [tbl, rows] = await Promise.all([
          window.api.tables.get(id),
          window.api.tables.listRows(id)
        ])
        if (tbl) {
          note(`t:${id}`, {
            columns: tbl.schema.columns.map((c) => ({ id: c.id, name: c.label, kind: c.type })),
            rows: rows.map((r) => ({
              id: r.id,
              cells: tbl.schema.columns.map((c) => {
                const v = (r.cells as Record<string, unknown>)[c.id]
                return v == null || typeof v === 'object' ? null : (v as string | number | boolean)
              })
            })),
            truncated: false
          })
        }
      } else if (w.kind === 'page' && !cache.has(`d:${id}`)) {
        // A page widget carries its Tiptap JSON inline rather than a document id.
        note(`d:${id}`, await docHtmlFrom(JSON.parse(id)))
      } else if ((w.kind === 'doc' || w.kind === 'living-doc') && !cache.has(`d:${id}`)) {
        const doc = await window.api.documents.get(id)
        if (doc && !doc.archived) note(`d:${id}`, await docHtmlFrom(doc.body))
      } else if (w.kind === 'sheet' && !cache.has(`t:${id}`)) {
        const doc = await window.api.documents.get(id)
        const body = doc?.body as SheetBodyV1 | undefined
        if (doc && !doc.archived && Array.isArray(body?.columns)) {
          note(`t:${id}`, {
            columns: body.columns.map((name, i) => ({ id: `c${i}`, name, kind: 'text' })),
            rows: (body.rows ?? []).map((cells, i) => ({ id: `r${i}`, cells })),
            truncated: false
          })
        }
      } else if (w.kind === 'slides' && !cache.has(`s:${id}`)) {
        const doc = await window.api.documents.get(id)
        const body = doc?.body as SlidesBody | undefined
        if (doc && !doc.archived && Array.isArray(body?.slides)) {
          note(`s:${id}`, {
            slides: body.slides.map((sl, i) => ({
              id: (sl as { id?: string }).id ?? `s${i}`,
              html: String((sl as { html?: string }).html ?? '')
            }))
          })
        }
      }
    } catch {
      // A body that will not load stays a placeholder. Never publish a guess.
    }
  }
  return learned
}

