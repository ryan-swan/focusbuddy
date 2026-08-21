// Geometry for the Home widget grid (Apple widget-picker mission, Phase 1).
// Pure functions only. The packing here is the single source of truth for
// where every widget sits: cells get explicit gridColumn/gridRow from
// packGrid's output, and drag math reads the same numbers, so CSS and pointer
// logic can never disagree — and drag targeting never measures the DOM
// mid-animation (framer's transforms would feed the springs back into the
// math and jitter).

import type { HomeWidgetInstance } from './homeWidgets'

export type WidgetSize = 'sm' | 'md' | 'lg' | 'stack'

export interface SizedInstance extends HomeWidgetInstance {
  size: WidgetSize
}

// Grid footprint per size, in cells.
export const SIZE_SPAN: Record<WidgetSize, { w: number; h: number }> = {
  sm: { w: 1, h: 1 },
  md: { w: 2, h: 1 },
  lg: { w: 2, h: 2 },
  stack: { w: 1, h: 2 }
}

export interface GridPos {
  col: number
  row: number
}

// Viewport-space measurements of the live grid, captured from the container
// once per pointer event. originX/originY are the container's content origin.
export interface GridMetrics {
  originX: number
  originY: number
  cellW: number
  cellH: number
  gap: number
  cols: number
}

// First-fit packing: scan rows top-down, columns left-right, place each item
// at the first spot its span fits. Later small widgets fill gaps left by
// earlier large ones, which keeps the board tight the way Apple's is.
export function packGrid(
  items: readonly { key: string; size: WidgetSize }[],
  cols: number
): Map<string, GridPos> {
  const out = new Map<string, GridPos>()
  const occupied: boolean[][] = []
  const rowAt = (r: number): boolean[] => {
    while (occupied.length <= r) occupied.push(new Array<boolean>(cols).fill(false))
    return occupied[r]
  }
  const fits = (col: number, row: number, w: number, h: number): boolean => {
    if (col + w > cols) return false
    for (let r = row; r < row + h; r++) {
      const line = rowAt(r)
      for (let c = col; c < col + w; c++) if (line[c]) return false
    }
    return true
  }
  const claim = (col: number, row: number, w: number, h: number): void => {
    for (let r = row; r < row + h; r++) {
      const line = rowAt(r)
      for (let c = col; c < col + w; c++) line[c] = true
    }
  }
  for (const item of items) {
    const span = SIZE_SPAN[item.size]
    const w = Math.min(span.w, cols)
    placed: for (let row = 0; ; row++) {
      for (let col = 0; col <= cols - w; col++) {
        if (fits(col, row, w, span.h)) {
          claim(col, row, w, span.h)
          out.set(item.key, { col, row })
          break placed
        }
      }
    }
  }
  return out
}

// Total rows the packed board occupies (for sizing the container if needed).
export function packedRows(
  items: readonly { key: string; size: WidgetSize }[],
  positions: Map<string, GridPos>
): number {
  let rows = 0
  for (const item of items) {
    const pos = positions.get(item.key)
    if (pos) rows = Math.max(rows, pos.row + SIZE_SPAN[item.size].h)
  }
  return rows
}

export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

// Viewport-space rect of a cell at a packed position.
export function cellRect(pos: GridPos, size: WidgetSize, m: GridMetrics): Rect {
  const span = SIZE_SPAN[size]
  return {
    left: m.originX + pos.col * (m.cellW + m.gap),
    top: m.originY + pos.row * (m.cellH + m.gap),
    width: span.w * m.cellW + (span.w - 1) * m.gap,
    height: span.h * m.cellH + (span.h - 1) * m.gap
  }
}

// Which grid cell a viewport point falls in, clamped to the board. Used to
// throttle drag targeting: the insertion index is only recomputed when the
// pointer crosses into a different cell, which is the hysteresis that keeps
// boundaries from jittering.
export function pointerCell(x: number, y: number, m: GridMetrics): GridPos {
  const col = Math.max(0, Math.min(m.cols - 1, Math.floor((x - m.originX) / (m.cellW + m.gap))))
  const row = Math.max(0, Math.floor((y - m.originY) / (m.cellH + m.gap)))
  return { col, row }
}

// The insertion index whose resulting layout puts the dragged widget's cell
// closest to the pointer. Tries every index (lists are ≤ ~20 items and packing
// is trivial, so this is cheap) — which makes the placeholder gap always be
// exactly where the widget will land, Apple's contract. Ties resolve to the
// earliest index so repeated calls are stable.
export function bestInsertionIndex(
  others: readonly SizedInstance[],
  dragged: SizedInstance,
  x: number,
  y: number,
  m: GridMetrics
): number {
  let best = 0
  let bestD = Infinity
  for (let i = 0; i <= others.length; i++) {
    const trial = [...others.slice(0, i), dragged, ...others.slice(i)]
    const pos = packGrid(trial, m.cols).get(dragged.key)
    if (!pos) continue
    const r = cellRect(pos, dragged.size, m)
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    const d = (cx - x) * (cx - x) + (cy - y) * (cy - y)
    if (d < bestD - 1) {
      bestD = d
      best = i
    }
  }
  return best
}
