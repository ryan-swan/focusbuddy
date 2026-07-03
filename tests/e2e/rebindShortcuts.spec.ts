// E2E: rebinding a canvas quick-add shortcut via the Cmd+/ shortcuts overlay
// actually changes which key spawns which widget on the canvas.
//
// Contract (src/renderer/src/lib/keymap.ts + components/ShortcutsOverlay.tsx +
// components/Canvas.tsx):
//   - Default quick-add map: WIDGET_SHORTCUTS.sticky = 'S' (widgetCatalog.ts).
//   - QuickAddEditor's [data-testid="rebind-sticky"] button enters capture
//     mode; the next non-modifier a-z keypress becomes the new binding
//     (setKey persists to the useKeymap store + localStorage).
//   - effectiveQuickAddMap() layers overrides over the defaults, so moving
//     sticky to 'X' means 'S' no longer maps to anything (S was sticky's only
//     default owner) — pressing S afterwards must NOT spawn a second sticky.
//   - Canvas's quick-add keydown listener only fires when
//     useNodeStore.getState().activeTaskId is set, i.e. a task canvas is open.

import { test, expect } from '@playwright/test'
import { launchApp, waitForReady, type LaunchedApp } from './_helpers'

let launched: LaunchedApp | null = null

test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

test('rebinding sticky from S to X via the shortcuts overlay changes the live quick-add key', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  // Seed a task to open as a canvas.
  const taskId = await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const t = await api.nodes.create({ parentId: null, kind: 'task', title: 'Rebind test task' })
    return t.id
  })

  // Open the global shortcuts overlay (Cmd+/).
  await window.keyboard.press('Meta+/')
  await expect(window.locator('[data-testid="shortcuts-overlay"]')).toBeVisible({ timeout: 5_000 })

  // Enter capture mode for sticky's binding, then press X to rebind it.
  await window.locator('[data-testid="rebind-sticky"]').click()
  await window.keyboard.press('x')

  // The chip now reads "X" instead of "S".
  await expect(window.locator('[data-testid="rebind-sticky"]')).toHaveText('X')

  // Close the overlay (click the dimmed backdrop, which calls onClose via
  // onMouseDown — clicking outside the panel itself).
  await window.locator('[data-testid="shortcuts-overlay"]').click({ position: { x: 5, y: 5 } })
  await expect(window.locator('[data-testid="shortcuts-overlay"]')).toHaveCount(0, { timeout: 3_000 })

  // Navigate into the task canvas via the view store (same path the sidebar
  // uses) — window.__fbView is a global handle exposed by stores/view.ts.
  await window.evaluate((id) => {
    const w = window as unknown as { __fbView?: { getState: () => { goTask: (id: string) => void } } }
    w.__fbView?.getState().goTask(id)
  }, taskId)
  await window.waitForTimeout(300)

  // Click into empty canvas space so no input/textarea has focus, then press
  // X — this should spawn a sticky widget through the rebound quick-add key.
  await window.locator('body').click({ position: { x: 400, y: 400 } }).catch(() => {})
  await window.keyboard.press('x')
  await window.waitForTimeout(400)

  const afterX = await window.evaluate(async (id) => {
    const api = (window as unknown as { api: typeof window.api }).api
    return (await api.widgets.listByTask(id)).filter((w) => w.kind === 'sticky').length
  }, taskId)
  expect(afterX, 'pressing the rebound key X spawns exactly one sticky').toBe(1)

  // Pressing S (the old, now-unbound key) must NOT spawn a second sticky.
  await window.keyboard.press('s')
  await window.waitForTimeout(400)

  const afterS = await window.evaluate(async (id) => {
    const api = (window as unknown as { api: typeof window.api }).api
    return (await api.widgets.listByTask(id)).filter((w) => w.kind === 'sticky').length
  }, taskId)
  expect(afterS, 'pressing the old unbound key S does not spawn a second sticky').toBe(1)
})
