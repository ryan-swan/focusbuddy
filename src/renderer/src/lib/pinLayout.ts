import { createContext, useContext } from 'react'
import type { PinZone, Widget } from '@shared/types'

// Pin-zone layout — compute the screen-space rectangle for each zone-pinned
// widget so multiple pins to the same zone dock side-by-side without overlap.
// Top-/bottom-left zones flow rightward from their corner; top-/bottom-right
// zones flow leftward. The pinned-layer's bounds are passed in so widgets
// always anchor to the visible main-pane corners (not the OS window).

export interface ZoneRect {
  x: number
  y: number
  width: number
  height: number
}

const PADDING = 16
const GAP = 8

/**
 * For each zone-pinned widget, compute its position + size inside the
 * pinned-layer container. Returns a Map keyed by widget.id.
 *
 * Stacking order within a zone is deterministic by widget creation time —
 * earliest pinned widget sits closest to the corner.
 */
export function computeZonePinPositions(
  widgets: Widget[],
  container: { width: number; height: number }
): Map<string, ZoneRect> {
  const out = new Map<string, ZoneRect>()
  const byZone: Record<PinZone, Widget[]> = {
    tl: [],
    tr: [],
    bl: [],
    br: []
  }
  for (const w of widgets) {
    if (!w.pinned || w.pinnedZone === null || w.parentSectionId !== null) continue
    byZone[w.pinnedZone].push(w)
  }
  // Stable order — earliest-pinned widget docks closest to the corner.
  for (const zone of Object.keys(byZone) as PinZone[]) {
    byZone[zone].sort((a, b) => a.createdAt - b.createdAt)
  }

  for (const zone of Object.keys(byZone) as PinZone[]) {
    const list = byZone[zone]
    // Compute cumulative offset along the stacking axis (horizontal).
    let offset = 0
    for (const w of list) {
      const width = w.width
      const height = w.height
      let x: number
      let y: number
      switch (zone) {
        case 'tl':
          x = PADDING + offset
          y = PADDING
          break
        case 'tr':
          x = container.width - PADDING - width - offset
          y = PADDING
          break
        case 'bl':
          x = PADDING + offset
          y = container.height - PADDING - height
          break
        case 'br':
        default:
          x = container.width - PADDING - width - offset
          y = container.height - PADDING - height
          break
      }
      out.set(w.id, { x, y, width, height })
      offset += width + GAP
    }
  }
  return out
}

export const PIN_ZONE_LABELS: Record<PinZone, string> = {
  tl: 'Top left',
  tr: 'Top right',
  bl: 'Bottom left',
  br: 'Bottom right'
}

export const PIN_ZONE_ICONS: Record<PinZone, string> = {
  tl: 'north_west',
  tr: 'north_east',
  bl: 'south_west',
  br: 'south_east'
}

// Context provided by Canvas's pinned-layer so WidgetFrame can look up the
// computed zone position for its widget without prop-drilling through every
// widget kind (sticky, note, webview, etc.).
export const PinLayoutContext = createContext<Map<string, ZoneRect> | null>(null)

export function useZonePosition(widgetId: string): ZoneRect | undefined {
  const ctx = useContext(PinLayoutContext)
  return ctx?.get(widgetId)
}
