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
  // Tidy also RESIZES to remove wasted space: every mode grows widgets to fill
  // the gaps its layout would otherwise leave (a grid fills each cell, flow fills
  // each row to full width, mosaic flushes column widths). Callers apply these
  // when present; a widget the mode chooses not to resize simply omits them.
  w?: number
  h?: number
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

// Wrap into rows at flowWidth — the classic tidy — then fill each row so it has
// no wasted space: every item in a row grows to the row's tallest height, and the
// row's leftover horizontal space is shared out so the items span the full width
// edge to edge.
function flowRows(items: TidyItem[], flowWidth: number, gap: number, padding: number): ArrangedPosition[] {
  // Pass 1 — assign items to rows, wrapping when the next would overflow.
  const rows: TidyItem[][] = []
  let row: TidyItem[] = []
  let rowW = 0
  for (const it of items) {
    const addW = row.length === 0 ? it.w : gap + it.w
    if (row.length > 0 && rowW + addW > flowWidth) {
      rows.push(row)
      row = []
      rowW = 0
    }
    row.push(it)
    rowW += row.length === 1 ? it.w : gap + it.w
  }
  if (row.length > 0) rows.push(row)

  // Pass 2 — fill each row. Height = tallest member; width = natural width plus an
  // equal share of the leftover so the row reaches flowWidth with no trailing gap.
  const out: ArrangedPosition[] = []
  let y = padding
  for (const r of rows) {
    const rowMaxH = Math.max(...r.map((it) => it.h))
    const naturalW = r.reduce((s, it) => s + it.w, 0) + gap * (r.length - 1)
    const extraPerItem = Math.max(0, flowWidth - naturalW) / r.length
    let x = padding
    for (const it of r) {
      const w = Math.round(it.w + extraPerItem)
      out.push({ id: it.id, x: Math.round(x), y: Math.round(y), w, h: rowMaxH })
      x += w + gap
    }
    y += rowMaxH + gap
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
  // Each widget grows to fill its whole cell (column width × row height), so an
  // aligned grid has no gaps around a smaller-than-its-neighbours widget.
  return items.map((it, i) => ({
    id: it.id,
    x: Math.round(colX[i % cols]),
    y: Math.round(rowY[Math.floor(i / cols)]),
    w: colW[i % cols],
    h: rowH[Math.floor(i / cols)]
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
    // Grow each item to the column width so the columns are flush; heights are
    // left alone because varying heights packing tightly is the point of mosaic.
    return { id: it.id, x: Math.round(x), y: Math.round(y), w: colWidth }
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
