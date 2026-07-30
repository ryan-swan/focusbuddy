import { test, expect } from '@playwright/test'
import { launchApp, waitForReady } from './_helpers'

// Screen-reader linear representation of the canvas (PLX-A11Y-003): the spatial desk
// exposes an equivalent non-spatial, navigable list of its objects.

test('test_plx_a11y_003_linear_canvas_lists_objects', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    const id = await window.evaluate(async () => {
      const api = (window as unknown as { api: { nodes: { create: (d: unknown) => Promise<{ id: string }> }; widgets: { create: (d: unknown) => Promise<unknown> } } }).api
      const task = await api.nodes.create({ parentId: null, kind: 'task', title: 'Linear desk' })
      await api.widgets.create({ taskId: task.id, kind: 'sticky', title: 'First note', content: 'a', x: 40, y: 40, width: 200, height: 160 })
      await api.widgets.create({ taskId: task.id, kind: 'markdown', title: 'Spec draft', content: 'b', x: 300, y: 40, width: 240, height: 200 })
      return task.id
    })
    await window.reload()
    await waitForReady(window)
    await window.evaluate((tid) => {
      const w = window as unknown as { __fbView?: { getState: () => { goTask: (id: string) => void } }; __fbNodes?: { getState: () => { setActive: (id: string) => void } } }
      w.__fbNodes?.getState().setActive(tid)
      w.__fbView?.getState().goTask(tid)
    }, id)
    await window.waitForSelector('[data-canvas-surface="true"]', { timeout: 8000 })

    // The linear landmark exists and lists each object as a focusable control.
    const linear = window.locator('[data-testid="canvas-linear-view"]')
    await expect(linear).toBeAttached()
    await expect(linear.locator('[data-linear-object]')).toHaveCount(2)
    await expect(linear).toContainText('First note')
    await expect(linear).toContainText('Spec draft')
    // The entries are real buttons (keyboard-operable), and activating one opens it.
    const first = linear.locator('[data-linear-object]').first()
    await expect(first).toHaveJSProperty('tagName', 'BUTTON')
    await first.evaluate((el: HTMLElement) => el.click())
    // No throw / the app stays live after activating a linear entry.
    await expect(window.locator('[data-canvas-surface="true"]')).toBeVisible()
  } finally {
    await dispose()
  }
})
