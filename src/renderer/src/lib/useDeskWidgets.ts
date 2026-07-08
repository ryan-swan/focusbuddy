import { useEffect, useState } from 'react'
import type { Widget } from '@shared/types'

// Load the widget set for a group of desks (task/folder nodes) so their spatial
// miniatures can render outside the canvas (index pages, room-icon composites,
// sidebar thumbnails). Only the active desk's widgets live in the widget store,
// so everything else is fetched directly. A failed fetch falls back to an empty
// (honest) preview rather than inventing content.
export function useDeskWidgets(deskIds: string[]): Record<string, Widget[]> {
  const [byDesk, setByDesk] = useState<Record<string, Widget[]>>({})
  const key = deskIds.join(',')
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const ids = key ? key.split(',') : []
      const entries = await Promise.all(
        ids.map(async (id) => {
          try {
            return [id, await window.api.widgets.listByTask(id)] as const
          } catch {
            return [id, [] as Widget[]] as const
          }
        })
      )
      if (!cancelled) setByDesk(Object.fromEntries(entries))
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return byDesk
}

// A widget is "real" desk content (not chrome) when it is visible, unpinned, not
// a section child, and not the auto minimap. Used for the desk content count and
// for deciding whether a miniature has anything to show.
export function realWidgetCount(widgets: Widget[]): number {
  return widgets.filter(
    (w) => !w.archived && !w.pinned && w.parentSectionId === null && w.kind !== 'minimap'
  ).length
}
