import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SheetBody, SheetBodyV2, SheetCellFormat, SheetChartSpec, SheetNumberFormat, SheetTab } from '@shared/types'
import { SHEET_FUNCTIONS } from '../../lib/sheetFormula'
import {
  normalizeBody,
  withTab,
  activeTab,
  emptyTab,
  colLabel,
  cellFormat
} from '../../lib/sheetBody'
import {
  setCell,
  setColumnName,
  addColumn,
  addRow,
  insertRowAt,
  deleteRowAt,
  insertColAt,
  deleteColAt,
  applyFormat,
  writeMatrix,
  fillSelection,
  tileMatrix,
  dataExtentBelow,
  sortByColumn,
  setColWidth,
  parseTsv,
  rangeToTsv,
  normalizeRange,
  type CellRange
} from './sheet/sheetOps'
import { extendSeries, canToggleSeries, numericFill } from '../../lib/sheetFill'
import { rewriteFormulaRefs } from '../../lib/sheetFormula'
import { isSingleCell } from '@shared/gridClipboard'
import SheetGrid from './sheet/SheetGrid'
import SheetToolbar from './sheet/SheetToolbar'
import SheetTabStrip from './sheet/SheetTabStrip'
import SheetChart from './sheet/SheetChart'
import SheetAiFill from './sheet/SheetAiFill'
import SheetFormulaAssist, { type FormulaPlan } from './sheet/SheetFormulaAssist'
import Icon from '../Icon'

// Excel-class spreadsheet editor. The body is held locally as v2 (legacy v1
// bodies are lifted on mount); every edit pushes an undo snapshot and flows to
// onChange (the store's debounced autosave). Cells carry real formatting and
// number formats; formulas compute for real and show #ERR rather than a fake
// number.

interface Props {
  body: SheetBody
  title: string
  onChange: (body: SheetBody) => void
}

interface Cell {
  r: number
  c: number
}

interface FuncMenu {
  items: typeof SHEET_FUNCTIONS
  tokenStart: number
  query: string
}

const DEFAULT_COL_W = 120

// When the in-cell text is a formula, work out whether to show the function
// menu and which functions match. We assume the caret is at the end of the
// text (the normal left-to-right typing case), which keeps this free of
// render-time DOM caret reads. Trailing letters are treated as a function-name
// prefix; right after =, (, a comma or an operator we show the full list.
function computeFuncMenu(value: string): FuncMenu | null {
  if (!value.startsWith('=')) return null
  const idM = value.match(/([A-Za-z]+)$/)
  let query = ''
  let tokenStart = value.length
  if (idM) {
    query = idM[1].toUpperCase()
    tokenStart = value.length - idM[1].length
  } else if (/[=+\-*/&^<>]$/.test(value)) {
    // Right after = or a binary operator: offer the whole catalogue. We
    // deliberately skip ( and , so the menu closes after a function is picked
    // (where you usually type a reference, not nest another function).
    query = ''
    tokenStart = value.length
  } else {
    return null
  }
  const items = SHEET_FUNCTIONS.filter((f) => f.name.startsWith(query))
  if (!items.length) return null
  return { items, tokenStart, query }
}

