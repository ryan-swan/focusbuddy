// E2E: Table widget cell-range selection, copy, and bulk paste-to-selection.
//
// The table cells are always-live FieldEditor inputs, so range selection is a
// drag (real mouse) that highlights cells; copy/paste then operate on the range.
// Clipboard is exercised through the Electron clipboard module (set/read via
// app.evaluate) so the test doesn't depend on OS clipboard state.

import { test, expect } from '@playwright/test'
import { launchApp, waitForReady, type LaunchedApp } from './_helpers'

let launched: LaunchedApp | null = null

test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

interface Seed {
  taskId: string
  widgetId: string
  tableId: string
}

async function seedTable(window: LaunchedApp['window']): Promise<Seed> {
  return window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const task = await api.nodes.create({ parentId: null, kind: 'task', title: 'PasteTest' })
    const table = await api.tables.create({
      title: 'PasteTable',
      schema: {
        columns: [
          { id: 'c-name', type: 'text-short', label: 'Name', config: {} },
          { id: 'c-city', type: 'text-short', label: 'City', config: {} }
        ]
      }
    })
    await api.tables.createRow({ tableId: table.id, cells: { 'c-name': 'Ann', 'c-city': 'NYC' } })
    await api.tables.createRow({ tableId: table.id, cells: { 'c-name': 'Bob', 'c-city': 'LA' } })
    await api.tables.createRow({ tableId: table.id, cells: { 'c-name': 'Cy', 'c-city': 'SF' } })
    const widget = await api.widgets.create({
      taskId: task.id,
      kind: 'table',
      title: 'PasteTable',
      content: table.id,
      x: 100,
      y: 100,
      width: 560,
      height: 380
    })
    return { taskId: task.id, widgetId: widget.id, tableId: table.id }
  })
}

async function openTable(window: LaunchedApp['window'], taskTitle: string, widgetId: string): Promise<void> {
  await window.reload()
  await waitForReady(window)
  await window.getByRole('button', { name: new RegExp(taskTitle) }).first().click()
  await window.waitForSelector('[data-canvas-surface="true"]', { timeout: 8_000 })
  await window.waitForFunction(
    (wid: string) => !!document.querySelector(`[data-widget-id="${wid}"] [data-testid="table-body"]`),
    widgetId,
    { timeout: 10_000 }
  )
}

function cell(window: LaunchedApp['window'], widgetId: string, r: number, c: number) {
  return window.locator(`[data-widget-id="${widgetId}"] [data-testid="table-cell-${r}-${c}"]`)
}

async function cellValue(
  window: LaunchedApp['window'],
  widgetId: string,
  r: number,
  c: number
): Promise<string> {
  const input = cell(window, widgetId, r, c).locator('input').first()
  return input.inputValue()
}

async function dragSelect(
  window: LaunchedApp['window'],
  widgetId: string,
  from: [number, number],
  to: [number, number]
): Promise<void> {
  const a = await cell(window, widgetId, from[0], from[1]).boundingBox()
  const b = await cell(window, widgetId, to[0], to[1]).boundingBox()
  if (!a || !b) throw new Error('missing cell bounds')
  await window.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await window.mouse.down()
  await window.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 6 })
  await window.mouse.up()
  await window.waitForTimeout(120)
}

async function setClipboard(app: LaunchedApp['app'], text: string): Promise<void> {
  await app.evaluate(({ clipboard }, t: string) => clipboard.writeText(t), text)
}
async function readClipboard(app: LaunchedApp['app']): Promise<string> {
  return app.evaluate(({ clipboard }) => clipboard.readText())
}
async function focusBody(window: LaunchedApp['window'], widgetId: string): Promise<void> {
  await window.evaluate((wid: string) => {
    const el = document.querySelector(`[data-widget-id="${wid}"] [data-testid="table-body"]`)
    ;(el as HTMLElement | null)?.focus()
  }, widgetId)
}

test('TP-1 — drag-select a range then Ctrl+C copies the cells as TSV', async () => {
  launched = await launchApp()
  const { window, app } = launched
  await waitForReady(window)
  const seed = await seedTable(window)
  await openTable(window, 'PasteTest', seed.widgetId)

  await dragSelect(window, seed.widgetId, [0, 0], [1, 1])
  await focusBody(window, seed.widgetId)
  await window.keyboard.press('Control+c')
  await window.waitForTimeout(150)

  expect(await readClipboard(app)).toBe('Ann\tNYC\nBob\tLA')
})

test('TP-2 — bulk paste a single value fills the whole selection (coerced)', async () => {
  launched = await launchApp()
  const { window, app } = launched
  await waitForReady(window)
  const seed = await seedTable(window)
  await openTable(window, 'PasteTest', seed.widgetId)

  await setClipboard(app, 'ZZ')
  await dragSelect(window, seed.widgetId, [0, 0], [1, 0]) // Name column, rows 0-1
  await focusBody(window, seed.widgetId)
  await window.keyboard.press('Control+v')
  await window.waitForTimeout(300)

  expect(await cellValue(window, seed.widgetId, 0, 0), 'row0 Name').toBe('ZZ')
  expect(await cellValue(window, seed.widgetId, 1, 0), 'row1 Name').toBe('ZZ')
  // Row 2 untouched.
  expect(await cellValue(window, seed.widgetId, 2, 0), 'row2 Name').toBe('Cy')
})

test('TP-3 — bulk paste a block writes from the top-left across rows', async () => {
  launched = await launchApp()
  const { window, app } = launched
  await waitForReady(window)
  const seed = await seedTable(window)
  await openTable(window, 'PasteTest', seed.widgetId)

  await setClipboard(app, 'Paris\tParis City\nRome\tRome City')
  // Select starting at row 0, col 0 (a single anchor cell drag-selecting to itself
  // won't register; select a 2x2 region so the block lands inside it).
  await dragSelect(window, seed.widgetId, [0, 0], [1, 1])
  await focusBody(window, seed.widgetId)
  await window.keyboard.press('Control+v')
  await window.waitForTimeout(300)

  expect(await cellValue(window, seed.widgetId, 0, 0)).toBe('Paris')
  expect(await cellValue(window, seed.widgetId, 0, 1)).toBe('Paris City')
  expect(await cellValue(window, seed.widgetId, 1, 0)).toBe('Rome')
  expect(await cellValue(window, seed.widgetId, 1, 1)).toBe('Rome City')
})
