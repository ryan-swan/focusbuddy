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

import type { FbNode } from '@shared/types'
import { buildTaskSnapshot, type SerializedWidget } from './shareSnapshot'

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

// Capture a task's board into a CanvasBody JSON string. Reuses
// buildTaskSnapshot for the widgets (so table widgets carry their data) and
// adds the widget links. Links whose endpoints are not both present in the
// serialized widget set are dropped so a rebuild never produces a dangling
// wire.
export async function serializeCanvasBody(task: FbNode): Promise<string> {
  const snap = await buildTaskSnapshot(task, '')
  const widgets = snap.task.widgets ?? []
  const widgetIds = new Set(widgets.map((w) => w.id))
  const rawLinks = await window.api.widgetLinks.listByTask(task.id)
  const links: SerializedLink[] = rawLinks
    .filter((l) => widgetIds.has(l.sourceWidgetId) && widgetIds.has(l.targetWidgetId))
    .map((l) => ({
      sourceWidgetId: l.sourceWidgetId,
      targetWidgetId: l.targetWidgetId,
      type: l.type,
      verb: l.verb,
      enabled: l.enabled
    }))
  const body: CanvasBody = {
    version: CANVAS_BODY_VERSION,
    title: task.title || 'Untitled desk',
    widgets,
    links
  }
  return JSON.stringify(body)
}

// Parse a stored canvas body. Reads defensively — a body minted by an
// older/newer build may be missing fields, and a corrupt/foreign body must
// fail to a clear null rather than throw deep in the render path. Returns null
// when the JSON is unusable; the caller shows an honest "couldn't load" state.
export function parseCanvasBody(raw: string): CanvasBody | null {
  let obj: unknown
  try {
    obj = JSON.parse(raw)
  } catch {
    return null
  }
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

// Produce an empty canvas body (e.g. when promoting a brand-new desk). Kept
// here so the shape lives in one place.
export function emptyCanvasBody(title: string): string {
  const body: CanvasBody = {
    version: CANVAS_BODY_VERSION,
    title: title || 'Untitled desk',
    widgets: [],
    links: []
  }
  return JSON.stringify(body)
}
