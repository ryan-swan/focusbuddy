// The spreadsheet grid surface. Cells render as divs (fast), with a single
// floating <input> mounted over the cell being edited (the Excel model). It owns
// no data: selection, the active/editing cell, and all mutations are driven by
// SheetEditor through props. Formatting (bold/colour/align/number format) is
// applied per cell from the tab's sparse format map.

import { useEffect, useMemo, useRef, useState } from 'react'
import type { SheetTab } from '@shared/types'
import { displayCell, buildSpillMap, sparklineForCell, type Grid, type Workbook } from '../../../lib/sheetFormula'
import { formatValue } from '../../../lib/sheetFormat'
import { cellFormat, colLabel } from '../../../lib/sheetBody'
import {
  applyCondFormat,
  validationForCell,
  valueIsValid,
  distinctValues
} from '../../../lib/sheetCond'
import Icon from '../../Icon'
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
  // Named ranges the formula engine resolves (e.g. =SUM(Revenue)).
  names?: Map<string, string>
  // Column filters: rows to hide, whether funnels show, the current per-column
  // hide-sets, and a setter. SheetGrid owns the funnel dropdown UI.
  hiddenRows?: Set<number> | null
  filterActive?: boolean
  filters?: Record<number, string[]>
  onSetColumnFilter?: (c: number, hidden: string[]) => void
}

const ROW_HEADER_W = 44

function inRange(range: CellRange | null, r: number, c: number): boolean {
  if (!range) return false
  return r >= range.r0 && r <= range.r1 && c >= range.c0 && c <= range.c1
}

