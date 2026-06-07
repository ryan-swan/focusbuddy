import { test, expect } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

// Regression: a table widget whose content points at a table that doesn't exist
// (e.g. the AI emitted create-widget(table) with an invented id) used to hang
// forever on "Loading table…". It now self-heals — provisions a real backing
// table and repoints itself at it.

let launched: LaunchedApp | null = null
test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

test('a table widget with a dangling id self-heals instead of hanging', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const ids = await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const task = await api.nodes.create({ parentId: null, kind: 'task', title: 'Heal table' })
    const w = await api.widgets.create({
      taskId: task.id,
      kind: 'table',
      title: 'My tasks',
      content: 'ghost-table-that-does-not-exist',
      x: 160,
      y: 160,
      width: 420,
      height: 280
    })
    return { taskId: task.id, widgetId: w.id }
  })

  await window.reload()
  await waitForReady(window)
  await window.getByRole('button', { name: /Heal table/ }).first().click()
  await window.waitForSelector('[data-canvas-surface="true"]', { timeout: 5_000 })

  // It repoints itself at a real backing table that exists.
  await expect
    .poll(
      async () =>
        window.evaluate(
          async ({ taskId, widgetId }: { taskId: string; widgetId: string }) => {
            const api = (window as unknown as { api: typeof window.api }).api
            const ws = await api.widgets.listByTask(taskId)
            const content = ws.find((w) => w.id === widgetId)?.content
            if (!content || content === 'ghost-table-that-does-not-exist') return false
            const tbl = await api.tables.get(content)
            return !!tbl
          },
          { taskId: ids.taskId, widgetId: ids.widgetId }
        ),
      { timeout: 8_000, intervals: [300, 500, 800] }
    )
    .toBe(true)

  // And it's no longer stuck on the loading state.
  await expect(
    window.locator(`[data-widget-id="${ids.widgetId}"]`).getByText('Loading table…')
  ).toHaveCount(0)
})
