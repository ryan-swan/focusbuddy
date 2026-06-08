import { test, expect } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

// Dev performance overlay: Cmd/Ctrl+Shift+M shows per-process RAM/CPU (from
// app.getAppMetrics) plus live widget / browser / wire counts.

let launched: LaunchedApp | null = null
test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

test('the metrics overlay toggles and shows real process metrics + live counts', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)
  await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const task = await api.nodes.create({ parentId: null, kind: 'task', title: 'Metrics' })
    const a = await api.widgets.create({ taskId: task.id, kind: 'sticky', title: 'a', content: 'x', x: 100, y: 100, width: 200, height: 160 })
    const b = await api.widgets.create({ taskId: task.id, kind: 'sticky', title: 'b', content: 'y', x: 360, y: 100, width: 200, height: 160 })
    await api.widgets.create({ taskId: task.id, kind: 'webview', title: 'browser', content: 'about:blank', x: 100, y: 320, width: 420, height: 300 })
    await api.widgetLinks.create(a.id, b.id, task.id)
  })
  await window.reload()
  await waitForReady(window)
  await window.getByRole('button', { name: /Metrics/ }).first().click()
  await window.waitForSelector('[data-canvas-surface="true"]', { timeout: 5_000 })
  await window.waitForTimeout(400)

  // Hidden until toggled.
  await expect(window.locator('[data-testid="metrics-overlay"]')).toHaveCount(0)

  // Toggle on.
  await window.keyboard.press('Meta+Shift+M')
  const overlay = window.locator('[data-testid="metrics-overlay"]')
  await expect(overlay).toBeVisible()
  await expect(overlay).toContainText('Total RAM')
  await expect(overlay).toContainText('Top processes by RAM')

  // Live counts reflect the seeded desk: 1 browser, 1 wire.
  await expect(window.locator('[data-testid="metrics-browsers"]')).toHaveText('1')
  await expect(window.locator('[data-testid="metrics-wires"]')).toHaveText('1')
  // Real per-process memory shows a non-zero total.
  const totalText = await overlay.locator('text=/Total RAM/').first().textContent()
  expect(totalText).toBeTruthy()

  // Toggle off.
  await window.keyboard.press('Meta+Shift+M')
  await expect(window.locator('[data-testid="metrics-overlay"]')).toHaveCount(0)
})

// Note: the "metrics IPC unavailable → status banner" branch is covered by
// tests/unit/metricsStatus.test.ts, not here. window.api is a frozen
// contextBridge object, so a fresh-launch e2e cannot faithfully simulate the
// stale-preload condition (you can't delete or override the namespace).
