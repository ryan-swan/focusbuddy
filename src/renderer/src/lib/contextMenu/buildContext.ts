// Helpers that turn a right-click on a surface into a MenuContext. A widget
// only knows what it was that got clicked (itself, a selection inside it, a
// table cell), so it calls one of these and hands the result to the menu. The
// canvas-space point is only needed for empty-canvas placement, so widget and
// multi contexts leave it at the origin; createConnectedTool positions new
// widgets relative to the source, not the click point.

import type { Widget } from '@shared/types'
import type { MenuContext } from './types'

interface ClickPoint {
  clientX: number
  clientY: number
}

export function buildContextForWidget(
  widget: Widget,
  e: ClickPoint,
  opts?: { granularity?: string; payload?: Record<string, unknown>; selectionText?: string }
): MenuContext {
  const text = opts?.selectionText?.trim() ? opts.selectionText : undefined
  return {
    object: { type: 'widget', widget },
    sub: opts?.granularity ? { granularity: opts.granularity, payload: opts.payload ?? {} } : undefined,
    selection: text
      ? { text, sourceWidgetId: widget.id, sourceKind: widget.kind }
      : undefined,
    taskId: widget.taskId,
    canvasPoint: { x: 0, y: 0 },
    clientPoint: { x: e.clientX, y: e.clientY }
  }
}

export function buildContextForSelection(widget: Widget, e: ClickPoint, selectionText: string): MenuContext {
  return buildContextForWidget(widget, e, { selectionText })
}

export function buildContextForMulti(widgets: Widget[], e: ClickPoint): MenuContext {
  return {
    object: { type: 'multi', widgets },
    taskId: widgets[0]?.taskId ?? '',
    canvasPoint: { x: 0, y: 0 },
    clientPoint: { x: e.clientX, y: e.clientY }
  }
}
