// The spreadsheet grid surface. Cells render as divs (fast), with a single
// floating <input> mounted over the cell being edited (the Excel model). It owns
// no data: selection, the active/editing cell, and all mutations are driven by
// SheetEditor through props. Formatting (bold/colour/align/number format) is
// applied per cell from the tab's sparse format map.

import { useEffect, useRef, useState } from 'react'
import type { SheetTab } from '@shared/types'
import { displayCell, type Grid, type Workbook } from '../../../lib/sheetFormula'
import { formatValue } from '../../../lib/sheetFormat'
import { cellFormat, colLabel } from '../../../lib/sheetBody'
import { applyCondFormat, validationForCell, valueIsValid } from '../../../lib/sheetCond'
import { loadGoogleFont, familyLabel } from '../../../lib/googleFonts'
import type { CellRange } from './sheetOps'

interface Props {
  tab: SheetTab
  selection: CellRange | null
  active: { r: number; c: number } | null
  editing: { r: number; c: number } | null
  editValue: string
  colWidthOf: (c: number) => number
  onEditValue: (v: string) => void
  onCellMouseDown: (r: number, c: number, shift: boolean) => void
  onCellMouseEnter: (r: number, c: number) => void
  onCellDoubleClick: (r: number, c: number) => void
  onCommitEdit: (move: 'down' | 'right' | 'none') => void
  onCancelEdit: () => void
  onHeaderRename: (c: number, name: string) => void
  onColResizeStart: (c: number, e: React.MouseEvent) => void
  onColAutoFit?: (c: number) => void
  onHeaderContextMenu: (c: number, x: number, y: number) => void
  // When editing a formula, clicking another cell inserts its reference instead
  // of moving the selection. The parent exposes the edit input (so it can read
  // the caret and write the ref) and tells the grid it is in reference mode (so
  // a cell click keeps the input focused rather than blurring + committing).
  editInputRef?: React.MutableRefObject<HTMLInputElement | null>
  formulaRefMode?: boolean
  // The fill handle: a live preview rectangle while dragging it, a start hook
  // (mousedown on the handle), and a fill-to-end hook (double-click the handle).
  fillPreview?: CellRange | null
  onFillStart?: () => void
  onFillToEnd?: () => void
  // Directly set a cell value (used by the data-validation in-cell dropdown).
  onSetCell?: (r: number, c: number, value: string) => void
  // The whole workbook, so cross-sheet references (Sheet2!A1) resolve at render.
  workbook?: Workbook
}

const ROW_HEADER_W = 44

function inRange(range: CellRange | null, r: number, c: number): boolean {
  if (!range) return false
  return r >= range.r0 && r <= range.r1 && c >= range.c0 && c <= range.c1
}

