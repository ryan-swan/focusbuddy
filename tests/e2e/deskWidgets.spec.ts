/**
 * On a desk (task canvas) the floating WidgetPalette lets you add widgets: its
 * chips can be dragged onto the canvas (or clicked) to create that widget. The
 * palette is desk-only — it does not appear off a desk. (Superseded the old
 * left-sidebar "Widgets" section; these tests were updated when the UI moved to
 * the palette, whose chips are `palette-add-<kind>` opened via `palette-add-button`.)
 */

import { test, expect, type Page } from '@playwright/test'
import { launchApp, waitForReady } from './_helpers'

// Open the floating widget palette (its chips render in a portal once open).
// The floating toolbar collapses its content until hovered, so hover it first.
async function openPalette(window: Page): Promise<void> {
  await window.locator('[data-testid="floating-toolbar"]').hover()
  const addBtn = window.locator('[data-testid="palette-add-button"]')
  await expect(addBtn).toBeVisible({ timeout: 4_000 })
  await addBtn.click()
  await expect(window.locator('[data-testid="palette-add-sticky"]')).toBeVisible({ timeout: 4_000 })
}

test('DW-1 dragging a widget-palette chip onto the desk creates that widget', async () => {
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

    // The palette is available on a desk; office kinds are draggable too.
    await openPalette(window)
    await expect(window.locator('[data-testid="palette-add-doc"]')).toBeVisible()
    await expect(window.locator('[data-testid="palette-add-sheet"]')).toBeVisible()

    // Drive the chip's real dragstart, then drop onto the canvas with the same
    // DataTransfer (the renderer reads dataTransfer.getData in its handlers).
    const result = await window.evaluate(() => {
      const chip = document.querySelector('[data-testid="palette-add-sticky"]')
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

test('DW-2 the widget palette is desk-only (not shown without a desk open)', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    // A fresh launch is not on a desk/task canvas, so the palette add button
    // (which lives on the canvas floating toolbar) is not present.
    await expect(window.locator('[data-testid="palette-add-button"]')).toHaveCount(0)
  } finally {
    await dispose()
  }
})

test('DW-3 a top-level folder-desk opens as a canvas with the widget palette', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)
    // Create a top-level folder (a desk) and open it via the view store.
    const id = await window.evaluate(async () => {
      const api = (window as unknown as { api: typeof window.api }).api
      const f = await api.nodes.create({ parentId: null, kind: 'folder', title: 'Folder Desk' })
      return f.id
    })
    // Reload so the node store hydrates the new folder, then open it.
    await window.reload()
    await waitForReady(window)
    await window.evaluate((pid: string) => {
      const w = window as unknown as { __fbView?: { getState: () => { goProject: (p: string) => void } } }
      w.__fbView?.getState().goProject(pid)
    }, id)
    // A folder-desk opens as a canvas with the floating toolbar. (The palette
    // add button is present but disabled off a task, since widgets attach to a
    // task's canvas — the folder-desk palette is a separate product decision.)
    await expect(window.locator('[data-canvas-surface="true"]')).toBeVisible({ timeout: 8_000 })
    await window.locator('[data-testid="floating-toolbar"]').hover()
    await expect(window.locator('[data-testid="palette-add-button"]')).toBeVisible({ timeout: 4_000 })
  } finally {
    await dispose()
  }
})
