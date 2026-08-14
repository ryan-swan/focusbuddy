import type { Widget, FbNode, TimeBlock, FbDocument } from '@shared/types'
import type { FbRow, FbTable, FileEntry } from '@shared/fields'

// WS01 sync substrate — the seam between the widgets store and the sync engine.
//
// The store must tell the engine "this widget's geometry/membership just changed
// locally" without importing the engine (which imports the store), so this tiny
// registry breaks the cycle. The engine registers its implementation at init, and
// only when the fb.sync.crdt.widgets flag is on; until then every call here is a
// no-op and the store behaves exactly as before.

export interface CrdtEmit {
  geom: (w: Widget) => void
  membership: (widgetId: string, from: string | null, to: string | null) => void
  widgetCreate: (w: Widget) => void
  widgetDelete: (widgetId: string) => void
  widgetFields: (widgetId: string, patch: { content?: string; title?: string; color?: string | null; status?: string | null; zIndex?: number }) => void
  nodeTitle: (nodeId: string, title: string) => void
  nodeParent: (nodeId: string, parentId: string | null) => void
  nodeCreate: (node: FbNode) => void
  nodeDelete: (nodeIds: string[]) => void
  nodeAttrs: (nodeId: string, attrs: Record<string, unknown>) => void
  rowCells: (rowId: string, cells: Record<string, unknown>) => void
  rowOrder: (rowId: string, sortOrder: number) => void
  rowCreate: (row: FbRow) => void
  rowDelete: (rowId: string) => void
  tableCreate: (table: FbTable) => void
  tableDelete: (tableId: string) => void
  tableAttrs: (tableId: string, attrs: Record<string, unknown>) => void
  timeBlock: (blockId: string, patch: { startMs?: number; durationMin?: number; title?: string; status?: string }) => void
  timeBlockCreate: (block: TimeBlock) => void
  timeBlockDelete: (blockId: string) => void
  fileName: (entryId: string, name: string) => void
  fileParent: (entryId: string, parentId: string | null) => void
  fileCreate: (entry: FileEntry) => void
  fileDelete: (entryId: string) => void
  documentCreate: (doc: FbDocument) => void
  documentDelete: (docId: string) => void
  documentAttrs: (docId: string, attrs: Record<string, unknown>) => void
}

let impl: CrdtEmit | null = null

export function registerCrdtEmit(e: CrdtEmit | null): void {
  impl = e
}

export function crdtEmitGeom(w: Widget): void {
  impl?.geom(w)
}

export function crdtEmitMembership(widgetId: string, from: string | null, to: string | null): void {
  impl?.membership(widgetId, from, to)
}

export function crdtEmitWidgetCreate(w: Widget): void {
  impl?.widgetCreate(w)
}
export function crdtEmitWidgetDelete(widgetId: string): void {
  impl?.widgetDelete(widgetId)
}
export function crdtEmitWidgetFields(
  widgetId: string,
  patch: { content?: string; title?: string; color?: string | null; status?: string | null; zIndex?: number }
): void {
  impl?.widgetFields(widgetId, patch)
}

export function crdtEmitNodeTitle(nodeId: string, title: string): void {
  impl?.nodeTitle(nodeId, title)
}

export function crdtEmitNodeParent(nodeId: string, parentId: string | null): void {
  impl?.nodeParent(nodeId, parentId)
}
export function crdtEmitNodeCreate(node: FbNode): void {
  impl?.nodeCreate(node)
}
// A node delete can cascade (a folder + its descendants); the store passes every
// removed id so each is tombstoned on other devices.
export function crdtEmitNodeDelete(nodeIds: string[]): void {
  impl?.nodeDelete(nodeIds)
}
export function crdtEmitNodeAttrs(nodeId: string, attrs: Record<string, unknown>): void {
  impl?.nodeAttrs(nodeId, attrs)
}

export function crdtEmitRowCells(rowId: string, cells: Record<string, unknown>): void {
  impl?.rowCells(rowId, cells)
}
export function crdtEmitRowOrder(rowId: string, sortOrder: number): void {
  impl?.rowOrder(rowId, sortOrder)
}
export function crdtEmitRowCreate(row: FbRow): void {
  impl?.rowCreate(row)
}
export function crdtEmitRowDelete(rowId: string): void {
  impl?.rowDelete(rowId)
}
export function crdtEmitTableCreate(table: FbTable): void {
  impl?.tableCreate(table)
}
export function crdtEmitTableDelete(tableId: string): void {
  impl?.tableDelete(tableId)
}
export function crdtEmitTableAttrs(tableId: string, attrs: Record<string, unknown>): void {
  impl?.tableAttrs(tableId, attrs)
}

export function crdtEmitTimeBlock(
  blockId: string,
  patch: { startMs?: number; durationMin?: number; title?: string; status?: string }
): void {
  impl?.timeBlock(blockId, patch)
}

export function crdtEmitFileName(entryId: string, name: string): void {
  impl?.fileName(entryId, name)
}

export function crdtEmitFileParent(entryId: string, parentId: string | null): void {
  impl?.fileParent(entryId, parentId)
}
export function crdtEmitTimeBlockCreate(block: TimeBlock): void {
  impl?.timeBlockCreate(block)
}
export function crdtEmitTimeBlockDelete(blockId: string): void {
  impl?.timeBlockDelete(blockId)
}
export function crdtEmitFileCreate(entry: FileEntry): void {
  impl?.fileCreate(entry)
}
export function crdtEmitFileDelete(entryId: string): void {
  impl?.fileDelete(entryId)
}
export function crdtEmitDocumentCreate(doc: FbDocument): void {
  impl?.documentCreate(doc)
}
export function crdtEmitDocumentDelete(docId: string): void {
  impl?.documentDelete(docId)
}
export function crdtEmitDocumentAttrs(docId: string, attrs: Record<string, unknown>): void {
  impl?.documentAttrs(docId, attrs)
}
