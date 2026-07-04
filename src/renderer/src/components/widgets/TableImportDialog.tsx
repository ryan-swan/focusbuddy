import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { TableSchema, FieldType, FieldDefinition } from '@shared/fields'
import { defaultConfig, FIELD_TYPE_LABELS } from '@shared/fields'
import { useTablesStore } from '../../stores/tables'
import { useActionHistory } from '../../stores/actionHistory'
import Icon from '../Icon'
import {
  buildImportPlan,
  suggestMappings,
  type ColumnMapping,
  type ColumnTarget,
  type ImportRow,
  type ParsedGrid
} from '../../lib/tableImport'

// The "import into this table" wizard. Maps the columns of a parsed file onto
// the table, creating new columns where asked, and upserts rows against a
// chosen primary key. The pure plan comes from lib/tableImport; this component
// is the mapping UI plus the apply step.

interface Props {
  tableId: string
  schema: TableSchema
  rows: ImportRow[]
  grid: ParsedGrid
  fileLabel: string
  onClose: () => void
  onApplied: (summary: { inserted: number; updated: number; columnsAdded: number }) => void
}

// Types a newly created column may take, kept to the ones an import can fill.
const NEW_COLUMN_TYPES: FieldType[] = ['text-short', 'text-long', 'number', 'checkbox', 'date']

