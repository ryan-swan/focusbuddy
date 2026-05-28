import { useEffect, useRef, useState } from 'react'
import type { Widget } from '@shared/types'
import type { FieldDefinition, FieldType, TableSchema } from '@shared/fields'
import {
  FIELD_TYPE_ICONS,
  FIELD_TYPE_LABELS,
  defaultConfig,
  defaultValue
} from '@shared/fields'
import WidgetFrame from './WidgetFrame'
import { useTablesStore } from '../../stores/tables'
import { useWidgetStore } from '../../stores/widgets'
import FieldEditor from '../fields/FieldEditor'
import RelationConfigEditor from '../fields/RelationConfigEditor'
import Icon from '../Icon'

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
    if (tableId) {
      void ensureTable(tableId).then(() => void ensureRows(tableId))
      return
    }
    if (provisionedRef.current) return
    provisionedRef.current = true
    void (async () => {
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
      await updateWidget(widget.id, { content: created.id, title: created.title })
    })()
  }, [tableId, ensureTable, ensureRows, createTable, updateWidget, widget.id, widget.taskId, widget.title])

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
    const id = `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    const def: FieldDefinition = {
      id,
      type,
      label: FIELD_TYPE_LABELS[type],
      config: defaultConfig(type) as never
    } as FieldDefinition
    const next: TableSchema = {
      columns: [...table!.schema.columns, def]
    }
    void setSchema(table!.id, next)
  }

  function removeColumn(columnId: string): void {
    const next: TableSchema = {
      columns: table!.schema.columns.filter((c) => c.id !== columnId)
    }
    void setSchema(table!.id, next)
  }

  function renameColumn(columnId: string, label: string): void {
    const next: TableSchema = {
      columns: table!.schema.columns.map((c) =>
        c.id === columnId ? ({ ...c, label } as FieldDefinition) : c
      )
    }
    void setSchema(table!.id, next)
  }

  function setColumnConfig(columnId: string, config: unknown): void {
    const next: TableSchema = {
      columns: table!.schema.columns.map((c) =>
        c.id === columnId ? ({ ...c, config } as FieldDefinition) : c
      )
    }
    void setSchema(table!.id, next)
  }

  function commitCell(rowId: string, columnId: string, value: unknown): void {
    void updateCells(rowId, { [columnId]: value })
  }

  function renameTable(title: string): void {
    void updateTable(table!.id, { title })
  }

  const body = (
    <div className="h-full w-full bg-white dark:bg-stone-900 overflow-auto">
      {/* Title row */}
      <div className="sticky top-0 z-10 px-3 py-2 bg-white/95 dark:bg-stone-900/95 border-b border-stone-200 dark:border-stone-700 flex items-center gap-1">
        <Icon name="table_chart" size={14} className="text-accent" />
        <input
          value={table.title}
          onChange={(e) => renameTable(e.target.value)}
          className="flex-1 bg-transparent text-[13px] font-medium text-stone-800 dark:text-stone-100 outline-none"
        />
        <span className="text-[10px] text-stone-400">
          {rows.length} {rows.length === 1 ? 'row' : 'rows'}
        </span>
      </div>

      <div className="text-[11px]">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/40">
              <th className="w-6 px-1 py-1" />
              {table.schema.columns.map((col) => (
                <ColumnHeader
                  key={col.id}
                  col={col}
                  tableId={table.id}
                  onRename={(label) => renameColumn(col.id, label)}
                  onRemove={() => removeColumn(col.id)}
                  onSetConfig={(c) => setColumnConfig(col.id, c)}
                />
              ))}
              <th className="w-8 px-1 py-1">
                <ColumnAdder onAdd={addColumn} />
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-stone-100 dark:border-stone-800 hover:bg-stone-50/50 dark:hover:bg-stone-800/30 group"
              >
                <td className="w-6 px-1 py-1 text-center">
                  <button
                    onClick={() => void deleteRow(row.id)}
                    className="opacity-0 group-hover:opacity-100 text-stone-400 hover:text-red-600"
                    title="Delete row"
                  >
                    <Icon name="delete" size={11} />
                  </button>
                </td>
                {table.schema.columns.map((col) => (
                  <td
                    key={col.id}
                    className="border-r border-stone-100 dark:border-stone-800 align-top"
                    style={{ minWidth: 120 }}
                  >
                    <FieldEditor
                      def={col}
                      value={row.cells[col.id] ?? defaultValue(col.type)}
                      variant="cell"
                      onCommit={(next) => commitCell(row.id, col.id, next)}
                    />
                  </td>
                ))}
                <td />
              </tr>
            ))}
            {/* Add-row footer */}
            <tr>
              <td colSpan={table.schema.columns.length + 2} className="p-1">
                <button
                  onClick={() => void addRow(table.id)}
                  className="inline-flex items-center gap-1 text-[11px] px-2 py-1 text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100"
                >
                  <Icon name="add" size={12} />
                  <span>Add row</span>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
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

// ── Column header with rename + config + delete popover ──────────────────────
function ColumnHeader({
  col,
  tableId,
  onRename,
  onRemove,
  onSetConfig
}: {
  col: FieldDefinition
  tableId: string
  onRename: (label: string) => void
  onRemove: () => void
  onSetConfig: (config: unknown) => void
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
      className="text-left px-2 py-1 font-medium text-[11px] text-stone-700 dark:text-stone-200 relative"
      style={{ minWidth: 120 }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 hover:bg-stone-100 dark:hover:bg-stone-800 rounded px-1 py-0.5 w-full text-left"
      >
        <Icon name={FIELD_TYPE_ICONS[col.type]} size={11} className="text-stone-400 shrink-0" />
        <span className="truncate">{col.label}</span>
      </button>
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