export default function SheetEditor({ body: rawBody, title, onChange }: Props): JSX.Element {
  const [body, setBody] = useState<SheetBodyV2>(() => normalizeBody(rawBody))
  const [anchor, setAnchor] = useState<Cell>({ r: 0, c: 0 })
  const [focus, setFocus] = useState<Cell>({ r: 0, c: 0 })
  const [editing, setEditing] = useState<Cell | null>(null)
  const [editValue, setEditValue] = useState('')
  const [aiOpen, setAiOpen] = useState(false)
  const [formulaAiOpen, setFormulaAiOpen] = useState(false)
  const [liveWidth, setLiveWidth] = useState<{ c: number; w: number } | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [colMenu, setColMenu] = useState<{ c: number; x: number; y: number } | null>(null)
  const [funcIndex, setFuncIndex] = useState(0)
  const [funcDismissed, setFuncDismissed] = useState(false)
  // Live preview rectangle while dragging the fill handle (cells about to be
  // filled), and the just-completed fill so we can offer an Excel-style
  // Copy/Series toggle for numeric fills.
  const [fillPreview, setFillPreview] = useState<CellRange | null>(null)
  const [lastFill, setLastFill] = useState<{
    source: CellRange
    target: CellRange
    mode: 'series' | 'copy'
  } | null>(null)

  const undoStack = useRef<SheetBodyV2[]>([])
  const redoStack = useRef<SheetBodyV2[]>([])
  const dragging = useRef(false)
  const gridWrapRef = useRef<HTMLDivElement | null>(null)
  const editInputRef = useRef<HTMLInputElement | null>(null)
  const refDrag = useRef<{ start: Cell; end: Cell } | null>(null)
  // Source selection captured when a fill-handle drag begins, the live preview
  // rectangle (mirrored as a ref so the global mouseup can read it), and a ref to
  // the latest fill executor (kept fresh each render so the mouseup closure isn't
  // stale).
  const fillDrag = useRef<CellRange | null>(null)
  const fillPreviewRef = useRef<CellRange | null>(null)
  const doFillRef = useRef<(source: CellRange, target: CellRange) => void>(() => {})
  // Remember the origin of the last in-app copy so a paste elsewhere can shift
  // formula references relative to the move (matching Excel/Sheets). Only applied
  // when the clipboard text still matches what we copied — an external copy is
  // pasted literally, since we can't know its origin.
  const clipboardCopy = useRef<{ text: string; r: number; c: number } | null>(null)

  const idx = body.activeSheet ?? 0
  const tab = activeTab(body)
  const selection: CellRange = normalizeRange(anchor, focus)

  // ── Commit helpers ────────────────────────────────────────────────────────
  const commit = useCallback(
    (next: SheetBodyV2) => {
      undoStack.current.push(body)
      if (undoStack.current.length > 100) undoStack.current.shift()
      redoStack.current = []
      setBody(next)
      onChange(next)
    },
    [body, onChange]
  )
  const mutateTab = useCallback(
    (fn: (t: SheetTab) => SheetTab) => commit(withTab(body, idx, fn(tab))),
    [body, idx, tab, commit]
  )

  const undo = useCallback(() => {
    const prev = undoStack.current.pop()
    if (!prev) return
    redoStack.current.push(body)
    setBody(prev)
    onChange(prev)
  }, [body, onChange])
  const redo = useCallback(() => {
    const nxt = redoStack.current.pop()
    if (!nxt) return
    undoStack.current.push(body)
    setBody(nxt)
    onChange(nxt)
  }, [body, onChange])

  const colWidthOf = useCallback(
    (c: number): number => (liveWidth?.c === c ? liveWidth.w : tab.colWidths?.[c] ?? DEFAULT_COL_W),
    [liveWidth, tab.colWidths]
  )

  // ── Selection + editing ───────────────────────────────────────────────────
  function focusGrid(): void {
    gridWrapRef.current?.focus()
  }
  // True while the cell being edited holds a formula, so a click on another
  // cell should insert its reference rather than move the selection.
  const inFormulaEdit = (): boolean => !!editing && editValue.startsWith('=')

  function onCellMouseDown(r: number, c: number, shift: boolean): void {
    if (inFormulaEdit()) {
      // Clicking the cell we're editing just places the caret in its input.
      if (editing && r === editing.r && c === editing.c) return
      refDrag.current = { start: { r, c }, end: { r, c } }
      dragging.current = true
      return
    }
    setEditing(null)
    if (shift) setFocus({ r, c })
    else {
      setAnchor({ r, c })
      setFocus({ r, c })
    }
    dragging.current = true
    focusGrid()
  }
  function onCellMouseEnter(r: number, c: number): void {
    if (fillDrag.current) {
      onFillEnter(r, c)
      return
    }
    if (refDrag.current) {
      refDrag.current = { start: refDrag.current.start, end: { r, c } }
      return
    }
    if (dragging.current) setFocus({ r, c })
  }
  useEffect(() => {
    // Reads only refs + colLabel + setEditValue (all stable), so the empty dep
    // list is safe and the handler never sees stale formula text — it pulls the
    // live value and caret straight from the input element.
    const up = (): void => {
      if (fillDrag.current) {
        const source = fillDrag.current
        const target = fillPreviewRef.current
        fillDrag.current = null
        fillPreviewRef.current = null
        dragging.current = false
        setFillPreview(null)
        if (target) doFillRef.current(source, target)
        return
      }
      if (refDrag.current) {
        const { start, end } = refDrag.current
        refDrag.current = null
        dragging.current = false
        const r0 = Math.min(start.r, end.r)
        const r1 = Math.max(start.r, end.r)
        const c0 = Math.min(start.c, end.c)
        const c1 = Math.max(start.c, end.c)
        const ref =
          r0 === r1 && c0 === c1
            ? `${colLabel(c0)}${r0 + 1}`
            : `${colLabel(c0)}${r0 + 1}:${colLabel(c1)}${r1 + 1}`
        const input = editInputRef.current
        if (input) {
          const s = input.selectionStart ?? input.value.length
          const e = input.selectionEnd ?? s
          const next = input.value.slice(0, s) + ref + input.value.slice(e)
          setEditValue(next)
          const caret = s + ref.length
          requestAnimationFrame(() => {
            input.focus()
            try {
              input.setSelectionRange(caret, caret)
            } catch {
              /* input may have unmounted */
            }
          })
        }
        return
      }
      dragging.current = false
    }
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [])

  // ── Formula function menu ─────────────────────────────────────────────────
  const funcMenu = useMemo(
    () => (editing && !funcDismissed ? computeFuncMenu(editValue) : null),
    [editing, editValue, funcDismissed]
  )
  function handleEditValue(v: string): void {
    setEditValue(v)
    setFuncIndex(0)
    setFuncDismissed(false)
  }
  function applyFunc(menu: FuncMenu, index: number): void {
    const fn = menu.items[index] ?? menu.items[0]
    if (!fn) return
    const input = editInputRef.current
    const caret = input?.selectionStart ?? editValue.length
    const next = editValue.slice(0, menu.tokenStart) + fn.name + '(' + editValue.slice(caret)
    setEditValue(next)
    setFuncIndex(0)
    const newCaret = menu.tokenStart + fn.name.length + 1
    requestAnimationFrame(() => {
      input?.focus()
      try {
        input?.setSelectionRange(newCaret, newCaret)
      } catch {
        /* noop */
      }
    })
  }
  // Drive the menu from the edit input's own keystrokes (capture phase, so this
  // runs before SheetGrid's Enter/Tab/Escape commit handlers and can stop them).
  useEffect(() => {
    const input = editInputRef.current
    if (!input || !funcMenu) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        e.stopPropagation()
        setFuncIndex((i) => Math.min(funcMenu.items.length - 1, i + 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        setFuncIndex((i) => Math.max(0, i - 1))
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        e.stopPropagation()
        applyFunc(funcMenu, funcIndex)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setFuncDismissed(true)
      }
    }
    input.addEventListener('keydown', onKey, true)
    return () => input.removeEventListener('keydown', onKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [funcMenu, funcIndex])

  function startEdit(cell: Cell, initial?: string): void {
    setEditing(cell)
    setEditValue(initial ?? tab.rows[cell.r]?.[cell.c] ?? '')
    setFuncIndex(0)
    setFuncDismissed(false)
  }
  function commitEdit(move: 'down' | 'right' | 'none'): void {
    if (!editing) return
    const { r, c } = editing
    mutateTab((t) => setCell(t, r, c, editValue))
    setEditing(null)
    if (move === 'down') selectCell(Math.min(tab.rows.length - 1, r + 1), c)
    else if (move === 'right') selectCell(r, Math.min(tab.columns.length - 1, c + 1))
    focusGrid()
  }
  function selectCell(r: number, c: number): void {
    setAnchor({ r, c })
    setFocus({ r, c })
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────
  async function onGridKeyDown(e: React.KeyboardEvent): Promise<void> {
    if (editing) return
    const { r, c } = focus
    const maxR = tab.rows.length - 1
    const maxC = tab.columns.length - 1
    const mod = e.metaKey || e.ctrlKey

    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault()
      e.shiftKey ? redo() : undo()
      return
    }
    if (mod && e.key.toLowerCase() === 'c') {
      e.preventDefault()
      const text = rangeToTsv(tab, selection)
      await navigator.clipboard.writeText(text).catch(() => {})
      clipboardCopy.current = { text, r: selection.r0, c: selection.c0 }
      return
    }
    if (mod && e.key.toLowerCase() === 'x') {
      e.preventDefault()
      const text = rangeToTsv(tab, selection)
      await navigator.clipboard.writeText(text).catch(() => {})
      clipboardCopy.current = { text, r: selection.r0, c: selection.c0 }
      mutateTab((t) => {
        let next = t
        for (let rr = selection.r0; rr <= selection.r1; rr++)
          for (let cc = selection.c0; cc <= selection.c1; cc++) next = setCell(next, rr, cc, '')
        return next
      })
      return
    }
    if (mod && e.key === 'Enter') {
      // Ctrl/Cmd+Enter fills the whole selection with the active cell's content,
      // shifting a formula's references per target cell.
      e.preventDefault()
      const v = tab.rows[focus.r]?.[focus.c] ?? ''
      mutateTab((t) =>
        fillSelection(t, selection, v, (val, rr, cc) =>
          val.trim().startsWith('=') ? rewriteFormulaRefs(val, rr - focus.r, cc - focus.c) : val
        )
      )
      return
    }
    if (mod && e.key.toLowerCase() === 'd') {
      // Fill down: copy the selection's top row into the rest, relative-shifting
      // formulas (Excel/Sheets Ctrl+D).
      e.preventDefault()
      mutateTab((t) => {
        const rows = t.rows.map((r) => [...r])
        for (let c = selection.c0; c <= selection.c1; c++) {
          const src = rows[selection.r0]?.[c] ?? ''
          for (let r = selection.r0 + 1; r <= selection.r1; r++)
            rows[r][c] = src.trim().startsWith('=') ? rewriteFormulaRefs(src, r - selection.r0, 0) : src
        }
        return { ...t, rows }
      })
      return
    }
    if (mod && e.key.toLowerCase() === 'r') {
      // Fill right (Ctrl+R).
      e.preventDefault()
      mutateTab((t) => {
        const rows = t.rows.map((r) => [...r])
        for (let r = selection.r0; r <= selection.r1; r++) {
          const src = rows[r]?.[selection.c0] ?? ''
          for (let c = selection.c0 + 1; c <= selection.c1; c++)
            rows[r][c] = src.trim().startsWith('=') ? rewriteFormulaRefs(src, 0, c - selection.c0) : src
        }
        return { ...t, rows }
      })
      return
    }
    if (mod && e.key.toLowerCase() === 'v') {
      e.preventDefault()
      const text = await navigator.clipboard.readText().catch(() => '')
      if (!text) return
      const matrix = parseTsv(text)
      // Only shift formulas when the clipboard is still our own copy (we know its
      // origin); an external paste is written literally.
      const origin = clipboardCopy.current && clipboardCopy.current.text === text ? clipboardCopy.current : null
      const isF = (s: string): boolean => s.trim().startsWith('=')
      const multiCell = selection.r0 !== selection.r1 || selection.c0 !== selection.c1
      if (isSingleCell(matrix) && multiCell) {
        const v = matrix[0][0]
        mutateTab((t) =>
          fillSelection(t, selection, v, (val, rr, cc) =>
            origin && isF(val) ? rewriteFormulaRefs(val, rr - origin.r, cc - origin.c) : val
          )
        )
      } else if (multiCell) {
        mutateTab((t) =>
          tileMatrix(t, selection, matrix, (val, destR, destC, si, sj) =>
            origin && isF(val) ? rewriteFormulaRefs(val, destR - origin.r - si, destC - origin.c - sj) : val
          )
        )
      } else {
        const shifted = origin
          ? matrix.map((row) =>
              row.map((val) =>
                isF(val) ? rewriteFormulaRefs(val, focus.r - origin.r, focus.c - origin.c) : val
              )
            )
          : matrix
        mutateTab((t) => writeMatrix(t, focus.r, focus.c, shifted))
      }
      return
    }
    if (mod && e.key.toLowerCase() === 'a') {
      // Select the whole used grid so formatting (colour, bold, number format)
      // can be applied across every cell at once.
      e.preventDefault()
      setAnchor({ r: 0, c: 0 })
      setFocus({ r: maxR, c: maxC })
      return
    }
    if (e.key === 'ArrowUp') { e.preventDefault(); move(Math.max(0, r - 1), c, e.shiftKey); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); move(Math.min(maxR, r + 1), c, e.shiftKey); return }
    if (e.key === 'ArrowLeft') { e.preventDefault(); move(r, Math.max(0, c - 1), e.shiftKey); return }
    if (e.key === 'ArrowRight' || e.key === 'Tab') { e.preventDefault(); move(r, Math.min(maxC, c + 1), e.shiftKey && e.key !== 'Tab'); return }
    if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); startEdit(focus); return }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      mutateTab((t) => {
        let next = t
        for (let rr = selection.r0; rr <= selection.r1; rr++)
          for (let cc = selection.c0; cc <= selection.c1; cc++) next = setCell(next, rr, cc, '')
        return next
      })
      return
    }
    // A printable character starts editing with that character. preventDefault
    // is essential: without it the same keystroke is ALSO inserted into the
    // newly-focused cell input, duplicating the first character (1 -> 11, and
    // = -> ==, which silently broke every formula).
    if (e.key.length === 1 && !mod) {
      e.preventDefault()
      startEdit(focus, e.key)
    }
  }
  function move(r: number, c: number, extend: boolean): void {
    setFocus({ r, c })
    if (!extend) setAnchor({ r, c })
  }

  // ── Autofill (fill handle, double-click, Ctrl+D/R) ────────────────────────
  // Compute the new tab after extending `source` into `target`. Direction is
  // inferred from how target grows past source; numeric sources can be forced to
  // 'copy' or 'series' (the post-fill toggle). Formulas shift their relative
  // references along the fill axis via the engine.
  function computeFilledTab(
    t: SheetTab,
    source: CellRange,
    target: CellRange,
    modeOverride?: 'copy' | 'series'
  ): SheetTab {
    let axis: 'down' | 'up' | 'right' | 'left' | null = null
    if (target.r1 > source.r1) axis = 'down'
    else if (target.r0 < source.r0) axis = 'up'
    else if (target.c1 > source.c1) axis = 'right'
    else if (target.c0 < source.c0) axis = 'left'
    if (!axis) return t

    const rows = t.rows.map((r) => [...r])
    let columns = t.columns
    while (columns.length <= target.c1) columns = [...columns, colLabel(columns.length)]
    while (rows.length <= target.r1) rows.push(new Array(columns.length).fill(''))
    rows.forEach((r) => {
      while (r.length < columns.length) r.push('')
    })

    const forced = (strip: string[]): boolean => !!modeOverride && canToggleSeries(strip)
    if (axis === 'down' || axis === 'up') {
      for (let c = source.c0; c <= source.c1; c++) {
        const strip: string[] = []
        for (let r = source.r0; r <= source.r1; r++) strip.push(rows[r]?.[c] ?? '')
        if (axis === 'down') {
          const count = target.r1 - source.r1
          const vals = forced(strip)
            ? numericFill(strip, count, modeOverride!)
            : extendSeries(strip, count, (v, step) => rewriteFormulaRefs(v, step, 0))
          for (let k = 0; k < count; k++) rows[source.r1 + 1 + k][c] = vals[k]
        } else {
          const count = source.r0 - target.r0
          const rev = [...strip].reverse()
          const vals = forced(rev)
            ? numericFill(rev, count, modeOverride!)
            : extendSeries(rev, count, (v, step) => rewriteFormulaRefs(v, -step, 0))
          for (let k = 0; k < count; k++) rows[source.r0 - 1 - k][c] = vals[k]
        }
      }
    } else {
      for (let r = source.r0; r <= source.r1; r++) {
        const strip: string[] = []
        for (let c = source.c0; c <= source.c1; c++) strip.push(rows[r]?.[c] ?? '')
        if (axis === 'right') {
          const count = target.c1 - source.c1
          const vals = forced(strip)
            ? numericFill(strip, count, modeOverride!)
            : extendSeries(strip, count, (v, step) => rewriteFormulaRefs(v, 0, step))
          for (let k = 0; k < count; k++) rows[r][source.c1 + 1 + k] = vals[k]
        } else {
          const count = source.c0 - target.c0
          const rev = [...strip].reverse()
          const vals = forced(rev)
            ? numericFill(rev, count, modeOverride!)
            : extendSeries(rev, count, (v, step) => rewriteFormulaRefs(v, 0, -step))
          for (let k = 0; k < count; k++) rows[r][source.c0 - 1 - k] = vals[k]
        }
      }
    }
    return { ...t, columns, rows }
  }

  function runFill(source: CellRange, target: CellRange): void {
    if (target.r0 === source.r0 && target.r1 === source.r1 && target.c0 === source.c0 && target.c1 === source.c1)
      return
    mutateTab((t) => computeFilledTab(t, source, target))
    setFocus({ r: target.r1, c: target.c1 })
    setAnchor({ r: target.r0, c: target.c0 })
    // Offer the Copy/Series toggle only when the source is numeric, where the
    // distinction is meaningful (Excel's auto-fill options button).
    const flat: string[] = []
    for (let r = source.r0; r <= source.r1; r++)
      for (let c = source.c0; c <= source.c1; c++) flat.push(tab.rows[r]?.[c] ?? '')
    setLastFill(canToggleSeries(flat) ? { source, target, mode: 'series' } : null)
  }
  // Keep the mouseup-time executor fresh (it reads the current tab via mutateTab).
  doFillRef.current = runFill

  // Flip a completed numeric fill between Copy and Series (re-applies over the
  // same target).
  function toggleFillMode(): void {
    if (!lastFill) return
    const nextMode = lastFill.mode === 'series' ? 'copy' : 'series'
    mutateTab((t) => computeFilledTab(t, lastFill.source, lastFill.target, nextMode))
    setLastFill({ ...lastFill, mode: nextMode })
  }

  // The preview rectangle while dragging the handle: extend along whichever axis
  // the pointer moved furthest, in the pointer's direction.
  function fillPreviewFor(source: CellRange, r: number, c: number): CellRange {
    const dRow = r > source.r1 ? r - source.r1 : r < source.r0 ? r - source.r0 : 0
    const dCol = c > source.c1 ? c - source.c1 : c < source.c0 ? c - source.c0 : 0
    if (Math.abs(dRow) >= Math.abs(dCol) && dRow !== 0) {
      return dRow > 0
        ? { r0: source.r0, c0: source.c0, r1: r, c1: source.c1 }
        : { r0: r, c0: source.c0, r1: source.r1, c1: source.c1 }
    }
    if (dCol !== 0) {
      return dCol > 0
        ? { r0: source.r0, c0: source.c0, r1: source.r1, c1: c }
        : { r0: source.r0, c0: c, r1: source.r1, c1: source.c1 }
    }
    return source
  }

  function onFillStart(): void {
    fillDrag.current = selection
    setLastFill(null)
  }
  function onFillEnter(r: number, c: number): void {
    if (!fillDrag.current) return
    const range = fillPreviewFor(fillDrag.current, r, c)
    fillPreviewRef.current = range
    setFillPreview(range)
  }
  // Double-click the handle: fill down to the extent of the neighbouring data.
  function onFillToEnd(): void {
    const extent = dataExtentBelow(tab, selection)
    if (extent > selection.r1) runFill(selection, { ...selection, r1: extent })
  }

  // ── Formatting + structural ops ───────────────────────────────────────────
  const applyToSelection = (patch: Partial<SheetCellFormat>): void =>
    mutateTab((t) => applyFormat(t, selection, patch))
  const applyNumberFormat = (numFmt: SheetNumberFormat): void => applyToSelection({ numFmt })

  // ── Charts ────────────────────────────────────────────────────────────────
  function insertChart(type: 'bar' | 'line' | 'pie'): void {
    const ref = `${colLabel(selection.c0)}${selection.r0 + 1}:${colLabel(selection.c1)}${selection.r1 + 1}`
    const spec: SheetChartSpec = {
      id: `ch-${Date.now().toString(36)}`,
      type,
      range: ref,
      headerRow: selection.r1 > selection.r0,
      headerCol: selection.c1 > selection.c0
    }
    mutateTab((t) => ({ ...t, charts: [...(t.charts ?? []), spec] }))
  }
  function removeChart(id: string): void {
    mutateTab((t) => ({ ...t, charts: (t.charts ?? []).filter((ch) => ch.id !== id) }))
  }

  // ── Tabs ──────────────────────────────────────────────────────────────────
  function switchTab(i: number): void {
    setBody({ ...body, activeSheet: i })
    onChange({ ...body, activeSheet: i })
    selectCell(0, 0)
  }
  function addTab(): void {
    const next: SheetBodyV2 = { ...body, sheets: [...body.sheets, emptyTab(`Sheet ${body.sheets.length + 1}`)], activeSheet: body.sheets.length }
    commit(next)
  }
  function renameTab(i: number, name: string): void {
    commit({ ...body, sheets: body.sheets.map((s, si) => (si === i ? { ...s, name } : s)) })
  }
  function deleteTab(i: number): void {
    if (body.sheets.length <= 1) return
    const sheets = body.sheets.filter((_, si) => si !== i)
    commit({ ...body, sheets, activeSheet: Math.max(0, i - 1) })
  }

  // ── Column resize ─────────────────────────────────────────────────────────
  function onColResizeStart(c: number, e: React.MouseEvent): void {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startW = colWidthOf(c)
    const onMove = (ev: MouseEvent): void => setLiveWidth({ c, w: Math.max(48, startW + ev.clientX - startX) })
    const onUp = (ev: MouseEvent): void => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      const w = Math.max(48, startW + ev.clientX - startX)
      setLiveWidth(null)
      mutateTab((t) => setColWidth(t, c, w))
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  // ── Office import / export ────────────────────────────────────────────────
  async function importFile(): Promise<void> {
    setStatus('Importing…')
    try {
      const res = await window.api.sheet.import()
      if (res.ok && res.body) {
        const v2 = normalizeBody(res.body)
        undoStack.current.push(body)
        setBody(v2)
        onChange(v2)
        selectCell(0, 0)
        setStatus(`Imported ${res.name ?? 'file'}. Values + formulas where available; styling is approximate.`)
      } else if (res.error) setStatus(res.error)
      else setStatus(null)
    } catch (e) {
      setStatus((e as Error).message)
    }
  }
  async function exportFile(format: 'xlsx' | 'csv'): Promise<void> {
    setStatus('Exporting…')
    try {
      const res = await window.api.sheet.export({ body, format, name: title })
      setStatus(res.ok ? `Saved ${res.path}` : res.error ?? null)
    } catch (e) {
      setStatus((e as Error).message)
    }
  }

  // ── AI fill ───────────────────────────────────────────────────────────────
  // Step one: name the columns starting at the selection's left edge, growing
  // the grid as needed. The panel stays open and advances to the rows step.
  function applyAiColumns(columns: string[]): void {
    mutateTab((t) => {
      let next = t
      const need = selection.c0 + columns.length
      while (next.columns.length < need) next = addColumn(next)
      columns.forEach((name, i) => {
        next = setColumnName(next, selection.c0 + i, name)
      })
      return next
    })
  }
  // Step two: write the generated rows just below the header, anchored to the
  // selection's top-left so they land under the columns we just created.
  function applyAiMatrix(matrix: string[][]): void {
    mutateTab((t) => writeMatrix(t, selection.r0, selection.c0, matrix))
    setAiOpen(false)
  }

  // Apply an AI formula plan in a single undo step: create any proposed columns
  // (appended to the active tab), write the formula to the active cell, and add
  // any proposed tabs.
  function applyFormulaPlan(plan: FormulaPlan): void {
    const ai = body.activeSheet ?? 0
    let nextBody: SheetBodyV2 = body
    if (plan.columnsToAdd?.length) {
      let t = activeTab(nextBody)
      for (const name of plan.columnsToAdd) {
        t = addColumn(t)
        t = setColumnName(t, t.columns.length - 1, name)
      }
      nextBody = withTab(nextBody, ai, t)
    }
    nextBody = withTab(nextBody, ai, setCell(activeTab(nextBody), focus.r, focus.c, plan.formula))
    if (plan.tabsToAdd?.length) {
      nextBody = { ...nextBody, sheets: [...nextBody.sheets, ...plan.tabsToAdd.map((tb) => emptyTab(tb.name))] }
    }
    commit(nextBody)
    setFormulaAiOpen(false)
  }

  const activeRaw = tab.rows[focus.r]?.[focus.c] ?? ''
  const activeRef = `${colLabel(focus.c)}${focus.r + 1}`

  return (
    <div className="flex flex-col h-full">
      <SheetToolbar
        activeFont={cellFormat(tab, focus.r, focus.c)?.fontFamily}
        onFormat={applyToSelection}
        onNumberFormat={applyNumberFormat}
        onInsertRow={() => mutateTab((t) => insertRowAt(t, selection.r0))}
        onDeleteRow={() => mutateTab((t) => deleteRowAt(t, selection.r0))}
        onInsertCol={() => mutateTab((t) => insertColAt(t, selection.c0))}
        onDeleteCol={() => mutateTab((t) => deleteColAt(t, selection.c0))}
        onSort={(dir) => mutateTab((t) => sortByColumn(t, selection.c0, dir))}
        onInsertChart={insertChart}
        onImport={() => void importFile()}
        onExport={(f) => void exportFile(f)}
        onAiFill={() => setAiOpen((v) => !v)}
        onUndo={undo}
        onRedo={redo}
        canUndo={undoStack.current.length > 0}
        canRedo={redoStack.current.length > 0}
      />

      <div className="flex-1 overflow-auto min-h-0 px-3 py-2">
        {/* Formula bar */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[11px] font-mono text-stone-400 w-12 text-center shrink-0">
            {colLabel(focus.c)}
            {focus.r + 1}
          </span>
          <input
            value={activeRaw}
            onChange={(e) => mutateTab((t) => setCell(t, focus.r, focus.c, e.target.value))}
            placeholder="Select a cell. Start with = for a formula, e.g. =SUM(A2:A9)"
            className="flex-1 bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600 rounded-lg px-3 py-1.5 text-[13px] font-mono focus:outline-none focus:border-accent"
          />
          <button
            onClick={() => setFormulaAiOpen((v) => !v)}
            data-testid="sheet-formula-ai-btn"
            title="Ask AI to write a formula"
            className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-accent/40 bg-accent/[0.06] text-accent px-2.5 py-1.5 text-[12px] hover:bg-accent/[0.12]"
          >
            <Icon name="function" size={13} />
            AI
          </button>
        </div>

        {formulaAiOpen && (
          <SheetFormulaAssist
            headers={tab.columns}
            activeRef={activeRef}
            sample={tab.rows.slice(0, 5)}
            onApply={applyFormulaPlan}
            onClose={() => setFormulaAiOpen(false)}
          />
        )}

        {status && (
          <div className="mb-2 text-[12px] text-stone-500 dark:text-stone-400 flex items-center gap-1.5" data-testid="sheet-status">
            <span>{status}</span>
            <button onClick={() => setStatus(null)} className="text-stone-400 hover:text-stone-600">
              <Icon name="close" size={12} />
            </button>
          </div>
        )}

        {/* Excel-style auto-fill options: after a numeric fill, flip between
            copying the value and continuing the series. */}
        {lastFill && (
          <div
            className="mb-2 inline-flex items-center gap-2 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 px-2 py-1 text-[12px]"
            data-testid="sheet-fill-options"
          >
            <Icon name="auto_fix_high" size={13} className="text-accent" />
            <span className="text-stone-500 dark:text-stone-400">Filled as {lastFill.mode === 'series' ? 'series' : 'copy'}.</span>
            <button onClick={toggleFillMode} className="text-accent hover:underline">
              Switch to {lastFill.mode === 'series' ? 'copy' : 'series'}
            </button>
            <button onClick={() => setLastFill(null)} className="text-stone-400 hover:text-stone-600">
              <Icon name="close" size={12} />
            </button>
          </div>
        )}

        {aiOpen && (
          <SheetAiFill
            headers={Array.from({ length: selection.c1 - selection.c0 + 1 }, (_, i) => tab.columns[selection.c0 + i] ?? colLabel(selection.c0 + i))}
            rangeRows={Math.max(1, selection.r1 - selection.r0 + 1)}
            onApplyColumns={applyAiColumns}
            onApply={applyAiMatrix}
            onClose={() => setAiOpen(false)}
          />
        )}

        <div
          ref={gridWrapRef}
          tabIndex={0}
          onKeyDown={(e) => void onGridKeyDown(e)}
          className="outline-none"
        >
          <SheetGrid
            tab={tab}
            selection={selection}
            active={focus}
            editing={editing}
            editValue={editValue}
            colWidthOf={colWidthOf}
            onEditValue={handleEditValue}
            onCellMouseDown={onCellMouseDown}
            onCellMouseEnter={onCellMouseEnter}
            onCellDoubleClick={(r, c) => startEdit({ r, c })}
            onCommitEdit={commitEdit}
            onCancelEdit={() => setEditing(null)}
            onHeaderRename={(c, name) => mutateTab((t) => setColumnName(t, c, name))}
            onColResizeStart={onColResizeStart}
            onHeaderContextMenu={(c, x, y) => setColMenu({ c, x, y })}
            editInputRef={editInputRef}
            formulaRefMode={inFormulaEdit()}
            fillPreview={fillPreview}
            onFillStart={onFillStart}
            onFillToEnd={onFillToEnd}
          />
          {funcMenu && editInputRef.current && (
            <FormulaMenu
              rect={editInputRef.current.getBoundingClientRect()}
              menu={funcMenu}
              activeIndex={Math.min(funcIndex, funcMenu.items.length - 1)}
              onPick={(i) => applyFunc(funcMenu, i)}
            />
          )}
        </div>

        {colMenu && (
          <ColumnHeaderMenu
            x={colMenu.x}
            y={colMenu.y}
            canDelete={tab.columns.length > 1}
            onInsertLeft={() => { mutateTab((t) => insertColAt(t, colMenu.c)); setColMenu(null) }}
            onInsertRight={() => { mutateTab((t) => insertColAt(t, colMenu.c + 1)); setColMenu(null) }}
            onDelete={() => { mutateTab((t) => deleteColAt(t, colMenu.c)); setColMenu(null) }}
            onClose={() => setColMenu(null)}
          />
        )}

        <button
          onClick={() => mutateTab((t) => addRow(t))}
          className="mt-2 text-[12px] text-stone-500 dark:text-stone-400 hover:text-accent inline-flex items-center gap-1"
        >
          <Icon name="add" size={14} /> Add row
        </button>

        {/* Charts */}
        {(tab.charts ?? []).length > 0 && (
          <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
            {tab.charts!.map((spec) => (
              <SheetChart key={spec.id} spec={spec} tab={tab} onRemove={() => removeChart(spec.id)} />
            ))}
          </div>
        )}
      </div>

      <SheetTabStrip body={body} onSwitch={switchTab} onAdd={addTab} onRename={renameTab} onDelete={deleteTab} />
    </div>
  )
}

// Right-click column-header menu: insert a column on either side of the clicked
// header, or delete it.
function ColumnHeaderMenu({
  x,
  y,
  canDelete,
  onInsertLeft,
  onInsertRight,
  onDelete,
  onClose
}: {
  x: number
  y: number
  canDelete: boolean
  onInsertLeft: () => void
  onInsertRight: () => void
  onDelete: () => void
  onClose: () => void
}): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    function onDown(e: MouseEvent): void {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])
  const left = Math.min(x, window.innerWidth - 210)
  const top = Math.min(y, window.innerHeight - 140)
  const item =
    'w-full flex items-center gap-2 px-3 py-1.5 text-[12px] hover:bg-stone-100 dark:hover:bg-stone-800 text-left'
  return (
    <div
      ref={ref}
      data-testid="sheet-col-menu"
      className="fixed z-[100] w-52 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 shadow-xl py-1 text-stone-700 dark:text-stone-200"
      style={{ left, top }}
    >
      <button className={item} onClick={onInsertLeft}>
        <Icon name="add" size={13} className="text-stone-400" /> Insert column left
      </button>
      <button className={item} onClick={onInsertRight}>
        <Icon name="add" size={13} className="text-stone-400" /> Insert column right
      </button>
      <div className="my-1 border-t border-stone-200 dark:border-stone-700" />
      <button
        className={item + ' text-red-600 disabled:opacity-40'}
        onClick={onDelete}
        disabled={!canDelete}
      >
        <Icon name="delete" size={13} /> Delete column
      </button>
    </div>
  )
}

