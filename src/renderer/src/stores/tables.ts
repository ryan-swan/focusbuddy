import { create } from 'zustand'
import { recordAction, recordActionWithToast } from './actionHistory'
import {
  crdtEmitRowCells,
  crdtEmitRowCreate,
  crdtEmitRowDelete,
  crdtEmitTableCreate,
  crdtEmitTableAttrs
} from '../lib/crdtBridge'
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
    // WS01 sync substrate (flagged): materialise the table on other devices.
    crdtEmitTableCreate(table)
    return table
  },
  updateTable: async (id, patch) => {
    const updated = await window.api.tables.update(id, patch)
    if (!updated) return
    set({ tables: { ...get().tables, [id]: updated } })
    // Title / schema as LWW attr registers.
    crdtEmitTableAttrs(id, patch as unknown as Record<string, unknown>)
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
    crdtEmitTableAttrs(id, { schema })
  },
  addRow: async (tableId, cells = {}) => {
    const row = await window.api.tables.createRow({ tableId, cells })
    const existing = get().rows[tableId] ?? []
    set({ rows: { ...get().rows, [tableId]: [...existing, row] } })
    // WS01 sync substrate (flagged): materialise the row on other devices.
    crdtEmitRowCreate(row)
    // Undo a row add (covers AI add-table-row applies). Redo re-creates it; the
    // id changes, so track the live id for a subsequent undo.
    let rowId = row.id
    recordAction({
      label: 'Add row',
      undo: async () => {
        await window.api.tables.deleteRow(rowId)
        set({ rows: { ...get().rows, [tableId]: (get().rows[tableId] ?? []).filter((r) => r.id !== rowId) } })
      },
      redo: async () => {
        const again = await window.api.tables.createRow({ tableId, cells })
        rowId = again.id
        set({ rows: { ...get().rows, [tableId]: [...(get().rows[tableId] ?? []), again] } })
      }
    })
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
    // WS01 sync substrate (flagged, off by default): each changed cell is an LWW
    // register, so a concurrent edit to a different cell of this row survives. No-op
    // until the engine registers (fb.sync.crdt.tables on).
    crdtEmitRowCells(rowId, cells)
    const updated = await window.api.tables.updateRow(rowId, {
      cells: rowsCopy[foundTableId].find((r) => r.id === rowId)?.cells
    })
    if (updated) {
      // Reconcile against the LIVE state, not the pre-await snapshot: another
      // cell edit or an AI row-add may have landed during the IPC round trip,
      // and rebuilding from the stale copy silently reverted it (the reported
      // "cell stays stale until re-selected" bug). Patch only this one row.
      const live = get().rows[foundTableId] ?? []
      const idx = live.findIndex((r) => r.id === rowId)
      if (idx !== -1) {
        const next = [...live]
        next[idx] = updated
        set({ rows: { ...get().rows, [foundTableId]: next } })
      }
    }
  },
  deleteRow: async (rowId) => {
    // Capture the row + its table so the delete can be undone (re-created with
    // the same cell values; the new row lands at the end of the table).
    let capturedTableId: string | null = null
    let capturedCells: Record<string, unknown> | null = null
    for (const [tableId, list] of Object.entries(get().rows)) {
      const r = list.find((x) => x.id === rowId)
      if (r) {
        capturedTableId = tableId
        capturedCells = r.cells
        break
      }
    }
    await window.api.tables.deleteRow(rowId)
    const rowsCopy: Record<string, FbRow[]> = {}
    for (const [tableId, list] of Object.entries(get().rows)) {
      rowsCopy[tableId] = list.filter((r) => r.id !== rowId)
    }
    set({ rows: rowsCopy })
    // WS01 sync substrate (flagged): tombstone the row so the delete converges.
    crdtEmitRowDelete(rowId)
    if (capturedTableId && capturedCells) {
      const tableId = capturedTableId
      // Rows are soft-deleted now, so undo restores the SAME row (same id and
      // sort_order) rather than re-inserting a fresh copy. Redo soft-deletes it
      // again. Keeping the id stable also means the delete/restore propagates as a
      // clean tombstone/un-tombstone pair to other org members.
      recordActionWithToast({
        label: 'Delete row',
        undo: async () => {
          const restored = await window.api.tables.restoreRow(rowId)
          if (restored) {
            const rest = (get().rows[tableId] ?? []).filter((r) => r.id !== rowId)
            set({ rows: { ...get().rows, [tableId]: [...rest, restored] } })
          }
        },
        redo: async () => {
          await window.api.tables.deleteRow(rowId)
          set({ rows: { ...get().rows, [tableId]: (get().rows[tableId] ?? []).filter((r) => r.id !== rowId) } })
        }
      })
    }
  },
  reorderRows: async (tableId, ids) => {
    const byId = new Map((get().rows[tableId] ?? []).map((r) => [r.id, r]))
    const reordered = ids.map((id) => byId.get(id)).filter(Boolean) as FbRow[]
    set({ rows: { ...get().rows, [tableId]: reordered } })
    await window.api.tables.reorderRows(tableId, ids)
  }
}))

// Refetch a table's rows whenever any writer changes them (flows and forms run
// in the main process and used to write behind this cache's back — the rows
// only appeared after an app restart). Only tables already cached refetch.
if (typeof window !== 'undefined' && window.api?.tables?.onRowsChanged) {
  window.api.tables.onRowsChanged((tableId) => {
    const state = useTablesStore.getState()
    if (!(tableId in state.rows)) return
    void window.api.tables.listRows(tableId).then((rows) => {
      useTablesStore.setState({ rows: { ...useTablesStore.getState().rows, [tableId]: rows } })
    })
  })
}