export default function TableImportDialog({
  tableId,
  schema,
  rows,
  grid,
  fileLabel,
  onClose,
  onApplied
}: Props): JSX.Element {
  const setSchema = useTablesStore((s) => s.setSchema)
  const addRow = useTablesStore((s) => s.addRow)
  const updateCells = useTablesStore((s) => s.updateCells)

  const [mappings, setMappings] = useState<ColumnMapping[]>(() =>
    suggestMappings(schema, grid, (_h, i) => `imp-${i}-${Math.random().toString(36).slice(2, 7)}`)
  )
  const [primaryKeyColumnId, setPrimaryKeyColumnId] = useState<string | null>(() => {
    // Default the key to the first source header that matched an existing column.
    const firstExisting = suggestMappings(schema, grid, (_h, i) => `x${i}`).find(
      (m) => m.target.kind === 'existing'
    )
    return firstExisting && firstExisting.target.kind === 'existing'
      ? firstExisting.target.columnId
      : null
  })
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const plan = useMemo(
    () => buildImportPlan({ schema, existingRows: rows, grid, mappings, primaryKeyColumnId }),
    [schema, rows, grid, mappings, primaryKeyColumnId]
  )

  // Columns the user can pick as the primary key: every mapped column (existing
  // or new). Matching on a brand-new column just means everything inserts.
  const keyOptions = useMemo(
    () =>
      mappings
        .filter((m) => m.target.kind !== 'skip')
        .map((m) => {
          const t = m.target as Exclude<ColumnTarget, { kind: 'skip' }>
          const label =
            t.kind === 'existing'
              ? schema.columns.find((c) => c.id === t.columnId)?.label ?? t.columnId
              : `${t.label} (new)`
          return { columnId: t.columnId, label }
        }),
    [mappings, schema]
  )

  function setTarget(index: number, target: ColumnTarget): void {
    setMappings((prev) => prev.map((m, i) => (i === index ? { ...m, target } : m)))
  }

  async function apply(): Promise<void> {
    if (applying) return
    setApplying(true)
    setError(null)
    try {
      if (plan.newColumns.length > 0) {
        const added: FieldDefinition[] = plan.newColumns.map(
          (c) =>
            ({
              id: c.id,
              type: c.type,
              label: c.label,
              config: defaultConfig(c.type)
            }) as FieldDefinition
        )
        await setSchema(tableId, { ...schema, columns: [...schema.columns, ...added] })
      }
      // One undo entry for the whole import, not one per row.
      useActionHistory.getState().beginBatch()
      try {
        for (const op of plan.ops) {
          if (op.op === 'insert') await addRow(tableId, op.cells)
          else await updateCells(op.rowId, op.cells)
        }
      } finally {
        useActionHistory.getState().endBatch(`Import ${plan.ops.length} row${plan.ops.length === 1 ? '' : 's'}`)
      }
      onApplied({
        inserted: plan.summary.inserted,
        updated: plan.summary.updated,
        columnsAdded: plan.summary.columnsAdded
      })
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setApplying(false)
    }
  }

  const selectCls =
    'text-[11px] rounded border border-[var(--edge-soft)] bg-[var(--surface-raised)] px-1.5 py-1 text-[var(--ink-70)] focus:outline-none focus:border-accent'

  return createPortal(
    <div
      className="fixed inset-0 z-[300] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Import into table"
      data-testid="table-import-dialog"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-xl bg-[var(--surface-raised)] border border-[var(--edge-soft)] shadow-2xl">
        <div className="px-4 py-3 border-b border-[var(--edge-soft)] flex items-center gap-2">
          <Icon name="upload_file" size={16} />
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-[var(--ink-100)]">Import into table</div>
            <div className="text-[11px] text-[var(--ink-50)] truncate">
              {fileLabel} · {grid.rows.length} {grid.rows.length === 1 ? 'row' : 'rows'}, {grid.headers.length}{' '}
              {grid.headers.length === 1 ? 'column' : 'columns'}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="h-7 w-7 inline-flex items-center justify-center rounded text-[var(--ink-40)] hover:text-[var(--ink-70)] hover:bg-[var(--surface-sunken)]">
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-auto px-4 py-3 space-y-3">
          <div className="text-[11px] uppercase tracking-[0.1em] text-[var(--ink-50)] font-medium">
            Map columns
          </div>
          <div className="space-y-1.5">
            {mappings.map((m, i) => {
              const t = m.target
              return (
                <div key={m.sourceHeader + i} className="flex items-center gap-2" data-testid={`map-row-${i}`}>
                  <div className="w-40 shrink-0 text-[12px] font-medium text-[var(--ink-70)] truncate" title={m.sourceHeader}>
                    {m.sourceHeader}
                  </div>
                  <Icon name="arrow_forward" size={13} />
                  <select
                    className={selectCls}
                    data-testid={`map-target-${i}`}
                    value={t.kind === 'existing' ? `existing:${t.columnId}` : t.kind === 'new' ? 'new' : 'skip'}
                    onChange={(e) => {
                      const v = e.target.value
                      if (v === 'skip') setTarget(i, { kind: 'skip' })
                      else if (v === 'new')
                        setTarget(i, {
                          kind: 'new',
                          columnId: `imp-${i}-${Math.random().toString(36).slice(2, 7)}`,
                          label: m.sourceHeader,
                          type: 'text-short'
                        })
                      else setTarget(i, { kind: 'existing', columnId: v.slice('existing:'.length) })
                    }}
                  >
                    <optgroup label="Existing column">
                      {schema.columns.map((c) => (
                        <option key={c.id} value={`existing:${c.id}`}>
                          {c.label}
                        </option>
                      ))}
                    </optgroup>
                    <option value="new">Create new column</option>
                    <option value="skip">Skip this column</option>
                  </select>
                  {t.kind === 'new' && (
                    <select
                      className={selectCls}
                      data-testid={`map-newtype-${i}`}
                      value={t.type}
                      onChange={(e) => setTarget(i, { ...t, type: e.target.value as FieldType })}
                    >
                      {NEW_COLUMN_TYPES.map((ft) => (
                        <option key={ft} value={ft}>
                          {FIELD_TYPE_LABELS[ft]}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )
            })}
          </div>

          <div className="pt-1 flex items-center gap-2">
            <div className="text-[11px] uppercase tracking-[0.1em] text-[var(--ink-50)] font-medium">
              Match rows on
            </div>
            <select
              className={selectCls}
              data-testid="import-primary-key"
              value={primaryKeyColumnId ?? ''}
              onChange={(e) => setPrimaryKeyColumnId(e.target.value || null)}
            >
              <option value="">Append all as new rows</option>
              {keyOptions.map((k) => (
                <option key={k.columnId} value={k.columnId}>
                  {k.label}
                </option>
              ))}
            </select>
            <span className="text-[10px] text-[var(--ink-40)]">
              rows with a matching value update in place; the rest are added
            </span>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-[var(--edge-soft)] flex items-center gap-3">
          <div className="flex-1 text-[11px] text-[var(--ink-70)]" data-testid="import-preview">
            {plan.summary.inserted} to add, {plan.summary.updated} to update
            {plan.summary.columnsAdded > 0 ? `, ${plan.summary.columnsAdded} new column${plan.summary.columnsAdded === 1 ? '' : 's'}` : ''}
            {plan.summary.rowsSkipped > 0 ? `, ${plan.summary.rowsSkipped} empty skipped` : ''}
            {error && <span className="ml-2 text-red-500">{error}</span>}
          </div>
          <button onClick={onClose} className="px-3 py-1.5 rounded-md text-[12px] text-[var(--ink-70)] hover:bg-[var(--surface-sunken)]">
            Cancel
          </button>
          <button
            onClick={() => void apply()}
            disabled={applying || plan.ops.length === 0}
            data-testid="import-apply"
            className="px-3 py-1.5 rounded-md text-[12px] font-medium bg-accent text-white hover:bg-accent/90 disabled:opacity-50"
          >
            {applying ? 'Importing…' : `Import ${plan.ops.length} ${plan.ops.length === 1 ? 'row' : 'rows'}`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