// The formula function menu, anchored just under the cell being edited. Buttons
// use onMouseDown + preventDefault so picking one does not blur the edit input
// (a blur would commit the half-typed formula).
function FormulaMenu({
  rect,
  menu,
  activeIndex,
  onPick
}: {
  rect: DOMRect
  menu: FuncMenu
  activeIndex: number
  onPick: (index: number) => void
}): JSX.Element {
  const top = Math.min(rect.bottom + 2, window.innerHeight - 240)
  const left = Math.min(rect.left, window.innerWidth - 280)
  return (
    <div
      data-testid="sheet-formula-menu"
      className="fixed z-[120] w-[268px] max-h-[230px] overflow-auto rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 shadow-xl py-1 text-stone-700 dark:text-stone-200"
      style={{ top, left }}
    >
      {menu.items.map((f, i) => (
        <button
          key={f.name}
          data-testid={`sheet-func-${f.name}`}
          onMouseDown={(e) => {
            e.preventDefault()
            onPick(i)
          }}
          className={`w-full text-left px-3 py-1.5 ${
            i === activeIndex ? 'bg-accent/15' : 'hover:bg-stone-100 dark:hover:bg-stone-800'
          }`}
        >
          <span className="font-mono text-[12px] font-semibold text-accent">{f.name}</span>
          <span className="block text-[11px] text-stone-500 dark:text-stone-400 truncate">{f.hint}</span>
        </button>
      ))}
    </div>
  )
}
