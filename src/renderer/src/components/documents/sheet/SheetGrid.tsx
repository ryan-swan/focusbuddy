// The spreadsheet grid surface. Cells render as divs (fast), with a single
// floating <input> mounted over the cell being edited (the Excel model). It owns
// no data: selection, the active/editing cell, and all mutations are driven by
// SheetEditor through props. Formatting (bold/colour/align/number format) is
// applied per cell from the tab's sparse format map.

import { useEffect, useRef } from 'react'
import type { SheetTab } from '@shared/types'
import { displayCell, type Grid } from '../../../lib/sheetFormula'
import { formatValue } from '../../../lib/sheetFormat'
import { cellFormat, colLabel } from '../../../lib/sheetBody'
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
  onHeaderContextMenu: (c: number, x: number, y: number) => void
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

  useEffect(() => {
    if (editing) editRef.current?.focus()
  }, [editing])

  const freezeHeader = (tab.freeze?.rows ?? 1) >= 1

  return (
    <div className="overflow-auto border border-stone-200 dark:border-stone-700 rounded-lg max-h-[70vh]" data-testid="sheet-grid">
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
                {/* Column resize handle */}
                <span
                  onMouseDown={(e) => props.onColResizeStart(c, e)}
                  className="absolute top-0 right-0 h-full w-[5px] cursor-col-resize hover:bg-accent/40"
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
                const fmt = cellFormat(tab, r, c)
                const computed = displayCell(grid, r, c)
                const shown = formatValue(computed, fmt?.numFmt)
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
                    onMouseDown={(e) => props.onCellMouseDown(r, c, e.shiftKey)}
                    onMouseEnter={() => props.onCellMouseEnter(r, c)}
                    onDoubleClick={() => props.onCellDoubleClick(r, c)}
                    className={`border-b border-r border-stone-200 dark:border-stone-700 p-0 ${
                      selected ? 'bg-accent/[0.10]' : ''
                    } ${isActive ? 'outline outline-2 -outline-offset-1 outline-accent' : ''}`}
                  >
                    {isEditing ? (
                      <input
                        ref={editRef}
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
                        className="px-2 py-1.5 truncate select-none text-stone-800 dark:text-stone-100"
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
