import type { FieldDefinition, FieldType } from '@shared/fields'
import { defaultConfig } from '@shared/fields'
import { useTablesStore } from '../stores/tables'
import { coerceCellValue } from './actionExecutor'

// Build/populate a table from free text using the SAME AI path the in-table
// assistant uses (suggestTableRows → add proposed columns → coerce + insert
// rows). This is what lets a wire or a desk agent feed a table so it ends up
// "configured as if the user used the table's AI" — proper typed columns and
// rows — instead of raw text landing in the table's id field.
//
// Rows are REPLACED on each build (the source owns the table's contents), so an
// agent re-running refreshes the table rather than piling up duplicates.

const PALETTE = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ec4899'
]

function buildColumn(c: { label: string; type: string; options?: string[] }): FieldDefinition {
  const id = `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  let config: unknown = defaultConfig(c.type as FieldType)
  if ((c.type === 'single-select' || c.type === 'multi-select') && Array.isArray(c.options)) {
    config = {
      options: c.options.map((label, oi) => ({
        id: `o-${Date.now().toString(36)}-${oi}`,
        label,
        color: PALETTE[oi % PALETTE.length]
      }))
    }
  }
  return { id, type: c.type, label: c.label, config } as FieldDefinition
}

export interface TableBuildResult {
  ok: boolean
  error?: string
  rows?: number
}

export async function buildTableFromText(
  tableId: string,
  material: string,
  extraInstruction?: string
): Promise<TableBuildResult> {
  if (!tableId) return { ok: false, error: 'No linked table.' }
  const tables = useTablesStore.getState()
  const table = await tables.ensureTableLoaded(tableId)
  if (!table) return { ok: false, error: 'Linked table not found.' }

  const lead = extraInstruction && extraInstruction.trim()
    ? `${extraInstruction.trim()}\n\n`
    : 'Populate this table from the following content. Make one row per item.\n\n'
  const resp = await window.api.ai.suggestTableRows(tableId, lead + material.slice(0, 8000), 0)
  if (!resp.ok) return { ok: false, error: resp.error ?? 'Table AI failed.' }
  if (!resp.rows || resp.rows.length === 0) return { ok: false, error: 'No rows generated.' }

  // Add any proposed columns the table doesn't already have.
  const fresh = (resp.columnsToAdd ?? []).filter((c) => {
    const lc = c.label.toLowerCase().trim()
    return !table.schema.columns.some((e) => e.label.toLowerCase().trim() === lc)
  })
  if (fresh.length > 0) {
    await tables.setSchema(tableId, {
      columns: [...table.schema.columns, ...fresh.map(buildColumn)]
    })
  }

  // Replace existing rows.
  const existing = await tables.ensureRowsLoaded(tableId)
  for (const r of existing) await tables.deleteRow(r.id)

  const cols = useTablesStore.getState().tables[tableId]?.schema.columns ?? table.schema.columns
  const byKey = new Map<string, FieldDefinition>()
  for (const col of cols) {
    byKey.set(col.id, col)
    byKey.set(col.label.toLowerCase().trim(), col)
  }
  let count = 0
  for (const aiRow of resp.rows) {
    const cells: Record<string, unknown> = {}
    for (const [key, raw] of Object.entries(aiRow)) {
      const col = byKey.get(key) ?? byKey.get(key.toLowerCase().trim())
      if (!col) continue
      cells[col.id] = coerceCellValue(col.type, raw, col.config)
    }
    if (Object.keys(cells).length > 0) {
      await tables.addRow(tableId, cells)
      count++
    }
  }
  return { ok: true, rows: count }
}
