import { test } from '@playwright/test'
import { launchApp, waitForReady } from './_helpers'

test('DIAG — rightInset numbers before/after assistant open', async () => {
  const { window, dispose } = await launchApp()
  try {
    await waitForReady(window)

    await window.evaluate(async () => {
      const api = (window as unknown as { api: typeof window.api }).api
      await api.nodes.create({ parentId: null, kind: 'task', title: 'DIAG Task' })
    })
    await window.reload()
    await waitForReady(window)
    await window.getByRole('button', { name: /DIAG Task/ }).first().click()
    await window.waitForSelector('[data-canvas-surface="true"]', { timeout: 8_000 })
    await window.waitForTimeout(300)

    // Make sure assistant is OPEN first (default), grab a "before" reading in
    // that default-open state, then also capture a genuinely-closed baseline.
    async function snapshot(label: string): Promise<void> {
      const data = await window.evaluate(() => {
        const canvas = document.querySelector('[data-canvas-surface]')
        // Multiple elements on the canvas carry data-floating-menu (minimap FAB,
        // suggestion chip, context menu, widget palette popover, the toolbar
        // itself...). FloatingToolbar's sharedWrapper is the only one with this
        // exact title, so scope to it precisely.
        const toolbar = document.querySelector(
          '[data-floating-menu][title="Drag to reposition · Double-click to re-center"]'
        )
        const panels = Array.from(document.querySelectorAll('[data-panel]')).map((el) => {
          const r = el.getBoundingClientRect()
          return {
            id: el.getAttribute('data-panel-id'),
            left: r.left,
            right: r.right,
            width: r.width
          }
        })
        const canvasRect = canvas?.getBoundingClientRect()
        const toolbarRect = toolbar?.getBoundingClientRect()
        const toolbarComputedRight = toolbar ? getComputedStyle(toolbar as Element).right : null
        return {
          innerWidth: window.innerWidth,
          canvasRight: canvasRect?.right ?? null,
          canvasExists: !!canvas,
          panels,
          toolbarRight: toolbarRect?.right ?? null,
          toolbarComputedRight,
          toolbarExists: !!toolbar
        }
      })
      // eslint-disable-next-line no-console
      console.log(`=== ${label} ===`, JSON.stringify(data, null, 2))
    }

    await snapshot('DEFAULT (app boot state, assistant likely OPEN)')

    // Force-close via the Hide button if present.
    const hideBtn = window.getByTitle('Hide assistant panel')
    if (await hideBtn.isVisible().catch(() => false)) {
      await hideBtn.click()
      await window.waitForTimeout(500)
    }
    await snapshot('BEFORE (assistant CLOSED)')

    await window.evaluate(() => {
      window.dispatchEvent(new CustomEvent('fb:open-assistant'))
    })
    await window.waitForTimeout(800)
    await snapshot('AFTER (assistant OPEN, +800ms)')
  } finally {
    await dispose()
  }
})
