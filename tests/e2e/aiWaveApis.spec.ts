// E2E: executor-adjacent API checks driven directly through window.api — the
// same IPC surface the AI action executor and undo/redo call into. API-driven
// rather than UI-gesture-driven per the documented tester policy: the risk
// surface here is store -> IPC -> SQLite -> IPC durability, not pointer
// interaction.
//
// (a) documents.create -> documents.update(..., 'AI edit') -> listSnapshots
//     proves a labelled body-save lands a real doc_snapshots row (see
//     src/main/ipc/index.ts documents:update handler, which calls
//     captureDocSnapshot(id, snapshotLabel) whenever patch.body is present).
// (b) tables: create + createRow + updateRow + listRows proves the cell-edit
//     round-trip real AI table edits rely on.
// (c) timeBlocks create/delete as an undo-surface sanity check (mirrors the
//     existing TB-1 pattern in timeBlocks.spec.ts).

import { test, expect } from '@playwright/test'
import { launchApp, waitForReady, type LaunchedApp } from './_helpers'

let launched: LaunchedApp | null = null

test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

test('(a) documents.update with a snapshot label lands a real doc_snapshots row', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const result = await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const doc = await api.documents.create({ docType: 'doc', title: 'AI Wave Doc' } as never)

    const beforeSnapshots = await api.documents.listSnapshots(doc.id)

    const updated = await api.documents.update(
      doc.id,
      { body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'AI wrote this' }] }] } } as never,
      'AI edit'
    )

    const afterSnapshots = await api.documents.listSnapshots(doc.id)

    return {
      docId: doc.id,
      updatedOk: !!updated,
      beforeCount: beforeSnapshots.length,
      afterCount: afterSnapshots.length,
      labels: afterSnapshots.map((s) => (s as unknown as { label: string }).label)
    }
  })

  expect(result.updatedOk).toBe(true)
  expect(result.afterCount).toBeGreaterThan(result.beforeCount)
  expect(result.labels).toContain('AI edit')
})

test('(b) table create + row create + row update round-trips through real SQLite', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const result = await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api

    const table = await api.tables.create({
      title: 'AI Wave Table',
      schema: { columns: [{ id: 'c1', type: 'text-short', label: 'Name', config: {} }] }
    } as never)

    const row = await api.tables.createRow({ tableId: table.id, cells: { c1: 'Original' } } as never)

    const updated = await api.tables.updateRow(row.id, { cells: { c1: 'Edited by AI' } } as never)

    const rows = await api.tables.listRows(table.id)
    const found = rows.find((r) => r.id === row.id)

    return {
      tableId: table.id,
      rowId: row.id,
      updatedOk: !!updated,
      updatedCellValue: (updated as unknown as { cells: Record<string, unknown> } | null)?.cells?.c1 ?? null,
      foundCellValue: (found as unknown as { cells: Record<string, unknown> } | undefined)?.cells?.c1 ?? null
    }
  })

  expect(result.tableId).toBeTruthy()
  expect(result.rowId).toBeTruthy()
  expect(result.updatedOk).toBe(true)
  expect(result.updatedCellValue).toBe('Edited by AI')
  expect(result.foundCellValue).toBe('Edited by AI')
})

test('(c) timeBlocks create + delete as an undo-surface sanity check', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const result = await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const start = 1_760_000_000_000

    const created = await api.timeBlocks.create({
      taskId: null,
      title: 'AI Wave Block',
      startMs: start,
      durationMin: 45
    } as never)

    const listedBeforeDelete = await api.timeBlocks.list(start - 60_000, start + 60_000)
    const deleted = await api.timeBlocks.delete(created.id)
    const listedAfterDelete = await api.timeBlocks.list(start - 60_000, start + 60_000)

    return {
      createdId: created.id,
      hadItBeforeDelete: listedBeforeDelete.some((b) => b.id === created.id),
      deleted,
      hasItAfterDelete: listedAfterDelete.some((b) => b.id === created.id)
    }
  })

  expect(result.createdId).toBeTruthy()
  expect(result.hadItBeforeDelete).toBe(true)
  expect(result.deleted).toBe(true)
  expect(result.hasItAfterDelete).toBe(false)
})
