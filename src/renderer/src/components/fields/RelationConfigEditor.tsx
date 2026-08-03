import { useEffect } from 'react'
import { useTablesStore } from '../../stores/tables'

interface Props {
  config: { tableId: string | null; displayColumnId?: string | null; multi?: boolean }
  // The current table id (if used inside a TableWidget). We hide it from the
  // target dropdown to prevent self-references — which would create unbounded
  // recursion in the relation display. Pass null when used from a free-floating
  // Field widget.
  excludeTableId?: string | null
  onChange: (next: {
    tableId: string | null
    displayColumnId?: string | null
    multi?: boolean
  }) => void
}

// Compact editor for `relation` field config: pick a target table, pick which
// column of that table to show on the chip, and toggle single vs multi.
// Shared between the FieldWidget (canvas) and TableWidget column header
// popover so the UX is identical.
export default function RelationConfigEditor({
  config,
  excludeTableId,
  onChange
}: Props): JSX.Element {
  const tables = useTablesStore((s) => s.tables)
  const ensureRows = useTablesStore((s) => s.ensureRowsLoaded)
  // Pull all tables once; in MVP we don't list them globally otherwise.
  useEffect(() => {
    void window.api.tables.list().then((all) => {
      const store = useTablesStore.getState()
      const next = { ...store.tables }
      for (const t of all) next[t.id] = t
      // We can't import set directly — use the store API to merge.
      useTablesStore.setState({ tables: next })
    })
  }, [])

  const candidates = Object.values(tables).filter(
    (t) => !excludeTableId || t.id !== excludeTableId
  )
  const target = config.tableId ? tables[config.tableId] ?? null : null
  // When the target changes, eagerly load its rows so the picker is responsive
  // when the user opens the relation chip.
  useEffect(() => {
    if (config.tableId) void ensureRows(config.tableId)
  }, [config.tableId, ensureRows])

  return (
    <div className="space-y-1.5">
      <div className="text-[10px] uppercase tracking-wider text-[var(--ink-40)]">
        Linked table
      </div>
      <select
        value={config.tableId ?? ''}
        onChange={(e) =>
          onChange({ ...config, tableId: e.target.value || null, displayColumnId: null })
        }
        className="w-full text-[11px] bg-[var(--surface-sunken)] border border-[var(--edge-firm)] rounded px-1.5 py-1"
      >
        <option value="">— pick a table —</option>
        {candidates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.title}
          </option>
        ))}
      </select>
      {target && (
        <>
          <div className="text-[10px] uppercase tracking-wider text-[var(--ink-40)]">
            Display column
          </div>
          <select
            value={config.displayColumnId ?? ''}
            onChange={(e) =>
              onChange({ ...config, displayColumnId: e.target.value || null })
            }
            className="w-full text-[11px] bg-[var(--surface-sunken)] border border-[var(--edge-firm)] rounded px-1.5 py-1"
          >
            <option value="">(auto — first text column)</option>
            {target.schema.columns
              .filter((c) => c.type === 'text-short' || c.type === 'text-long' || c.type === 'number')
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
          </select>
          <label className="inline-flex items-center gap-1 text-[11px] text-[var(--ink-70)] cursor-pointer">
            <input
              type="checkbox"
              checked={config.multi !== false}
              onChange={(e) => onChange({ ...config, multi: e.target.checked })}
              className="h-3 w-3 cursor-pointer"
            />
            <span>Allow multiple links</span>
          </label>
        </>
      )}
    </div>
  )
}
