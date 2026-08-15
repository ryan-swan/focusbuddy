// Serialize and parse a canvas (desk) so a whole board can live as a
// server-canonical "live document" of kind 'canvas' in the check-out
// collaboration system. The body carries the task's widgets (with inlined
// table data, via buildTaskSnapshot) plus the connector links between them, so
// a recipient can rebuild the entire board.
//
// This mirrors the one-off share path (lib/shareSnapshot.ts captures,
// lib/acceptShare.ts rebuilds) but targets LIVE collaboration: the body is the
// canonical state that the lock holder edits and everyone else mirrors, rather
// than a frozen copy. The signal server stores it as opaque JSON, exactly like
// a doc/sheet/slides body, so no server change is needed to carry a canvas.

import type { SectionLayout, WidgetKind, WireType } from '@shared/types'
import { defaultConfig, type FieldDefinition, type FieldType } from '@shared/fields'
import { useLinksStore } from '../stores/links'
import { useWidgetStore } from '../stores/widgets'
import type { SerializedWidget } from './shareSnapshot'

export const CANVAS_BODY_VERSION = 1 as const

// A connector wire between two widgets, trimmed to the fields a reconstruct
// needs. Endpoints reference SerializedWidget ids inside the same body.
export interface SerializedLink {
  sourceWidgetId: string
  targetWidgetId: string
  type?: string
  verb?: string
  enabled?: boolean
}

// The full body of a live canvas. `widgets` reuses the share snapshot's widget
// shape (geometry + content + inlined table data) so the two paths stay in
// lockstep and a single render/rebuild routine serves both.
export interface CanvasBody {
  version: number
  title: string
  widgets: SerializedWidget[]
  links: SerializedLink[]
}

// Coerce an already-parsed value into a CanvasBody, reading defensively. Used
// by the live view, which receives the body pre-parsed from the collaboration
// store. Returns null when the value can't be a usable board.
export function coerceCanvasBody(obj: unknown): CanvasBody | null {
  if (!obj || typeof obj !== 'object') return null
  const o = obj as Partial<CanvasBody>
  if (!Array.isArray(o.widgets)) return null
  return {
    version: typeof o.version === 'number' ? o.version : 1,
    title: typeof o.title === 'string' ? o.title : 'Untitled desk',
    widgets: o.widgets as SerializedWidget[],
    links: Array.isArray(o.links) ? (o.links as SerializedLink[]) : []
  }
}

// Parse a stored canvas body string. A body minted by an older/newer build may
// be missing fields, and a corrupt/foreign body must fail to a clear null
// rather than throw deep in the render path; the caller then shows an honest
// "couldn't load" state.
export function parseCanvasBody(raw: string): CanvasBody | null {
  let obj: unknown
  try {
    obj = JSON.parse(raw)
  } catch {
    return null
  }
  return coerceCanvasBody(obj)
}

// Widget kinds whose content is a local id or blob that cannot resolve on
// another user's machine (or a freshly rebuilt mirror). They still reconstruct
// structurally — geometry, title, the kind itself — but the content shows a
// broken/placeholder state cross-user. This mirrors the one-off share path's
// fidelity boundary and is surfaced honestly in the UI rather than silently
// producing a dead widget. Table widgets are NOT here: their data is inlined in
// the body and rebuilt into a fresh backing table.
export const CROSS_USER_LOSSY_KINDS: ReadonlySet<string> = new Set([
  'file',
  'pdf',
  'image',
  'video',
  'doc',
  'sheet',
  'slides',
  'task-link',
  'local-app-launcher',
  'recorder'
])

// Rebuild a task's board (widgets, sections, links, inlined table data) from a
// canvas body. Used to mirror a live canvas's canonical state into a local
// "mirror" task that the normal Canvas can render. The task's existing widgets
// are cleared first.
//
// All writes go through the low-level window.api rather than the widget store's
// create/remove so a rebuild never pollutes the undo history (a mirror is not
// the user's own authored work to undo). The rebuild runs in three passes so
// section nesting and link endpoints resolve regardless of array order:
//   1. create every widget (rebuilding table backings), recording old->new ids;
//   2. patch section layout + parentSectionId using the id map;
//   3. recreate links with remapped endpoints.
// Finally the widget store is refreshed so the Canvas re-renders.
export async function applyCanvasBodyToTask(taskId: string, body: CanvasBody): Promise<void> {
  // Clear current widgets (soft-delete; trashed rows are filtered out of
  // listByTask and purged on the normal 7-day cycle).
  const existing = await window.api.widgets.listByTask(taskId)
  for (const w of existing) await window.api.widgets.delete(w.id)

  const idMap = new Map<string, string>() // old widget id -> new widget id

  // Pass 1 — create every widget.
  for (const sw of body.widgets) {
    let content = sw.content ?? ''
    if (sw.kind === 'table' && sw.tableSnapshot) {
      // Rebuild the backing table from the inlined snapshot and repoint content
      // at the new table id, so the table widget shows real data on the mirror.
      try {
        const snap = sw.tableSnapshot
        const columns: FieldDefinition[] = snap.columns.map(
          (c) =>
            ({
              id: c.id,
              type: c.type as FieldType,
              label: c.label,
              config: defaultConfig(c.type as FieldType)
            }) as FieldDefinition
        )
        const tbl = await window.api.tables.create({ taskId, title: snap.title, schema: { columns } })
        for (const r of snap.rows) await window.api.tables.createRow({ tableId: tbl.id, cells: r.cells })
        content = tbl.id
      } catch {
        content = '' // table rebuild failed — leave an empty table widget rather than a crash
      }
    }
    const created = await window.api.widgets.create({
      taskId,
      kind: sw.kind as WidgetKind,
      title: sw.title ?? '',
      content,
      x: typeof sw.x === 'number' ? sw.x : 80,
      y: typeof sw.y === 'number' ? sw.y : 80,
      width: typeof sw.width === 'number' ? sw.width : 280,
      height: typeof sw.height === 'number' ? sw.height : 200,
      color: sw.color ?? null
    })
    idMap.set(sw.id, created.id)
  }

  // Pass 2 — restore section layout + membership now that every id is mapped.
  for (const sw of body.widgets) {
    const newId = idMap.get(sw.id)
    if (!newId) continue
    const patch: { layout?: SectionLayout | null; parentSectionId?: string | null } = {}
    if (sw.kind === 'section' && sw.layout) patch.layout = sw.layout
    if (sw.parentSectionId) {
      const mappedParent = idMap.get(sw.parentSectionId)
      if (mappedParent) patch.parentSectionId = mappedParent
    }
    if (Object.keys(patch).length > 0) await window.api.widgets.update(newId, patch)
  }

  // Pass 3 — recreate links with remapped endpoints. Drop any whose endpoints
  // didn't survive (e.g. a widget that failed to create).
  for (const l of body.links) {
    const s = idMap.get(l.sourceWidgetId)
    const t = idMap.get(l.targetWidgetId)
    if (!s || !t) continue
    const link = await window.api.widgetLinks.create(s, t, taskId, (l.type as WireType) || undefined)
    if (link && (l.verb || l.enabled === false)) {
      await window.api.widgetLinks.update(link.id, { verb: l.verb, enabled: l.enabled })
    }
  }

  // Refresh widgets + links so the Canvas re-renders the rebuilt board.
  await useWidgetStore.getState().loadForTask(taskId)
  await useLinksStore.getState().loadForTask(taskId)
}
