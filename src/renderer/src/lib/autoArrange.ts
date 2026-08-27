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

/**
 * DEC-038 — the tidy modes, in the order they are offered.
 *
 * ONE catalogue, because Tidy now lives in exactly one place: the top pill.
 * It used to be duplicated as a submenu on the desk right-click menu, which
 * meant two lists that could drift and two places to learn the same thing.
 *
 * `icon` is the whole affordance in the pill's menu — the operator asked for
 * "just the images", so `label` survives only as the hover tooltip and the
 * accessible name.
 */
export interface TidyModeDef {
  opts: TidyOptions
  icon: string
  label: string
}

export const TIDY_MODES: readonly TidyModeDef[] = [
  { opts: { mode: 'square' }, icon: 'grid_view', label: 'Square grid' },
  { opts: { mode: 'vertical' }, icon: 'view_agenda', label: 'Single column (vertical)' },
  { opts: { mode: 'horizontal' }, icon: 'view_column', label: 'Single row (horizontal)' },
  { opts: { mode: 'mosaic' }, icon: 'dashboard', label: 'Mosaic' },
  { opts: { mode: 'flow' }, icon: 'reorder', label: 'Rows of the canvas (flow)' }
] as const

// DEC-040: the explicit column/row count buttons were removed from the menu.
// "I shouldn't need to select the amount" — square grid now derives a balanced
// shape from the item count (balancedColumns). The 'custom' MODE survives in
// tidyPositions for programmatic callers; nothing in the UI offers it.

/**
 * DEC-040 — how far tidy may GROW a widget.
 *
 * Tidy resizes to remove wasted space, but it used to size every widget to its
 * column's widest and its row's tallest member. One browser at 1200px turned
 * every sticky beside it into a 1200px sticky — "it stretches my apps really
 * wide, well beyond the necessary limits" (operator live QA, with a screenshot
 * of a note stretched across half the canvas).
 *
 * A widget may now grow at most this much past its natural size. Small
 * mismatches still close up, so a tidy grid still reads as a grid; a widget
 * that is genuinely narrow stays narrow.
 */
export const MAX_TIDY_GROWTH = 1.25

/** Grow `natural` toward `cell`, but never past the cap, and never shrink. */
function grow(natural: number, cell: number): number {
  return Math.round(Math.max(natural, Math.min(cell, natural * MAX_TIDY_GROWTH)))
}

/**
 * DEC-040 — the column count for "square grid", chosen from the item count.
 *
 * Not simply ceil(sqrt(n)): that leaves ragged last rows (10 items became
 * 4+4+2). The operator's ask was "as close to a square as you can get with the
 * amount of apps on screen" — 10 as 5+5, 9 as 3x3, 4 as 2x2.
 *
 * So the cost balances two defects: empty cells in the last row (weighted
 * double, because a hole is what you actually see) and departure from square.
 * Ties go to MORE columns, since canvases are wider than they are tall.
 */
export function balancedColumns(n: number): number {
  if (n <= 1) return 1
  let best = 1
  let bestCost = Number.POSITIVE_INFINITY
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols)
    const empty = cols * rows - n
    const cost = empty * 2 + Math.abs(cols - rows)
    if (cost < bestCost || (cost === bestCost && cols > best)) {
      best = cols
      bestCost = cost
    }
  }
  return best
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
          ? balancedColumns(n)
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
      // Capped: a row reaches for the full width, but never by inflating one
      // small widget to several times its size.
      const w = grow(it.w, it.w + extraPerItem)
      out.push({ id: it.id, x: Math.round(x), y: Math.round(y), w, h: grow(it.h, rowMaxH) })
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
  // Each widget grows TOWARD its cell (column width × row height) so an aligned
  // grid closes up small gaps — but only within MAX_TIDY_GROWTH, so a narrow
  // widget sharing a column with a browser is no longer stretched to match it.
  return items.map((it, i) => ({
    id: it.id,
    x: Math.round(colX[i % cols]),
    y: Math.round(rowY[Math.floor(i / cols)]),
    w: grow(it.w, colW[i % cols]),
    h: grow(it.h, rowH[Math.floor(i / cols)])
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
    // Grow each item TOWARD the column width so the columns read as flush,
    // capped so the widest item cannot drag every other one out to its size.
    // Heights are left alone — varying heights packing tightly IS mosaic.
    return { id: it.id, x: Math.round(x), y: Math.round(y), w: grow(it.w, colWidth) }
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
