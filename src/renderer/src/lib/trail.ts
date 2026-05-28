import type { ActivityKind } from '@shared/types'

// Fire-and-forget activity recorder. Never blocks UI; failures are swallowed.
// Designed to be called from many places — every meaningful user action.
export function recordTrail(
  kind: ActivityKind,
  taskId: string | null,
  payload?: Record<string, unknown>
): void {
  try {
    void window.api.trail.record({ taskId, kind, payload })
  } catch {
    // No window.api yet (early boot) or IPC failure — log nothing, never throw
  }
}

// Per-widget debounce so rapid edits collapse into one "note_edit" event.
// Keyed by widget.id; the trail captures only the latest preview after settle.
const editDebounce = new Map<string, number>()

export function recordNoteEditDebounced(
  widgetId: string,
  taskId: string | null,
  kind: string,
  preview: string,
  delayMs = 3000
): void {
  const prev = editDebounce.get(widgetId)
  if (prev !== undefined) window.clearTimeout(prev)
  const handle = window.setTimeout(() => {
    recordTrail('note_edit', taskId, {
      widgetId,
      kind,
      preview: preview.slice(0, 200)
    })
    editDebounce.delete(widgetId)
  }, delayMs)
  editDebounce.set(widgetId, handle)
}
