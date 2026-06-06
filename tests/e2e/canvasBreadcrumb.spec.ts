import { test, expect } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

// System-wide breadcrumb: every task canvas shows Home › Folder › … › Task,
// derived from the node tree. Clicking an ancestor task navigates to it.

let launched: LaunchedApp | null = null
test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

test('a task canvas shows a Home › Folder › Task breadcrumb', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  const seeded = await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const folder = await api.nodes.create({ parentId: null, kind: 'folder', title: 'Projects' })
    const task = await api.nodes.create({ parentId: folder.id, kind: 'task', title: 'Website redesign' })
    return { folderId: folder.id, taskId: task.id }
  })
  await window.reload()
  await waitForReady(window)
  await window.getByRole('button', { name: /Website redesign/ }).first().click()
  await window.waitForSelector('[data-canvas-surface="true"]', { timeout: 5_000 })
  await window.waitForTimeout(300)

  const bc = window.locator('[data-testid="canvas-breadcrumb"]')
  await expect(bc).toBeVisible()
  const text = await bc.innerText()
  expect(text).toContain('Projects')
  expect(text).toContain('Website redesign')

  // The current (last) segment is the task, and the folder segment is present.
  await expect(window.locator('[data-testid="breadcrumb-current"]')).toContainText('Website redesign')
  await expect(window.locator(`[data-testid="breadcrumb-${seeded.folderId}"]`)).toBeVisible()
})
