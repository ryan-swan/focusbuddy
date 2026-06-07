import type { FbRow, FieldDefinition, FieldType } from '@shared/fields'
import { defaultConfig } from '@shared/fields'
import { useTablesStore } from '../stores/tables'
import { coerceCellValue } from './actionExecutor'

// Build/maintain a table from free text using the SAME AI path the in-table
// assistant uses (suggestTableRows → add proposed columns → coerce rows). This
// lets a wire or a desk agent feed a table so it ends up "configured as if the
// user used the table's AI" — proper typed columns and rows — instead of raw
// text landing in the table's id field.
//
// CRITICAL: this is a non-destructive UPSERT, never a wipe-and-replace. The AI
// sees the table's CURRENT rows + the instruction, and we match returned rows to
// existing ones by their key column: a match UPDATES that row in place, a new
// item ADDS a row, and rows the AI doesn't mention are LEFT ALONE. So asking an
// agent to "complete task X" updates that row instead of deleting the table.

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
  instruction?: string
): Promise<TableBuildResult> {
  if (!tableId) return { ok: false, error: 'No linked table.' }
  const tables = useTablesStore.getState()
  const table = await tables.ensureTableLoaded(tableId)
  if (!table) return { ok: false, error: 'Linked table not found.' }
  const existingRows = await tables.ensureRowsLoaded(tableId)

  // The key column we match rows on (first text column, else the first column).
  const cols0 = table.schema.columns
  const keyCol =
    cols0.find((c) => c.type === 'text-short' || c.type === 'text-long') ?? cols0[0] ?? null

  // Show the AI the current rows so it UPDATES the right ones instead of
  // regenerating the table from scratch.
  const rowsCtx = existingRows.length
    ? existingRows
        .map((r) => cols0.map((c) => `${c.label}: ${String(r.cells[c.id] ?? '')}`).join(' | '))
        .join('\n')
    : '(no rows yet)'

  const prompt =
    `The table currently contains these rows:\n${rowsCtx}\n\n` +
    (instruction && instruction.trim()
      ? `Request: ${instruction.trim()}\n\n`
      : 'Request: update this table from the material below.\n\n') +
    `Material to work from:\n${material.slice(0, 8000)}\n\n` +
    (keyCol
      ? `Return ONLY rows to add or update. To UPDATE an existing row, return it with the exact same "${keyCol.label}" value and just the fields that change. Add a row only for a genuinely new item. Do NOT restate unchanged rows and never remove rows.`
      : 'Return rows to add or update; never remove rows.')

  const resp = await window.api.ai.suggestTableRows(tableId, prompt, 0)
  if (!resp.ok) return { ok: false, error: resp.error ?? 'Table AI failed.' }
  if (!resp.rows || resp.rows.length === 0) {
    // Nothing to change is fine for a populated table; only an error if the
    // table was empty and we still got nothing.
    return existingRows.length > 0
      ? { ok: true, rows: 0 }
      : { ok: false, error: 'No rows generated.' }
  }

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

  const cols = useTablesStore.getState().tables[tableId]?.schema.columns ?? table.schema.columns
  const byKey = new Map<string, FieldDefinition>()
  for (const col of cols) {
    byKey.set(col.id, col)
    byKey.set(col.label.toLowerCase().trim(), col)
  }
  // Index existing rows by their key-column value for matching.
  const keyColId = keyCol?.id ?? null
  const existingByKey = new Map<string, FbRow>()
  if (keyColId) {
    for (const r of await tables.ensureRowsLoaded(tableId)) {
      const k = String(r.cells[keyColId] ?? '').toLowerCase().trim()
      if (k) existingByKey.set(k, r)
    }
  }

  let changed = 0
  for (const aiRow of resp.rows) {
    const cells: Record<string, unknown> = {}
    for (const [key, raw] of Object.entries(aiRow)) {
      const col = byKey.get(key) ?? byKey.get(key.toLowerCase().trim())
      if (!col) continue
      cells[col.id] = coerceCellValue(col.type, raw, col.config)
    }
    if (Object.keys(cells).length === 0) continue
    const keyVal = keyColId ? String(cells[keyColId] ?? '').toLowerCase().trim() : ''
    const match = keyVal ? existingByKey.get(keyVal) : null
    if (match) {
      await tables.updateCells(match.id, cells) // UPDATE in place
    } else {
      await tables.addRow(tableId, cells) // genuinely new
    }
    changed++
  }
  return { ok: true, rows: changed }
}
