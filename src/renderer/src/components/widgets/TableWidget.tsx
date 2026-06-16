import { useEffect, useRef, useState } from 'react'
import type { Widget } from '@shared/types'
import type {
  FbRow,
  FieldDefinition,
  FieldType,
  TableSchema,
  TableViewConfig,
  TableViewMode
} from '@shared/fields'
import {
  FIELD_TYPE_ICONS,
  FIELD_TYPE_LABELS,
  defaultConfig,
  defaultValue
} from '@shared/fields'
import WidgetFrame from './WidgetFrame'
import TableImportDialog from './TableImportDialog'
import type { ParsedGrid } from '../../lib/tableImport'
import { useTablesStore } from '../../stores/tables'
import { useWidgetStore } from '../../stores/widgets'
import FieldEditor from '../fields/FieldEditor'
import RelationConfigEditor from '../fields/RelationConfigEditor'
import { coerceCellValue } from '../../lib/actionExecutor'
import Icon from '../Icon'
import { ListView, CardsView, KanbanView, CalendarView, GanttView } from './TableViews'
import UnifiedConnectedMenu from '../contextMenu/UnifiedConnectedMenu'
import TableFilterBar from './TableFilterBar'
import { applyFilters, groupRows } from '../../lib/tableFilter'
import type { RowGroup } from '../../lib/tableFilter'

