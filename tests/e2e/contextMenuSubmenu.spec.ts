import { test, expect } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

// Regression: the canvas right-click menu became overflow-y-auto (so long lists
// scroll), but an overflow-y container also clips overflow-x — which hid the
// submenu flyouts inside the menu's own div. They're now portalled to <body>,
// so hovering a parent row reveals a fully visible, on-screen flyout.

let launched: LaunchedApp | null = null
test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

test('right-click submenu flyout is visible and on-screen (not clipped)', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  // The Add/Arrange items only build when a task canvas is active.
  await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const t = await api.nodes.create({ parentId: null, kind: 'task', title: 'Ctx menu task' })
    return t.id
  })
  await window.reload()
  await waitForReady(window)
  await window.getByRole('button', { name: /Ctx menu task/ }).first().click()
  const surface = window.locator('[data-canvas-surface="true"]')
  await surface.waitFor({ timeout: 5_000 })
  await window.waitForTimeout(300)

  // Right-click an empty patch of canvas to open the context menu.
  await surface.click({ button: 'right', position: { x: 360, y: 300 } })
  await expect(window.locator('[data-canvas-ctx-menu]').first()).toBeVisible()

  // Hover the "Auto-arrange" parent — its submenu has stable child labels.
  await window.getByText('Auto-arrange', { exact: true }).hover()
  await window.waitForTimeout(200)

  const child = window.getByText('Group by type', { exact: true })
  await expect(child).toBeVisible()

  // The flyout must sit fully within the viewport (the bug left it clipped to
  // zero width inside the scroll container).
  const box = await child.boundingBox()
  const vw = await window.evaluate(() => window.innerWidth)
  expect(box).not.toBeNull()
  expect(box!.width).toBeGreaterThan(0)
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(vw)

  // And it's actually clickable (drives the real action without throwing).
  await child.click()
})
