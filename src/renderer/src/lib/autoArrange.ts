import type { Widget } from '@shared/types'
import { CATEGORIES, catalogFor } from './widgetCatalog'

const PADDING = 20
const GAP_X = 16
const GAP_Y = 20
const CAT_LABEL_H = 22

export interface ArrangedPosition {
  id: string
  x: number
  y: number
}

export function arrangeByCategory(
  widgets: Widget[],
  canvasWidth: number
): ArrangedPosition[] {
  const result: ArrangedPosition[] = []
  let cursorY = PADDING

  for (const category of CATEGORIES) {
    const inCat = widgets.filter((w) => catalogFor(w.kind)?.category === category)
    if (inCat.length === 0) continue

    cursorY += CAT_LABEL_H

    let rowX = PADDING
    let rowMaxH = 0

    for (const w of inCat) {
      const wantedWidth = w.width
      if (rowX + wantedWidth > canvasWidth - PADDING && rowX > PADDING) {
        rowX = PADDING
        cursorY += rowMaxH + GAP_Y
        rowMaxH = 0
      }
      result.push({ id: w.id, x: rowX, y: cursorY })
      rowX += wantedWidth + GAP_X
      rowMaxH = Math.max(rowMaxH, w.height)
    }
    cursorY += rowMaxH + GAP_Y
  }

  return result
}
