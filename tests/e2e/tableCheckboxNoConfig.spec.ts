import { test, expect } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

// Regression: a table whose checkbox column has no `config` (legacy / imported /
// seeded data) used to crash the canvas — CheckboxInput read config.label on
// undefined. FieldEditor now defaults a missing config, so the table renders.

let launched: LaunchedApp | null = null
test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

test('a table with a config-less checkbox column renders without crashing', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const ids = await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const task = await api.nodes.create({ parentId: null, kind: 'task', title: 'Table crash test' })
    // Columns deliberately WITHOUT a `config` field — the old crash case.
    const tbl = await api.tables.create({
      taskId: task.id,
      title: 'Things',
      schema: {
        columns: [
          { id: 'c_name', label: 'Name', type: 'text-short' },
          { id: 'c_done', label: 'Done', type: 'checkbox' }
        ]
      }
    } as never)
    await api.tables.createRow({ tableId: tbl.id, cells: { c_name: 'Ship it', c_done: 'true' } } as never)
    const w = await api.widgets.create({
      taskId: task.id,
      kind: 'table',
      title: 'Things',
      content: tbl.id,
      x: 160,
      y: 160,
      width: 420,
      height: 280
    })
    return { taskId: task.id, widgetId: w.id }
  })

  await window.reload()
  await waitForReady(window)
  await window.getByRole('button', { name: /Table crash test/ }).first().click()
  await window.waitForSelector('[data-canvas-surface="true"]', { timeout: 5_000 })
  await window.waitForTimeout(400)

  // The canvas + the table widget render (no white-screen, no error boundary),
  // and the checkbox cell is present.
  await expect(window.locator('[data-canvas-surface="true"]')).toBeVisible()
  await expect(window.locator(`[data-widget-id="${ids.widgetId}"]`)).toBeVisible()
  await expect(
    window.locator(`[data-widget-id="${ids.widgetId}"] input[type="checkbox"]`).first()
  ).toBeVisible()
})