// All available views with the icon + label that drive the switcher pill.
const VIEW_OPTIONS: Array<{ id: TableViewMode; label: string; icon: string }> = [
  { id: 'table', label: 'Table', icon: 'table_chart' },
  { id: 'list', label: 'List', icon: 'view_list' },
  { id: 'cards', label: 'Cards', icon: 'view_module' },
  { id: 'kanban', label: 'Kanban', icon: 'view_kanban' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar_month' },
  { id: 'gantt', label: 'Gantt', icon: 'timeline' }
]

// Table-view column geometry. The leading column holds the delete-row button,
// the trailing one holds the add-column button; data columns size to their
// per-column widthHint and fall back to DEFAULT_COL_WIDTH. Resizing never goes
// below MIN_COL_WIDTH so a column can't collapse to nothing.
const ROW_HANDLE_WIDTH = 32
const ADD_COL_WIDTH = 40
const DEFAULT_COL_WIDTH = 160
const MIN_COL_WIDTH = 64

interface Props {
  widget: Widget
  inline?: boolean
}

// Airtable-style table.
//
// widget.content stores the fb_tables.id. The widget loads the table's schema
// and rows on mount; edits go through the tables store (which writes through
// to SQLite via IPC). A fresh widget (no content yet) auto-creates a backing
// table on first render so the user never sees a "create table" step.
export default function TableWidget({ widget, inline = false }: Props): JSX.Element {
  const tables = useTablesStore((s) => s.tables)
  const rowsByTable = useTablesStore((s) => s.rows)
  const ensureTable = useTablesStore((s) => s.ensureTableLoaded)
  const ensureRows = useTablesStore((s) => s.ensureRowsLoaded)
  const createTable = useTablesStore((s) => s.createTable)
  const updateTable = useTablesStore((s) => s.updateTable)
  const setSchema = useTablesStore((s) => s.setSchema)
  const addRow = useTablesStore((s) => s.addRow)
  const updateCells = useTablesStore((s) => s.updateCells)
  const deleteRow = useTablesStore((s) => s.deleteRow)
  const updateWidget = useWidgetStore((s) => s.update)

  const tableId = widget.content
  const table = tableId ? tables[tableId] : null
  const rows = tableId ? rowsByTable[tableId] ?? [] : []

  // Lazy creation: if the widget was just dropped on the canvas with no
  // backing table, we provision one with two starter columns so the user
  // sees something usable immediately.
  const provisionedRef = useRef(false)
  useEffect(() => {
    // Provision a fresh backing table and repoint the widget at it. Used both
    // for a brand-new table widget (no content) AND to SELF-HEAL a widget whose
    // content points at a table that doesn't exist — e.g. the AI emitted a
    // create-widget(table) with an invented id, which otherwise leaves the
    // widget stuck on "Loading table…" forever.
    const provision = async (): Promise<void> => {
      if (provisionedRef.current) return
      provisionedRef.current = true
      const created = await createTable({
        taskId: widget.taskId,
        title: widget.title || 'Untitled table',
        schema: {
          columns: [
            {
              id: 'c-name',
              type: 'text-short',
              label: 'Name',
              config: {} as never
            } as FieldDefinition,
            {
              id: 'c-done',
              type: 'checkbox',
              label: 'Done',
              config: {} as never
            } as FieldDefinition
          ]
        }
      })
      await updateWidget(widget.id, { content: created.id, title: widget.title || created.title })
    }

    if (tableId) {
      void ensureTable(tableId).then((t) => {
        if (t) void ensureRows(tableId)
        else void provision() // dangling id → heal into a real table
      })
      return
    }
    void provision()
  }, [tableId, ensureTable, ensureRows, createTable, updateWidget, widget.id, widget.taskId, widget.title])

  // ── In-table AI assistant state ─────────────────────────────────────────
  // These useState hooks MUST live above the `if (!table) return …` early
  // exit below. Hooks must be called in the same order every render — if
  // they sit below a conditional return, the first render (when `table` is
  // still null) calls fewer hooks than later renders, which throws "Rendered
  // more hooks than during the previous render" and blanks the app.
  const [aiOpen, setAiOpen] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  // File import wizard: the parsed grid (null = closed), the file label for the
  // header, and any pick/parse error to surface inline.
  const [importGrid, setImportGrid] = useState<ParsedGrid | null>(null)
  const [importFileLabel, setImportFileLabel] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  // Per-cell right-click "Create + connect" menu. The column label +
  // cell text are passed into the menu so the user-facing copy can
  // change ("Create new sticky from this cell" etc.). The spawn helper
  // (createConnectedTool) uses them as the new tool's seed content.
  const [cellCtxMenu, setCellCtxMenu] = useState<{
    x: number
    y: number
    columnLabel: string
    cellText: string
    rowId: string
  } | null>(null)
  const [aiCount, setAiCount] = useState(5)
  // When true, the AI is asked to generate as many rows as the prompt
  // naturally implies (no fixed N). The renderer signals this to the
  // backend by passing count=0 — main treats 0 as the "auto" sentinel.
  const [aiAutoCount, setAiAutoCount] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiStaged, setAiStaged] = useState<Array<Record<string, unknown>> | null>(null)
  // The AI may also propose new columns to fit the prompt. We surface
  // those FIRST as a separate decision — the user reviews + applies the
  // schema additions, THEN sees the row preview and decides about rows
  // independently. Two-step staging makes accidental wholesale apply less
  // likely and gives the user agency over what the AI changes.
  const [aiStagedColumns, setAiStagedColumns] = useState<Array<{
    label: string
    type: string
    options?: string[]
  }> | null>(null)
  // Tracks which staged columns the user has approved + applied. Once
  // applied we hide the column panel and reveal the row preview.
  const [columnsApplied, setColumnsApplied] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  // ── Table-view column manipulation state ────────────────────────────────
  // Right-click-on-header menu: anchor coords + which column it targets.
  const [headerMenu, setHeaderMenu] = useState<{
    x: number
    y: number
    columnId: string
    index: number
  } | null>(null)
  // Drag-to-reorder: the column id currently being dragged and the index it
  // is hovering over, so we can paint a drop indicator.
  const [dragColId, setDragColId] = useState<string | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  // Live resize override. While the user drags a column edge we hold the
  // in-flight width here so the render is smooth, then commit to the schema
  // (widthHint) on mouse-up. null when no resize is in progress.
  const [resize, setResize] = useState<{ columnId: string; width: number } | null>(null)

  if (!table) {
    const body = (
      <div className="h-full w-full flex items-center justify-center text-[11px] text-stone-500">
        Loading table…
      </div>
    )
    if (inline) return body
    return (
      <WidgetFrame widget={widget} headerLabel="Table" headerAccent="bg-stone-300/60">
        {body}
      </WidgetFrame>
    )
  }

  function addColumn(type: FieldType): void {
    addColumnAt(table!.schema.columns.length, type)
  }

  function removeColumn(columnId: string): void {
    const next: TableSchema = {
      ...table!.schema,
      columns: table!.schema.columns.filter((c) => c.id !== columnId)
    }
    void setSchema(table!.id, next)
  }

  function renameColumn(columnId: string, label: string): void {
    const next: TableSchema = {
      ...table!.schema,
      columns: table!.schema.columns.map((c) =>
        c.id === columnId ? ({ ...c, label } as FieldDefinition) : c
      )
    }
    void setSchema(table!.id, next)
  }

  function setColumnConfig(columnId: string, config: unknown): void {
    const next: TableSchema = {
      ...table!.schema,
      columns: table!.schema.columns.map((c) =>
        c.id === columnId ? ({ ...c, config } as FieldDefinition) : c
      )
    }
    void setSchema(table!.id, next)
  }

  // Build a fresh column definition of the given type. Shared by the trailing
  // "+" adder and the insert-left / insert-right context-menu actions.
  function makeColumn(type: FieldType): FieldDefinition {
    const id = `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    return {
      id,
      type,
      label: FIELD_TYPE_LABELS[type],
      config: defaultConfig(type) as never
    } as FieldDefinition
  }

  // Insert a new column at an explicit position. index === columns.length
  // appends (same as the trailing adder); index 0 prepends.
  function addColumnAt(index: number, type: FieldType): void {
    const cols = [...table!.schema.columns]
    const at = Math.max(0, Math.min(cols.length, index))
    cols.splice(at, 0, makeColumn(type))
    void setSchema(table!.id, { ...table!.schema, columns: cols })
  }

  // Reorder: pull the dragged column out and re-insert it so it lands before
  // the column that currently occupies targetIndex. The fromIdx < targetIndex
  // adjustment accounts for the array shrinking after the splice-out.
  function moveColumn(fromId: string, targetIndex: number): void {
    const cols = [...table!.schema.columns]
    const fromIdx = cols.findIndex((c) => c.id === fromId)
    if (fromIdx === -1) return
    const [moved] = cols.splice(fromIdx, 1)
    let insertAt = fromIdx < targetIndex ? targetIndex - 1 : targetIndex
    insertAt = Math.max(0, Math.min(cols.length, insertAt))
    if (insertAt === fromIdx) return // no-op drop onto itself
    cols.splice(insertAt, 0, moved)
    void setSchema(table!.id, { ...table!.schema, columns: cols })
  }

  // Persist a resized width as the column's widthHint.
  function setColumnWidth(columnId: string, width: number): void {
    const w = Math.max(MIN_COL_WIDTH, Math.round(width))
    const next: TableSchema = {
      ...table!.schema,
      columns: table!.schema.columns.map((c) =>
        c.id === columnId ? ({ ...c, widthHint: w } as FieldDefinition) : c
      )
    }
    void setSchema(table!.id, next)
  }

  // The width a column should render at right now — the live drag value if it
  // is the one being resized, otherwise its stored hint or the default.
  function effectiveWidth(col: FieldDefinition): number {
    if (resize && resize.columnId === col.id) return resize.width
    return col.widthHint ?? DEFAULT_COL_WIDTH
  }

  // Begin an edge drag. Listeners live on the document so the pointer can
  // leave the 5px handle without dropping the gesture; mouse-up commits.
  function startResize(e: React.MouseEvent, col: FieldDefinition): void {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startW = effectiveWidth(col)
    const onMove = (ev: MouseEvent): void => {
      setResize({ columnId: col.id, width: Math.max(MIN_COL_WIDTH, startW + ev.clientX - startX) })
    }
    const onUp = (ev: MouseEvent): void => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      setResize(null)
      setColumnWidth(col.id, Math.max(MIN_COL_WIDTH, startW + ev.clientX - startX))
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  function setViewMode(mode: TableViewMode): void {
    const next: TableSchema = { ...table!.schema, viewMode: mode }
    void setSchema(table!.id, next)
  }

  function setViewConfig(viewConfig: TableViewConfig): void {
    const next: TableSchema = { ...table!.schema, viewConfig }
    void setSchema(table!.id, next)
  }

  function commitCell(rowId: string, columnId: string, value: unknown): void {
    void updateCells(rowId, { [columnId]: value })
  }

  function renameTable(title: string): void {
    void updateTable(table!.id, { title })
  }

  // Open the import wizard: pick a tabular file, read it into a grid, then show
  // the column-mapping dialog. CSV, JSON, XLS, and XLSX are supported.
  async function handleImport(): Promise<void> {
    setImportError(null)
    const path = await window.api.fileImport.pickGrid()
    if (!path) return
    const res = await window.api.fileImport.parseGrid(path)
    if (!res.ok) {
      setImportError(res.error)
      return
    }
    if (res.grid.headers.length === 0) {
      setImportError('No columns found in that file.')
      return
    }
    setImportFileLabel(path.split(/[\\/]/).pop() ?? 'file')
    setImportGrid(res.grid)
  }

  // ── In-table AI assistant handlers ──────────────────────────────────────
  // State for these lives above the `if (!table)` early return so the hook
  // call order stays constant. The handlers themselves use `table` which is
  // guaranteed non-null at this point because of the early-return guard.

  async function runAi(): Promise<void> {
    if (!aiPrompt.trim() || aiBusy || !table) return
    setAiBusy(true)
    setAiError(null)
    // Reset prior staging so a re-run can't conflate yesterday's columns
    // with today's rows.
    setAiStaged(null)
    setAiStagedColumns(null)
    setColumnsApplied(false)
    try {
      // count=0 signals the backend's "auto" mode.
      const requestedCount = aiAutoCount ? 0 : aiCount
      const resp = await window.api.ai.suggestTableRows(
        table.id,
        aiPrompt,
        requestedCount
      )
      if (!resp.ok) {
        setAiError(resp.error ?? 'AI request failed.')
        return
      }
      if (!resp.rows || resp.rows.length === 0) {
        setAiError('AI returned no rows.')
        return
      }
      setAiStaged(resp.rows)
      // Filter out columns whose label already exists in the current
      // schema (the AI sometimes echoes existing columns). This makes the
      // "add N columns" count match reality.
      const fresh = (resp.columnsToAdd ?? []).filter((c) => {
        const lc = c.label.toLowerCase().trim()
        return !table.schema.columns.some(
          (existing) => existing.label.toLowerCase().trim() === lc
        )
      })
      setAiStagedColumns(fresh.length > 0 ? fresh : null)
      // If no new columns are proposed we go straight to row staging.
      if (fresh.length === 0) setColumnsApplied(true)
    } finally {
      setAiBusy(false)
    }
  }

  function rejectAi(): void {
    setAiStaged(null)
    setAiStagedColumns(null)
    setColumnsApplied(false)
    setAiError(null)
  }

  // Phase 1 — user approves the schema additions. After this fires the
  // table actually gains the new columns and the row preview becomes the
  // active decision.
  async function applyColumns(): Promise<void> {
    if (!aiStagedColumns || !table) return
    const palette = [
      '#ef4444', '#f97316', '#eab308', '#22c55e',
      '#06b6d4', '#3b82f6', '#a855f7', '#ec4899'
    ]
    const newCols: FieldDefinition[] = aiStagedColumns.map((c) => {
      const id = `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
      let config: unknown = defaultConfig(c.type as FieldType) as never
      if (
        (c.type === 'single-select' || c.type === 'multi-select') &&
        Array.isArray(c.options)
      ) {
        config = {
          options: c.options.map((label, oi) => ({
            id: `o-${Date.now().toString(36)}-${oi}`,
            label,
            color: palette[oi % palette.length]
          }))
        }
      }
      return {
        id,
        type: c.type,
        label: c.label,
        config
      } as FieldDefinition
    })
    const nextSchema: TableSchema = {
      columns: [...table.schema.columns, ...newCols]
    }
    await setSchema(table.id, nextSchema)
    setColumnsApplied(true)
  }

  // Phase 2 — user approves the row preview. Inserts the rows using the
  // post-column-addition schema for coercion.
  async function applyRows(): Promise<void> {
    if (!aiStaged || !table) return
    const byKey = new Map<string, FieldDefinition>()
    for (const col of table.schema.columns) {
      byKey.set(col.id, col)
      byKey.set(col.label.toLowerCase().trim(), col)
    }
    for (const aiRow of aiStaged) {
      const cells: Record<string, unknown> = {}
      for (const [key, raw] of Object.entries(aiRow)) {
        const col =
          byKey.get(key) ?? byKey.get(key.toLowerCase().trim()) ?? null
        if (!col) continue
        cells[col.id] = coerceCellValue(col.type, raw, col.config)
      }
      if (Object.keys(cells).length > 0) {
        await addRow(table.id, cells)
      }
    }
    setAiStaged(null)
    setAiStagedColumns(null)
    setColumnsApplied(false)
    setAiPrompt('')
    setAiOpen(false)
  }

  const viewMode: TableViewMode = table.schema.viewMode ?? 'table'
  const viewConfig: TableViewConfig = table.schema.viewConfig ?? {}
  const currentViewMeta = VIEW_OPTIONS.find((v) => v.id === viewMode) ?? VIEW_OPTIONS[0]

  // Total table width = row-handle + every data column at its effective width
  // + the add-column gutter. Drives the fixed-layout table so resized columns
  // are honored exactly and the table scrolls horizontally when it overflows.
  const totalTableWidth =
    ROW_HANDLE_WIDTH +
    ADD_COL_WIDTH +
    table.schema.columns.reduce((sum, c) => sum + effectiveWidth(c), 0)

  // Rows after the active filter is applied — used by EVERY view so a filter
  // narrows the data everywhere, not just the table. Grouping is resolved
  // separately and only drives the table view's row layout.
  const filteredRows = applyFilters(rows, table.schema, viewConfig.filter)
  const groupColumn =
    viewConfig.group?.columnId
      ? table.schema.columns.find((c) => c.id === viewConfig.group?.columnId) ?? null
      : null
  const groups =
    groupColumn && viewMode === 'table'
      ? groupRows(filteredRows, groupColumn, viewConfig.group?.direction ?? 'asc')
      : null
  const collapsedGroups = new Set(viewConfig.group?.collapsed ?? [])

  function toggleGroupCollapsed(key: string): void {
    const current = viewConfig.group
    if (!current) return
    const collapsed = new Set(current.collapsed ?? [])
    if (collapsed.has(key)) collapsed.delete(key)
    else collapsed.add(key)
    setViewConfig({ ...viewConfig, group: { ...current, collapsed: Array.from(collapsed) } })
  }

  // One data <tr>. Extracted so the flat list and the grouped list render rows
  // identically. `idx` only drives the zebra stripe.
  function renderDataRow(row: FbRow, idx: number): JSX.Element {
    return (
      <tr
        key={row.id}
        className={`border-b border-stone-200 dark:border-stone-700 group ${
          idx % 2 === 0
            ? 'bg-white dark:bg-stone-900'
            : 'bg-stone-50/60 dark:bg-stone-800/30'
        } hover:bg-accent/[0.04] dark:hover:bg-accent/[0.08]`}
      >
        <td className="w-8 px-1 py-1 text-center border-r border-stone-200 dark:border-stone-700">
          <button
            onClick={() => void deleteRow(row.id)}
            className="text-stone-300 dark:text-stone-600 hover:text-red-600 transition-colors"
            title="Delete row"
          >
            <Icon name="delete" size={13} />
          </button>
        </td>
        {table!.schema.columns.map((col) => (
          <td
            key={col.id}
            className="border-r border-stone-200 dark:border-stone-700 align-top"
            style={{ minWidth: 140 }}
            onContextMenu={(e) => {
              // Shift bypasses our menu and gives the OS clipboard menu.
              if (e.shiftKey) return
              e.preventDefault()
              const rawCell = row.cells[col.id]
              const cellStr =
                rawCell == null
                  ? ''
                  : typeof rawCell === 'string'
                    ? rawCell
                    : String(rawCell)
              setCellCtxMenu({
                x: e.clientX,
                y: e.clientY,
                columnLabel: col.label,
                cellText: cellStr,
                rowId: row.id
              })
            }}
          >
            <FieldEditor
              def={col}
              value={row.cells[col.id] ?? defaultValue(col.type)}
              variant="cell"
              onCommit={(next) => commitCell(row.id, col.id, next)}
            />
          </td>
        ))}
        <td className="border-r border-stone-200 dark:border-stone-700" />
      </tr>
    )
  }

  const body = (
    <div className="h-full w-full bg-white dark:bg-stone-900 overflow-auto relative">
      {/* Title row */}
      <div className="sticky top-0 z-10 px-3 py-2 bg-white/95 dark:bg-stone-900/95 border-b border-stone-200 dark:border-stone-700 flex items-center gap-1.5">
        <Icon name={currentViewMeta.icon} size={15} className="text-accent shrink-0" />
        <input
          value={table.title}
          onChange={(e) => renameTable(e.target.value)}
          placeholder="Untitled table"
          className="flex-1 bg-transparent text-[14px] font-semibold text-stone-800 dark:text-stone-100 outline-none placeholder-stone-300 dark:placeholder-stone-600"
        />
        <span className="text-[11px] text-stone-400 dark:text-stone-500 font-medium tabular-nums">
          {rows.length} {rows.length === 1 ? 'row' : 'rows'}
        </span>
        <button
          onClick={() => void handleImport()}
          data-testid="table-import-button"
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-stone-500 dark:text-stone-400 hover:text-accent hover:bg-accent/10 transition-colors"
          title="Import CSV, JSON, XLS, or XLSX — map columns and upsert by a key"
        >
          <Icon name="upload_file" size={12} />
          <span>Import</span>
        </button>
        <button
          onClick={() => setAiOpen((v) => !v)}
          className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
            aiOpen
              ? 'bg-accent text-white'
              : 'text-accent hover:bg-accent/10'
          }`}
          title="AI assistant — describe rows to generate, preview, then apply"
        >
          <Icon name="auto_awesome" size={12} />
          <span>AI</span>
        </button>
      </div>
      {importError && (
        <div className="px-2.5 py-1 text-[11px] text-red-500 bg-red-50 dark:bg-red-950/30 border-b border-red-100 dark:border-red-900" data-testid="import-error">
          {importError}
        </div>
      )}
      {importGrid && table && (
        <TableImportDialog
          tableId={table.id}
          schema={table.schema}
          rows={rows.map((r) => ({ id: r.id, cells: r.cells }))}
          grid={importGrid}
          fileLabel={importFileLabel}
          onClose={() => setImportGrid(null)}
          onApplied={() => {
            setImportGrid(null)
          }}
        />
      )}
      {/* View switcher — pill of six view options. The active view is
          highlighted; clicking switches without losing data. Each non-
          table view uses TableSchema.viewConfig to remember which column
          drives its grouping (kanban lanes / calendar date / etc.). */}
      <div className="sticky top-[44px] z-[9] px-2.5 py-1.5 border-b border-stone-200 dark:border-stone-700 bg-stone-50/60 dark:bg-stone-900/60 flex items-center gap-0.5 overflow-x-auto">
        {VIEW_OPTIONS.map((v) => {
          const active = v.id === viewMode
          return (
            <button
              key={v.id}
              onClick={() => setViewMode(v.id)}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors shrink-0 ${
                active
                  ? 'bg-accent/15 text-accent'
                  : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800/60'
              }`}
              title={`Switch to ${v.label} view`}
              aria-pressed={active}
            >
              <Icon name={v.icon} size={12} />
              <span>{v.label}</span>
            </button>
          )
        })}
      </div>

      {/* Filter + group toolbar. Filtering applies to every view; grouping
          drives the table view's row layout. State lives in viewConfig so it
          persists with the schema. */}
      <TableFilterBar
        columns={table.schema.columns}
        viewConfig={viewConfig}
        setViewConfig={setViewConfig}
        filteredCount={filteredRows.length}
        totalCount={rows.length}
      />

      {/* Alternate views — each reads the same schema + rows and routes
          edits back through commitCell / addRow / deleteRow so the data
          contract is identical to the table view. The user can switch
          between any view without losing data. */}
      {viewMode !== 'table' && viewMode === 'list' && (
        <ListView
          schema={table.schema}
          rows={filteredRows}
          viewConfig={viewConfig}
          commitCell={commitCell}
          addRow={() => void addRow(table.id)}
          deleteRow={(id) => void deleteRow(id)}
          setViewConfig={setViewConfig}
        />
      )}
      {viewMode === 'cards' && (
        <CardsView
          schema={table.schema}
          rows={filteredRows}
          viewConfig={viewConfig}
          commitCell={commitCell}
          addRow={() => void addRow(table.id)}
          deleteRow={(id) => void deleteRow(id)}
          setViewConfig={setViewConfig}
        />
      )}
      {viewMode === 'kanban' && (
        <KanbanView
          schema={table.schema}
          rows={filteredRows}
          viewConfig={viewConfig}
          commitCell={commitCell}
          addRow={() => void addRow(table.id)}
          deleteRow={(id) => void deleteRow(id)}
          setViewConfig={setViewConfig}
        />
      )}
      {viewMode === 'calendar' && (
        <CalendarView
          schema={table.schema}
          rows={filteredRows}
          viewConfig={viewConfig}
          commitCell={commitCell}
          addRow={() => void addRow(table.id)}
          deleteRow={(id) => void deleteRow(id)}
          setViewConfig={setViewConfig}
        />
      )}
      {viewMode === 'gantt' && (
        <GanttView
          schema={table.schema}
          rows={filteredRows}
          viewConfig={viewConfig}
          commitCell={commitCell}
          addRow={() => void addRow(table.id)}
          deleteRow={(id) => void deleteRow(id)}
          setViewConfig={setViewConfig}
        />
      )}
      {viewMode === 'table' && (
      <div className="text-[12px]">
        <table
          className="border-collapse"
          style={{ tableLayout: 'fixed', width: totalTableWidth }}
        >
          <colgroup>
            <col style={{ width: ROW_HANDLE_WIDTH }} />
            {table.schema.columns.map((col) => (
              <col key={col.id} style={{ width: effectiveWidth(col) }} />
            ))}
            <col style={{ width: ADD_COL_WIDTH }} />
          </colgroup>
          <thead>
            <tr className="border-b border-stone-300 dark:border-stone-600 bg-stone-100/70 dark:bg-stone-800/60">
              <th className="px-1 py-1.5" />
              {table.schema.columns.map((col, index) => (
                <ColumnHeader
                  key={col.id}
                  col={col}
                  index={index}
                  tableId={table.id}
                  isDragging={dragColId === col.id}
                  isDragOver={dragOverIndex === index && dragColId !== null && dragColId !== col.id}
                  onRename={(label) => renameColumn(col.id, label)}
                  onRemove={() => removeColumn(col.id)}
                  onSetConfig={(c) => setColumnConfig(col.id, c)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setHeaderMenu({ x: e.clientX, y: e.clientY, columnId: col.id, index })
                  }}
                  onResizeStart={(e) => startResize(e, col)}
                  onDragStartCol={() => setDragColId(col.id)}
                  onDragOverCol={(e) => {
                    if (!dragColId || dragColId === col.id) return
                    e.preventDefault()
                    setDragOverIndex(index)
                  }}
                  onDropCol={() => {
                    if (dragColId && dragColId !== col.id) moveColumn(dragColId, index)
                    setDragColId(null)
                    setDragOverIndex(null)
                  }}
                  onDragEndCol={() => {
                    setDragColId(null)
                    setDragOverIndex(null)
                  }}
                />
              ))}
              <th className="px-1 py-1.5">
                <ColumnAdder onAdd={addColumn} />
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={table.schema.columns.length + 2}
                  className="py-8 text-center text-[12px] text-stone-400 dark:text-stone-500"
                >
                  <div className="flex flex-col items-center gap-1">
                    <Icon name="table_rows" size={20} className="text-stone-300 dark:text-stone-600" />
                    <span>No rows yet — click <strong className="text-stone-600 dark:text-stone-300">Add row</strong> below or use the <strong className="text-accent">AI</strong> button to generate some.</span>
                  </div>
                </td>
              </tr>
            )}
            {rows.length > 0 && filteredRows.length === 0 && (
              <tr>
                <td
                  colSpan={table.schema.columns.length + 2}
                  className="py-8 text-center text-[12px] text-stone-400 dark:text-stone-500"
                  data-testid="table-no-matches"
                >
                  <div className="flex flex-col items-center gap-1">
                    <Icon name="filter_list_off" size={20} className="text-stone-300 dark:text-stone-600" />
                    <span>No rows match the current filter.</span>
                  </div>
                </td>
              </tr>
            )}
            {/* Ungrouped: flat list of filtered rows. */}
            {!groups && filteredRows.map((row, idx) => renderDataRow(row, idx))}
            {/* Grouped: a collapsible header row per group, then its rows. */}
            {groups &&
              groups.map((g) => {
                const isCollapsed = collapsedGroups.has(g.key)
                return (
                  <GroupRows
                    key={g.key}
                    group={g}
                    collapsed={isCollapsed}
                    colSpan={table.schema.columns.length + 2}
                    onToggle={() => toggleGroupCollapsed(g.key)}
                    renderRow={renderDataRow}
                  />
                )
              })}
            {/* Add-row footer */}
            <tr>
              <td colSpan={table.schema.columns.length + 2} className="p-1.5 border-t border-stone-200 dark:border-stone-700">
                <button
                  onClick={() => void addRow(table.id)}
                  className="w-full inline-flex items-center justify-center gap-1 text-[12px] py-1.5 rounded text-stone-500 dark:text-stone-400 hover:text-accent hover:bg-accent/5 transition-colors"
                >
                  <Icon name="add" size={14} />
                  <span>Add row</span>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      )}

      {aiOpen && (
        <div className="absolute bottom-2 left-2 right-2 z-50 rounded-lg border border-accent bg-white dark:bg-stone-900 shadow-xl p-3 max-h-[70%] flex flex-col gap-2">
          <div className="flex items-center gap-1.5">
            <Icon name="auto_awesome" size={13} className="text-accent" />
            <span className="text-[10px] uppercase tracking-wider font-semibold text-accent">
              AI assistant — generate rows
            </span>
            <button
              onClick={() => {
                setAiOpen(false)
                rejectAi()
              }}
              className="ml-auto h-5 w-5 rounded inline-flex items-center justify-center text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
              aria-label="Close"
            >
              <Icon name="close" size={12} />
            </button>
          </div>
          <textarea
            autoFocus
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                void runAi()
              }
            }}
            placeholder='e.g. "Add 5 fictional podcast episodes about climate tech"'
            rows={2}
            className="w-full text-[13px] px-2.5 py-1.5 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-md resize-none focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
          <div className="flex items-center gap-2 text-[11px] flex-wrap">
            <label className="text-stone-500 dark:text-stone-400">Rows:</label>
            <label className="inline-flex items-center gap-1 cursor-pointer text-stone-700 dark:text-stone-200">
              <input
                type="checkbox"
                checked={aiAutoCount}
                onChange={(e) => setAiAutoCount(e.target.checked)}
                className="accent-accent"
              />
              <span>As many as needed</span>
            </label>
            {!aiAutoCount && (
              <>
                <span className="text-stone-300 dark:text-stone-600">·</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={aiCount}
                  onChange={(e) =>
                    setAiCount(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))
                  }
                  className="w-14 px-2 py-0.5 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded text-stone-800 dark:text-stone-100 focus:outline-none focus:border-accent"
                />
                <span className="text-stone-400 dark:text-stone-500">fixed</span>
              </>
            )}
          </div>
          {aiError && (
            <div className="text-[11px] text-amber-700 dark:text-amber-400">
              {aiError}
            </div>
          )}
          {/* STAGE 1 — column staging. Visible until the user either
              applies the new columns OR runAi returned no proposed columns
              (columnsApplied auto-set true). Includes its own Apply/Skip
              buttons so the schema decision is explicit and separate from
              the row decision. */}
          {aiStagedColumns && aiStagedColumns.length > 0 && !columnsApplied && (
            <div className="rounded-md border-2 border-accent bg-accent/[0.06] p-2 space-y-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-accent text-white text-[10px] font-bold">1</span>
                <div className="text-[11px] uppercase tracking-wider text-accent font-semibold">
                  Step 1 — Approve {aiStagedColumns.length} new {aiStagedColumns.length === 1 ? 'column' : 'columns'}
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {aiStagedColumns.map((c, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white dark:bg-stone-800 border border-accent/40 text-[11px] text-stone-700 dark:text-stone-200"
                    title={
                      c.options && c.options.length > 0
                        ? `Options: ${c.options.join(', ')}`
                        : c.type
                    }
                  >
                    <Icon name="view_column" size={11} className="text-accent" />
                    <strong className="text-stone-800 dark:text-stone-100">{c.label}</strong>
                    <span className="text-stone-400 dark:text-stone-500">{c.type}</span>
                  </span>
                ))}
              </div>
              <div className="text-[10px] text-stone-500 dark:text-stone-400">
                Adding these will update your table's schema. Rows preview unlocks once you decide.
              </div>
              <div className="flex justify-end gap-1.5">
                <button
                  onClick={() => {
                    // Skip column additions and proceed straight to row
                    // preview. We don't drop them from aiStagedColumns
                    // entirely (so the user can still see "AI suggested")
                    // but mark columnsApplied so the UI moves on.
                    setAiStagedColumns(null)
                    setColumnsApplied(true)
                  }}
                  className="text-[11px] px-3 py-1 rounded text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
                >
                  Skip
                </button>
                <button
                  onClick={() => void applyColumns()}
                  className="text-[11px] px-3 py-1 rounded bg-accent text-white hover:brightness-110 inline-flex items-center gap-1"
                >
                  <Icon name="check" size={11} />
                  Add {aiStagedColumns.length} {aiStagedColumns.length === 1 ? 'column' : 'columns'}
                </button>
              </div>
            </div>
          )}
          {/* STAGE 2 — row preview. Only renders once the schema decision
              is locked in (either applied columns or explicitly skipped),
              so the user is making one decision at a time. */}
          {aiStaged && aiStaged.length > 0 && columnsApplied && (
            <div className="flex-1 min-h-0 flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-accent text-white text-[10px] font-bold">2</span>
                <div className="text-[11px] uppercase tracking-wider text-accent font-semibold">
                  Step 2 — Approve {aiStaged.length} {aiStaged.length === 1 ? 'row' : 'rows'}
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-auto bg-stone-50 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-700 rounded-md">
                <table className="w-full text-[11px]">
                  <thead className="bg-stone-100 dark:bg-stone-800 sticky top-0">
                    <tr>
                      {table.schema.columns.map((col) => (
                        <th
                          key={col.id}
                          className="text-left px-2 py-1 font-medium text-stone-700 dark:text-stone-200 border-r border-stone-200 dark:border-stone-700"
                        >
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {aiStaged.map((row, i) => (
                      <tr
                        key={i}
                        className="border-b border-stone-200 dark:border-stone-700"
                      >
                        {table.schema.columns.map((col) => {
                          const v =
                            row[col.label] ??
                            row[col.label.toLowerCase().trim()] ??
                            row[col.id] ??
                            ''
                          const display = Array.isArray(v)
                            ? v.join(', ')
                            : typeof v === 'boolean'
                              ? v ? '✓' : ''
                              : String(v ?? '')
                          return (
                            <td
                              key={col.id}
                              className="px-2 py-1 text-stone-700 dark:text-stone-200 border-r border-stone-200 dark:border-stone-700 align-top max-w-[200px] truncate"
                              title={display}
                            >
                              {display || <span className="text-stone-300 dark:text-stone-600">—</span>}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <div className="flex justify-end gap-1.5">
            {aiStaged && columnsApplied ? (
              <>
                <button
                  onClick={rejectAi}
                  className="text-[11px] px-3 py-1 rounded text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
                >
                  Discard
                </button>
                <button
                  onClick={() => void runAi()}
                  disabled={!aiPrompt.trim() || aiBusy}
                  className="text-[11px] px-3 py-1 rounded text-stone-700 dark:text-stone-200 border border-stone-300 dark:border-stone-600 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-50"
                >
                  {aiBusy ? 'Regenerating…' : 'Regenerate'}
                </button>
                <button
                  onClick={() => void applyRows()}
                  className="text-[11px] px-3 py-1 rounded bg-accent text-white hover:brightness-110 inline-flex items-center gap-1"
                >
                  <Icon name="check" size={11} />
                  Add {aiStaged.length} {aiStaged.length === 1 ? 'row' : 'rows'}
                </button>
              </>
            ) : (
              <button
                onClick={() => void runAi()}
                disabled={!aiPrompt.trim() || aiBusy}
                className="text-[11px] px-3 py-1 rounded bg-accent text-white hover:brightness-110 disabled:opacity-50 inline-flex items-center gap-1"
              >
                {aiBusy ? (
                  <>
                    <Icon name="autorenew" size={11} className="animate-spin" />
                    Drafting…
                  </>
                ) : (
                  <>
                    <Icon name="auto_awesome" size={11} />
                    Draft
                  </>
                )}
              </button>
            )}
          </div>
          <div className="text-[9px] text-stone-400 dark:text-stone-500">
            Cmd+Enter to draft · rows are previewed before they touch the table
          </div>
        </div>
      )}
      {cellCtxMenu && (
        // The cell right-click now resolves through the unified menu. The cell
        // text becomes the selection (so AI Assist and Create both work on it),
        // and the cell/row granularity lets the table provider offer row
        // actions. This retires the bespoke per-cell create list.
        <UnifiedConnectedMenu
          sourceWidgetId={widget.id}
          x={cellCtxMenu.x}
          y={cellCtxMenu.y}
          selectionContext={{ selectionText: cellCtxMenu.cellText }}
          granularity="cell"
          payload={{
            rowId: cellCtxMenu.rowId,
            columnLabel: cellCtxMenu.columnLabel,
            tableId: tableId ?? ''
          }}
          onClose={() => setCellCtxMenu(null)}
        />
      )}
      {headerMenu && (
        <HeaderContextMenu
          x={headerMenu.x}
          y={headerMenu.y}
          canDelete={table.schema.columns.length > 1}
          onInsert={(side, type) => {
            addColumnAt(side === 'left' ? headerMenu.index : headerMenu.index + 1, type)
            setHeaderMenu(null)
          }}
          onDelete={() => {
            removeColumn(headerMenu.columnId)
            setHeaderMenu(null)
          }}
          onClose={() => setHeaderMenu(null)}
        />
      )}
    </div>
  )

  if (inline) return body
  return (
    <WidgetFrame
      widget={widget}
      headerLabel={table.title}
      headerAccent="bg-stone-300/60"
    >
      {body}
    </WidgetFrame>
  )
}

// ── Grouped rows — a collapsible header row plus its data rows ────────────────
function GroupRows({
  group,
  collapsed,
  colSpan,
  onToggle,
  renderRow
}: {
  group: RowGroup
  collapsed: boolean
  colSpan: number
  onToggle: () => void
  renderRow: (row: FbRow, idx: number) => JSX.Element
}): JSX.Element {
  return (
    <>
      <tr className="bg-stone-100/80 dark:bg-stone-800/70 border-b border-stone-300 dark:border-stone-600">
        <td colSpan={colSpan} className="px-2 py-1.5">
          <button
            onClick={onToggle}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-stone-700 dark:text-stone-200 hover:text-accent"
          >
            <Icon
              name={collapsed ? 'chevron_right' : 'expand_more'}
              size={15}
              className="text-stone-400"
            />
            {group.color && (
              <span
                className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: group.color }}
              />
            )}
            <span className="truncate max-w-[280px]">{group.label}</span>
            <span className="text-stone-400 dark:text-stone-500 font-normal tabular-nums">
              {group.rows.length}
            </span>
          </button>
        </td>
      </tr>
      {!collapsed && group.rows.map((row, idx) => renderRow(row, idx))}
    </>
  )
}

// ── Column header with rename + config + delete popover ──────────────────────
// Also the anchor for the three column-manipulation gestures: the title button
// is draggable to reorder columns, a right-edge handle resizes the column, and
// right-clicking opens the insert/delete context menu (onContextMenu).
function ColumnHeader({
  col,
  index: _index,
  tableId,
  isDragging,
  isDragOver,
  onRename,
  onRemove,
  onSetConfig,
  onContextMenu,
  onResizeStart,
  onDragStartCol,
  onDragOverCol,
  onDropCol,
  onDragEndCol
}: {
  col: FieldDefinition
  index: number
  tableId: string
  isDragging: boolean
  isDragOver: boolean
  onRename: (label: string) => void
  onRemove: () => void
  onSetConfig: (config: unknown) => void
  onContextMenu: (e: React.MouseEvent) => void
  onResizeStart: (e: React.MouseEvent) => void
  onDragStartCol: () => void
  onDragOverCol: (e: React.DragEvent) => void
  onDropCol: () => void
  onDragEndCol: () => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLTableCellElement | null>(null)
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent): void {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])
  return (
    <th
      ref={ref}
      onContextMenu={onContextMenu}
      onDragOver={onDragOverCol}
      onDrop={onDropCol}
      className={`text-left px-2 py-1 font-medium text-[11px] text-stone-700 dark:text-stone-200 relative ${
        isDragging ? 'opacity-40' : ''
      } ${isDragOver ? 'border-l-2 border-l-accent' : ''}`}
    >
      <button
        draggable={!open}
        onDragStart={(e) => {
          // Reorder gesture. setData makes the drag valid in Electron/Chromium
          // and the move effect shows the right cursor.
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', col.id)
          onDragStartCol()
        }}
        onDragEnd={onDragEndCol}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 hover:bg-stone-100 dark:hover:bg-stone-800 rounded px-1 py-0.5 w-full text-left cursor-grab active:cursor-grabbing"
        title="Click to edit · drag to reorder · right-click for more"
      >
        <Icon name={FIELD_TYPE_ICONS[col.type]} size={11} className="text-stone-400 shrink-0" />
        <span className="truncate">{col.label}</span>
      </button>
      {/* Resize handle — a thin grab strip on the right edge. Uses raw mouse
          events (not HTML5 drag) so it never starts a column-reorder. */}
      <div
        onMouseDown={onResizeStart}
        onClick={(e) => e.stopPropagation()}
        className="absolute top-0 right-0 h-full w-[5px] cursor-col-resize hover:bg-accent/40 z-10"
        title="Drag to resize column"
      />
      {open && (
        <div className="absolute z-50 mt-1 left-0 w-56 rounded border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 shadow-lg p-2 space-y-1.5 text-stone-700 dark:text-stone-200 font-normal">
          <input
            value={col.label}
            onChange={(e) => onRename(e.target.value)}
            placeholder="Column name"
            className="w-full text-[11px] bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded px-2 py-1"
          />
          <div className="text-[10px] uppercase tracking-wider text-stone-400">
            Type
          </div>
          <div className="text-[10px] text-stone-500 dark:text-stone-400">
            <Icon name={FIELD_TYPE_ICONS[col.type]} size={10} className="inline mr-1" />
            {FIELD_TYPE_LABELS[col.type]} (type change coming soon)
          </div>
          {(col.type === 'single-select' || col.type === 'multi-select') && (
            <SelectOptionsMini
              options={
                (col.config as { options: { id: string; label: string; color?: string }[] })
                  .options ?? []
              }
              onChange={(options) =>
                onSetConfig({ ...col.config, options })
              }
            />
          )}
          {col.type === 'relation' && (
            <RelationConfigEditor
              config={col.config as {
                tableId: string | null
                displayColumnId?: string | null
                multi?: boolean
              }}
              excludeTableId={tableId}
              onChange={(c) => onSetConfig(c)}
            />
          )}
          <button
            onClick={() => {
              onRemove()
              setOpen(false)
            }}
            className="w-full text-[11px] text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded px-2 py-1 text-left"
          >
            <Icon name="delete" size={11} className="inline mr-1" />
            Delete column
          </button>
        </div>
      )}
    </th>
  )
}

function SelectOptionsMini({
  options,
  onChange
}: {
  options: { id: string; label: string; color?: string }[]
  onChange: (next: { id: string; label: string; color?: string }[]) => void
}): JSX.Element {
  const [draft, setDraft] = useState('')
  const palette = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ec4899']
  function add(): void {
    const label = draft.trim()
    if (!label) return
    const id = `o-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    onChange([
      ...options,
      { id, label, color: palette[options.length % palette.length] }
    ])
    setDraft('')
  }
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-wider text-stone-400">Options</div>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <span
            key={o.id}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]"
            style={{ backgroundColor: `${o.color ?? '#78716c'}26`, color: o.color ?? '#78716c' }}
          >
            {o.label}
            <button
              onClick={() => onChange(options.filter((x) => x.id !== o.id))}
              className="opacity-60 hover:opacity-100"
            >
              <Icon name="close" size={9} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-1">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add()
          }}
          placeholder="New option…"
          className="flex-1 text-[10px] bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded px-1.5 py-0.5"
        />
        <button
          onClick={add}
          disabled={!draft.trim()}
          className="text-[10px] px-1.5 py-0.5 rounded bg-accent text-white disabled:opacity-50"
        >
          add
        </button>
      </div>
    </div>
  )
}

// ── Column-add menu ─────────────────────────────────────────────────────────
function ColumnAdder({ onAdd }: { onAdd: (t: FieldType) => void }): JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent): void {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center justify-center h-5 w-5 rounded hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-500"
        title="Add column"
      >
        <Icon name="add" size={12} />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 w-44 rounded border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 shadow-lg py-1">
          {(Object.keys(FIELD_TYPE_LABELS) as FieldType[]).map((t) => (
            <button
              key={t}
              onClick={() => {
                onAdd(t)
                setOpen(false)
              }}
              className="w-full flex items-center gap-1.5 px-2 py-1 hover:bg-stone-100 dark:hover:bg-stone-800 text-left font-normal text-stone-700 dark:text-stone-200"
            >
              <Icon name={FIELD_TYPE_ICONS[t]} size={11} className="text-stone-400" />
              <span className="text-[11px]">{FIELD_TYPE_LABELS[t]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Header right-click menu — insert left / right + delete ───────────────────
// A two-level menu: the main view offers insert-left, insert-right and delete;
// choosing an insert side switches to a field-type picker so the user picks the
// new column's type at creation time (column type can't be changed afterwards).
function HeaderContextMenu({
  x,
  y,
  canDelete,
  onInsert,
  onDelete,
  onClose
}: {
  x: number
  y: number
  canDelete: boolean
  onInsert: (side: 'left' | 'right', type: FieldType) => void
  onDelete: () => void
  onClose: () => void
}): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null)
  const [mode, setMode] = useState<'main' | 'left' | 'right'>('main')
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
  // Keep the menu on-screen by clamping its top-left away from the viewport
  // edges. Width is fixed at 208px (w-52).
  const left = Math.min(x, window.innerWidth - 216)
  const top = Math.min(y, window.innerHeight - 320)
  return (
    <div
      ref={ref}
      className="fixed z-[100] w-52 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 shadow-xl py-1 text-stone-700 dark:text-stone-200"
      style={{ left, top }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {mode === 'main' ? (
        <>
          <button
            onClick={() => setMode('left')}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] hover:bg-stone-100 dark:hover:bg-stone-800 text-left"
          >
            <Icon name="keyboard_tab_rtl" size={13} className="text-stone-400" />
            <span className="flex-1">Insert column left</span>
            <Icon name="chevron_right" size={13} className="text-stone-400" />
          </button>
          <button
            onClick={() => setMode('right')}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] hover:bg-stone-100 dark:hover:bg-stone-800 text-left"
          >
            <Icon name="keyboard_tab" size={13} className="text-stone-400" />
            <span className="flex-1">Insert column right</span>
            <Icon name="chevron_right" size={13} className="text-stone-400" />
          </button>
          <div className="my-1 border-t border-stone-200 dark:border-stone-700" />
          <button
            onClick={onDelete}
            disabled={!canDelete}
            title={canDelete ? undefined : 'A table needs at least one column'}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 text-left disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <Icon name="delete" size={13} />
            <span>Delete column</span>
          </button>
        </>
      ) : (
        <>
          <button
            onClick={() => setMode('main')}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] uppercase tracking-wider text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 text-left"
          >
            <Icon name="chevron_left" size={13} />
            <span>Insert {mode === 'left' ? 'left' : 'right'} — pick type</span>
          </button>
          <div className="border-t border-stone-200 dark:border-stone-700 max-h-64 overflow-auto">
            {(Object.keys(FIELD_TYPE_LABELS) as FieldType[]).map((t) => (
              <button
                key={t}
                onClick={() => onInsert(mode === 'left' ? 'left' : 'right', t)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] hover:bg-stone-100 dark:hover:bg-stone-800 text-left font-normal"
              >
                <Icon name={FIELD_TYPE_ICONS[t]} size={12} className="text-stone-400" />
                <span>{FIELD_TYPE_LABELS[t]}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
