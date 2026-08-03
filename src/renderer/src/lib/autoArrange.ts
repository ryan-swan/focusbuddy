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

// Tidy layout modes the user can pick from the Tidy menu. 'flow' is the classic
// wrap-at-canvas-width behaviour; the rest give explicit geometry. Whatever mode
// is chosen, the caller passes items already ordered so linked widgets are
// contiguous (cluster ordering), so links stay short in every mode.
export type TidyMode = 'flow' | 'square' | 'vertical' | 'horizontal' | 'mosaic' | 'custom'

export interface TidyItem {
  id: string
  w: number
  h: number
}

export interface TidyOptions {
  mode: TidyMode
  // For 'custom': number of columns (preferred) or rows to bind the grid to.
  cols?: number
  rows?: number
}

// Place items (in the given order) according to a tidy mode. Pure and
// deterministic — the caller applies the returned x/y. `flowWidth` is the usable
// canvas width for the wrapping 'flow' mode.
export function tidyPositions(
  items: TidyItem[],
  opts: TidyOptions,
  flowWidth: number,
  gap = 40,
  padding = 60
): ArrangedPosition[] {
  const n = items.length
  if (n === 0) return []

  if (opts.mode === 'flow') return flowRows(items, flowWidth, gap, padding)
  if (opts.mode === 'mosaic') return masonry(items, columnsFor(opts, n), gap, padding)

  // Grid-based modes reduce to "how many columns".
  const columns =
    opts.mode === 'vertical'
      ? 1
      : opts.mode === 'horizontal'
        ? n
        : opts.mode === 'square'
          ? Math.ceil(Math.sqrt(n))
          : columnsFor(opts, n) // custom
  return gridPlace(items, columns, gap, padding)
}

function columnsFor(opts: TidyOptions, n: number): number {
  if (opts.cols && opts.cols > 0) return Math.min(opts.cols, n)
  if (opts.rows && opts.rows > 0) return Math.ceil(n / opts.rows)
  return Math.ceil(Math.sqrt(n))
}

// Wrap into rows at flowWidth — the classic tidy. Row height = tallest in row.
function flowRows(items: TidyItem[], flowWidth: number, gap: number, padding: number): ArrangedPosition[] {
  const out: ArrangedPosition[] = []
  let cursorX = padding
  let cursorY = padding
  let rowMaxH = 0
  for (const it of items) {
    if (cursorX !== padding && cursorX + it.w > padding + flowWidth) {
      cursorX = padding
      cursorY += rowMaxH + gap
      rowMaxH = 0
    }
    out.push({ id: it.id, x: Math.round(cursorX), y: Math.round(cursorY) })
    cursorX += it.w + gap
    rowMaxH = Math.max(rowMaxH, it.h)
  }
  return out
}

// Aligned grid with `columns` columns: column widths and row heights sized to
// their widest/tallest member so rows and columns line up cleanly.
function gridPlace(items: TidyItem[], columns: number, gap: number, padding: number): ArrangedPosition[] {
  const n = items.length
  const cols = Math.max(1, Math.min(columns, n))
  const rowCount = Math.ceil(n / cols)
  const colW = new Array<number>(cols).fill(0)
  const rowH = new Array<number>(rowCount).fill(0)
  items.forEach((it, i) => {
    const c = i % cols
    const r = Math.floor(i / cols)
    colW[c] = Math.max(colW[c], it.w)
    rowH[r] = Math.max(rowH[r], it.h)
  })
  const colX = new Array<number>(cols)
  let x = padding
  for (let c = 0; c < cols; c++) {
    colX[c] = x
    x += colW[c] + gap
  }
  const rowY = new Array<number>(rowCount)
  let y = padding
  for (let r = 0; r < rowCount; r++) {
    rowY[r] = y
    y += rowH[r] + gap
  }
  return items.map((it, i) => ({
    id: it.id,
    x: Math.round(colX[i % cols]),
    y: Math.round(rowY[Math.floor(i / cols)])
  }))
}

// Masonry: fixed-width columns, each item dropped into the currently shortest
// column so varying heights pack tightly. Column width = widest item.
function masonry(items: TidyItem[], columns: number, gap: number, padding: number): ArrangedPosition[] {
  const cols = Math.max(1, Math.min(columns, items.length))
  const colWidth = Math.max(...items.map((it) => it.w), 1)
  const colHeights = new Array<number>(cols).fill(padding)
  return items.map((it) => {
    let c = 0
    for (let i = 1; i < cols; i++) if (colHeights[i] < colHeights[c]) c = i
    const x = padding + c * (colWidth + gap)
    const y = colHeights[c]
    colHeights[c] += it.h + gap
    return { id: it.id, x: Math.round(x), y: Math.round(y) }
  })
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