export default function SheetGrid(props: Props): JSX.Element {
  const { tab, selection, active, editing } = props
  const grid: Grid = { columns: tab.columns, rows: tab.rows }
  // Spill map for array formulas (SEQUENCE/UNIQUE/SORT/FILTER/TRANSPOSE), built
  // once per data change rather than per cell. Drives both the anchor's value and
  // the cells the result spills into.
  const spill = useMemo(
    () => buildSpillMap({ columns: tab.columns, rows: tab.rows }, props.workbook, props.names),
    [tab.columns, tab.rows, props.workbook, props.names]
  )
  const editRef = useRef<HTMLInputElement | null>(null)
  // Which cell's data-validation list dropdown is open (null = none).
  const [openList, setOpenList] = useState<{ r: number; c: number } | null>(null)
  // Which column header's filter funnel dropdown is open (null = none).
  const [openFilter, setOpenFilter] = useState<number | null>(null)

  useEffect(() => {
    if (editing) editRef.current?.focus()
  }, [editing])

  const freezeHeader = (tab.freeze?.rows ?? 1) >= 1

  return (
    <div className="h-full overflow-auto border border-[var(--edge-soft)] rounded-lg" data-testid="sheet-grid">
      <table className="border-collapse text-[13px]" style={{ tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: ROW_HEADER_W }} />
          {tab.columns.map((_, c) => (
            <col key={c} style={{ width: props.colWidthOf(c) }} />
          ))}
        </colgroup>
        <thead>
          <tr className={freezeHeader ? 'sticky top-0 z-20' : ''}>
            <th className="sticky left-0 z-30 bg-[var(--surface-sunken)] border-b border-r border-[var(--edge-soft)]" />
            {tab.columns.map((col, c) => (
              <th
                key={c}
                data-testid={`col-header-${c}`}
                onContextMenu={(e) => {
                  e.preventDefault()
                  props.onHeaderContextMenu(c, e.clientX, e.clientY)
                }}
                className="relative border-b border-r border-[var(--edge-soft)] bg-[var(--surface-sunken)] p-0"
              >
                <div className="flex items-center">
                  <span className="px-1 text-[10px] text-[var(--ink-40)] select-none">{colLabel(c)}</span>
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
                {/* Filter funnel (Data > Create a filter). Highlighted when this
                    column has an active filter. */}
                {props.filterActive && (
                  <button
                    data-testid={`col-filter-${c}`}
                    title="Filter this column"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setOpenFilter(openFilter === c ? null : c)
                    }}
                    className={`absolute right-1.5 top-1/2 -translate-y-1/2 z-10 ${
                      props.filters?.[c]?.length
                        ? 'text-accent'
                        : 'text-[var(--ink-40)] hover:text-[var(--ink-70)]'
                    }`}
                  >
                    <Icon name="filter_alt" size={13} />
                  </button>
                )}
                {props.filterActive && openFilter === c && (
                  <FilterDropdown
                    values={distinctValues(
                      tab.rows.map((_, r) => displayCell(grid, r, c, props.workbook, spill, props.names))
                    )}
                    hidden={props.filters?.[c] ?? []}
                    onApply={(hidden) => {
                      props.onSetColumnFilter?.(c, hidden)
                    }}
                    onClose={() => setOpenFilter(null)}
                  />
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tab.rows.map((_row, r) => {
            // Filtered-out rows are not rendered, but r stays the true data index
            // so selection, fill, and every formula reference are unaffected.
            if (props.hiddenRows?.has(r)) return null
            return (
            <tr key={r}>
              <td className="sticky left-0 z-10 bg-[var(--surface-sunken)] text-center text-[11px] text-[var(--ink-40)] border-b border-r border-[var(--edge-soft)] select-none">
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
                const computed = displayCell(grid, r, c, props.workbook, spill, props.names)
                // A =SPARKLINE(...) cell is drawn as a mini chart instead of text.
                // Only a cell that holds the formula qualifies (sparklineForCell
                // returns null for empty/spilled cells), so nothing else can be
                // mistaken for a sparkline.
                const sparkline = sparklineForCell(grid, r, c, props.workbook, props.names)
                // A spilled cell shows a value an array formula produced in a
                // neighbour, while its own raw is empty — rendered muted so it
                // reads as computed, not typed.
                const isSpilled = (tab.rows[r]?.[c] ?? '').trim() === '' && spill.has(`${r},${c}`)
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
                  color: isErr ? '#ef4444' : isSpilled ? '#7c6cf0' : fmt?.color,
                  backgroundColor: fmt?.bg,
                  fontFamily: fmt?.fontFamily || undefined,
                  textAlign: fmt?.align ?? (computed !== '' && Number.isFinite(Number(computed)) ? 'right' : 'left')
                }
                return (
                  <td
                    key={c}
                    data-testid={`cell-${r}-${c}`}
                    data-spill={isSpilled ? '1' : undefined}
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
                    className={`relative border-b border-r border-[var(--edge-soft)] p-0 align-top ${
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
                        className="absolute bottom-0 right-0 z-10 flex h-4 w-4 items-center justify-center text-[var(--ink-40)] hover:text-[var(--ink-70)]"
                      >
                        <span className="text-[9px] leading-none">▾</span>
                      </button>
                    )}
                    {listValues && listOpen && (
                      <>
                        <div className="fixed inset-0 z-20" onMouseDown={() => setOpenList(null)} />
                        <div className="absolute left-0 top-full z-30 min-w-full max-h-40 overflow-auto rounded-md border border-[var(--edge-soft)] bg-[var(--surface-raised)] shadow-lg py-1">
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
                              className="block w-full text-left px-3 py-1 text-[12px] hover:bg-[var(--surface-sunken)] whitespace-nowrap"
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
                    ) : sparkline ? (
                      <div
                        className="px-2 py-1.5 select-none text-accent"
                        title={`Sparkline of ${sparkline.values.length} value${sparkline.values.length === 1 ? '' : 's'}`}
                      >
                        <SparklineCell
                          r={r}
                          c={c}
                          values={sparkline.values}
                          type={sparkline.type}
                          width={props.colWidthOf(c) - 16}
                        />
                      </div>
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
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// A mini in-cell chart for a =SPARKLINE(...) cell. Draws a polyline (line) or
// thin bars (bar) across the cell width, normalised to the value range. The SVG
// uses currentColor so it inherits the accent set on the wrapper and stays crisp
// in dark mode. With fewer than the points a chart needs, or no numeric values at
// all, it renders a faint baseline placeholder rather than inventing data.
function SparklineCell({
  r,
  c,
  values,
  type,
  width
}: {
  r: number
  c: number
  values: number[]
  type: 'line' | 'bar'
  width: number
}): JSX.Element {
  const w = Math.max(24, Math.round(width))
  const h = 18
  const testid = `sparkline-${r}-${c}`
  // A line needs two points; a single value or none has nothing to plot. Show a
  // faint baseline so the cell reads as an empty chart, never a fabricated trend.
  const drawable = type === 'bar' ? values.length >= 1 : values.length >= 2
  if (!drawable) {
    return (
      <svg
        data-testid={testid}
        data-sparkline-empty="1"
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        className="text-[var(--ink-30)]"
        aria-hidden="true"
      >
        <line x1={0} y1={h - 2} x2={w} y2={h - 2} stroke="currentColor" strokeWidth={1} strokeDasharray="2 2" />
      </svg>
    )
  }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const pad = 2
  if (type === 'bar') {
    const gap = values.length > 20 ? 0.5 : 1
    const barW = (w - gap * (values.length - 1)) / values.length
    const baseMax = max <= 0 ? 1 : max
    return (
      <svg
        data-testid={testid}
        data-sparkline-type="bar"
        data-sparkline-count={values.length}
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        aria-hidden="true"
      >
        {values.map((v, i) => {
          const barH = Math.max(1, (Math.max(0, v) / baseMax) * (h - pad))
          return (
            <rect
              key={i}
              x={(barW + gap) * i}
              y={h - barH}
              width={Math.max(0.5, barW)}
              height={barH}
              rx={0.5}
              fill="currentColor"
            />
          )
        })}
      </svg>
    )
  }
  const d = values
    .map((v, i) => {
      const x = pad + (i / (values.length - 1)) * (w - pad * 2)
      const y = h - pad - ((v - min) / range) * (h - pad * 2)
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg
      data-testid={testid}
      data-sparkline-type="line"
      data-sparkline-count={values.length}
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      fill="none"
      aria-hidden="true"
    >
      <path d={d} stroke="currentColor" strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// The filter funnel dropdown: a checkbox list of the column's distinct values.
// Checked = visible; unchecking adds the value to the column's hide-set.
function FilterDropdown({
  values,
  hidden,
  onApply,
  onClose
}: {
  values: string[]
  hidden: string[]
  onApply: (hidden: string[]) => void
  onClose: () => void
}): JSX.Element {
  const hide = new Set(hidden)
  const toggle = (v: string): void => {
    const next = new Set(hide)
    if (next.has(v)) next.delete(v)
    else next.add(v)
    onApply([...next])
  }
  return (
    <>
      <div className="fixed inset-0 z-30" onMouseDown={onClose} />
      <div
        data-testid="sheet-filter-dropdown"
        className="absolute left-0 top-full z-40 mt-0.5 w-48 rounded-md border border-[var(--edge-soft)] bg-[var(--surface-raised)] shadow-lg"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-2 py-1 border-b border-[var(--edge-soft)] text-[11px]">
          <button className="text-accent hover:underline" onMouseDown={() => onApply([])}>
            Select all
          </button>
          <button
            className="text-[var(--ink-50)] hover:underline"
            onMouseDown={() => onApply(values.slice())}
          >
            Clear
          </button>
        </div>
        <div className="max-h-52 overflow-auto py-1">
          {values.map((v) => (
            <label
              key={v}
              className="flex items-center gap-2 px-2 py-1 text-[12px] hover:bg-[var(--surface-sunken)] cursor-pointer"
            >
              <input type="checkbox" checked={!hide.has(v)} onChange={() => toggle(v)} />
              <span className="truncate">{v === '' ? '(blanks)' : v}</span>
            </label>
          ))}
        </div>
      </div>
    </>
  )
}