export default function SheetGrid(props: Props): JSX.Element {
  const { tab, selection, active, editing } = props
  const grid: Grid = { columns: tab.columns, rows: tab.rows }
  const editRef = useRef<HTMLInputElement | null>(null)
  // Which cell's data-validation list dropdown is open (null = none).
  const [openList, setOpenList] = useState<{ r: number; c: number } | null>(null)

  useEffect(() => {
    if (editing) editRef.current?.focus()
  }, [editing])

  const freezeHeader = (tab.freeze?.rows ?? 1) >= 1

  return (
    <div className="h-full overflow-auto border border-stone-200 dark:border-stone-700 rounded-lg" data-testid="sheet-grid">
      <table className="border-collapse text-[13px]" style={{ tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: ROW_HEADER_W }} />
          {tab.columns.map((_, c) => (
            <col key={c} style={{ width: props.colWidthOf(c) }} />
          ))}
        </colgroup>
        <thead>
          <tr className={freezeHeader ? 'sticky top-0 z-20' : ''}>
            <th className="sticky left-0 z-30 bg-stone-100 dark:bg-stone-800 border-b border-r border-stone-200 dark:border-stone-700" />
            {tab.columns.map((col, c) => (
              <th
                key={c}
                data-testid={`col-header-${c}`}
                onContextMenu={(e) => {
                  e.preventDefault()
                  props.onHeaderContextMenu(c, e.clientX, e.clientY)
                }}
                className="relative border-b border-r border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/60 p-0"
              >
                <div className="flex items-center">
                  <span className="px-1 text-[10px] text-stone-400 select-none">{colLabel(c)}</span>
                  <input
                    value={col}
                    onChange={(e) => props.onHeaderRename(c, e.target.value)}
                    className="w-full bg-transparent px-1 py-1.5 text-[12px] font-semibold text-stone-700 dark:text-stone-200 focus:outline-none min-w-0"
                  />
                </div>
                {/* Column resize handle. Drag to set the width (which drives the
                    sheet's total width); double-click to auto-fit to content. */}
                <span
                  onMouseDown={(e) => props.onColResizeStart(c, e)}
                  onDoubleClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    props.onColAutoFit?.(c)
                  }}
                  title="Drag to resize · double-click to fit"
                  className="absolute top-0 right-0 h-full w-[8px] translate-x-1/2 z-20 cursor-col-resize hover:bg-accent/40"
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tab.rows.map((_row, r) => (
            <tr key={r}>
              <td className="sticky left-0 z-10 bg-stone-100 dark:bg-stone-800 text-center text-[11px] text-stone-400 border-b border-r border-stone-200 dark:border-stone-700 select-none">
                {r + 1}
              </td>
              {tab.columns.map((_, c) => {
                const isActive = active?.r === r && active?.c === c
                const isEditing = editing?.r === r && editing?.c === c
                const selected = inRange(selection, r, c)
                const inFillPreview = inRange(props.fillPreview ?? null, r, c) && !selected
                // The fill handle sits on the bottom-right cell of the selection.
                const showHandle =
                  !isEditing &&
                  !!selection &&
                  !!props.onFillStart &&
                  r === selection.r1 &&
                  c === selection.c1
                const computed = displayCell(grid, r, c, props.workbook)
                // Base cell format, then overlay any matching conditional-format
                // rule (paint only — the true value is unchanged).
                const fmt = applyCondFormat(cellFormat(tab, r, c), tab.condRules, r, c, computed)
                const shown = formatValue(computed, fmt?.numFmt)
                // Data validation: a list rule shows an in-cell dropdown; any rule
                // flags an invalid current value (the value is never auto-changed).
                const validation = validationForCell(tab.validations, r, c)
                const invalid = validation ? !valueIsValid(computed, validation.rule) : false
                const listValues =
                  validation && validation.rule.kind === 'list' ? validation.rule.values : null
                const listOpen = !!openList && openList.r === r && openList.c === c
                const isErr = computed === '#ERR'
                if (fmt?.fontFamily) loadGoogleFont(familyLabel(fmt.fontFamily))
                const style: React.CSSProperties = {
                  fontWeight: fmt?.bold ? 700 : undefined,
                  fontStyle: fmt?.italic ? 'italic' : undefined,
                  textDecoration: fmt?.underline ? 'underline' : undefined,
                  color: isErr ? '#ef4444' : fmt?.color,
                  backgroundColor: fmt?.bg,
                  fontFamily: fmt?.fontFamily || undefined,
                  textAlign: fmt?.align ?? (computed !== '' && Number.isFinite(Number(computed)) ? 'right' : 'left')
                }
                return (
                  <td
                    key={c}
                    data-testid={`cell-${r}-${c}`}
                    onMouseDown={(e) => {
                      // In formula reference mode, prevent the default focus
                      // shift so the edit input keeps focus (no blur -> no
                      // commit). Clicking inside an input (the editing cell, or
                      // a header) is left alone so the caret can be placed.
                      if (props.formulaRefMode && !(e.target instanceof HTMLInputElement)) e.preventDefault()
                      props.onCellMouseDown(r, c, e.shiftKey)
                    }}
                    onMouseEnter={() => props.onCellMouseEnter(r, c)}
                    onDoubleClick={() => props.onCellDoubleClick(r, c)}
                    className={`relative border-b border-r border-stone-200 dark:border-stone-700 p-0 align-top ${
                      selected ? 'bg-accent/[0.10]' : inFillPreview ? 'bg-accent/[0.06]' : ''
                    } ${isActive ? 'outline outline-2 -outline-offset-1 outline-accent' : ''}`}
                  >
                    {showHandle && (
                      <span
                        data-testid="sheet-fill-handle"
                        title="Drag to fill. Double-click to fill down to the end of your data."
                        onMouseDown={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          props.onFillStart?.()
                        }}
                        onDoubleClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          props.onFillToEnd?.()
                        }}
                        className="absolute -bottom-[3px] -right-[3px] z-10 h-[7px] w-[7px] cursor-crosshair rounded-[1px] bg-accent border border-white dark:border-stone-900"
                      />
                    )}
                    {/* Data validation: invalid-value marker (a small red corner). */}
                    {invalid && !isEditing && (
                      <span
                        data-testid={`cell-invalid-${r}-${c}`}
                        title="Value does not match this cell's data validation"
                        className="absolute top-0 right-0 z-10 h-0 w-0 border-t-[6px] border-l-[6px] border-t-red-500 border-l-transparent"
                      />
                    )}
                    {/* Data validation: in-cell dropdown for a list rule. */}
                    {listValues && !isEditing && (
                      <button
                        data-testid={`cell-list-${r}-${c}`}
                        title="Choose a value"
                        onMouseDown={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setOpenList(listOpen ? null : { r, c })
                        }}
                        className="absolute bottom-0 right-0 z-10 flex h-4 w-4 items-center justify-center text-stone-400 hover:text-stone-600"
                      >
                        <span className="text-[9px] leading-none">▾</span>
                      </button>
                    )}
                    {listValues && listOpen && (
                      <>
                        <div className="fixed inset-0 z-20" onMouseDown={() => setOpenList(null)} />
                        <div className="absolute left-0 top-full z-30 min-w-full max-h-40 overflow-auto rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 shadow-lg py-1">
                          {listValues.map((v) => (
                            <button
                              key={v}
                              data-testid={`cell-list-opt-${r}-${c}-${v}`}
                              onMouseDown={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                props.onSetCell?.(r, c, v)
                                setOpenList(null)
                              }}
                              className="block w-full text-left px-3 py-1 text-[12px] hover:bg-stone-100 dark:hover:bg-stone-700 whitespace-nowrap"
                            >
                              {v}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                    {isEditing ? (
                      <input
                        ref={(el) => {
                          editRef.current = el
                          if (props.editInputRef) props.editInputRef.current = el
                        }}
                        value={props.editValue}
                        onChange={(e) => props.onEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            props.onCommitEdit('down')
                          } else if (e.key === 'Tab') {
                            e.preventDefault()
                            props.onCommitEdit('right')
                          } else if (e.key === 'Escape') {
                            e.preventDefault()
                            props.onCancelEdit()
                          }
                        }}
                        onBlur={() => props.onCommitEdit('none')}
                        className="w-full px-2 py-1.5 bg-white dark:bg-stone-900 outline-none text-stone-900 dark:text-stone-100 font-mono"
                      />
                    ) : (
                      <div
                        style={style}
                        className={`px-2 py-1.5 whitespace-pre-wrap break-words select-none text-stone-800 dark:text-stone-100 ${listValues ? 'pr-4' : ''}`}
                        title={shown}
                      >
                        {shown}
                      </div>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
