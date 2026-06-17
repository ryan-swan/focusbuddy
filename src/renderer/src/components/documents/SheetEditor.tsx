import { useCallback, useEffect, useRef, useState } from 'react'
import type { SheetBody, SheetBodyV2, SheetCellFormat, SheetChartSpec, SheetNumberFormat, SheetTab } from '@shared/types'
import {
  normalizeBody,
  withTab,
  activeTab,
  emptyTab,
  colLabel
} from '../../lib/sheetBody'
import {
  setCell,
  setColumnName,
  addRow,
  insertRowAt,
  deleteRowAt,
  insertColAt,
  deleteColAt,
  applyFormat,
  writeMatrix,
  sortByColumn,
  setColWidth,
  parseTsv,
  rangeToTsv,
  normalizeRange,
  type CellRange
} from './sheet/sheetOps'
import SheetGrid from './sheet/SheetGrid'
import SheetToolbar from './sheet/SheetToolbar'
import SheetTabStrip from './sheet/SheetTabStrip'
import SheetChart from './sheet/SheetChart'
import SheetAiFill from './sheet/SheetAiFill'
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

const DEFAULT_COL_W = 120

export default function SheetEditor({ body: rawBody, title, onChange }: Props): JSX.Element {
  const [body, setBody] = useState<SheetBodyV2>(() => normalizeBody(rawBody))
  const [anchor, setAnchor] = useState<Cell>({ r: 0, c: 0 })
  const [focus, setFocus] = useState<Cell>({ r: 0, c: 0 })
  const [editing, setEditing] = useState<Cell | null>(null)
  const [editValue, setEditValue] = useState('')
  const [aiOpen, setAiOpen] = useState(false)
  const [liveWidth, setLiveWidth] = useState<{ c: number; w: number } | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  const undoStack = useRef<SheetBodyV2[]>([])
  const redoStack = useRef<SheetBodyV2[]>([])
  const dragging = useRef(false)
  const gridWrapRef = useRef<HTMLDivElement | null>(null)

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
  function onCellMouseDown(r: number, c: number, shift: boolean): void {
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
    if (dragging.current) setFocus({ r, c })
  }
  useEffect(() => {
    const up = (): void => {
      dragging.current = false
    }
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [])

  function startEdit(cell: Cell, initial?: string): void {
    setEditing(cell)
    setEditValue(initial ?? tab.rows[cell.r]?.[cell.c] ?? '')
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
      await navigator.clipboard.writeText(rangeToTsv(tab, selection)).catch(() => {})
      return
    }
    if (mod && e.key.toLowerCase() === 'x') {
      e.preventDefault()
      await navigator.clipboard.writeText(rangeToTsv(tab, selection)).catch(() => {})
      mutateTab((t) => {
        let next = t
        for (let rr = selection.r0; rr <= selection.r1; rr++)
          for (let cc = selection.c0; cc <= selection.c1; cc++) next = setCell(next, rr, cc, '')
        return next
      })
      return
    }
    if (mod && e.key.toLowerCase() === 'v') {
      e.preventDefault()
      const text = await navigator.clipboard.readText().catch(() => '')
      if (text) mutateTab((t) => writeMatrix(t, focus.r, focus.c, parseTsv(text)))
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
    // A printable character starts editing with that character.
    if (e.key.length === 1 && !mod) {
      startEdit(focus, e.key)
    }
  }
  function move(r: number, c: number, extend: boolean): void {
    setFocus({ r, c })
    if (!extend) setAnchor({ r, c })
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
  function applyAiMatrix(matrix: string[][]): void {
    mutateTab((t) => writeMatrix(t, selection.r0, selection.c0, matrix))
    setAiOpen(false)
  }

  const activeRaw = tab.rows[focus.r]?.[focus.c] ?? ''

  return (
    <div className="flex flex-col h-full">
      <SheetToolbar
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
        </div>

        {status && (
          <div className="mb-2 text-[12px] text-stone-500 dark:text-stone-400 flex items-center gap-1.5" data-testid="sheet-status">
            <span>{status}</span>
            <button onClick={() => setStatus(null)} className="text-stone-400 hover:text-stone-600">
              <Icon name="close" size={12} />
            </button>
          </div>
        )}

        {aiOpen && (
          <SheetAiFill
            headers={Array.from({ length: selection.c1 - selection.c0 + 1 }, (_, i) => tab.columns[selection.c0 + i] ?? colLabel(selection.c0 + i))}
            rangeRows={Math.max(1, selection.r1 - selection.r0 + 1)}
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
            onEditValue={setEditValue}
            onCellMouseDown={onCellMouseDown}
            onCellMouseEnter={onCellMouseEnter}
            onCellDoubleClick={(r, c) => startEdit({ r, c })}
            onCommitEdit={commitEdit}
            onCancelEdit={() => setEditing(null)}
            onHeaderRename={(c, name) => mutateTab((t) => setColumnName(t, c, name))}
            onColResizeStart={onColResizeStart}
          />
        </div>

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
