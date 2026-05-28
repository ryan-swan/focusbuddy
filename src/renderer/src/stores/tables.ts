import { create } from 'zustand'
import type {
  FbRow,
  FbTable,
  FbTableDraft,
  FbTablePatch,
  TableSchema
} from '@shared/fields'

interface TablesStore {
  tables: Record<string, FbTable>
  rows: Record<string, FbRow[]> // tableId → rows in display order
  ensureTableLoaded: (id: string) => Promise<FbTable | null>
  ensureRowsLoaded: (tableId: string) => Promise<FbRow[]>
  createTable: (draft: FbTableDraft) => Promise<FbTable>
  updateTable: (id: string, patch: FbTablePatch) => Promise<void>
  setSchema: (id: string, schema: TableSchema) => Promise<void>
  addRow: (tableId: string, cells?: Record<string, unknown>) => Promise<FbRow>
  updateCells: (rowId: string, cells: Record<string, unknown>) => Promise<void>
  deleteRow: (rowId: string) => Promise<void>
  reorderRows: (tableId: string, ids: string[]) => Promise<void>
}

export const useTablesStore = create<TablesStore>((set, get) => ({
  tables: {},
  rows: {},
  ensureTableLoaded: async (id) => {
    const existing = get().tables[id]
    if (existing) return existing
    const fetched = await window.api.tables.get(id)
    if (fetched) {
      set({ tables: { ...get().tables, [id]: fetched } })
    }
    return fetched
  },
  ensureRowsLoaded: async (tableId) => {
    const existing = get().rows[tableId]
    if (existing) return existing
    const fetched = await window.api.tables.listRows(tableId)
    set({ rows: { ...get().rows, [tableId]: fetched } })
    return fetched
  },
  createTable: async (draft) => {
    const table = await window.api.tables.create(draft)
    set({
      tables: { ...get().tables, [table.id]: table },
      rows: { ...get().rows, [table.id]: [] }
    })
    return table
  },
  updateTable: async (id, patch) => {
    const updated = await window.api.tables.update(id, patch)
    if (!updated) return
    set({ tables: { ...get().tables, [id]: updated } })
  },
  setSchema: async (id, schema) => {
    // Optimistic: apply locally so the schema-editing UI doesn't lag, then
    // reconcile with the persisted value.
    const current = get().tables[id]
    if (current) {
      set({ tables: { ...get().tables, [id]: { ...current, schema } } })
    }
    const updated = await window.api.tables.update(id, { schema })
    if (updated) set({ tables: { ...get().tables, [id]: updated } })
  },
  addRow: async (tableId, cells = {}) => {
    const row = await window.api.tables.createRow({ tableId, cells })
    const existing = get().rows[tableId] ?? []
    set({ rows: { ...get().rows, [tableId]: [...existing, row] } })
    return row
  },
  updateCells: async (rowId, cells) => {
    // Optimistic local update — table editing feels janky otherwise because
    // every keystroke routes through IPC.
    const rowsCopy: Record<string, FbRow[]> = { ...get().rows }
    let foundTableId: string | null = null
    for (const [tableId, list] of Object.entries(rowsCopy)) {
      const idx = list.findIndex((r) => r.id === rowId)
      if (idx === -1) continue
      foundTableId = tableId
      const next = [...list]
      next[idx] = { ...next[idx], cells: { ...next[idx].cells, ...cells } }
      rowsCopy[tableId] = next
      break
    }
    if (!foundTableId) return
    set({ rows: rowsCopy })
    const updated = await window.api.tables.updateRow(rowId, {
      cells: rowsCopy[foundTableId].find((r) => r.id === rowId)?.cells
    })
    if (updated) {
      const list = rowsCopy[foundTableId]
      const idx = list.findIndex((r) => r.id === rowId)
      if (idx !== -1) {
        const next = [...list]
        next[idx] = updated
        set({ rows: { ...get().rows, [foundTableId]: next } })
      }
    }
  },
  deleteRow: async (rowId) => {
    await window.api.tables.deleteRow(rowId)
    const rowsCopy: Record<string, FbRow[]> = {}
    for (const [tableId, list] of Object.entries(get().rows)) {
      rowsCopy[tableId] = list.filter((r) => r.id !== rowId)
    }
    set({ rows: rowsCopy })
  },
  reorderRows: async (tableId, ids) => {
    const byId = new Map((get().rows[tableId] ?? []).map((r) => [r.id, r]))
    const reordered = ids.map((id) => byId.get(id)).filter(Boolean) as FbRow[]
    set({ rows: { ...get().rows, [tableId]: reordered } })
    await window.api.tables.reorderRows(tableId, ids)
  }
}))
