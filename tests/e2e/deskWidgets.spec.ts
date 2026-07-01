/**
 * On a desk (task canvas) the sidebar shows a compact Widgets section whose chips
 * can be dragged onto the canvas to create that widget. The section is desk-only:
 * it does not appear on the home view.
 */

import { test, expect } from '@playwright/test'
import { launchApp, waitForReady } from './_helpers'

test('DW-1 dragging a sidebar widget chip onto the desk creates that widget', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    const taskId = await window.evaluate(async () => {
      const api = (window as unknown as { api: typeof window.api }).api
      const t = await api.nodes.create({ parentId: null, kind: 'task', title: 'Widget Desk' })
      return t.id
    })
    await window.reload()
    await waitForReady(window)
    await window.getByRole('button', { name: /Widget Desk/ }).first().click()
    await window.waitForSelector('[data-canvas-surface="true"]', { timeout: 8_000 })

    // The Widgets section and its chips show while a desk is open.
    await expect(window.locator('[data-testid="sidebar-widgets"]')).toBeVisible()
    await expect(window.locator('[data-testid="sidebar-widget-sticky"]')).toBeVisible()
    // Office things can be dragged onto the desk too, not just widgets.
    await expect(window.locator('[data-testid="sidebar-widget-doc"]')).toBeVisible()
    await expect(window.locator('[data-testid="sidebar-widget-sheet"]')).toBeVisible()

    // Drive the chip's real dragstart, then drop onto the canvas with the same
    // DataTransfer (the renderer reads dataTransfer.getData in its handlers).
    const result = await window.evaluate(() => {
      const chip = document.querySelector('[data-testid="sidebar-widget-sticky"]')
      const surface = document.querySelector('[data-canvas-surface="true"]')
      if (!chip || !surface) return { ok: false, kind: '' }
      const dt = new DataTransfer()
      chip.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }))
      const kind = dt.getData('application/x-fb-widget-kind')
      const rect = surface.getBoundingClientRect()
      const clientX = rect.left + rect.width / 2
      const clientY = rect.top + rect.height / 2
      for (const type of ['dragenter', 'dragover', 'drop']) {
        surface.dispatchEvent(
          new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, clientX, clientY })
        )
      }
      return { ok: true, kind }
    })
    // The chip's dragstart set the widget kind, so the drop knows what to create.
    expect(result.ok).toBe(true)
    expect(result.kind).toBe('sticky')

    await window.waitForTimeout(800)
    const stickies = await window.evaluate(async (id: string) => {
      const api = (window as unknown as { api: typeof window.api }).api
      const ws = await api.widgets.listByTask(id)
      return ws.filter((w) => w.kind === 'sticky').length
    }, taskId)
    expect(stickies).toBeGreaterThanOrEqual(1)
  } finally {
    await dispose()
  }
})

test('DW-2 the Widgets section is desk-only (not shown without a desk open)', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    // A fresh launch is not on a desk/task canvas, so there is no Widgets section.
    await expect(window.locator('[data-testid="sidebar-widgets"]')).toHaveCount(0)
  } finally {
    await dispose()
  }
})
