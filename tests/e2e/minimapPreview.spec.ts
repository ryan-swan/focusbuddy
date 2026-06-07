import { test, expect } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

// Upgraded minimap: thumbnails show the REAL content of each widget (not blank
// rectangles), and hovering a thumbnail opens a magnifier — a legible preview
// sized to the widget's real dimensions — with jump-to and open-focused actions.

let launched: LaunchedApp | null = null
test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

async function hideAssistant(window: LaunchedApp['window']): Promise<void> {
  const btn = window.getByRole('button', { name: 'Hide assistant panel' })
  if (await btn.isVisible().catch(() => false)) await btn.click().catch(() => {})
  await window.waitForTimeout(150)
}

test('minimap thumbnails show real content and the hover magnifier works', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const ids = await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const task = await api.nodes.create({ parentId: null, kind: 'task', title: 'Minimap task' })
    const a = await api.widgets.create({
      taskId: task.id,
      kind: 'sticky',
      title: 'note A',
      content: 'MINIMAP-PREVIEW-XYZ',
      x: 160,
      y: 160,
      width: 220,
      height: 180
    })
    await api.widgets.create({
      taskId: task.id,
      kind: 'sticky',
      title: 'note B',
      content: 'second note',
      x: 420,
      y: 160,
      width: 220,
      height: 180
    })
    return { taskId: task.id, stickyId: a.id }
  })

  await window.reload()
  await waitForReady(window)
  await window.getByRole('button', { name: /Minimap task/ }).first().click()
  await window.waitForSelector('[data-canvas-surface="true"]', { timeout: 5_000 })
  await window.waitForTimeout(500)
  await hideAssistant(window)

  // The minimap auto-creates; its thumbnail for the sticky carries the real
  // content text (proving it's a content preview, not a coloured rect).
  const thumb = window.locator(`[data-testid="minimap-thumb-${ids.stickyId}"]`)
  await expect(thumb).toBeVisible()
  await expect(thumb).toContainText('MINIMAP-PREVIEW-XYZ')

  // Hover the thumbnail → the magnifier appears with the content and actions.
  await thumb.hover({ force: true })
  const mag = window.locator('[data-testid="minimap-magnifier"]')
  await expect(mag).toBeVisible({ timeout: 4_000 })
  await expect(mag).toContainText('MINIMAP-PREVIEW-XYZ')
  await expect(window.locator('[data-testid="magnify-zoom"]')).toBeVisible()
  await expect(window.locator('[data-testid="magnify-open"]')).toBeVisible()

  // Open-focused launches focus mode for that widget.
  await window.locator('[data-testid="magnify-open"]').click()
  await expect(window.getByRole('button', { name: 'Close focus mode' })).toBeVisible({
    timeout: 4_000
  })
})
